/**
 * One-off browser test: sign in and verify canvas (and optional mobile view).
 * Uses credentials provided for this session only. DELETE this file after use; do not commit.
 *
 * Run (with backend up): node scripts/browser-signin-test.js
 */
const puppeteer = require('puppeteer');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8000';
const EMAIL = 'jack@clearstreamguttering.co.nz';
const PASSWORD = 'Manonabench02!';

async function main() {
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: null,
  });
  const page = await browser.newPage();
  await page.setDefaultTimeout(15000);

  console.log('Navigating to', BASE_URL);
  await page.goto(BASE_URL, { waitUntil: 'networkidle0' });

  const loginVisible = await page.evaluate(() => {
    const view = document.getElementById('view-login');
    const form = document.getElementById('authForm');
    return view && !view.classList.contains('hidden') && form && !form.hidden;
  });

  if (loginVisible) {
    console.log('Login view visible, filling credentials...');
    await page.type('#authEmail', EMAIL, { delay: 50 });
    await page.type('#authPassword', PASSWORD, { delay: 50 });
    await page.click('#authSubmitBtn');
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1500));
  } else {
    console.log('Login not visible (may already be signed in)');
  }

  const onCanvas = await page.evaluate(() => {
    const view = document.getElementById('view-canvas');
    return view && !view.classList.contains('hidden');
  });
  if (!onCanvas) {
    const err = await page.evaluate(() => document.getElementById('authError')?.textContent || '');
    console.error('Not on canvas view. Auth error:', err || 'unknown');
    await browser.close();
    process.exit(1);
  }
  console.log('Signed in, canvas view visible.');

  // Optional: switch to mobile viewport and check fit/pan hooks
  await page.setViewport({ width: 390, height: 844, isMobile: true });
  await page.goto(BASE_URL + '?viewport=mobile', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 800));

  const viewport = await page.evaluate(() => {
    if (typeof window.__quoteAppGetViewport !== 'function') return null;
    return window.__quoteAppGetViewport();
  });
  console.log('Mobile viewport state:', viewport ? { viewZoom: viewport.viewZoom, viewPanX: viewport.viewPanX, viewPanY: viewport.viewPanY } : 'hooks not available');

  await new Promise((r) => setTimeout(r, 2000));
  await browser.close();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
