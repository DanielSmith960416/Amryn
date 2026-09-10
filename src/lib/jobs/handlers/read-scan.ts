import { readScannedPdf, OcrError, MAX_OCR_PAGES } from '@/lib/files/ocr';
import { PermanentJobError, type JobHandler } from '../types';

/**
 * Reading a scanned document, on our own hardware.
 *
 * Migration 38 gave a photographed invoice an honest answer — pages, no text
 * layer, nothing to extract — and left it there. This is what finishes the
 * job, and it runs here rather than in the request that uploaded the file for
 * the obvious reason: a fifty-page bundle is half a minute of work, and half a
 * minute is not a thing to make somebody watch a spinner for.
 *
 * ── why the worker rather than a service ─────────────────────────────────
 *
 * Cloud OCR is about $1.50 per thousand pages at Google, Azure and AWS alike —
 * genuinely cheap. It is also every customer's invoices and bank statements
 * leaving our infrastructure for a third party, which is a processor to
 * declare in the privacy notice and a jurisdiction to name. Tesseract in this
 * container costs nothing per page, was measured at roughly a third of a
 * second for an A4 invoice, and keeps the document where it already is.
 *
 * A vision model was ruled out on a different ground entirely. Asked to
 * transcribe an invoice it can produce a figure that is plausible and simply
 * not on the page, and a plausible wrong number is far worse than a visibly
 * mangled one. Tesseract's failures announce themselves.
 *
 * ── this handler is trusted with tenant data and must scope itself ───────
 *
 * The worker holds a direct connection as the database owner, so row level
 * security is not what protects a tenant here. Every statement below filters
 * on the job's own organisation_id, and the file is fetched by the path stored
 * on that row rather than by anything in the payload — a payload is a claim,
 * and a claim that named another organisation's object would otherwise be
 * honoured.
 */
export const readScan: JobHandler = {
  kind: 'document.ocr',
  description: 'Reads a scanned document with character recognition, and records how sure it is.',
  /*
   * Ninety seconds between heartbeats.
   *
   * Not a limit on the work — the handler renews the lease after every page,
   * which is what the progress callback is for. It is the window in which a
   * worker killed mid-page leaves the job stuck, and a page takes under a
   * second, so this is generous by two orders of magnitude on purpose: the
   * cost of it being too short is two workers reading the same document.
   */
  leaseSeconds: 90,

  async run({ job, query, keepAlive, log }) {
    const documentId = job.payload.documentId;
    if (typeof documentId !== 'string' || documentId === '') {
      throw new PermanentJobError('The job carries no document to read.');
    }
    if (!job.organisationId) {
      throw new PermanentJobError('A document belongs to an organisation, and this job names none.');
    }

    const [document] = await query<{
      id: string;
      filename: string;
      storage_path: string;
      page_count: number;
    }>(
      `select id, filename, storage_path, page_count
         from public.data_documents
        where id = $1 and organisation_id = $2 and deleted_at is null`,
      [documentId, job.organisationId],
    );

    if (!document) {
      // Deleted between the upload and the worker picking it up, which is a
      // customer changing their mind rather than a fault.
      throw new PermanentJobError('That document is no longer here.');
    }

    const settings = storageSettings();
    if (!settings) {
      /*
       * Two audiences, and only one of them may be told which setting.
       *
       * A job result is shown to a customer, and naming an environment
       * variable there tells somebody who cannot act on it about
       * infrastructure they should not have to know exists — which is what
       * the vocabulary test in src/lib/copy guards, and it caught this
       * sentence when it was one line. The operator, who can act on it, reads
       * the worker's log.
       *
       * Retryable either way: the next deployment may carry the settings, and
       * failing permanently would need a person to notice and re-queue every
       * scan uploaded in between.
       */
      console.error(
        '[amryn:ocr] the worker cannot reach object storage: set the project URL and the service role key on this service',
      );
      throw new Error('This worker is not configured to fetch files, so it cannot read scans.');
    }

    await query(
      `update public.data_documents set ocr_state = 'running' where id = $1 and organisation_id = $2`,
      [document.id, job.organisationId],
    );

    try {
      const bytes = await download(document.storage_path, settings);
      log(`read ${document.filename} — ${bytes.length} bytes`);

      const result = await readScannedPdf(bytes, async (done, total) => {
        // After every page, so a long document cannot outlive its lease. A
        // lapsed lease means a second worker starts the same file, and both
        // finish writing.
        if (!(await keepAlive())) {
          throw new PermanentJobError('Another worker took this document over.');
        }
        if (done === 1 || done % 10 === 0) log(`page ${done} of ${total}`);
      });

      if (result.text === '') {
        // The engine ran and found no words. A photograph of a wall, a blank
        // page, a page of a language we have no data for. Distinct from a
        // failure and recorded as such: a customer who uploads a blank scan
        // should not be told something went wrong.
        await query(
          `update public.data_documents
              set ocr_state = 'done', read_error = $3
            where id = $1 and organisation_id = $2`,
          [
            document.id,
            job.organisationId,
            'We read every page of that scan and found no words on it. The file is kept exactly as you sent it.',
          ],
        );
        return { pages: result.pages.length, characters: 0, confidence: null, empty: true };
      }

      // The text first, then the parent row. In that order because a document
      // marked as read with no text behind it is a page showing a heading and
      // nothing under it, and the reverse — text stored against a row that
      // still says 'running' — merely looks slow.
      await query(
        `insert into public.data_document_text (document_id, organisation_id, content)
         values ($1, $2, $3)
         on conflict (document_id) do update set content = excluded.content`,
        [document.id, job.organisationId, result.text],
      );

      await query(
        `update public.data_documents
            set handling    = 'text',
                text_source = 'ocr',
                text_chars  = $3,
                page_count  = case when page_count > 0 then page_count else $4 end,
                ocr_state   = 'done',
                read_error  = $5
          where id = $1 and organisation_id = $2`,
        [
          document.id,
          job.organisationId,
          result.text.length,
          result.pages.length,
          caveat(result.confidence, result.skipped),
        ],
      );

      return {
        pages: result.pages.length,
        characters: result.text.length,
        confidence: result.confidence,
        skipped: result.skipped,
      };
    } catch (error) {
      const message =
        error instanceof OcrError
          ? error.message
          : error instanceof PermanentJobError
            ? error.message
            : 'We could not read that scan. The file is kept exactly as you sent it.';

      await query(
        `update public.data_documents
            set ocr_state = 'failed', read_error = $3
          where id = $1 and organisation_id = $2`,
        [document.id, job.organisationId, message],
      );

      // A retryable OCR failure — a missing binary, a container without the
      // memory — goes back to the queue. Everything else is settled, and
      // retrying a damaged PDF three times only delays telling the customer.
      if (error instanceof OcrError && !error.retryable) throw new PermanentJobError(message);
      throw error;
    }
  },
};

/**
 * What the reader should be told about this reading.
 *
 * Empty where there is nothing to say. A low confidence and a truncated
 * document are both things a person acting on these words needs in front of
 * them rather than in a job result they will never open.
 */
function caveat(confidence: number | null, skipped: number): string {
  const parts: string[] = [];

  if (confidence !== null && confidence < 75) {
    parts.push(
      `Character recognition was unsure of this one — about ${confidence}% confident on average. Check anything you rely on against the page itself.`,
    );
  }
  if (skipped > 0) {
    parts.push(
      `Only the first ${MAX_OCR_PAGES} pages were read; ${skipped} more were not. Split the file if you need the rest.`,
    );
  }

  return parts.join(' ');
}

interface StorageSettings {
  url: string;
  key: string;
}

/**
 * Read from the environment rather than from lib/env.
 *
 * That module carries `server-only`, which is a build-time signal to the React
 * bundler — and the worker is a plain Node process that the React bundler
 * never sees. types.ts says as much at the top of this directory: nothing here
 * may reach for Next, Supabase or a session.
 */
function storageSettings(): StorageSettings | null {
  const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (url === '' || key === '') return null;
  return { url: url.replace(/\/+$/, ''), key };
}

/**
 * The object itself, over Supabase's storage API.
 *
 * Plain fetch rather than the Supabase client, which would pull the whole
 * library into a worker bundle to make one authenticated GET.
 *
 * The service role bypasses the storage policies, which is why the path comes
 * from the row this handler already read under the job's organisation and
 * never from the payload.
 */
async function download(path: string, settings: StorageSettings): Promise<Uint8Array> {
  const response = await fetch(`${settings.url}/storage/v1/object/documents/${path}`, {
    headers: {
      apikey: settings.key,
      Authorization: `Bearer ${settings.key}`,
    },
  });

  if (!response.ok) {
    // 404 is settled — the object is gone. Anything else may be transient.
    const detail = `storage answered ${response.status}`;
    if (response.status === 404) throw new PermanentJobError(`That file is no longer in storage (${detail}).`);
    throw new Error(`Could not fetch the file to read it — ${detail}.`);
  }

  return new Uint8Array(await response.arrayBuffer());
}
