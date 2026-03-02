#!/usr/bin/env node
/**
 * One-off manual QA: sign in (if login visible) then verify diagram toolbar
 * (top-center, collapse/expand). Credentials from env: QA_EMAIL, QA_PASSWORD.
 * Usage: QA_EMAIL=you@example.com QA_PASSWORD=secret node scripts/manual-browser-qa-toolbar.js
 * Requires: server running at BASE_URL (default http://127.0.0.1:8000), npm install (puppeteer).
 */
const puppeteer = require('puppeteer');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8000';
const QA_EMAIL = process.env.QA_EMAIL || '';
const QA_PASSWORD = process.env.QA_PASSWORD || '';

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const results = { signIn: null, canvasVisible: null, toolbarPresent: null, toolbarTopCenter: null, collapseExpand: null, errors: [] };
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 15000 });
    await delay(2000);

    const loginVisible = await page.evaluate(() => {
      const v = document.getElementById('view-login');
      return v && !v.classList.contains('hidden');
    });

    if (loginVisible && QA_EMAIL && QA_PASSWORD) {
      await page.type('#authEmail', QA_EMAIL, { delay: 50 });
      await page.type('#authPassword', QA_PASSWORD, { delay: 50 });
      await page.click('#authSubmitBtn');
      await delay(4000);
      results.signIn = 'attempted';
    } else if (loginVisible) {
      results.signIn = 'skipped (no QA_EMAIL/QA_PASSWORD)';
      results.errors.push('Login visible but QA_EMAIL/QA_PASSWORD not set');
    } else {
      results.signIn = 'not_shown';
    }

    const canvasVisible = await page.evaluate(() => {
      const v = document.getElementById('view-canvas');
      return v && !v.classList.contains('hidden');
    });
    results.canvasVisible = canvasVisible;
    if (!canvasVisible) {
      results.errors.push('Canvas view not visible after load/sign-in');
      console.log(JSON.stringify(results, null, 2));
      await browser.close();
      process.exit(1);
    }

    const toolbarInfo = await page.evaluate(() => {
      const wrap = document.querySelector('.blueprint-wrap');
      const toolbar = document.getElementById('diagramFloatingToolbar');
      const collapseBtn = document.getElementById('diagramToolbarCollapseBtn');
      if (!wrap || !toolbar) return { present: false };
      const wrapRect = wrap.getBoundingClientRect();
      const toolRect = toolbar.getBoundingClientRect();
      const centerX = wrapRect.left + wrapRect.width / 2;
      const toolCenterX = toolRect.left + toolRect.width / 2;
      const isRoughlyTopCenter = Math.abs(toolCenterX - centerX) < 80 && toolRect.top >= wrapRect.top && toolRect.top < wrapRect.top + 120;
      return {
        present: true,
        collapsed: toolbar.classList.contains('diagram-floating-toolbar--collapsed'),
        orientation: toolbar.getAttribute('data-orientation') || 'horizontal',
        hasCollapseBtn: !!collapseBtn,
        roughlyTopCenter: isRoughlyTopCenter,
      };
    });
    results.toolbarPresent = toolbarInfo.present;
    results.toolbarTopCenter = toolbarInfo.present ? toolbarInfo.roughlyTopCenter : null;
    if (!toolbarInfo.present) {
      results.errors.push('Diagram floating toolbar not found');
    } else if (!toolbarInfo.roughlyTopCenter) {
      results.errors.push('Toolbar not roughly top-center');
    }

    if (toolbarInfo.present && toolbarInfo.hasCollapseBtn) {
      await page.click('#diagramToolbarCollapseBtn');
      await delay(600);
      const collapsed = await page.evaluate(() =>
        document.getElementById('diagramFloatingToolbar')?.classList.contains('diagram-floating-toolbar--collapsed')
      );
      if (!collapsed) {
        results.errors.push('Toolbar did not collapse on first click');
      }
      await page.click('#diagramToolbarCollapseBtn');
      await delay(800);
      const expanded = await page.evaluate(() =>
        !document.getElementById('diagramFloatingToolbar')?.classList.contains('diagram-floating-toolbar--collapsed')
      );
      results.collapseExpand = expanded;
      if (!expanded) {
        results.errors.push('Toolbar did not expand on second click');
      }
    } else {
      results.collapseExpand = false;
    }

    console.log(JSON.stringify(results, null, 2));
    process.exit(results.errors.length > 0 ? 1 : 0);
  } catch (err) {
    if (results) results.errors.push(err.message);
    console.log(JSON.stringify(results || { errors: [err.message] }, null, 2));
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

main();
