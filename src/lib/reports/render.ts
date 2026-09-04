import type { WeeklyBrief } from '@/lib/intelligence/briefing';
import type { Workspace } from '@/lib/workspace';
import { compactMoney, count, date, percent, score } from '@/lib/format';

/**
 * The formal executive report, as a print-ready HTML document.
 *
 * **Why HTML and not a generated PDF file.** Producing a real PDF server-side
 * means either a headless Chromium in the deployment — hundreds of megabytes,
 * a cold start measured in seconds, and a container image several times the
 * size of the application — or a PDF drawing library, which means
 * re-implementing layout,
 * fonts, page breaks and table wrapping by hand and getting a document that
 * looks nothing like the platform.
 *
 * The browser already has a typesetter. This page is styled for A4 with real
 * page breaks and print margins, and "Print → Save as PDF" produces a file
 * indistinguishable from a generated one. If a genuinely headless pipeline is
 * needed later — emailing the report on a schedule, say — this same HTML is
 * what a renderer would be pointed at, so nothing here is throwaway.
 *
 * The document is deliberately self-contained: inline styles, no external
 * fonts, no scripts. A report that needs the network to look right is a report
 * that will one day be printed looking wrong.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sectionHtml(heading: string, body: string, items?: string[]): string {
  const list = items?.length
    ? `<ol class="items">${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ol>`
    : '';
  return `
    <section class="brief">
      <h2>${escapeHtml(heading)}</h2>
      <p>${escapeHtml(body)}</p>
      ${list}
    </section>`;
}

export function renderReport(workspace: Workspace, brief: WeeklyBrief): string {
  const w = workspace;
  const currency = w.profile.currency;

  const indicators: Array<[string, string]> = [
    ['Revenue YTD', compactMoney(w.ytd.revenue, currency)],
    ['Gross profit', compactMoney(w.ytd.grossProfit, currency)],
    ['Net profit', compactMoney(w.ytd.netProfit, currency)],
    ['Gross margin', percent(w.ytd.grossMargin)],
    ['Net cash YTD', compactMoney(w.ytd.netCash, currency)],
    ['Customers', count(w.ytd.totalCustomers)],
    ['Business Health', `${score(w.health.overall)}/100 ${w.health.status}`],
    ['Open risks', count(w.riskSummary.open)],
  ];

  const inv = w.inventory.summary;

  return `<!doctype html>
<html lang="en-ZA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(brief.title)} — ${escapeHtml(brief.companyName)}</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }

  :root {
    --ink: #1a2332;
    --muted: #6b7c93;
    --faint: #94a3b8;
    --brand: #004aad;
    --line: #e2e8f0;
    --inset: #f5f7fa;
  }

  * { box-sizing: border-box; }

  body {
    margin: 0;
    padding: 24px;
    background: #fff;
    color: var(--ink);
    font: 400 11pt/1.5 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    max-width: 190mm;
    margin-inline: auto;
  }

  h1, h2, h3 { font-family: Outfit, 'Segoe UI', sans-serif; letter-spacing: -0.02em; }

  .masthead { border-bottom: 2px solid var(--brand); padding-bottom: 12px; margin-bottom: 20px; }
  .brandline { font: 500 8pt/1 Outfit, 'Segoe UI', sans-serif; letter-spacing: 0.14em; text-transform: uppercase; color: var(--brand); }
  h1 { margin: 8px 0 4px; font-size: 20pt; }
  .meta { margin: 0; font-size: 9.5pt; color: var(--muted); }
  sup { font-size: 0.55em; vertical-align: 0.5em; }

  .indicators { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 22px; }
  .indicator { border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px; }
  .indicator dt { font: 500 7.5pt/1.2 Outfit, 'Segoe UI', sans-serif; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); margin: 0; }
  .indicator dd { margin: 4px 0 0; font: 600 12pt/1.1 'IBM Plex Mono', monospace; font-variant-numeric: tabular-nums; }

  /* Sections must not be split across a page break — a heading orphaned at the
     foot of a page is the classic way a printed report reads as broken. */
  .brief { break-inside: avoid; margin-bottom: 16px; }
  .brief h2 { margin: 0 0 5px; font-size: 11pt; color: var(--brand); }
  .brief h2::before { content: '◆ '; }
  .brief p { margin: 0; font-size: 10pt; }
  .items { margin: 6px 0 0; padding-left: 18px; font-size: 10pt; }
  .items li { margin-bottom: 3px; }

  .block { break-inside: avoid; margin: 22px 0; }
  .block h2 { font-size: 11pt; margin: 0 0 8px; padding-bottom: 5px; border-bottom: 1px solid var(--line); }

  table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  th { text-align: left; padding: 5px 7px; border-bottom: 1px solid var(--line); background: var(--inset);
       font: 500 7.5pt/1.2 Outfit, 'Segoe UI', sans-serif; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
  td { padding: 5px 7px; border-bottom: 1px solid var(--line); vertical-align: top; }
  td.num, th.num { text-align: right; font-family: 'IBM Plex Mono', monospace; font-variant-numeric: tabular-nums; white-space: nowrap; }

  .footnote { margin-top: 26px; padding-top: 10px; border-top: 1px solid var(--line); font-size: 8pt; line-height: 1.5; color: var(--faint); }

  .hint { margin-bottom: 18px; padding: 8px 12px; border: 1px solid var(--brand); border-radius: 6px;
          background: #e8eef8; font-size: 9pt; color: var(--brand); }
  @media print { .hint { display: none; } }
</style>
</head>
<body>

<p class="hint">
  To save this as a PDF: print this page (Ctrl/Cmd + P) and choose &ldquo;Save as PDF&rdquo;.
  Page size and margins are already set for A4. This note does not print.
</p>

<header class="masthead">
  <p class="brandline">Amryn<sup>™</sup> AIGrowthIntelligence<sup>®</sup></p>
  <h1>${escapeHtml(brief.title)}</h1>
  <p class="meta">
    ${escapeHtml(brief.companyName)} &middot; ${escapeHtml(w.profile.location)}
    &middot; ${escapeHtml(brief.weekEnding)}
    &middot; Generated ${escapeHtml(date(w.asOf.toISOString().slice(0, 10)))}
  </p>
</header>

<dl class="indicators">
  ${indicators
    .map(
      ([k, v]) =>
        `<div class="indicator"><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`,
    )
    .join('')}
</dl>

${brief.sections.map((s) => sectionHtml(s.heading, s.body, s.items)).join('')}

<div class="block">
  <h2>Branch performance</h2>
  <table>
    <thead>
      <tr>
        <th>Branch</th><th class="num">Revenue YTD</th><th class="num">Net profit</th>
        <th class="num">Customers</th><th class="num">Health</th>
      </tr>
    </thead>
    <tbody>
      ${w.branches
        .map(
          (b) => `<tr>
            <td>${escapeHtml(b.name)}</td>
            <td class="num">${escapeHtml(compactMoney(b.revenueYtd, currency))}</td>
            <td class="num">${escapeHtml(compactMoney(b.netProfit, currency))}</td>
            <td class="num">${escapeHtml(count(b.customers))}</td>
            <td class="num">${b.healthScore}/100</td>
          </tr>`,
        )
        .join('')}
    </tbody>
  </table>
</div>

<div class="block">
  <h2>Opportunity pipeline</h2>
  <table>
    <thead>
      <tr><th>ID</th><th>Opportunity</th><th class="num">Est. value</th><th class="num">Score</th><th>Status</th></tr>
    </thead>
    <tbody>
      ${w.opportunities
        .map(
          (o) => `<tr>
            <td class="num">${escapeHtml(o.id)}</td>
            <td>${escapeHtml(o.title)}</td>
            <td class="num">${escapeHtml(compactMoney(o.estValue, currency))}</td>
            <td class="num">${escapeHtml(score(o.score, 0))}</td>
            <td>${escapeHtml(o.status)}</td>
          </tr>`,
        )
        .join('')}
    </tbody>
  </table>
</div>

<div class="block">
  <h2>Risk register</h2>
  <table>
    <thead>
      <tr><th>ID</th><th>Risk</th><th class="num">Score</th><th>Class</th><th>Owner</th><th>Due</th><th>Trend</th></tr>
    </thead>
    <tbody>
      ${w.risks
        .map(
          (r) => `<tr>
            <td class="num">${escapeHtml(r.id)}</td>
            <td>${escapeHtml(r.risk)}</td>
            <td class="num">${r.score.toFixed(2)}</td>
            <td>${escapeHtml(r.classification)}</td>
            <td>${escapeHtml(r.owner)}</td>
            <td>${escapeHtml(date(r.dueDate))}</td>
            <td>${escapeHtml(r.trend)}</td>
          </tr>`,
        )
        .join('')}
    </tbody>
  </table>
</div>

<div class="block">
  <h2>Inventory compliance &mdash; ${escapeHtml(w.inventory.settings.siteName)}</h2>
  <table>
    <thead>
      <tr>
        <th>Total lines</th><th class="num">Expired</th><th class="num">Critical</th>
        <th class="num">Warning</th><th class="num">Clear</th><th class="num">Compliance</th>
        <th class="num">Dormant</th><th class="num">Pending review</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="num">${inv.totalItems}</td>
        <td class="num">${inv.expired}</td>
        <td class="num">${inv.critical}</td>
        <td class="num">${inv.warning}</td>
        <td class="num">${inv.clear}</td>
        <td class="num">${escapeHtml(percent(inv.complianceRate, 0))}</td>
        <td class="num">${inv.dormantItems}</td>
        <td class="num">${inv.pendingReview}</td>
      </tr>
    </tbody>
  </table>
  <p style="margin-top:8px;font-size:8.5pt;color:var(--muted)">
    ${escapeHtml(w.inventory.profile.retentionNote)}
  </p>
</div>

<p class="footnote">
  ${escapeHtml(brief.disclaimer)}
  ${w.isDemo ? 'All figures in this report are an illustrative demonstration, not real client data. ' : ''}
  Amryn<sup>™</sup> AIGrowthIntelligence<sup>®</sup>, Amryn<sup>™</sup>DigitalTwin<sup>®</sup> and
  Amryn<sup>™</sup>OpportunityRadar<sup>®</sup> are trademarks of Amryn. &copy; 2026 Amryn.
  All rights reserved.
</p>

</body>
</html>`;
}
