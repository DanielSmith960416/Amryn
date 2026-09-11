import { connector } from '@/lib/connectors/catalogue';
import type { CredentialStore } from '@/lib/connectors/credentials';
import { syncingProvider } from '@/lib/connectors/native';
import { ProviderError, type ConnectorProvider, type FetchedRecord } from '@/lib/connectors/provider';
import { PermanentJobError, type JobContext, type JobHandler, type JobResult } from '../types';

/**
 * Reading a connected system, repeatedly, without duplicating anything.
 *
 * ── this handler is trusted with tenant data and must scope itself ───────
 *
 * The worker holds a direct connection as the database owner, so row level
 * security is not what protects a tenant here. Every statement below filters
 * on the job's own organisation_id, and the connection is loaded by that
 * filter rather than taken from the payload — a payload is a claim, and a
 * claim naming another organisation's connection would otherwise be honoured
 * and would read one customer's payments into another's books.
 *
 * ── only transactions, and only the ones that succeeded ──────────────────
 *
 * The catalogue declares two reads for Paystack and this syncs one of them.
 * `failed_payments` is the same endpoint under a status filter, so every row
 * it would return already arrives here — syncing it separately would be the
 * same requests twice. What is missing is somewhere to put a failure: a
 * payment that did not go through is not income, and writing it into
 * financial_records would inflate the revenue this platform reasons about.
 * Counting losses properly needs its own home, and guessing at one now would
 * be worse than saying it is not built.
 *
 * So a non-success transaction is counted and not written. The count is
 * reported, because "we read 400 and stored 380" is a different statement from
 * "we read 380", and a business whose failure rate is five per cent should be
 * able to see that somewhere rather than have it silently dropped.
 *
 * ── the minor unit ───────────────────────────────────────────────────────
 *
 * Paystack reports amounts in the currency's subunit and financial_records
 * calls its column amount_cents, which is the same thing for every currency
 * Paystack settles in — all of them two-decimal. Written across unchanged and
 * recorded here rather than converted, because a conversion is where a factor
 * of a hundred gets applied twice.
 */

/** How many pages one run will walk before stopping and leaving a cursor. */
const MAX_PAGES = 40;

/**
 * The kinds this handler knows how to store.
 *
 * Deliberately narrower than the catalogue's intendedReads, and narrower on
 * purpose rather than by omission — see the header.
 */
const SYNCED_KINDS = ['transactions'] as const;

interface ConnectionRow {
  id: string;
  credential_ref: string | null;
  data_source_id: string;
  provider: string | null;
}

interface SyncRow {
  cursor: string | null;
  watermark: string | null;
}

/**
 * The store, on the worker's own connection.
 *
 * connection_credential is granted to service_role and to nobody a browser can
 * be; the worker connects as the database owner, which holds it by ownership.
 * That is the whole of the worker's extra reach, and it is one function.
 */
export function credentialStore(query: JobContext['query']): CredentialStore {
  return {
    async read(credentialRef) {
      const [row] = await query<{ secret: string | null }>(
        'select public.connection_credential($1) as secret',
        [credentialRef],
      );
      return row?.secret ?? null;
    },

    async forget(credentialRef) {
      // Quiet when the handle resolves to nothing, per the interface: the
      // function returns without doing anything for a connection that is gone.
      await query(
        `select public.forget_connection_credential(c.id)
           from public.data_connections c
          where c.credential_ref = $1`,
        [credentialRef],
      );
    },
  };
}

export const syncConnection: JobHandler = {
  kind: 'connection.sync',
  description: 'Reads a connected system and stores what it finds, resuming where it stopped.',
  /*
   * Two minutes between heartbeats.
   *
   * Not a limit on the work — the lease is renewed after every page. It is the
   * window in which a worker killed mid-page leaves the job stuck, and one
   * page is one HTTP request against a gateway that could be slow.
   */
  leaseSeconds: 120,

  async run({ job, query, keepAlive, log }): Promise<JobResult> {
    const connectionId = job.payload.connectionId;
    if (typeof connectionId !== 'string' || connectionId === '') {
      throw new PermanentJobError('The job carries no connection to sync.');
    }
    if (!job.organisationId) {
      throw new PermanentJobError('A connection belongs to an organisation, and this job names none.');
    }

    const [connection] = await query<ConnectionRow>(
      `select c.id, c.credential_ref, c.data_source_id, s.provider
         from public.data_connections c
         join public.data_sources s on s.id = c.data_source_id
        where c.id = $1 and c.organisation_id = $2`,
      [connectionId, job.organisationId],
    );

    if (!connection) {
      throw new PermanentJobError('That connection no longer exists.');
    }
    if (!connection.credential_ref) {
      throw new PermanentJobError('That connection has no key stored, so there is nothing to read with.');
    }

    const definition = connection.provider ? connector(connection.provider) : null;
    if (!definition) {
      throw new PermanentJobError('That connection names a system Amryn does not have a connector for.');
    }

    const provider = syncingProvider(definition, credentialStore(query));
    if (!provider) {
      throw new PermanentJobError(`${definition.name} has no connector implementation.`);
    }

    const startedAt = new Date();
    await query(`update public.data_connections set status = 'syncing', updated_at = now() where id = $1`, [
      connection.id,
    ]);

    let stored = 0;
    let skipped = 0;
    let unfinished = false;

    try {
      for (const kind of SYNCED_KINDS) {
        if (!definition.intendedReads.includes(kind)) continue;

        const outcome = await syncOneKind({
          kind,
          provider,
          connection,
          organisationId: job.organisationId,
          startedAt,
          query,
          keepAlive,
          log,
        });

        stored += outcome.stored;
        skipped += outcome.skipped;
        unfinished = unfinished || outcome.unfinished;
      }
    } catch (error) {
      await query(
        `update public.data_connections
            set status = 'error', last_error = $2, consecutive_errors = consecutive_errors + 1, updated_at = now()
          where id = $1`,
        [connection.id, customerWords(error, definition.name)],
      );
      throw error;
    }

    await query(
      `update public.data_connections
          set status = 'connected', last_synced_at = now(), last_error = null,
              consecutive_errors = 0, updated_at = now()
        where id = $1`,
      [connection.id],
    );

    log(`${definition.name}: stored ${stored}, skipped ${skipped}${unfinished ? ', more to come' : ''}`);

    return { system: definition.name, stored, skipped, complete: !unfinished };
  },
};

/*
 * Exported for tests, which is the honest reason and worth stating. The
 * handler reaches for syncingProvider() itself — that is what makes it a
 * handler rather than a function with eight parameters — so the seam a test
 * can hold on to is here instead.
 */
export async function syncOneKind(options: {
  kind: string;
  provider: ConnectorProvider;
  connection: ConnectionRow;
  organisationId: string;
  startedAt: Date;
  query: JobContext['query'];
  keepAlive: JobContext['keepAlive'];
  log: JobContext['log'];
}): Promise<{ stored: number; skipped: number; unfinished: boolean }> {
  const { kind, provider, connection, organisationId, startedAt, query, keepAlive, log } = options;

  const [existing] = await query<SyncRow>(
    `insert into public.data_connection_syncs (organisation_id, data_connection_id, kind)
     values ($1, $2, $3)
     on conflict (data_connection_id, kind) do update set updated_at = now()
     returning cursor, watermark`,
    [organisationId, connection.id, kind],
  );

  let cursor = existing?.cursor ?? null;
  const since = existing?.watermark ? new Date(existing.watermark) : null;

  let stored = 0;
  let skipped = 0;
  let pages = 0;

  while (pages < MAX_PAGES) {
    /*
     * Checked before the request, not after.
     *
     * A lapsed lease means another worker has taken the job over. Finding that
     * out after spending a request means two workers have both pulled the same
     * page from a rate-limited gateway.
     */
    if (!(await keepAlive())) {
      log(`${kind}: lease lost, stopping`);
      return { stored, skipped, unfinished: true };
    }

    const page = await provider.fetch({ credentialRef: connection.credential_ref!, kind, cursor, since });
    pages += 1;

    for (const record of page.records) {
      const written = await storeRecord({ record, connection, organisationId, query });
      if (written) stored += 1;
      else skipped += 1;
    }

    cursor = page.cursor;

    // Written after every page rather than at the end, so a worker killed
    // halfway resumes from here instead of walking the whole history again.
    await query(
      `update public.data_connection_syncs
          set cursor = $3, records_written = records_written + $4, last_run_at = now(), last_error = null
        where data_connection_id = $1 and kind = $2`,
      [connection.id, kind, cursor, stored],
    );

    if (cursor === null) break;
  }

  const unfinished = cursor !== null;

  if (!unfinished) {
    /*
     * The watermark moves only when the walk actually finished.
     *
     * Moving it on an interrupted run would mean the next one asks for changes
     * since a moment it never reached, and everything between is lost — the
     * kind of gap nobody notices because the sync reports success both times.
     *
     * It is set to when this run started, not to now: a transaction created
     * while the walk was in progress must be caught by the next run rather
     * than fall in the gap between the two.
     */
    await query(
      `update public.data_connection_syncs
          set watermark = $3, cursor = null
        where data_connection_id = $1 and kind = $2`,
      [connection.id, kind, startedAt.toISOString()],
    );
  }

  return { stored, skipped, unfinished };
}

/**
 * One record, stored or deliberately not.
 *
 * Returns false for a record this handler will not write — a payment that did
 * not succeed, or one missing the fields a financial record cannot be without.
 * Not an error: a gateway returning a transaction with no amount is a thing
 * that happens, and losing the rest of the page over it would be worse.
 */
export async function storeRecord(options: {
  record: FetchedRecord;
  connection: ConnectionRow;
  organisationId: string;
  query: JobContext['query'];
}): Promise<boolean> {
  const { record, connection, organisationId, query } = options;
  const attributes = record.attributes;

  if (text(attributes.status) !== 'success') return false;

  const amount = attributes.amount_minor;
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return false;

  const when = text(attributes.paid_at) ?? text(attributes.created_at) ?? record.updatedAt;
  if (!when) return false;

  const occurredOn = when.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) return false;

  const currency = text(attributes.currency);

  await query(
    `insert into public.financial_records
       (organisation_id, occurred_on, category, subcategory, amount_cents, currency_code,
        direction, reference, external_id, data_source_id, data_connection_id)
     values ($1, $2, 'payments', $3, $4, coalesce($5, 'ZAR'), 'income', $6, $7, $8, $9)
     on conflict (organisation_id, data_source_id, external_id) where external_id is not null
     do update set amount_cents = excluded.amount_cents,
                   occurred_on  = excluded.occurred_on,
                   subcategory  = excluded.subcategory,
                   reference    = excluded.reference`,
    [
      organisationId,
      occurredOn,
      text(attributes.channel),
      Math.round(amount),
      currency && currency.length === 3 ? currency.toUpperCase() : null,
      text(attributes.reference),
      record.externalId,
      connection.data_source_id,
      connection.id,
    ],
  );

  return true;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/**
 * A failure in words a customer could be shown.
 *
 * A ProviderError is already written for them. Anything else is ours, and its
 * message could carry a URL, a driver's connection string or whatever was in
 * scope — none of which belongs on a connection card.
 */
function customerWords(error: unknown, name: string): string {
  if (error instanceof ProviderError) return error.message;
  return `We could not finish reading ${name}. The problem has been recorded.`;
}
