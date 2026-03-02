/**
 * Focused audit for Section 63 manual-metre behavior.
 *
 * Verifies:
 * - stock-length selection for gutter/downpipe edge lengths,
 * - Quick Quoter missing-measurement scaling before bin-pack,
 * - commitMetresInput + getElementsFromQuoteTable integration path.
 */
const puppeteer = require('puppeteer');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8000';
const HEADED = process.env.HEADED === '1' || process.env.HEADED === 'true';

function formatFailureList(failures) {
  return failures.map((item, idx) => `${idx + 1}. ${item}`).join('\n');
}

async function run() {
  const browser = await puppeteer.launch({
    headless: !HEADED,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: null,
  });

  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(10000);
  page.setDefaultTimeout(8000);

  try {
    console.log('Loading', BASE_URL);
    const response = await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
    if (!response || !response.ok()) {
      throw new Error(
        `Page load failed: ${response ? response.status() : 'no response'}. ` +
        'Start the server with: cd backend && uvicorn main:app --reload --host 127.0.0.1 --port 8000'
      );
    }

    await page.waitForSelector('.app', { timeout: 5000 });

    const audit = await page.evaluate(() => {
      const failures = [];

      const fnBag = window.__quoteAppManualMetreTestFns || {};

      const requiredFns = [
        'mToMm',
        'getOptimalGutterCombination',
        'getOptimalDownpipeCombination',
        'getElementsForQuoteFromSynthetic',
        'getElementsFromQuoteTable',
        'commitMetresInput',
      ];
      requiredFns.forEach((name) => {
        if (typeof fnBag[name] !== 'function') {
          failures.push(`Missing required function on window: ${name}`);
        }
      });
      if (failures.length > 0) return { failures, checksRun: 0 };

      const manualCases = [
        { metres: 1.49, requiredMm: 1490, gutter: { 1500: 1 }, downpipe: { 1500: 1 } },
        { metres: 1.5, requiredMm: 1500, gutter: { 1500: 1 }, downpipe: { 1500: 1 } },
        { metres: 1.51, requiredMm: 1510, gutter: { 3000: 1 }, downpipe: { 3000: 1 } },
        { metres: 2.99, requiredMm: 2990, gutter: { 3000: 1 }, downpipe: { 3000: 1 } },
        { metres: 3.01, requiredMm: 3010, gutter: { 3000: 1, 1500: 1 }, downpipe: { 3000: 1, 1500: 1 } },
        { metres: 4.99, requiredMm: 4990, gutter: { 5000: 1 }, downpipe: { 3000: 2 } },
        { metres: 5.01, requiredMm: 5010, gutter: { 3000: 2 }, downpipe: { 3000: 2 } },
      ];

      const stableObject = (obj) => {
        const out = {};
        Object.keys(obj || {}).sort((a, b) => Number(a) - Number(b)).forEach((key) => {
          out[key] = obj[key];
        });
        return out;
      };

      const positiveCounts = (counts) => {
        const out = {};
        Object.entries(counts || {}).forEach(([lengthMm, qty]) => {
          if (Number(qty) > 0) out[lengthMm] = Number(qty);
        });
        return stableObject(out);
      };

      const sumMm = (counts) => Object.entries(counts || {}).reduce((acc, [lengthMm, qty]) => {
        return acc + (Number(lengthMm) * Number(qty));
      }, 0);

      const pieceCount = (counts) => Object.values(counts || {}).reduce((acc, qty) => {
        return acc + Number(qty);
      }, 0);

      const assertEqual = (label, actual, expected) => {
        const a = JSON.stringify(actual);
        const e = JSON.stringify(expected);
        if (a !== e) failures.push(`${label}: expected ${e}, got ${a}`);
      };

      const collectPacked = (elements, prefix) => {
        const byId = {};
        let firstLengthMm = null;
        (Array.isArray(elements) ? elements : []).forEach((item) => {
          const assetId = String(item && item.assetId ? item.assetId : '');
          if (!assetId.startsWith(prefix)) return;
          const qty = Number(item.quantity) || 0;
          byId[assetId] = (byId[assetId] || 0) + qty;
          const lengthMm = Number(item.length_mm);
          if (firstLengthMm == null && Number.isFinite(lengthMm) && lengthMm > 0) firstLengthMm = lengthMm;
        });
        return { byId: stableObject(byId), firstLengthMm };
      };

      let checksRun = 0;

      manualCases.forEach((testCase) => {
        const requiredMm = fnBag.mToMm(testCase.metres);
        checksRun += 1;
        if (requiredMm !== testCase.requiredMm) {
          failures.push(
            `mToMm(${testCase.metres}) mismatch: expected ${testCase.requiredMm}, got ${requiredMm}`
          );
          return;
        }

        const gutter = fnBag.getOptimalGutterCombination(requiredMm);
        const downpipe = fnBag.getOptimalDownpipeCombination(requiredMm);

        const gutterCounts = positiveCounts(gutter && gutter.counts);
        const downpipeCounts = positiveCounts(downpipe && downpipe.counts);

        checksRun += 2;
        assertEqual(`Gutter counts @ ${testCase.metres}m`, gutterCounts, stableObject(testCase.gutter));
        assertEqual(`Downpipe counts @ ${testCase.metres}m`, downpipeCounts, stableObject(testCase.downpipe));

        const gutterWaste = sumMm(gutterCounts) - requiredMm;
        const downpipeWaste = sumMm(downpipeCounts) - requiredMm;

        checksRun += 2;
        if (gutterWaste < 0) failures.push(`Gutter waste negative @ ${testCase.metres}m`);
        if (downpipeWaste < 0) failures.push(`Downpipe waste negative @ ${testCase.metres}m`);

        checksRun += 2;
        if (pieceCount(gutterCounts) <= 0) failures.push(`Gutter piece count invalid @ ${testCase.metres}m`);
        if (pieceCount(downpipeCounts) <= 0) failures.push(`Downpipe piece count invalid @ ${testCase.metres}m`);
      });

      const syntheticDownpipePacked = collectPacked(
        fnBag.getElementsForQuoteFromSynthetic([
          { assetId: 'DP-65-3M', measuredLength: 1600 },
          { assetId: 'DP-65-3M', measuredLength: 1200 },
        ]),
        'DP-65-'
      );

      checksRun += 1;
      assertEqual(
        'getElementsForQuote synthetic downpipe packed counts',
        syntheticDownpipePacked.byId,
        stableObject({ 'DP-65-3M': 1, 'DP-65-1.5M': 1 })
      );

      checksRun += 1;
      if (syntheticDownpipePacked.firstLengthMm !== 2800) {
        failures.push(
          `getElementsForQuote synthetic downpipe length_mm mismatch: expected 2800, got ${syntheticDownpipePacked.firstLengthMm}`
        );
      }

      const syntheticMixedDownpipePacked = collectPacked(
        fnBag.getElementsForQuoteFromSynthetic([
          { assetId: 'DP-65-3M', measuredLength: 1600 },
          { assetId: 'DP-65-3M' },
        ]),
        'DP-65-'
      );

      checksRun += 1;
      assertEqual(
        'getElementsForQuote synthetic mixed downpipe packed counts',
        syntheticMixedDownpipePacked.byId,
        stableObject({ 'DP-65-3M': 2 })
      );

      checksRun += 1;
      if (syntheticMixedDownpipePacked.firstLengthMm !== 4600) {
        failures.push(
          `getElementsForQuote synthetic mixed downpipe length_mm mismatch: expected 4600, got ${syntheticMixedDownpipePacked.firstLengthMm}`
        );
      }

      const tableBody = document.getElementById('quoteTableBody');
      if (!tableBody) {
        failures.push('Missing #quoteTableBody; cannot run quote-table scaling checks.');
        return { failures, checksRun };
      }

      const createIncompleteMetresRow = ({ assetId, enteredMetres, multiplier }) => {
        const tr = document.createElement('tr');
        tr.dataset.assetId = assetId;
        tr.dataset.incompleteMeasurement = 'true';
        tr.dataset.missingMeasurementMultiplier = String(multiplier);
        tr.classList.add('quote-row-incomplete-measurement');
        tr.innerHTML = '<td>Synthetic</td><td></td><td>—</td><td>—</td><td>—</td><td>—</td>';
        const qtyCell = tr.cells[1];
        const input = document.createElement('input');
        input.type = 'number';
        input.min = '0';
        input.step = '0.001';
        input.className = 'quote-qty-metres-input';
        input.value = String(enteredMetres);
        qtyCell.appendChild(input);
        return { tr, input };
      };

      const originalTableHtml = tableBody.innerHTML;

      try {
        const tableScalingScenarios = [
          {
            label: 'Downpipe scaling 6 x 0.33',
            assetId: 'DP-65-3M',
            enteredMetres: 6,
            multiplier: 0.33,
            prefix: 'DP-65-',
            expectedById: { 'DP-65-3M': 1 },
            expectedLengthMm: 1980,
          },
          {
            label: 'Downpipe scaling 6 x 2',
            assetId: 'DP-65-3M',
            enteredMetres: 6,
            multiplier: 2,
            prefix: 'DP-65-',
            expectedById: { 'DP-65-3M': 4 },
            expectedLengthMm: 12000,
          },
          {
            label: 'Gutter scaling 6 x 0.33',
            assetId: 'GUT-SC-MAR-3M',
            enteredMetres: 6,
            multiplier: 0.33,
            prefix: 'GUT-SC-',
            expectedById: { 'GUT-SC-MAR-3M': 1 },
            expectedLengthMm: 1980,
          },
          {
            label: 'Gutter scaling 6 x 2',
            assetId: 'GUT-SC-MAR-3M',
            enteredMetres: 6,
            multiplier: 2,
            prefix: 'GUT-SC-',
            expectedById: { 'GUT-SC-MAR-3M': 4 },
            expectedLengthMm: 12000,
          },
        ];

        tableScalingScenarios.forEach((scenario) => {
          tableBody.innerHTML = '';
          const { tr } = createIncompleteMetresRow(scenario);
          tableBody.appendChild(tr);

          const elements = fnBag.getElementsFromQuoteTable();
          const packed = collectPacked(elements, scenario.prefix);

          checksRun += 1;
          assertEqual(`${scenario.label} packed counts`, packed.byId, stableObject(scenario.expectedById));

          checksRun += 1;
          if (packed.firstLengthMm !== scenario.expectedLengthMm) {
            failures.push(
              `${scenario.label} length_mm mismatch: expected ${scenario.expectedLengthMm}, got ${packed.firstLengthMm}`
            );
          }
        });

        tableBody.innerHTML = '';
        const commitScenario = createIncompleteMetresRow({
          assetId: 'DP-65-3M',
          enteredMetres: 6,
          multiplier: 2,
        });
        tableBody.appendChild(commitScenario.tr);

        fnBag.commitMetresInput(commitScenario.tr, commitScenario.input);

        checksRun += 1;
        if (commitScenario.tr.dataset.lengthMm !== '12000') {
          failures.push(`commitMetresInput length_mm mismatch: expected 12000, got ${commitScenario.tr.dataset.lengthMm}`);
        }

        checksRun += 1;
        if (commitScenario.tr.dataset.manualLength !== 'true') {
          failures.push('commitMetresInput did not set data-manual-length="true".');
        }

        checksRun += 1;
        if (commitScenario.tr.dataset.incompleteMeasurement === 'true') {
          failures.push('commitMetresInput did not clear incomplete measurement state.');
        }

        checksRun += 1;
        if (commitScenario.tr.querySelector('.quote-qty-metres-input')) {
          failures.push('commitMetresInput did not remove metres input element.');
        }

        const committedElements = fnBag.getElementsFromQuoteTable();
        const committedPacked = collectPacked(committedElements, 'DP-65-');

        checksRun += 1;
        assertEqual(
          'commitMetresInput -> getElementsFromQuoteTable packed counts',
          committedPacked.byId,
          stableObject({ 'DP-65-3M': 4 })
        );

        checksRun += 1;
        if (committedPacked.firstLengthMm !== 12000) {
          failures.push(
            `commitMetresInput -> getElementsFromQuoteTable length_mm mismatch: expected 12000, got ${committedPacked.firstLengthMm}`
          );
        }

      } finally {
        tableBody.innerHTML = originalTableHtml;
      }

      return { failures, checksRun };
    });

    if (!audit || !Array.isArray(audit.failures)) {
      throw new Error('Audit did not return a valid result payload.');
    }

    if (audit.failures.length > 0) {
      throw new Error(
        `Manual-metre audit failed (${audit.failures.length} issues):\n${formatFailureList(audit.failures)}`
      );
    }

    console.log(`  ✓ Manual-metre audit passed (${audit.checksRun} checks).`);
  } finally {
    await browser.close();
  }
}

run()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((err) => {
    console.error(err && err.stack ? err.stack : String(err));
    process.exitCode = 1;
  });
