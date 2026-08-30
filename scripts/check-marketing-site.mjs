#!/usr/bin/env node
/**
 * Smoke-checks the static marketing site in /docs.
 *
 * That site has no build step and no test runner, which is the point of it —
 * but it does have behaviour: the Command Centre demo renders from JavaScript,
 * and the platform links reveal themselves only once APP_URL is set. Both are
 * easy to break silently, so they are checked in a real browser.
 *
 *   node scripts/check-marketing-site.mjs
 *
 * Exits non-zero on a page error or a failed assertion.
 */
import { chromium } from 'playwright';
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const docs = join(root, 'docs');

/**
 * Prefer a Chromium already on the machine. CI images often ship one whose
 * revision does not match the installed Playwright, and downloading another
 * to open a static HTML file is not worth the minutes.
 */
const PRESET_CHROMIUM = ['/opt/pw-browsers/chromium/chrome-linux/chrome', '/opt/pw-browsers/chromium'];
const executablePath = PRESET_CHROMIUM.find((path) => existsSync(path));

const browser = await chromium.launch(executablePath ? { executablePath } : {});
let failures = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  pass  ${message}`);
  } else {
    console.log(`  FAIL  ${message}`);
    failures += 1;
  }
}

/** Copies the site to a temp dir, optionally setting APP_URL, and loads it. */
async function withSite(appUrl, run) {
  const dir = mkdtempSync(join(tmpdir(), 'amryn-site-'));
  cpSync(docs, dir, { recursive: true });

  if (appUrl) {
    const source = readFileSync(join(dir, 'app.js'), 'utf8');
    const patched = source.replace("var APP_URL = '';", `var APP_URL = '${appUrl}';`);
    if (patched === source) {
      console.log('  FAIL  could not find APP_URL in app.js to patch');
      failures += 1;
    }
    writeFileSync(join(dir, 'app.js'), patched);
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];

  // Script errors are the thing worth failing on. A blocked webfont or a
  // network the runner cannot reach says nothing about the site, and failing
  // on it would make this check useless anywhere offline.
  const isNetworkNoise = (text) =>
    /ERR_CONNECTION|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|net::|Failed to load resource/i.test(
      text,
    );

  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error' && !isNetworkNoise(message.text())) {
      errors.push(message.text());
    }
  });

  await page.goto(`file://${join(dir, 'index.html')}`);
  await page.waitForTimeout(600);

  await run(page, errors);
  await page.close();
}

console.log('\nAPP_URL unset — the platform links must stay hidden');
await withSite('', async (page, errors) => {
  assert(errors.length === 0, `no page errors${errors.length ? `: ${errors.join('; ')}` : ''}`);
  assert((await page.$$('.app__frame')).length > 0, 'the Command Centre demo renders');

  const links = await page.$$eval('[data-app-link]', (els) =>
    els.map((el) => ({ hidden: el.hidden, href: el.getAttribute('href') })),
  );
  assert(links.length > 0, 'the page declares platform links');
  assert(
    links.every((link) => link.hidden && !link.href),
    'every platform link is hidden and has no href while APP_URL is unset',
  );

  const legal = await page.$eval('.foot__legal', (el) => el.textContent.replace(/\s+/g, ' '));
  assert(
    legal.includes('does not take on government-sector work'),
    "Amryn's own commercial posture is stated in the footer",
  );
  assert(
    legal.includes('not a limit on the software'),
    'the footer distinguishes that posture from what the software surfaces',
  );
});

console.log('\nAPP_URL set — the platform links are revealed and pointed');
await withSite('https://app.amryn.example/', async (page, errors) => {
  assert(errors.length === 0, `no page errors${errors.length ? `: ${errors.join('; ')}` : ''}`);

  const links = await page.$$eval('[data-app-link]', (els) =>
    els.map((el) => ({ hidden: el.hidden, href: el.getAttribute('href') })),
  );
  assert(
    links.every((link) => !link.hidden),
    'every platform link is visible',
  );
  assert(
    links.some((link) => link.href === 'https://app.amryn.example/sign-in'),
    'the sign-in link points at the deployment, with no doubled slash',
  );
  assert(
    links.some((link) => link.href === 'https://app.amryn.example/sign-up'),
    'the sign-up link points at the deployment',
  );
});

console.log('\nThe radar demo still offers tenders to the businesses using it');
await withSite('', async (page) => {
  const text = await page.evaluate(() => document.body.textContent.replace(/\s+/g, ' '));
  assert(/tender/i.test(text), 'tenders appear as customer opportunities on the page');
});

await browser.close();
console.log(failures === 0 ? '\nmarketing site checks passed\n' : `\n${failures} check(s) failed\n`);
process.exit(failures === 0 ? 0 : 1);
