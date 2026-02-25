#!/usr/bin/env node
/**
 * One-off verification: open quote modal on mobile, check that the labour
 * warning icon and "Labour" label are close (icon content-sized, label just after).
 * Run with server up: node scripts/verify-labour-warning-spacing.js
 */
const puppeteer = require('puppeteer');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8000';

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  await page.setDefaultTimeout(8000);

  await page.goto(`${BASE_URL}/?viewport=mobile`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('body[data-viewport-mode="mobile"]', { timeout: 5000 });

  await page.evaluate(() => {
    const btn = document.getElementById('generateQuoteBtn');
    if (btn) btn.click();
  });
  await page.waitForSelector('#quoteModal[hidden]', { state: 'detached', timeout: 3000 }).catch(() => {});
  await page.waitForSelector('#quoteModal .quote-row-labour', { timeout: 3000 });
  await new Promise((r) => setTimeout(r, 400));

  const result = await page.evaluate(() => {
    const icon = document.querySelector('#quoteModal .quote-labour-zero-warning-icon');
    const label = document.querySelector('#quoteModal .quote-row-labour .quote-labour-label');
    if (!icon || !label) return { ok: false, reason: 'icon or label not found' };
    if (icon.hidden) return { ok: false, reason: 'icon is hidden (0 hrs not applicable)' };
    const rIcon = icon.getBoundingClientRect();
    const rLabel = label.getBoundingClientRect();
    const gap = rLabel.left - (rIcon.left + rIcon.width);
    const iconWidth = rIcon.width;
    return {
      ok: true,
      gapPx: Math.round(gap),
      iconWidthPx: Math.round(iconWidth),
      iconLeft: Math.round(rIcon.left),
      labelLeft: Math.round(rLabel.left),
    };
  });

  await browser.close();

  if (!result.ok) {
    console.log('Verification:', result.reason);
    process.exit(1);
  }
  console.log('Labour row spacing:');
  console.log('  Warning icon width:', result.iconWidthPx + 'px', result.iconWidthPx <= 30 ? '(content-sized ✓)' : '(expected ≤30px)');
  console.log('  Gap between icon and "Labour":', result.gapPx + 'px', result.gapPx <= 15 ? '(tight ✓)' : '(expected ≤15px)');
  const pass = result.iconWidthPx <= 30 && result.gapPx <= 15;
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
