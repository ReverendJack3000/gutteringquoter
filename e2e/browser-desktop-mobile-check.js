/**
 * Quick browser check: desktop and mobile view.
 * - Loads app with ?viewport=desktop, switches to canvas, opens a11y modal, closes it.
 * - Loads app with ?viewport=mobile, same flow.
 * - Reports console errors and pass/fail.
 */
const puppeteer = require('puppeteer');

async function runView(page, viewportLabel, urlSuffix) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PageError: ' + e.message));

  await page.goto('http://127.0.0.1:8000/' + urlSuffix, { waitUntil: 'networkidle2' });
  await page.waitForSelector('.app', { timeout: 5000 });
  await page.waitForFunction('typeof window.__quoteAppSwitchView === "function"', { timeout: 5000 }).catch(() => null);
  await new Promise((r) => setTimeout(r, 300));

  await page.evaluate(() => { if (typeof window.__quoteAppSwitchView === 'function') window.__quoteAppSwitchView('view-canvas'); });
  await new Promise((r) => setTimeout(r, 500));

  await page.evaluate(() => { const b = document.getElementById('openAccessibilitySettingsBtn'); if (b) b.click(); });
  await new Promise((r) => setTimeout(r, 400));
  const modalOpen = await page.evaluate(() => {
    const m = document.getElementById('accessibilitySettingsModal');
    return m && !m.hasAttribute('hidden');
  });
  if (!modalOpen) return { ok: false, errors, msg: 'Accessibility modal did not open' };

  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 200));
  const modalClosed = await page.evaluate(() => {
    const m = document.getElementById('accessibilitySettingsModal');
    return !m || m.hasAttribute('hidden');
  });
  if (!modalClosed) return { ok: false, errors, msg: 'Modal did not close on Escape' };

  return { ok: true, errors };
}

async function main() {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  console.log('--- Desktop view (?viewport=desktop) ---');
  const desktop = await runView(page, 'desktop', '?viewport=desktop');
  console.log(desktop.ok ? '  PASS' : '  FAIL: ' + (desktop.msg || ''));
  if (desktop.errors.length) console.log('  Console errors:', desktop.errors);

  console.log('--- Mobile view (?viewport=mobile) ---');
  await page.setViewport({ width: 390, height: 844 });
  const mobile = await runView(page, 'mobile', '?viewport=mobile');
  console.log(mobile.ok ? '  PASS' : '  FAIL: ' + (mobile.msg || ''));
  if (mobile.errors.length) console.log('  Console errors:', mobile.errors);

  await browser.close();
  const ok = desktop.ok && mobile.ok;
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
