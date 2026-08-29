# Amryn™ AIGrowthIntelligence®

Static front end for Amryn — AI growth intelligence for businesses building a
growth engine. The page leads with a working **Executive Command Centre** demo
rather than describing one. Plain HTML, CSS and JS. No build step.

## Structure

```
docs/                → everything GitHub Pages serves
  index.html         → positioning band, Command Centre shell, content bands
  styles.css         → design system + layout
  app.js             → workspace data + all Command Centre behaviour
  brand/             → supplied brand artwork (see BRAND-USAGE.txt)
  .nojekyll          → tells Pages to serve the folder as-is
.github/workflows/deploy.yml
```

## Deploying

Pages is already enabled with **Source: GitHub Actions**. Every push to `main`
redeploys. See **Custom domain** below for where the site is served.

## The Command Centre

`app.js` renders every view from the `WORKSPACES` object — nothing in the
dashboard is hard-coded in the HTML. Switching workspace or period recomputes
the whole view.

Three workspaces ship, at deliberately different scales, because Amryn is sized
to a decision rather than to a company:

| Key | Business | Scale |
|---|---|---|
| `highveld` | Highveld Supply Co. | Single site · 14 staff |
| `meridian` | Meridian Retail Group | Multi-branch · 9 sites · 210 staff |
| `kalahari` | Kalahari Freight & Logistics | National · 4 depots · 480 staff |

Each carries its own `revenue` series, health `score` and `bars`, `metrics`,
`feed`, `risks`, `ops` (radar signals) and `acts` (action register). To add a
workspace, add a key with the same shape — the selector populates itself.

Views: **Command Centre** (summary), **DigitalTwin®**, **OpportunityRadar®**,
**Actions**, **Intelligence Loop**. The rail switches them; `data-goto` buttons
inside tiles jump between them.

Interactive behaviour worth knowing about:

- **Period** re-slices the revenue series and redraws the chart and its note.
- **Filter** on the radar narrows signals; blips are regenerated to match, and
  blip ↔ card highlighting is wired both ways.
- **Action register** ticks persist per workspace in `localStorage`, and drive
  the progress bar, the rail badge and the Command Centre summary.
- Radar blip position is derived from each signal's `urgency` (distance from
  centre) and `size` (revenue at stake), with a stable per-id angle.

## Brand

Artwork in `docs/brand/` is used exactly as supplied. `BRAND-USAGE.txt` is the
pack's own rule sheet; the short version:

- Never re-colour, stretch, rotate or outline a mark.
- Lockups never below 90px wide; the icon mark never below 24px.
- Use the `-ondark` variants on backgrounds darker than 50% luminance.
- Brand names are never uppercased — the solid capitalisation
  (`AIGrowthIntelligence®`, `DigitalTwin®`, `OpportunityRadar®`) is part of
  the mark.

Palette: `#004AAD` brand blue, `#081B33` dark navy, `#3E7BD6` lifted blue
(on navy only — brand blue is near-invisible there).

**Known conflict:** the brand pack sets the products solid and without an "AI"
prefix (`Amryn™DigitalTwin®`), and ships product-mark artwork that way. The
Master Business-Building Blueprint writes them as `Amryn™ AI Digital Twin®`.
The site follows the pack, since that is the trademark form and the artwork
that exists. If the blueprint wins instead, the two product-mark PNGs need
reissuing and the panel headings go back to live text.

## Editing the demo data

All of it lives at the top of `app.js`:

- **Revenue** — the `revenue` array per workspace, monthly, in thousands of Rand.
  Twelve entries; `MONTHS` labels them.
- **Health score** — `score` and `scoreDelta`; the ring and the counter both read it.
- **Radar signals** — `ops[]`. `kind` is `opportunity` or `threat`, `urgency`
  is 0–1 (0 = centre), `size` is the blip radius in SVG units.
- **Actions** — `acts[]` as `[title, rationale, owner, effort, outcome]`.

## Positioning

Copy follows section 11 of the Master Business-Building Blueprint: *See Your
Business. See Your Market. Know What To Do Next.* — with the philosophy line
*Business Inside + Market Outside = Intelligent Growth* carried through the
page and the footer.

## Custom domain

The site is served at `amryn.co.za`. `docs/CNAME` carries the domain so it
survives every redeploy rather than living only in repo settings.

DNS at the registrar:

| Host | Type | Value |
|---|---|---|
| `@` | A | `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` |
| `@` | AAAA | `2606:50c0:8000::153`, `:8001::153`, `:8002::153`, `:8003::153` |
| `www` | CNAME | `danielsmith960416.github.io` |

Then **Settings → Pages → Custom domain** → `amryn.co.za`, wait for the DNS
check, and tick **Enforce HTTPS** once the certificate is issued.

Ordering matters: configuring the domain makes GitHub redirect
`danielsmith960416.github.io/Amryn/` to it, so point DNS *before* this lands on
`main` or the live site goes dark in between.

`og:url`, `og:image` and the canonical link are absolute against
`https://amryn.co.za/` — they are wrong until the domain resolves, which is
why they ship in the same commit as the CNAME.
