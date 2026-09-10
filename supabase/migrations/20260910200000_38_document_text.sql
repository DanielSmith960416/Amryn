-- ═══════════════════════════════════════════════════════════════════════════
-- 38. The words inside a document
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Migration 37 could keep a PDF and could not read one. This adds the reading:
-- text pulled out of PDFs, Word documents, presentations and plain text on
-- upload, stored beside the file so it can be searched and quoted.
--
-- ── why the text is in its own table ─────────────────────────────────────
--
-- A three-hundred-page contract yields something close to a megabyte of text.
-- Put that column on data_documents and every `select *` behind the file list
-- drags the whole corpus across the wire to render a list of names — a page
-- that gets slower with every upload, for no reason a reader could guess.
--
-- One row per document, cascading with it, fetched only when somebody opens
-- the document itself. The counts that the list *does* show — pages, how many
-- characters — stay on the parent row where they are cheap.
--
-- ── the third value of `handling`, and the line it must not cross ────────
--
--   table     rows read
--   text      words extracted and stored
--   document  kept, not read
--
-- 'text' means the words are available. It does not mean anything has been
-- understood: no term noted, no risk assessed, no figure taken. That
-- distinction is one careless sentence from collapsing — "we have the words"
-- and "we know what it says" look alike in a hurry — and the whole reason it
-- is a constrained column rather than a convention is so a page cannot claim
-- the second by accident. Test 36 already refuses 'analysed'.
--
-- ── the case that must not read as an empty file ─────────────────────────
--
-- A scanned invoice is a photograph of paper. It has pages and no text layer,
-- so extraction returns nothing — indistinguishable from a blank document
-- unless the row says which it was. `read_error` carries that sentence, and
-- most of what a small business actually holds arrives this way.
--
-- Purely additive: three columns, one table, one constraint widened. Nothing
-- dropped, no row rewritten.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.data_documents
  add column page_count integer not null default 0 check (page_count >= 0),
  add column text_chars integer not null default 0 check (text_chars >= 0),
  add column text_truncated boolean not null default false;

comment on column public.data_documents.page_count is
  'Pages in a PDF, slides in a presentation. Zero where the format has no such unit.';

comment on column public.data_documents.text_chars is
  'How much text was extracted. Zero with handling=document and a read_error set means we tried and could not.';

-- The constraint is widened rather than replaced in spirit: every value that
-- was legal before is legal now. Dropping and recreating is the only way
-- PostgreSQL offers to widen a check, and it rewrites no rows.
alter table public.data_documents
  drop constraint data_documents_handling_check;

alter table public.data_documents
  add constraint data_documents_handling_check
  check (handling in ('table', 'text', 'document'));

create table public.data_document_text (
  document_id     uuid primary key references public.data_documents (id) on delete cascade,
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  content         text not null,
  created_at      timestamptz not null default now()
);

comment on table public.data_document_text is
  'The words extracted from one document. Separate from data_documents so listing files does not read the corpus.';

-- organisation_id is repeated here rather than reached through the join.
-- A row level security policy that had to join to its parent to know which
-- tenant it belongs to is a policy that runs a subquery per row, and one whose
-- correctness depends on the join staying right.
create index data_document_text_org_idx on public.data_document_text (organisation_id);

alter table public.data_document_text enable row level security;
alter table public.data_document_text force row level security;

create policy data_document_text_read on public.data_document_text
  for select to authenticated
  using (amryn.has_permission(organisation_id, 'view_data_sources'));

create policy data_document_text_write on public.data_document_text
  for all to authenticated
  using (amryn.has_permission(organisation_id, 'import_data'))
  with check (amryn.has_permission(organisation_id, 'import_data'));

-- Guarded, like its parent: an organisation whose subscription has lapsed
-- keeps everything already extracted and adds nothing new.
create trigger zz_subscription_data_document_text
  before insert or update or delete on public.data_document_text
  for each row execute function amryn.refuse_lapsed_write();

notify pgrst, 'reload schema';
