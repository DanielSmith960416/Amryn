-- ═══════════════════════════════════════════════════════════════════════════
-- 39. Reading a scan
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Migration 38 could pull the words out of a PDF that had words in it, and
-- said so honestly when one did not: a photographed invoice is a picture of a
-- page, and there is nothing to extract. That is a large share of what a small
-- business actually holds.
--
-- Character recognition closes it, and it runs on our own worker rather than
-- through a paid service. That decision is worth recording with its numbers,
-- because the alternative looked cheap too:
--
--   Tesseract on the worker    R0 per page. Measured at ~275 ms for an A4
--                              invoice. The file never leaves our own
--                              infrastructure, so the processor register in
--                              the privacy notice does not change.
--
--   A cloud OCR service        Around $1.50 per thousand pages at Google,
--                              Azure and AWS alike. Cheap, and it means every
--                              customer's invoices and bank statements go to
--                              a third party — a new processor to declare and
--                              a new jurisdiction to name.
--
--   A vision model             Ruled out, and not on price. A generative model
--                              asked to transcribe an invoice can produce a
--                              figure that is plausible and absent from the
--                              page. Tesseract's failures look like failures.
--                              For a product whose claim is that its numbers
--                              are traceable, that difference decides it.
--
-- ── why the source of the text is now a column ───────────────────────────
--
-- Text lifted from a PDF's own text layer is what the document says. Text from
-- character recognition is a *reading* of what the document says, and it is
-- wrong often enough to matter — measurably so. Running Tesseract over an
-- invoice rendered two ways produced two different sets of errors: one run
-- dropped a quantity of 140 entirely, the other turned R42.50 into "RA250".
-- Both runs looked equally confident.
--
-- So the two are not interchangeable and the interface must not present them
-- as one. `text_source` is what lets a page say "read by character
-- recognition — check the figures against the image", and it is the same
-- discipline as the provenance column on a metric: where a number came from
-- travels with the number.
--
-- Purely additive: two columns with defaults, one index. No row is rewritten.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.data_documents
  add column text_source text not null default 'none'
    check (text_source in ('none', 'embedded', 'ocr')),
  add column ocr_state text not null default 'not_needed'
    check (ocr_state in ('not_needed', 'queued', 'running', 'done', 'failed'));

comment on column public.data_documents.text_source is
  'none: no text. embedded: lifted from the file''s own text layer, and is what the document says. ocr: read off an image by character recognition, and is a reading of what the document says — presented with that caveat, never as equivalent.';

comment on column public.data_documents.ocr_state is
  'Where the recognition job is. queued and running are what the file list shows while the worker has it.';

-- Finding the work. Partial, because all but a handful of rows are
-- 'not_needed' and an index over those would be a copy of the table.
create index data_documents_ocr_pending_idx
  on public.data_documents (organisation_id, created_at)
  where ocr_state in ('queued', 'running');

-- ═══════════════════════════════════════════════════════════════════════════
-- Asking for a scan to be read
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A function rather than an insert. job_runs is not writable from a session —
-- deliberately, since migration 23 — and the two existing ways in are both
-- functions that check a permission first and can queue exactly one kind of
-- job each. This is the third, on the same terms.
--
-- It exists at all because the alternative was the upload action inserting a
-- job row itself, which would mean granting a browser session the ability to
-- write to the queue. A queue anybody can put anything into is not a queue.
create or replace function public.request_document_ocr(p_document uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org      uuid;
  v_state    text;
  v_job      uuid;
begin
  -- The document decides the organisation, not the caller. Taking the
  -- organisation as a parameter would let a well-formed call name one it does
  -- not belong to and have the permission check pass against it.
  select organisation_id, ocr_state
    into v_org, v_state
    from public.data_documents
   where id = p_document and deleted_at is null;

  if v_org is null then
    raise exception 'that document does not exist' using errcode = 'P0002';
  end if;

  -- The same permission that allows the upload. Reading a file needs only
  -- view_data_sources; spending a worker's time on it needs more.
  if not amryn.has_permission(v_org, 'import_data') then
    raise exception 'you do not have permission to read that document'
      using errcode = '42501';
  end if;

  -- Already queued or running. Returning quietly rather than raising: a person
  -- who presses the button twice has not made a mistake worth an error.
  if v_state in ('queued', 'running') then
    return null;
  end if;

  insert into public.job_runs
    (organisation_id, kind, payload, singleton_key, max_attempts, requested_by)
  values
    (v_org, 'document.ocr',
     jsonb_build_object('documentId', p_document::text),
     -- One reading of one document at a time. Keyed on the document rather
     -- than the organisation: two people uploading two scans at once are not
     -- competing for anything.
     'ocr:' || p_document::text,
     2,
     auth.uid())
  returning id into v_job;

  update public.data_documents
     set ocr_state = 'queued', read_error = ''
   where id = p_document;

  return v_job;
end $$;

comment on function public.request_document_ocr is
  'Queues one scanned document to be read by the worker. The third and last thing that may write to job_runs from a session, and it can queue exactly one kind of job.';

revoke all on function public.request_document_ocr(uuid) from public, anon;
grant execute on function public.request_document_ocr(uuid) to authenticated;

notify pgrst, 'reload schema';
