# Amryn™ AI Growth Intelligence®

Static single-page dashboard for Amryn — a business intelligence and growth
monitoring service for SMBs. Plain HTML, CSS and JS. No build step.

## Structure

```
docs/            → everything GitHub Pages serves
  index.html     → the page
  styles.css     → design system + layout
  app.js         → chart, dial, counters, radar interactions
  .nojekyll      → tells Pages to serve the folder as-is
.github/workflows/deploy.yml
```

## Deploying

1. Push this to the `main` branch of `DanielSmith960416/Amryn`.
2. In the repo, open **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **GitHub Actions**.

Every push to `main` then rebuilds the site. It lands at
`https://danielsmith960416.github.io/Amryn/`.

If you would rather not use Actions at all, you can instead set Source to
**Deploy from a branch → main → /docs**. The workflow becomes unnecessary in
that case, but leaving it in place does no harm.

## Editing the sample data

The briefing shown is illustrative — a fictional client, Highveld Supply Co.

- **Revenue trend** — the `revenue` array at the top of `app.js` (monthly, in
  thousands of Rand). Add or remove months and the chart redraws itself.
- **Health score** — `data-score` on the `.score__fill` circle in `index.html`.
- **Animated numbers** — any element with `data-count`. Optional
  `data-dec` (decimal places), `data-comma="1"` (thousands separators),
  `data-suffix`.
- **Radar blips** — the `cx` / `cy` on each `.blip` in `index.html`. Distance
  from centre reads as urgency, radius reads as revenue at stake. The
  `data-op` value links a blip to its opportunity card.

## Design notes

The mark is a split triangle: the black half is the inside view
(Amryn™ AI Digital Twin®), the blue half is the outside view
(Amryn™ AI Opportunity Radar®). Each panel is headed by its own half of the
mark, so the logo doubles as wayfinding.

The dashboard uses no red or green. Blue carries opportunity and improvement,
black carries attention — which keeps every signal on-brand and avoids the
traffic-light look of generic BI tools.

Fonts are Archivo (display), IBM Plex Sans (body) and IBM Plex Mono (data and
labels), loaded from Google Fonts.
