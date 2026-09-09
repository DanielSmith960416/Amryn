import { SECTIONS, SECTION_LABEL, type BriefItem, type EmptySection, type Section } from './compose';

/**
 * The brief as an email.
 *
 * Pure: takes what was composed and returns the message. No transport, no
 * database, no clock — so what the email actually says can be asserted in a
 * test rather than read in an inbox.
 *
 * ── the citation travels with the item ────────────────────────────────────
 *
 * Every item carries the record it came from, and the email prints it. That is
 * the point of the whole change: an email is the one place a figure ends up
 * furthest from the platform that produced it — forwarded, pasted into a board
 * pack, quoted back six weeks later — and a claim that arrives with no way to
 * check it is the thing this brief exists not to be.
 *
 * ── plain text is not the fallback ────────────────────────────────────────
 *
 * Both parts are written deliberately. A brief read on a phone at six in the
 * morning, in a client that blocks images and styles, should say exactly what
 * the HTML says. So the text part is composed rather than stripped.
 */

export interface BriefEmail {
  subject: string;
  text: string;
  html: string;
}

export interface BriefEmailInput {
  organisationName: string;
  briefDate: string;
  items: readonly BriefItem[];
  empty: readonly EmptySection[];
  /** Where to read it in full. Absent when no site URL is configured. */
  url?: string;
}

export function renderBriefEmail(input: BriefEmailInput): BriefEmail {
  const { organisationName, briefDate, items, empty, url } = input;

  const subject =
    items.length === 0
      ? `${organisationName} — nothing to report, ${briefDate}`
      : `${organisationName} — ${items[0]!.headline}`;

  return { subject, text: text(), html: html(input) };

  // Closes over the destructured input above rather than taking it again: two
  // bindings for one value is how a renderer ends up printing yesterday's
  // items under today's date.
  function text(): string {
    const lines: string[] = [
      `${organisationName} — morning brief, ${briefDate}`,
      '',
    ];

    if (items.length === 0) {
      lines.push('Nothing needed your attention this morning.', '');
    }

    for (const item of ordered(items)) {
      lines.push(
        `${item.rank}. ${SECTION_LABEL[item.section]} — ${item.headline}`,
        `   ${item.detail}`,
        `   From: ${item.sourceTable} ${item.sourceId}`,
        '',
      );
    }

    if (empty.length > 0) {
      lines.push('Looked at and found nothing:');
      for (const section of empty) {
        lines.push(`   ${SECTION_LABEL[section.section]} — ${section.reason}`);
      }
      lines.push('');
    }

    if (url) lines.push(`Read it in full: ${url}`);

    lines.push(
      '',
      'Every line above names the record it came from. Nothing here is written by a model.',
    );

    return lines.join('\n');
  }
}

/* ── the HTML half ─────────────────────────────────────────────────────── */

function html(input: BriefEmailInput): string {
  const { organisationName, briefDate, items, empty, url } = input;

  /*
   * Inline styles and a table-free layout, because a mail client is not a
   * browser: no stylesheet, no custom properties, no dark-mode media query
   * worth relying on. Colours are chosen to read on white and on the grey most
   * clients substitute in dark mode, rather than to match the product.
   */
  const rows = ordered(items)
    .map(
      (item) => `
      <tr><td style="padding:0 0 20px 0;">
        <div style="font:600 11px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#6b7280;">
          ${escape(SECTION_LABEL[item.section])}
        </div>
        <div style="font:600 16px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:#111827;margin-top:4px;">
          ${escape(item.headline)}
        </div>
        <div style="font:400 14px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#374151;margin-top:6px;">
          ${escape(item.detail)}
        </div>
        <div style="font:400 12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:#6b7280;margin-top:8px;">
          From ${escape(item.sourceTable)} · ${escape(item.sourceId)}
        </div>
      </td></tr>`,
    )
    .join('');

  const nothing =
    items.length === 0
      ? `<tr><td style="padding:0 0 20px 0;font:400 15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#374151;">
           Nothing needed your attention this morning.
         </td></tr>`
      : '';

  const quiet =
    empty.length === 0
      ? ''
      : `<tr><td style="padding:16px 0 0 0;border-top:1px solid #e5e7eb;">
           <div style="font:600 11px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#6b7280;">
             Looked at and found nothing
           </div>
           ${empty
             .map(
               (section) => `<div style="font:400 13px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#6b7280;margin-top:6px;">
                  <strong style="color:#374151;">${escape(SECTION_LABEL[section.section])}</strong> — ${escape(section.reason)}
                </div>`,
             )
             .join('')}
         </td></tr>`;

  const link = url
    ? `<tr><td style="padding:20px 0 0 0;">
         <a href="${escape(url)}" style="font:600 14px/1 -apple-system,Segoe UI,Roboto,sans-serif;color:#111827;">Read it in full →</a>
       </td></tr>`
    : '';

  return `<div style="background:#f9fafb;padding:24px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;">
    <tr><td style="padding:24px 24px 8px 24px;">
      <div style="font:600 15px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:#111827;">${escape(organisationName)}</div>
      <div style="font:400 13px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:#6b7280;margin-top:2px;">Morning brief · ${escape(briefDate)}</div>
    </td></tr>
    <tr><td style="padding:16px 24px 0 24px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        ${nothing}${rows}${quiet}${link}
      </table>
    </td></tr>
    <tr><td style="padding:20px 24px 24px 24px;">
      <div style="font:400 12px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:12px;">
        Every line above names the record it came from. Nothing here is written by a model.
      </div>
    </td></tr>
  </table>
</div>`;
}

/* ── helpers ───────────────────────────────────────────────────────────── */

/** By rank, which is by impact. The composer already decided; this only obeys. */
function ordered(items: readonly BriefItem[]): BriefItem[] {
  return [...items].sort((a, b) => a.rank - b.rank);
}

/**
 * Everything interpolated goes through this.
 *
 * Item text comes from the database — a recommendation's title, a market
 * signal's summary — and a signal's summary is the one field in this whole
 * message that originated outside the platform. An apostrophe in a company
 * name is the common case; a `<script>` in a scraped headline is the reason
 * this is not optional.
 */
function escape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Exported for the test that asserts every section has a label. */
export const ALL_SECTIONS: readonly Section[] = SECTIONS;
