/**
 * Paystack's HTTP API, as far as its documentation actually goes.
 *
 * This file is the customer's Paystack account — the money a business takes
 * through its own gateway. It is not, and must never become, the Paystack
 * account Amryn bills subscriptions through. Those are two different
 * organisations' credentials that happen to belong to the same vendor, and
 * confusing them would let a customer's sync touch Amryn's revenue or the
 * reverse. Amryn's billing credentials do not appear in this directory, and
 * nothing here reads an environment variable to find a key: the key arrives as
 * an argument, from whatever holds credentials, and leaves again.
 *
 * ── written from the documentation, not from memory ──────────────────────
 *
 * Every path, parameter, response field and value below appears in Paystack's
 * own API reference (authentication and transactions). Where the reference is
 * silent, this file is silent too, and says so in a comment rather than
 * filling the gap with something plausible. The two places that happens are
 * the page cursor and the key format; both are marked.
 *
 * ── the transport is a seam, on purpose ──────────────────────────────────
 *
 * Nothing here calls `fetch` except `directTransport`. Everything else takes a
 * `PaystackTransport` and asks it for a path. That is not indirection for its
 * own sake: whether Amryn talks to Paystack directly or through Nango's proxy
 * is not yet decided — Nango's guide for API-key integrations has not been
 * read — and the half that *is* decided is which endpoints to call and what
 * their answers mean. Splitting them means the undecided half is one function,
 * not a rewrite.
 *
 * ── read-only, structurally ──────────────────────────────────────────────
 *
 * A Paystack secret key is not a read-only credential. The same key that
 * lists transactions can also initialise one, charge a stored authorisation
 * and take a partial debit — those endpoints are in the same reference, under
 * the same `Authorization: Bearer`. Paystack does not offer a narrower scope
 * for this, so the narrowing has to happen here: `directTransport` issues GET
 * and nothing else, there is no method that takes a body, and a test asserts
 * that no write path appears in this file. A customer handing Amryn a key that
 * *could* move their money deserves the assurance that the code physically
 * cannot.
 */
import { ProviderError } from '../provider';

/** Confirmed from the authentication reference. */
export const PAYSTACK_BASE_URL = 'https://api.paystack.co';

/**
 * Records per page.
 *
 * 50 is the documented default for `perPage`. The reference does not state a
 * maximum, so this does not raise it: a larger page would be a guess, and a
 * guess that is wrong costs a rejected request per sync rather than a faster
 * one.
 */
export const PER_PAGE = 50;

/** A hung gateway must not hang a sync, or a page waiting on one. */
const TIMEOUT_MS = 20_000;

/**
 * The documented transaction statuses.
 *
 * The list endpoint accepts exactly these three as the `status` filter, and
 * returns one of them on each record.
 */
export type PaystackTransactionStatus = 'success' | 'failed' | 'abandoned';

export const TRANSACTION_STATUSES: readonly PaystackTransactionStatus[] = [
  'success',
  'failed',
  'abandoned',
];

/** One request, described in Paystack's terms and performed by somebody else. */
export interface PaystackRequest {
  /** Path below the base URL, beginning with a slash. */
  path: string;
  /** Query parameters. Undefined values are dropped rather than sent empty. */
  query?: Readonly<Record<string, string | number | undefined>>;
}

/**
 * Whatever actually performs the request and returns the parsed body.
 *
 * Returning the whole envelope rather than its `data` is deliberate: `meta`
 * carries the paging, and a transport that threw it away would force every
 * caller to re-request to find out whether there was more.
 */
export type PaystackTransport = (request: PaystackRequest) => Promise<unknown>;

/**
 * The envelope every documented response arrives in.
 *
 * `{ status, message, data, meta }`, where `status` is a boolean and is not
 * the HTTP status and not a transaction's status. Three different things share
 * that word in this API, which is precisely why it is parsed in one place.
 */
export interface PaystackEnvelope {
  ok: boolean;
  message: string;
  data: unknown;
  meta: Record<string, unknown> | null;
}

/**
 * One transaction, reduced to the fields the reference documents.
 *
 * `raw` keeps the provider's own payload intact. Mapping into Amryn's tables
 * happens above this file, and an adapter that quietly dropped fields on the
 * way past would make that impossible to audit later.
 */
export interface PaystackTransaction {
  /** Text, always. See `quoteLongIntegers` below for why. */
  id: string;
  reference: string;
  status: string;
  /** In the currency's subunit, as Paystack reports it. Never divided here. */
  amountMinor: number | null;
  currency: string | null;
  channel: string | null;
  /** ISO 8601, as given. Not reformatted, not reinterpreted into a timezone. */
  paidAt: string | null;
  createdAt: string | null;
  feesMinor: number | null;
  customerEmail: string | null;
  customerCode: string | null;
  raw: Record<string, unknown>;
}

export interface TransactionPage {
  transactions: readonly PaystackTransaction[];
  /**
   * Where to resume, or null at the end.
   *
   * This is Amryn's cursor, not Paystack's. The response carries a `meta.next`
   * token, but the reference does not name the parameter that consumes it, and
   * a token sent under a guessed parameter name is silently ignored — which
   * looks exactly like a sync that finished. So paging is done with the
   * documented `page` number, and the cursor is a page number in a string that
   * callers treat as opaque. If `meta.next` is ever documented, this is the
   * only function that changes.
   */
  cursor: string | null;
}

export interface ListTransactionsOptions {
  /** Null for a first sync; otherwise the cursor from the previous page. */
  cursor?: string | null;
  /** Only transactions created at or after this, via the documented `from`. */
  since?: Date | null;
  /** Restrict to one documented status. */
  status?: PaystackTransactionStatus | null;
}

/* ────────────────────────────────────────────────────────────────────────
 * Parsing
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Quote integer literals too long to survive JSON.parse.
 *
 * The reference says it twice, in two different places, which is a vendor
 * telling you they have been bitten: "If you plan to store or make use of the
 * transaction ID, you should represent it as a unsigned 64-bit integer."
 * JavaScript has no such type. `JSON.parse` produces a double, and above
 * 9,007,199,254,740,991 a double silently rounds — so a transaction id would
 * come back off by one or two with no error anywhere, and Amryn would file a
 * payment against an id that never existed.
 *
 * Today's ids are ten digits and nowhere near that. This exists so that the
 * day they are not is not the day somebody discovers it.
 *
 * The rewrite is deliberately narrow: only after an `"id":` key, and only for
 * runs of sixteen digits or more, which is where the risk begins. Quoting a
 * still-safe sixteen-digit value costs nothing, since every id is turned into
 * text anyway. The one thing it could misread is the characters `"id": <16+
 * digits>` occurring *inside* a string value — free-text metadata containing
 * JSON, say — which would corrupt that string. That is a worse trade than
 * silent rounding only if it ever happens, and rounding is guaranteed.
 */
export function quoteLongIntegers(text: string): string {
  return text.replace(/("id"\s*:\s*)(\d{16,})/g, '$1"$2"');
}

/** Parse a response body without losing long ids on the way. */
export function parseBody(text: string): unknown {
  try {
    return JSON.parse(quoteLongIntegers(text));
  } catch (cause) {
    throw new ProviderError('Paystack sent something we could not read.', {
      retryable: true,
      cause,
    });
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() === '' ? null : value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Read the envelope, or say which way it was malformed. */
export function envelope(body: unknown): PaystackEnvelope {
  const outer = record(body);
  if (!outer) {
    throw new ProviderError('Paystack sent a response in an unexpected shape.', {
      retryable: false,
    });
  }

  return {
    ok: outer.status === true,
    message: text(outer.message) ?? '',
    data: outer.data,
    meta: record(outer.meta),
  };
}

/**
 * One transaction out of the envelope's data.
 *
 * Every field is optional on the way in. A gateway that stops sending `channel`
 * on some record should cost Amryn a null, not a failed sync — but `id` is
 * different: a record with no id cannot be stored without duplicating on the
 * next run, so that one is a refusal.
 */
export function readTransaction(value: unknown): PaystackTransaction {
  const row = record(value);
  if (!row) {
    throw new ProviderError('Paystack sent a transaction we could not read.', {
      retryable: false,
    });
  }

  const id = text(row.id);
  if (!id) {
    throw new ProviderError('Paystack sent a transaction with no identifier.', {
      retryable: false,
    });
  }

  const customer = record(row.customer);

  return {
    id,
    reference: text(row.reference) ?? '',
    status: text(row.status) ?? '',
    amountMinor: number(row.amount),
    currency: text(row.currency),
    channel: text(row.channel),
    paidAt: text(row.paid_at),
    createdAt: text(row.created_at),
    feesMinor: number(row.fees),
    customerEmail: customer ? text(customer.email) : null,
    customerCode: customer ? text(customer.customer_code) : null,
    raw: row,
  };
}

/* ────────────────────────────────────────────────────────────────────────
 * Paging
 * ──────────────────────────────────────────────────────────────────────── */

const CURSOR_PREFIX = 'page:';

/** The first page, or the page a cursor refers to. Invalid cursors are refused. */
export function pageFromCursor(cursor: string | null | undefined): number {
  if (cursor === null || cursor === undefined || cursor === '') return 1;

  if (!cursor.startsWith(CURSOR_PREFIX)) {
    throw new ProviderError('That sync cannot be resumed; it will start again.', {
      retryable: false,
    });
  }

  const page = Number(cursor.slice(CURSOR_PREFIX.length));
  if (!Number.isSafeInteger(page) || page < 1) {
    throw new ProviderError('That sync cannot be resumed; it will start again.', {
      retryable: false,
    });
  }

  return page;
}

export function cursorForPage(page: number): string {
  return `${CURSOR_PREFIX}${page}`;
}

/* ────────────────────────────────────────────────────────────────────────
 * Endpoints
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * List transactions, one page at a time.
 *
 * `GET /transaction`, with the documented `perPage`, `page`, `status` and
 * `from` parameters. A short page ends the walk: the reference gives no total
 * to compare against, and asking for the page after the last one costs a
 * request per sync forever.
 */
export async function listTransactions(
  transport: PaystackTransport,
  options: ListTransactionsOptions = {},
): Promise<TransactionPage> {
  const page = pageFromCursor(options.cursor ?? null);

  const body = await transport({
    path: '/transaction',
    query: {
      perPage: PER_PAGE,
      page,
      status: options.status ?? undefined,
      from: options.since ? options.since.toISOString() : undefined,
    },
  });

  const { ok, data } = envelope(body);
  if (!ok || !Array.isArray(data)) {
    throw new ProviderError('Paystack did not return the transactions we asked for.', {
      retryable: false,
    });
  }

  const transactions = data.map(readTransaction);

  return {
    transactions,
    cursor: transactions.length < PER_PAGE ? null : cursorForPage(page + 1),
  };
}

/**
 * What a key is, established by using it once.
 *
 * `domain` is Paystack's own word for which set of keys this is — 'test' or
 * 'live' on every transaction it returns. Worth surfacing, because connecting
 * a test key and waiting for real revenue to appear is a mistake that looks
 * exactly like a broken sync, and it is the mistake somebody makes at four in
 * the afternoon on their first attempt.
 *
 * Null where the account has no transactions yet. An account with none is a
 * new business rather than a bad key, so this reports what it found instead of
 * refusing.
 */
export interface AccessCheck {
  domain: string | null;
  currency: string | null;
  hasTransactions: boolean;
}

/**
 * Confirm a key works, as cheaply as the API allows.
 *
 * One page of one record. There is no dedicated "who am I" endpoint in the
 * reference read here, and inventing a path to one would be exactly the
 * failure this connector was written to avoid — so the check is the smallest
 * documented read, which proves the same three things: the key is accepted,
 * the account exists, and the transactions endpoint is reachable.
 */
export async function checkAccess(transport: PaystackTransport): Promise<AccessCheck> {
  const { ok, data } = envelope(
    await transport({ path: '/transaction', query: { perPage: 1, page: 1 } }),
  );

  if (!ok || !Array.isArray(data)) {
    throw new ProviderError('Paystack did not accept that key.', { retryable: false });
  }

  const first = data.length > 0 ? readTransaction(data[0]) : null;

  return {
    domain: first ? text(first.raw.domain) : null,
    currency: first ? first.currency : null,
    hasTransactions: data.length > 0,
  };
}

/**
 * Fetch one transaction by Paystack's own id.
 *
 * `GET /transaction/:id`. Used to re-read a single record rather than to
 * verify a payment — verification is `/transaction/verify/:reference`, which
 * belongs to a checkout flow Amryn does not have and is therefore not here.
 */
export async function fetchTransaction(
  transport: PaystackTransport,
  id: string,
): Promise<PaystackTransaction> {
  const { ok, data } = envelope(await transport({ path: `/transaction/${encodeURIComponent(id)}` }));
  if (!ok) {
    throw new ProviderError('Paystack could not find that transaction.', { retryable: false });
  }
  return readTransaction(data);
}

/* ────────────────────────────────────────────────────────────────────────
 * The transport that actually speaks to Paystack
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Check the key is present before spending a request on it.
 *
 * Present and non-blank, and nothing more. Paystack's dashboard distinguishes
 * a secret key from a public one, and a check on the prefix would catch the
 * commonest mistake — but the key *format* is not stated in the reference read
 * here, and a format check written from memory rejects valid keys the day the
 * vendor issues a new prefix. A wrong key already fails on the first request
 * with Paystack's own message, which is the right authority for it.
 */
function bearer(secretKey: string): string {
  const key = secretKey.trim();
  if (!key) {
    throw new ProviderError('That Paystack connection has no key.', { retryable: false });
  }
  return key;
}

function url(request: PaystackRequest): string {
  const target = new URL(`${PAYSTACK_BASE_URL}${request.path}`);
  for (const [name, value] of Object.entries(request.query ?? {})) {
    if (value !== undefined) target.searchParams.set(name, String(value));
  }
  return target.toString();
}

/**
 * Talk to Paystack directly.
 *
 * GET only — see the header. The key travels in a header and never in a URL,
 * so it cannot reach a request log or an error message; no branch below puts
 * the response body or the key into a ProviderError, because a ProviderError
 * is shown to a customer and a gateway's error body can carry another
 * customer's reference.
 */
export function directTransport(secretKey: string): PaystackTransport {
  return async (request: PaystackRequest): Promise<unknown> => {
    // Read before the request, so a missing key is reported as a missing key
    // rather than caught below and reported as an unreachable gateway.
    const token = bearer(secretKey);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url(request), {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: controller.signal,
        cache: 'no-store',
      });
    } catch (cause) {
      throw new ProviderError('We could not reach Paystack just now.', {
        retryable: true,
        cause,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) throw failure(response.status);

    return parseBody(await response.text());
  };
}

/**
 * A refused request, in words a customer can act on.
 *
 * The three that need separating are 401 — the key is wrong or has been
 * rotated, which is the customer's to fix — 429, which is ours to back off
 * from, and 5xx, which is Paystack's and passes. Everything else is a fault in
 * the request and no amount of retrying improves it.
 */
function failure(status: number): ProviderError {
  if (status === 401 || status === 403) {
    return new ProviderError('Paystack would not accept that key. It may have been rotated.', {
      retryable: false,
    });
  }
  if (status === 429) {
    return new ProviderError('Paystack is asking us to slow down. We will try again shortly.', {
      retryable: true,
    });
  }
  if (status >= 500) {
    return new ProviderError('Paystack is having trouble. We will try again shortly.', {
      retryable: true,
    });
  }
  return new ProviderError('Paystack refused that request.', { retryable: false });
}
