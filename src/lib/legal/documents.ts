/**
 * The legal documents, and the details they depend on.
 *
 * ── read this before going live ───────────────────────────────────────────
 * These are drafts written to be complete in structure and honest in
 * substance. They are not legal advice and have not been reviewed by an
 * attorney. POPIA obliges a responsible party to register an Information
 * Officer with the Information Regulator and to name them; several fields
 * below cannot be invented and must be filled in before a real customer sees
 * these pages.
 *
 * The version string is the point of this file being code. Consent is recorded
 * against a version, because agreeing to one wording is not agreeing to a
 * later one — so changing a document means changing VERSION, after which
 * everyone's recorded consent correctly reads as consent to something else.
 */

/** Bump when the wording changes materially. Recorded alongside every acceptance. */
export const LEGAL_VERSION = '2026-08-31';

/**
 * Details the documents cannot be honest without.
 *
 * Deliberately obvious placeholders rather than plausible-looking inventions:
 * a made-up registration number in a privacy policy is worse than a visible
 * blank, because nobody notices it.
 */
export const RESPONSIBLE_PARTY = {
  legalName: 'Amryn (Pty) Ltd',
  registrationNumber: '[COMPANY REGISTRATION NUMBER]',
  address: '[REGISTERED ADDRESS]',
  informationOfficer: '[INFORMATION OFFICER NAME]',
  informationOfficerEmail: '[INFORMATION OFFICER EMAIL]',
  supportEmail: '[SUPPORT EMAIL]',
} as const;

/** True when the placeholders are still in place, so the pages can say so. */
export function hasUnfilledDetails(): boolean {
  return Object.values(RESPONSIBLE_PARTY).some((value) => value.includes('['));
}

export const REGULATOR = {
  name: 'Information Regulator (South Africa)',
  complaints: 'https://inforegulator.org.za',
  email: 'complaints.IR@justice.gov.za',
} as const;

/**
 * Where personal information goes, and why. Rendered as a table in the policy.
 *
 * Every location here was written as "depends on the region chosen" until the
 * deployment existed and somebody looked. They are now the regions actually in
 * use, read from the providers rather than assumed:
 *
 *   · Supabase project region  eu-west-1  (Ireland)
 *   · Railway service region   ams        (Netherlands)
 *
 * "Depends" is an honest answer for a product that has not been deployed and a
 * useless one for a customer asking where their invoices are kept. If a region
 * changes, this table changes with it — that is the whole reason the policy
 * reads from here instead of restating it in prose.
 */
export const PROCESSORS = [
  {
    name: 'Supabase',
    purpose: 'Database, authentication and file storage',
    location: 'Ireland (European Union)',
  },
  {
    name: 'Railway',
    purpose: 'Application hosting — the server that runs the platform, and backups',
    location: 'Netherlands (European Union)',
  },
  {
    name: 'Cloudflare',
    purpose:
      'Domain name resolution, content delivery, TLS termination and the web application firewall',
    location: 'Global edge network; the nearest location to the visitor answers',
  },
  {
    name: 'Resend',
    purpose: 'Sending invitations, sign-in links, password resets and the daily brief',
    // Not asserted. Resend's own processing region has not been confirmed
    // against their documentation, and a privacy policy is the last place to
    // guess. It says what it knows and no more.
    location: 'To be confirmed with the provider',
  },
  {
    name: 'Nango',
    purpose:
      'Holds the credentials for systems you connect — your accounting, payments and sales tools — and refreshes them.',
    location: 'European Union',
  },
  {
    name: 'Your chosen AI provider',
    purpose:
      'Optional. Phrasing findings the platform has already calculated. Disabled unless a key is configured.',
    location: 'United States',
  },
] as const;

/**
 * Where the data actually lives, in a sentence a customer can act on.
 *
 * POPIA section 72 governs sending personal information outside the Republic.
 * It permits it — a recipient bound by a law with substantially similar
 * protection is one of the grounds, and the EU's regime is the usual example —
 * but permission is not the same as silence. A South African business is
 * entitled to know that its invoices, bank transactions and staff records are
 * held in Ireland before it uploads them, not after it asks.
 *
 * Kept beside the processor table rather than written into a page, because
 * three pages say this and three copies of a sentence about data residency is
 * how one of them comes to be wrong.
 */
export const DATA_RESIDENCY = {
  /** Named for the reader, not the region code. */
  countries: ['Ireland', 'the Netherlands'] as const,
  summary:
    'Your information is stored on servers in Ireland and the Netherlands, inside the European Union. ' +
    'Amryn is a South African company and this is a cross-border transfer under POPIA — permitted, ' +
    'because European data protection law offers protection comparable to South Africa\u2019s, and ' +
    'worth telling you plainly rather than leaving in a policy nobody opens.',
  /** The one sentence a signup or an upload screen has room for. */
  short: 'Stored in the EU (Ireland and the Netherlands).',
} as const;

/**
 * What is collected, why, and on what lawful basis.
 *
 * POPIA requires processing to rest on a stated basis. Writing them out here
 * rather than in prose means the policy page and any future record of
 * processing activities read from one source.
 */
export const PROCESSING = [
  {
    category: 'Account details',
    items: 'Name, email address, password (stored only as a hash we cannot reverse)',
    purpose: 'Identifying you, signing you in, and contacting you about the service',
    basis: 'Necessary to perform the contract you entered when creating an account',
  },
  {
    category: 'Organisation details',
    items: 'Organisation name, industry, country, currency, structure and membership',
    purpose: 'Separating your workspace from every other, and deciding what each member may see',
    basis: 'Necessary to perform the contract',
  },
  {
    category: 'Business data you enter or import',
    items: 'Metrics, customers, opportunities, risks, documents and anything else you upload',
    purpose: 'Providing the analysis the platform exists to provide',
    basis:
      'Necessary to perform the contract. Where this includes other people’s personal information, your organisation is the responsible party and we act as an operator on your instruction.',
  },
  {
    category: 'Security records',
    items:
      'Timestamps of sign-ins, sign-outs, failed sign-in attempts, password changes, invitations and organisation setting changes, plus hashed identifiers used to limit repeated attempts',
    purpose: 'Detecting misuse, and being able to answer what happened to an account',
    basis: 'Our legitimate interest in keeping the service and your data secure',
  },
  {
    category: 'Technical records',
    items: 'IP address and browser details, retained briefly and in hashed form where practical',
    purpose: 'Preventing automated abuse of sign-in and sign-up',
    basis: 'Our legitimate interest in preventing unauthorised access',
  },
] as const;

/** How long things are kept. Vague retention is a common failing; these are specific. */
export const RETENTION = [
  { what: 'Your account', period: 'Until you close it, or ask us to delete it' },
  {
    what: 'Your organisation’s business data',
    period:
      'Until your organisation deletes it or ends its subscription, then 30 days before permanent deletion',
  },
  { what: 'Security records', period: '12 months' },
  { what: 'Rate-limiting records', period: '24 hours, and never in a form that identifies you' },
  {
    what: 'Records we must keep by law',
    period: 'As long as the relevant law requires, and no longer',
  },
] as const;
