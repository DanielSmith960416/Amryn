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

const APP_URL_ASSIGNMENT = /var APP_URL = '[^']*';/;

/**
 * Copies the site to a temp dir, forces APP_URL to the given value, and loads
 * it. Both states are exercised whatever the committed value happens to be, so
 * setting a real deployment URL does not silently retire the hidden-link case.
 */
async function withSite(appUrl, run) {
  const dir = mkdtempSync(join(tmpdir(), 'amryn-site-'));
  cpSync(docs, dir, { recursive: true });

  const source = readFileSync(join(dir, 'app.js'), 'utf8');
  const patched = source.replace(APP_URL_ASSIGNMENT, `var APP_URL = '${appUrl}';`);
  if (patched === source && !APP_URL_ASSIGNMENT.test(source)) {
    console.log('  FAIL  could not find the APP_URL assignment in app.js to patch');
    failures += 1;
  }
  writeFileSync(join(dir, 'app.js'), patched);

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

console.log('\nAs committed — whatever APP_URL is currently set to');
{
  const committed = readFileSync(join(docs, 'app.js'), 'utf8').match(APP_URL_ASSIGNMENT)?.[0];
  const value = committed?.match(/'([^']*)'/)?.[1] ?? null;

  assert(value !== null, 'app.js declares an APP_URL');

  if (value) {
    assert(
      /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(value),
      `APP_URL is an absolute https URL (${value})`,
    );
    assert(!value.endsWith('//'), 'APP_URL has no trailing double slash');
    // Deliberately no assertion about *which* host this is. The deployment
    // reuses the hostname the previous build had, so the name cannot tell you
    // which application answers on it — only a request to the live URL can, and
    // that is not this file's job. What can be checked is shape, which is above.

    console.log(`  note  platform links resolve to ${value.replace(/\/+$/, '')}/sign-in and /sign-up`);
  } else {
    console.log('  note  APP_URL is empty, so the platform links stay hidden');
  }
}

await browser.close();
console.log(failures === 0 ? '\nmarketing site checks passed\n' : `\n${failures} check(s) failed\n`);
process.exit(failures === 0 ? 0 : 1);
