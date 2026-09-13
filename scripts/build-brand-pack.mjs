#!/usr/bin/env node
/**
 * Builds docs/brand-pack.html — the brand pack as one file somebody can save.
 *
 *   node scripts/build-brand-pack.mjs
 *
 * ── why a build rather than a hand-written page ───────────────────────────
 * The pack has to show the assets, and a page that links to them is only a
 * pack while it sits next to them. Emailed to a designer, opened from a
 * downloads folder, or attached to a brief, a page of broken images is worse
 * than no pack. So every mark and both faces are embedded as data URIs and
 * the file stands alone.
 *
 * That makes it too large to maintain by hand, and — more to the point — a
 * hand-written copy would drift from what public/brand actually contains. This
 * reads the directory. An asset that is not there cannot be documented, and one
 * that is added shows up on the next run.
 *
 * BRAND-USAGE.txt is the written half and stays the source of the rules; this
 * is the half you can look at.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BRAND = join(root, 'public', 'brand');
const FONTS = join(root, 'public', 'fonts');
const OUT = join(root, 'docs', 'brand-pack.html');

const dataUri = (path, mime) => `data:${mime};base64,${readFileSync(path).toString('base64')}`;
const png = (name) => dataUri(join(BRAND, `${name}.png`), 'image/png');
const font = (name) => dataUri(join(FONTS, name), 'font/woff2');

/** Every asset the pack shows, in the order a reader wants them. */
const MARKS = [
  {
    group: 'The mark',
    note: 'The A, on its own. Minimum reproduction width 24px / 8mm.',
    items: [
      { file: 'amryn-icon-mark', label: 'amryn-icon-mark', height: 64, on: 'light' },
      { file: 'amryn-icon-mark-black', label: 'amryn-icon-mark-black', height: 64, on: 'light' },
      { file: 'amryn-icon-mark-white', label: 'amryn-icon-mark-white', height: 64, on: 'navy' },
    ],
  },
  {
    group: 'Product wordmarks',
    note:
      'Set solid — no space around the ™. Never respaced, never recoloured, never set in type instead.',
    items: [
      { file: 'amryn-product-digital-twin', label: 'amryn-product-digital-twin', height: 34, on: 'light' },
      { file: 'amryn-product-opportunity-radar', label: 'amryn-product-opportunity-radar', height: 34, on: 'light' },
      { file: 'amryn-product-aigrowthintelligence', label: 'amryn-product-aigrowthintelligence', height: 34, on: 'light' },
    ],
  },
  {
    group: 'Lockup',
    note: 'The mark, the name and the tagline as one drawing. Use where it is the only mark on the surface — a social card, a cover. Beside the platform’s own header it competes with it; there the mark and the word are composed in type instead.',
    items: [{ file: 'amryn-lockup-secondary', label: 'amryn-lockup-secondary', height: 72, on: 'light' }],
  },
  {
    group: 'Application icons',
    note: 'The mark on white, centred at 62% of the square, so a launcher’s rounding does not clip it.',
    items: [
      { file: 'amryn-app-icon-512', label: 'amryn-app-icon-512', height: 88, on: 'light' },
      { file: 'amryn-app-icon-180', label: 'amryn-app-icon-180', height: 64, on: 'light' },
      { file: 'amryn-favicon-32', label: 'amryn-favicon-32', height: 32, on: 'light' },
    ],
  },
];

const PALETTE = [
  { hex: '#004AAD', name: 'Brand blue', use: 'Primary. Buttons, links, accents — on light surfaces.' },
  { hex: '#081B33', name: 'Dark navy', use: 'Dark surfaces, gradients, the intelligence environment.' },
  { hex: '#3E7BD6', name: 'Lifted blue', use: 'On navy only. Brand blue disappears against navy; this does not.' },
  { hex: '#DDE5F0', name: 'Ground', use: 'The washed ground the platform’s glass panels sit on.' },
  { hex: '#FFFFFF', name: 'Paper', use: 'Card surfaces, and the plate behind the app icon.' },
];

const RULES = [
  'Clear space around any lockup equals the cap height of the AMRYN letterforms.',
  'Minimum reproduction width: lockups 90px / 32mm, icon mark 24px / 8mm.',
  'Never recolour, stretch, rotate, outline or add effects to any mark.',
  'On backgrounds darker than 50% luminance use the white mark.',
  'Product wordmarks are set solid by design — do not respace them.',
  'Brand names are never uppercased: the solid capitalisation is part of the mark.',
  'Always carry ™ on Amryn and ® on AIGrowthIntelligence, DigitalTwin and OpportunityRadar.',
];

const missing = MARKS.flatMap((g) => g.items)
  .map((item) => item.file)
  .filter((file) => !existsSync(join(BRAND, `${file}.png`)));
if (missing.length) {
  console.error(`These assets are documented but not in public/brand: ${missing.join(', ')}`);
  process.exit(1);
}

const swatch = (entry) => `
      <li class="swatch">
        <div class="swatch__chip" style="background:${entry.hex}"></div>
        <p class="swatch__hex">${entry.hex}</p>
        <p class="swatch__name">${entry.name}</p>
        <p class="swatch__use">${entry.use}</p>
      </li>`;

const asset = (item) => `
        <li class="asset asset--${item.on}">
          <div class="asset__stage">
            <img src="${png(item.file)}" alt="${item.label}" style="height:${item.height}px">
          </div>
          <p class="asset__name">${item.label}.png<span> · @2x</span></p>
        </li>`;

const group = (g) => `
      <section class="group">
        <h3>${g.group}</h3>
        <p class="group__note">${g.note}</p>
        <ul class="assets">${g.items.map(asset).join('')}
        </ul>
      </section>`;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Amryn™ AIGrowthIntelligence® — Brand Pack</title>
<style>
@font-face{font-family:'Outfit';src:url(${font('outfit-latin-var.woff2')}) format('woff2-variations'),url(${font('outfit-latin-var.woff2')}) format('woff2');font-weight:100 900;font-display:swap}
@font-face{font-family:'IBM Plex Sans';src:url(${font('ibm-plex-sans-latin-var.woff2')}) format('woff2-variations'),url(${font('ibm-plex-sans-latin-var.woff2')}) format('woff2');font-weight:100 700;font-display:swap}
@font-face{font-family:'IBM Plex Mono';src:url(${font('ibm-plex-mono-latin-400.woff2')}) format('woff2');font-weight:400;font-display:swap}

:root{color-scheme:only light;--ink:#0d1b2e;--mute:#5d6675;--rule:#dce1ea;--navy:#081B33;--signal:#004AAD;--lift:#3E7BD6;--ground:#dde5f0}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);font-family:'IBM Plex Sans',system-ui,sans-serif;line-height:1.6;font-size:15px}
.sheet{max-width:1080px;margin:0 auto;padding:clamp(1.5rem,5vw,4rem) clamp(1rem,4vw,2.5rem) 4rem}
h1,h2,h3{font-family:'Outfit',system-ui,sans-serif;letter-spacing:-.012em;line-height:1.15;margin:0}
.eyebrow{font-family:'Outfit',system-ui,sans-serif;font-size:.6875rem;letter-spacing:.14em;color:var(--signal);margin:0 0 .5rem}
.tm{font-size:.55em;vertical-align:.5em;letter-spacing:0;font-weight:500}

header.cover{background:#fff;border-radius:22px;padding:clamp(1.5rem,4vw,2.5rem);box-shadow:0 8px 32px rgba(12,42,82,.10)}
.cover__mark{display:flex;align-items:center;gap:.7rem}
.cover__mark img{height:44px;width:auto;display:block}
.cover__word{font-family:'Outfit',system-ui,sans-serif;font-weight:800;font-size:1.75rem;letter-spacing:-.02em}
.cover h1{font-size:clamp(1.6rem,4vw,2.4rem);font-weight:700;margin:1.5rem 0 0}
.cover__bar{height:3px;width:56px;background:var(--signal);border-radius:2px;margin:.9rem 0}
.cover p{color:var(--mute);max-width:62ch;margin:0}
.cover__meta{font-family:'IBM Plex Mono',monospace;font-size:.75rem;color:var(--mute);margin-top:1.5rem;padding-top:1rem;border-top:1px solid var(--rule)}

section.block{margin-top:clamp(2rem,5vw,3.5rem)}
section.block>h2{font-size:1.35rem;font-weight:700}
section.block>p.lede{color:var(--mute);max-width:70ch;margin:.5rem 0 0}

.group{background:#fff;border-radius:18px;padding:1.25rem;margin-top:1.25rem}
.group h3{font-size:1rem;font-weight:700}
.group__note{color:var(--mute);font-size:.875rem;margin:.35rem 0 1rem;max-width:72ch}
.assets{list-style:none;display:grid;gap:1rem;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));margin:0;padding:0}
.asset__stage{display:flex;align-items:center;justify-content:center;min-height:120px;padding:1rem;border-radius:12px;border:1px solid var(--rule);background:#fff}
.asset--navy .asset__stage{background:var(--navy);border-color:var(--navy)}
.asset__stage img{max-width:100%;width:auto}
.asset__name{font-family:'IBM Plex Mono',monospace;font-size:.7rem;color:var(--mute);margin:.6rem 0 0;word-break:break-all}
.asset__name span{opacity:.65}

.swatches{list-style:none;display:grid;gap:1rem;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));margin:1.25rem 0 0;padding:0}
.swatch{background:#fff;border-radius:14px;overflow:hidden}
.swatch__chip{height:84px}
.swatch__hex{font-family:'IBM Plex Mono',monospace;font-size:.8125rem;font-weight:500;margin:.75rem .9rem 0}
.swatch__name{font-family:'Outfit',sans-serif;font-weight:600;font-size:.875rem;margin:.1rem .9rem 0}
.swatch__use{color:var(--mute);font-size:.75rem;line-height:1.5;margin:.3rem .9rem .9rem}

.type{background:#fff;border-radius:18px;padding:1.25rem;margin-top:1.25rem}
.type__row{padding:1rem 0;border-top:1px solid var(--rule)}
.type__row:first-child{border-top:0;padding-top:0}
.type__k{font-family:'IBM Plex Mono',monospace;font-size:.7rem;color:var(--mute);margin:0 0 .4rem}
.type__sample{margin:0}
.sample-display{font-family:'Outfit',sans-serif;font-weight:800;font-size:1.9rem;letter-spacing:-.015em}
.sample-body{font-family:'IBM Plex Sans',sans-serif;font-size:1rem;color:var(--mute)}
.sample-mono{font-family:'IBM Plex Mono',monospace;font-size:1rem}

ol.rules{background:#fff;border-radius:18px;padding:1.25rem 1.25rem 1.25rem 2.5rem;margin-top:1.25rem}
ol.rules li{margin:.45rem 0}
ol.rules li::marker{color:var(--signal);font-weight:600}

footer{margin-top:clamp(2rem,5vw,3.5rem);padding-top:1.25rem;border-top:1px solid rgba(12,42,82,.18);font-family:'IBM Plex Mono',monospace;font-size:.7rem;color:var(--mute)}
@media print{body{background:#fff}.sheet{padding:0}header.cover,.group,.swatch,.type,ol.rules{box-shadow:none;border:1px solid var(--rule)}}
</style>
</head>
<body>
<div class="sheet">

<header class="cover">
  <div class="cover__mark">
    <img src="${png('amryn-icon-mark')}" alt="">
    <span class="cover__word">Amryn<span class="tm">™</span></span>
  </div>
  <h1>Brand Pack</h1>
  <div class="cover__bar"></div>
  <p>Every mark Amryn uses, the colours they sit on, and the rules that keep them
     recognisable. This file carries the artwork inside it — save it, send it,
     open it offline; nothing here loads from anywhere.</p>
  <p class="cover__meta">Version 2.0 · ${new Date().toISOString().slice(0, 10)} · ${MARKS.flatMap((g) => g.items).length} assets, each also supplied at @2x</p>
</header>

<section class="block">
  <h2>Marks</h2>
  <p class="lede">Supplied artwork. Every one of these is a drawing, not type — reproducing a
     wordmark by setting it in a typeface is the one thing that is never in specification.</p>
  ${MARKS.map(group).join('')}
</section>

<section class="block">
  <h2>Palette</h2>
  <p class="lede">Three brand colours and the two grounds they are used on. The lifted blue exists
     for one reason: brand blue disappears against navy.</p>
  <ul class="swatches">${PALETTE.map(swatch).join('')}
  </ul>
</section>

<section class="block">
  <h2>Typefaces</h2>
  <p class="lede">Three roles, one face each. The mono earns its place only where digits line up in a
     column or the text is literally machine output — a key, a code, a filename. It is never a label.</p>
  <div class="type">
    <div class="type__row">
      <p class="type__k">Display — Outfit · headings, labels, fine print</p>
      <p class="type__sample sample-display">See Your Business. See Your Market.</p>
    </div>
    <div class="type__row">
      <p class="type__k">Body — IBM Plex Sans · running prose</p>
      <p class="type__sample sample-body">A continuously updated model of the business itself — what it earns, who it keeps, and what changed.</p>
    </div>
    <div class="type__row">
      <p class="type__k">Mono — IBM Plex Mono · figures and machine text</p>
      <p class="type__sample sample-mono">R 4 820 355 · 2026-09-13 · amryn-icon-mark@2x.png</p>
    </div>
  </div>
</section>

<section class="block">
  <h2>Rules</h2>
  <ol class="rules">${RULES.map((rule) => `
    <li>${rule}</li>`).join('')}
  </ol>
</section>

<footer>
  ©${new Date().getFullYear()} Amryn. All Rights Reserved. AIGrowthIntelligence®<br>
  Amryn™ AIGrowthIntelligence®, Amryn™DigitalTwin® and Amryn™OpportunityRadar® are trademarks of Amryn.
</footer>

</div>
</body>
</html>
`;

writeFileSync(OUT, html);
console.log(`brand-pack.html written — ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB, self-contained`);
