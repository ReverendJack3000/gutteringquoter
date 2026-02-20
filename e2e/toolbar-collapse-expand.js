/**
 * Expand and collapse the diagram toolbar twice in desktop, twice in mobile.
 * Uses diagramToolbarCollapseBtn. Run: node e2e/toolbar-collapse-expand.js
 */
const puppeteer = require('puppeteer');

async function ensureCanvasView(page) {
  await page.waitForFunction('typeof window.__quoteAppSwitchView === "function"', { timeout: 5000 }).catch(() => null);
  await page.evaluate(() => { window.__quoteAppSwitchView('view-canvas'); });
  await new Promise((r) => setTimeout(r, 600));
}

async function collapseExpandTwice(page, label) {
  const found = await page.evaluate(() => !!document.getElementById('diagramToolbarCollapseBtn'));
  if (!found) throw new Error(label + ': diagramToolbarCollapseBtn not found');

  for (let i = 0; i < 2; i++) {
    // Collapse: click collapse btn (toolbar starts expanded)
    await page.evaluate(() => {
      const btn = document.getElementById('diagramToolbarCollapseBtn');
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 450));
    const collapsed1 = await page.evaluate(() => {
      const t = document.getElementById('diagramFloatingToolbar');
      return t && t.classList.contains('diagram-floating-toolbar--collapsed');
    });
    if (!collapsed1) throw new Error(label + ': toolbar did not collapse (cycle ' + (i + 1) + ')');

    // Expand
    await page.evaluate(() => {
      const btn = document.getElementById('diagramToolbarCollapseBtn');
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 450));
    const expanded1 = await page.evaluate(() => {
      const t = document.getElementById('diagramFloatingToolbar');
      return t && !t.classList.contains('diagram-floating-toolbar--collapsed');
    });
    if (!expanded1) throw new Error(label + ': toolbar did not expand (cycle ' + (i + 1) + ')');
  }
  console.log('  ' + label + ': 2× collapse/expand OK');
}

async function main() {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  console.log('--- Desktop ---');
  await page.setViewport({ width: 1280, height: 720 });
  await page.goto('http://127.0.0.1:8000/?viewport=desktop', { waitUntil: 'networkidle2' });
  await page.waitForSelector('.app', { timeout: 5000 });
  await ensureCanvasView(page);
  await collapseExpandTwice(page, 'Desktop');

  console.log('--- Mobile ---');
  await page.setViewport({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:8000/?viewport=mobile', { waitUntil: 'networkidle2' });
  await page.waitForSelector('.app', { timeout: 5000 });
  await ensureCanvasView(page);
  await collapseExpandTwice(page, 'Mobile');

  await browser.close();
  console.log('Done.');
}

main().catch((e) => { console.error(e); process.exit(1); });
