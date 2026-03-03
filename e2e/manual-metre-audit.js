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
        'setQuoteSectionModeForTest',
        'resetQuoteSectionModesForTest',
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
        Object.keys(obj || {}).sort((a, b) => {
          const aNum = Number(a);
          const bNum = Number(b);
          const aIsNum = Number.isFinite(aNum);
          const bIsNum = Number.isFinite(bNum);
          if (aIsNum && bIsNum) return aNum - bNum;
          return String(a).localeCompare(String(b));
        }).forEach((key) => {
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

      const stockMmFromById = (byId) => {
        return Object.entries(byId || {}).reduce((acc, [assetId, qty]) => {
          const match = /-(\d+(?:\.\d+)?)M$/i.exec(String(assetId || '').trim());
          if (!match) return acc;
          return acc + (Math.round(Number(match[1]) * 1000) * (Number(qty) || 0));
        }, 0);
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

      const syntheticStormCloudPackedElements = fnBag.getElementsForQuoteFromSynthetic([
        { assetId: 'GUT-SC-MAR-3M', measuredLength: 4000 },
        { assetId: 'GUT-SC-MAR-3M', measuredLength: 1000 },
      ]);
      const syntheticStormCloudPacked = collectPacked(syntheticStormCloudPackedElements, 'GUT-SC-');

      checksRun += 1;
      assertEqual(
        'getElementsForQuote synthetic storm cloud packed counts',
        syntheticStormCloudPacked.byId,
        stableObject({ 'GUT-SC-MAR-1.5M': 2, 'GUT-SC-MAR-3M': 1 })
      );

      checksRun += 1;
      const syntheticStormCloudStockMm = stockMmFromById(syntheticStormCloudPacked.byId);
      if (syntheticStormCloudStockMm !== 6000) {
        failures.push(
          `getElementsForQuote synthetic storm cloud stock_mm mismatch: expected 6000, got ${syntheticStormCloudStockMm}`
        );
      }

      checksRun += 1;
      const syntheticStormCloudProvenanceFlags = (Array.isArray(syntheticStormCloudPackedElements)
        ? syntheticStormCloudPackedElements
        : []
      ).filter((item) => {
        return String(item && item.assetId ? item.assetId : '').startsWith('GUT-SC-');
      }).map((item) => item && item.packed_from_canvas === true);
      if (
        syntheticStormCloudProvenanceFlags.length !== 2
        || syntheticStormCloudProvenanceFlags.some((flag) => flag !== true)
      ) {
        failures.push(
          `getElementsForQuote synthetic storm cloud packed_from_canvas flags invalid: ${JSON.stringify(syntheticStormCloudProvenanceFlags)}`
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

      const createSectionHeaderRow = ({ sectionId, metresValue }) => {
        const tr = document.createElement('tr');
        tr.dataset.sectionHeader = sectionId;
        tr.innerHTML = '<td>Header</td><td><span class="quote-header-metres-wrap"></span></td><td></td><td></td><td></td><td></td>';
        const wrap = tr.querySelector('.quote-header-metres-wrap');
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'quote-header-metres-input';
        input.min = '0';
        input.step = '0.5';
        input.value = metresValue == null ? '' : String(metresValue);
        wrap.appendChild(input);
        return { tr, input };
      };

      const createChildRow = ({ assetId, qty, sectionFor }) => {
        const tr = document.createElement('tr');
        tr.dataset.assetId = assetId;
        if (sectionFor) tr.dataset.sectionFor = sectionFor;
        tr.innerHTML = '<td>Synthetic</td><td><input type="number" class="quote-line-qty-input" min="0" step="1"></td><td>—</td><td>—</td><td>—</td><td>—</td>';
        const qtyInput = tr.querySelector('.quote-line-qty-input');
        if (qtyInput) qtyInput.value = String(qty);
        return { tr, qtyInput };
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
        (Array.isArray(syntheticStormCloudPackedElements) ? syntheticStormCloudPackedElements : []).forEach((item) => {
          const assetId = String(item && item.assetId ? item.assetId : '');
          if (!assetId) return;
          const tr = document.createElement('tr');
          tr.dataset.assetId = assetId;
          tr.dataset.manualLength = 'true';
          tr.dataset.packedFromCanvas = 'true';
          const lengthMm = Number(item && item.length_mm);
          if (Number.isFinite(lengthMm) && lengthMm > 0) tr.dataset.lengthMm = String(lengthMm);
          tr.innerHTML = '<td>Synthetic</td><td></td><td>—</td><td>—</td><td>—</td><td>—</td>';
          tr.cells[1].textContent = String(Number(item && item.quantity) || 0);
          tableBody.appendChild(tr);
        });

        const syntheticStormCloudSecondPass = fnBag.getElementsFromQuoteTable();
        const syntheticStormCloudSecondPassPacked = collectPacked(syntheticStormCloudSecondPass, 'GUT-SC-');

        checksRun += 1;
        assertEqual(
          'storm cloud 4m+1m second-pass packed counts',
          syntheticStormCloudSecondPassPacked.byId,
          stableObject({ 'GUT-SC-MAR-1.5M': 2, 'GUT-SC-MAR-3M': 1 })
        );

        checksRun += 1;
        const syntheticStormCloudSecondPassStockMm = stockMmFromById(syntheticStormCloudSecondPassPacked.byId);
        if (syntheticStormCloudSecondPassStockMm !== 6000) {
          failures.push(
            `storm cloud 4m+1m second-pass stock_mm mismatch: expected 6000, got ${syntheticStormCloudSecondPassStockMm}`
          );
        }

        // Risk guard 1: quote-table rebuild path drops packed tags; header metres must still prevent child-row inflation.
        fnBag.resetQuoteSectionModesForTest();
        tableBody.innerHTML = '';
        const rebuiltHeader = createSectionHeaderRow({ sectionId: 'SC', metresValue: 6 });
        const rebuiltChildA = createChildRow({ assetId: 'GUT-SC-MAR-1.5M', qty: 2, sectionFor: 'SC' });
        const rebuiltChildB = createChildRow({ assetId: 'GUT-SC-MAR-3M', qty: 1, sectionFor: 'SC' });
        tableBody.appendChild(rebuiltHeader.tr);
        tableBody.appendChild(rebuiltChildA.tr);
        tableBody.appendChild(rebuiltChildB.tr);

        const rebuiltHeaderElements = fnBag.getElementsFromQuoteTable();
        const rebuiltHeaderPacked = collectPacked(rebuiltHeaderElements, 'GUT-SC-');
        checksRun += 1;
        assertEqual(
          'storm cloud rebuilt table uses header metres (tags dropped)',
          rebuiltHeaderPacked.byId,
          stableObject({ 'GUT-SC-MAR-3M': 2 })
        );
        checksRun += 1;
        if (stockMmFromById(rebuiltHeaderPacked.byId) !== 6000) {
          failures.push(
            `storm cloud rebuilt table stock_mm mismatch: expected 6000, got ${stockMmFromById(rebuiltHeaderPacked.byId)}`
          );
        }

        // Risk guard 2: child qty edits after rebuild should not bypass header metres path.
        if (rebuiltChildA.qtyInput) rebuiltChildA.qtyInput.value = '99';
        const rebuiltEditedElements = fnBag.getElementsFromQuoteTable();
        const rebuiltEditedPacked = collectPacked(rebuiltEditedElements, 'GUT-SC-');
        checksRun += 1;
        assertEqual(
          'storm cloud rebuilt child qty edit still header-driven',
          rebuiltEditedPacked.byId,
          stableObject({ 'GUT-SC-MAR-3M': 2 })
        );

        // Risk guard 3: clearing header metres after rebuild should suppress child gutter serialization (no fallback inflation).
        rebuiltHeader.input.value = '';
        const rebuiltIncompleteElements = fnBag.getElementsFromQuoteTable();
        const rebuiltIncompletePacked = collectPacked(rebuiltIncompleteElements, 'GUT-SC-');
        checksRun += 1;
        assertEqual(
          'storm cloud rebuilt table cleared header emits no child gutters',
          rebuiltIncompletePacked.byId,
          stableObject({})
        );

        // Section mode serialization guard: gutter header mode -> parts mode -> header mode.
        fnBag.resetQuoteSectionModesForTest();
        tableBody.innerHTML = '';
        const gutterModeHeader = createSectionHeaderRow({ sectionId: 'SC', metresValue: 6 });
        const gutterModeChildA = createChildRow({ assetId: 'GUT-SC-MAR-1.5M', qty: 2, sectionFor: 'SC' });
        const gutterModeChildB = createChildRow({ assetId: 'GUT-SC-MAR-3M', qty: 1, sectionFor: 'SC' });
        tableBody.appendChild(gutterModeHeader.tr);
        tableBody.appendChild(gutterModeChildA.tr);
        tableBody.appendChild(gutterModeChildB.tr);

        const gutterHeaderModePacked = collectPacked(fnBag.getElementsFromQuoteTable(), 'GUT-SC-');
        checksRun += 1;
        assertEqual(
          'section mode gutter header baseline',
          gutterHeaderModePacked.byId,
          stableObject({ 'GUT-SC-MAR-3M': 2 })
        );

        fnBag.setQuoteSectionModeForTest('SC', 'parts');
        const gutterPartsModePacked = collectPacked(fnBag.getElementsFromQuoteTable(), 'GUT-SC-');
        checksRun += 1;
        assertEqual(
          'section mode gutter parts ignores header',
          gutterPartsModePacked.byId,
          stableObject({ 'GUT-SC-MAR-1.5M': 2, 'GUT-SC-MAR-3M': 1 })
        );
        checksRun += 1;
        if (stockMmFromById(gutterPartsModePacked.byId) !== 6000) {
          failures.push(
            `section mode gutter parts stock_mm mismatch: expected 6000, got ${stockMmFromById(gutterPartsModePacked.byId)}`
          );
        }

        fnBag.setQuoteSectionModeForTest('SC', 'header');
        const gutterRestoredModePacked = collectPacked(fnBag.getElementsFromQuoteTable(), 'GUT-SC-');
        checksRun += 1;
        assertEqual(
          'section mode gutter restore to header',
          gutterRestoredModePacked.byId,
          stableObject({ 'GUT-SC-MAR-3M': 2 })
        );

        // Section mode serialization guard: downpipe header mode -> parts mode -> header mode.
        fnBag.resetQuoteSectionModesForTest();
        tableBody.innerHTML = '';
        const downpipeModeHeader = createSectionHeaderRow({ sectionId: 'downpipe-65', metresValue: 4.5 });
        const downpipeModeChildA = createChildRow({ assetId: 'DP-65-3M', qty: 1, sectionFor: 'downpipe-65' });
        const downpipeModeChildB = createChildRow({ assetId: 'DP-65-1.5M', qty: 2, sectionFor: 'downpipe-65' });
        tableBody.appendChild(downpipeModeHeader.tr);
        tableBody.appendChild(downpipeModeChildA.tr);
        tableBody.appendChild(downpipeModeChildB.tr);

        const downpipeHeaderModePacked = collectPacked(fnBag.getElementsFromQuoteTable(), 'DP-65-');
        checksRun += 1;
        assertEqual(
          'section mode downpipe header baseline',
          downpipeHeaderModePacked.byId,
          stableObject({ 'DP-65-1.5M': 1, 'DP-65-3M': 1 })
        );

        fnBag.setQuoteSectionModeForTest('downpipe-65', 'parts');
        const downpipePartsModePacked = collectPacked(fnBag.getElementsFromQuoteTable(), 'DP-65-');
        checksRun += 1;
        assertEqual(
          'section mode downpipe parts ignores header',
          downpipePartsModePacked.byId,
          stableObject({ 'DP-65-1.5M': 2, 'DP-65-3M': 1 })
        );
        checksRun += 1;
        if (stockMmFromById(downpipePartsModePacked.byId) !== 6000) {
          failures.push(
            `section mode downpipe parts stock_mm mismatch: expected 6000, got ${stockMmFromById(downpipePartsModePacked.byId)}`
          );
        }

        fnBag.setQuoteSectionModeForTest('downpipe-65', 'header');
        const downpipeRestoredModePacked = collectPacked(fnBag.getElementsFromQuoteTable(), 'DP-65-');
        checksRun += 1;
        assertEqual(
          'section mode downpipe restore to header',
          downpipeRestoredModePacked.byId,
          stableObject({ 'DP-65-1.5M': 1, 'DP-65-3M': 1 })
        );

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
