/**
 * What Amryn reads out of a customer's Paystack account, in Amryn's words.
 *
 * api.ts speaks Paystack. This file is the translation, and it stops here: no
 * caller above needs to know that a failed payment is the same endpoint as a
 * transaction with a query parameter, or that an amount arrives in the
 * currency's subunit.
 *
 * It is written against `PaystackTransport` rather than against a credential,
 * which means every line below is settled whether Amryn ends up calling
 * Paystack directly or proxying through Nango. That question is still open —
 * Nango's guide for API-key integrations has not been read — and this is the
 * work that does not depend on the answer.
 *
 * ── the kinds are the documented ones ────────────────────────────────────
 *
 * Two, and only two, because the transactions reference is what has been read.
 * Refunds, payouts and the customer list are real parts of Paystack's API and
 * are not here: their pages have not been opened, and a `kind` that names an
 * endpoint nobody has checked is the same mistake as a number filled in from
 * memory. Adding them is a small change to this file once somebody reads them.
 */
import type { FetchPage, FetchedRecord } from '../provider';
import {
  listTransactions,
  type PaystackTransaction,
  type PaystackTransport,
} from './api';

/** An Amryn read, and the documented Paystack filter that serves it. */
interface Read {
  kind: string;
  /** The documented `status` filter, or null for everything. */
  status: 'failed' | null;
  /** One line for a connection card or a sync log. */
  describes: string;
}

export const PAYSTACK_READS: readonly Read[] = [
  {
    kind: 'transactions',
    status: null,
    describes: 'Every payment attempt, with its amount, channel, fee and customer.',
  },
  {
    /*
     * Not a second endpoint — the same list, filtered to `status=failed`.
     *
     * It earns its own kind because a business asking "how much are we losing
     * at checkout" is asking a different question from "what did we take", and
     * a sync that had to pull every transaction to answer it would be pulling
     * the whole history to count a fraction of it.
     */
    kind: 'failed_payments',
    status: 'failed',
    describes: 'Payments that did not go through, so the loss can be counted.',
  },
];

export function paystackRead(kind: string): Read | null {
  return PAYSTACK_READS.find((read) => read.kind === kind) ?? null;
}

/**
 * One transaction as a record Amryn can store.
 *
 * `attributes` carries Paystack's own payload untouched, per the interface:
 * mapping into financial_records is the caller's job and needs the fields this
 * file did not think to name. The parsed fields sit beside it rather than
 * instead of it — `amount_minor` spelled out so nobody downstream divides by a
 * hundred twice, and `id` as text because Paystack asks for it to be held as a
 * 64-bit integer and JavaScript has no such thing.
 *
 * `updatedAt` is `paid_at` where there is one and `created_at` otherwise. A
 * failed or abandoned transaction never gets a paid_at, and using it alone
 * would make every failure look like it had no time at all.
 */
export function toRecord(kind: string, transaction: PaystackTransaction): FetchedRecord {
  return {
    externalId: transaction.id,
    kind,
    attributes: {
      id: transaction.id,
      reference: transaction.reference,
      status: transaction.status,
      amount_minor: transaction.amountMinor,
      currency: transaction.currency,
      channel: transaction.channel,
      fees_minor: transaction.feesMinor,
      paid_at: transaction.paidAt,
      created_at: transaction.createdAt,
      customer_email: transaction.customerEmail,
      customer_code: transaction.customerCode,
      paystack: transaction.raw,
    },
    updatedAt: transaction.paidAt ?? transaction.createdAt ?? undefined,
  };
}

/**
 * One page of one kind, ready for the sync engine.
 *
 * An unknown kind returns an empty page rather than throwing. The catalogue is
 * what decides which kinds exist, and a connector asked for a kind it does not
 * serve is a mismatch between two of our own files — worth an empty result and
 * a sync that finishes, not an error a customer reads.
 */
export async function readPage(
  transport: PaystackTransport,
  request: { kind: string; cursor: string | null; since: Date | null },
): Promise<FetchPage> {
  const read = paystackRead(request.kind);
  if (!read) return { records: [], cursor: null };

  const page = await listTransactions(transport, {
    cursor: request.cursor,
    since: request.since,
    status: read.status,
  });

  return {
    records: page.transactions.map((transaction) => toRecord(read.kind, transaction)),
    cursor: page.cursor,
  };
}
