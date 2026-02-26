/**
 * Diagnostic: Confirm Job overlay – root cause (A) vs (B).
 * Run with server up: node e2e/diagnose-job-confirm-overlay.js
 * Or: BASE_URL=http://127.0.0.1:8000 node e2e/diagnose-job-confirm-overlay.js
 *
 * (A) Handlers not attached: addBtn/createNewBtn null at init.
 * (B) Handlers run but return before loading/API: getAddToJobPayload returns null.
 *
 * This script:
 * 1. Checks overlay and buttons exist after load (if missing → init/DOM issue).
 * 2. Opens quote modal, mocks job lookup, triggers overlay, clicks Add to Job button.
 * 3. Checks if loading class appears or add-to-job fetch is requested within 1s.
 *    - If neither → handler not running (A) or handler returns before loading (B).
 *    - If loading or fetch seen → handler runs; issue is elsewhere.
 */
const path = require('path');
const puppeteer = require('puppeteer');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8000';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);

  const addToJobRequests = [];
  const createNewJobRequests = [];
  const jobLookupRequests = [];

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('/api/servicem8/jobs') && url.includes('generated_job_id')) {
      jobLookupRequests.push(url);
      req.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          uuid: 'e2e-fake-job-uuid-123',
          generated_job_id: '5734',
          job_address: '123 Test St',
          total_invoice_amount: '100.00',
        }),
      });
      return;
    }
    if (url.includes('/api/servicem8/add-to-job')) {
      addToJobRequests.push({ url: url.split('?')[0], method: req.method() });
      req.respond({ status: 200, contentType: 'application/json', body: '{"generated_job_id":"5734","uuid":"e2e-fake-job-uuid-123"}' });
      return;
    }
    if (url.includes('/api/servicem8/create-new-job')) {
      createNewJobRequests.push({ url: url.split('?')[0], method: req.method() });
      req.respond({ status: 200, contentType: 'application/json', body: '{"generated_job_id":"5735","new_job_uuid":"e2e-fake-new-uuid"}' });
      return;
    }
    req.continue();
  });

  console.log('Diagnostic: Job Confirm Overlay root cause\n');
  console.log('Loading', BASE_URL, '...');

  const res = await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
  if (!res || !res.ok()) {
    console.error('Page load failed. Is the server running?');
    await browser.close();
    process.exit(1);
  }

  await page.waitForSelector('.app', { timeout: 8000 });
  await delay(1500);

  // Ensure canvas view and auth so ServiceM8 section is enabled
  await page.evaluate(() => {
    if (typeof window.__quoteAppSetAuthForTests === 'function') {
      window.__quoteAppSetAuthForTests({
        token: 'e2e-diagnostic-token',
        role: 'editor',
        email: 'e2e-diagnostic@example.com',
        userId: 'e2e-diagnostic-user-id',
      });
    }
    if (typeof window.__quoteAppSwitchView === 'function') window.__quoteAppSwitchView('view-canvas');
  });
  await page.waitForFunction(
    () => {
      const view = document.getElementById('view-canvas');
      return view && !view.classList.contains('hidden');
    },
    { timeout: 8000 }
  );
  await delay(500);

  // --- Step 1: Do overlay and buttons exist after load? ---
  const step1 = await page.evaluate(() => {
    const overlay = document.getElementById('jobConfirmOverlay');
    const addBtn = document.getElementById('jobConfirmAddBtn');
    const createNewBtn = document.getElementById('jobConfirmCreateNew');
    return {
      overlayExists: !!overlay,
      overlayHidden: overlay ? overlay.hasAttribute('hidden') : null,
      addBtnExists: !!addBtn,
      createNewBtnExists: !!createNewBtn,
    };
  });
  console.log('\n[Step 1] After load: overlay exists =', step1.overlayExists, ', addBtn =', step1.addBtnExists, ', createNewBtn =', step1.createNewBtnExists);
  if (!step1.addBtnExists || !step1.createNewBtnExists) {
    console.log('ROOT CAUSE (A) LIKELY: Buttons missing in DOM at load. Init may run before overlay exists or initQuoteModal returned early.');
    await browser.close();
    process.exit(0);
  }

  // --- Step 2: Open quote modal (Generate Quote) ---
  await page.waitForSelector('#generateQuoteBtn', { visible: true, timeout: 5000 });
  await page.click('#generateQuoteBtn');
  await delay(2500);

  const quoteOpen = await page.evaluate(() => {
    const m = document.getElementById('quoteModal');
    return m && !m.hasAttribute('hidden');
  });
  if (!quoteOpen) {
    const diag = await page.evaluate(() => ({
      quoteModalExists: !!document.getElementById('quoteModal'),
      quoteModalHidden: document.getElementById('quoteModal')?.hasAttribute('hidden'),
      viewCanvasHidden: document.getElementById('view-canvas')?.classList.contains('hidden'),
    }));
    console.log('Quote modal did not open; cannot continue diagnostic.', diag);
    await browser.close();
    process.exit(1);
  }
  console.log('[Step 2] Quote modal opened');

  // Force ServiceM8 section enabled and labour hours > 0 so Add to Job runs (diagnostic only)
  await page.evaluate(() => {
    window.servicem8Connected = true;
    const section = document.getElementById('quoteServicem8Section');
    const input = document.getElementById('servicem8JobIdInput');
    const btn = document.getElementById('servicem8AddToJobBtn');
    if (section) section.classList.remove('quote-servicem8-section--disabled');
    if (input) input.disabled = false;
    if (btn) btn.disabled = false;
  });
  await delay(200);
  // Ensure labour hours > 0 so Add to Job click does not return early (desktop has .quote-labour-hours-input; mobile may use summary)
  await page.evaluate(() => {
    const labourRow = document.querySelector('#quoteTableBody tr[data-labour-row="true"]');
    let hoursInput = labourRow ? labourRow.querySelector('.quote-labour-hours-input') : null;
    if (!hoursInput) {
      const anyHours = document.querySelector('#quoteTableBody .quote-labour-hours-input');
      hoursInput = anyHours;
    }
    if (hoursInput) {
      hoursInput.value = '1';
      hoursInput.dispatchEvent(new Event('input', { bubbles: true }));
      hoursInput.dispatchEvent(new Event('change', { bubbles: true }));
      hoursInput.dispatchEvent(new Event('blur', { bubbles: true }));
    }
    if (typeof window.__quoteAppUpdateQuoteTotalWarning === 'function') window.__quoteAppUpdateQuoteTotalWarning();
    if (typeof window.__quoteAppSyncMobileQuoteLineSummaries === 'function') window.__quoteAppSyncMobileQuoteLineSummaries();
  });
  await delay(600);

  // Set job # and trigger Add to Job (which will call our mock and open overlay)
  await page.evaluate(() => {
    const input = document.getElementById('servicem8JobIdInput');
    const btn = document.getElementById('servicem8AddToJobBtn');
    if (input) input.value = '5734';
    if (input) input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await delay(200);
  await page.evaluate(() => {
    const btn = document.getElementById('servicem8AddToJobBtn');
    if (btn && !btn.disabled) btn.click();
  });
  await delay(2000);

  const overlayVisible = await page.evaluate(() => {
    const overlay = document.getElementById('jobConfirmOverlay');
    return overlay && !overlay.hasAttribute('hidden');
  });
  if (!overlayVisible) {
    const labourDiag = await page.evaluate(() => {
      const row = document.querySelector('#quoteTableBody tr[data-labour-row="true"]');
      const hoursInput = row ? row.querySelector('.quote-labour-hours-input') : null;
      const jobInput = document.getElementById('servicem8JobIdInput');
      const addBtn = document.getElementById('servicem8AddToJobBtn');
      return {
        labourRowExists: !!row,
        hoursValue: hoursInput ? hoursInput.value : null,
        jobIdValue: jobInput ? jobInput.value : null,
        addToJobBtnDisabled: addBtn ? addBtn.disabled : null,
      };
    });
    console.log('Overlay did not open after Add to Job click.');
    console.log('  Job lookup requests:', jobLookupRequests.length, jobLookupRequests[0] || '');
    console.log('  Labour/hours/jobId/btnDisabled:', labourDiag);
    await browser.close();
    process.exit(1);
  }
  console.log('[Step 3] Confirm Job overlay is visible');

  // --- Step 4: Click "Add to Job # ..." and observe loading or fetch within 1s ---
  addToJobRequests.length = 0;
  await page.evaluate(() => {
    const addBtn = document.getElementById('jobConfirmAddBtn');
    if (addBtn && !addBtn.disabled) addBtn.click();
  });

  await delay(1000);

  const step4 = await page.evaluate(() => {
    const addBtn = document.getElementById('jobConfirmAddBtn');
    const hasLoading = addBtn && addBtn.classList.contains('job-confirm-add-btn--loading');
    const hasDone = addBtn && addBtn.classList.contains('job-confirm-add-btn--done');
    const disabled = addBtn && addBtn.disabled;
    const feedback = document.getElementById('servicem8Feedback');
    const feedbackText = feedback ? feedback.textContent : '';
    const feedbackVisible = feedback && feedback.classList.contains('quote-servicem8-feedback--visible');
    return { hasLoading, hasDone, disabled, feedbackText: feedbackText.slice(0, 80), feedbackVisible };
  });

  const fetchFired = addToJobRequests.length > 0;
  console.log('[Step 4] After clicking Add to Job # button:');
  console.log('  - add-to-job fetch requested:', fetchFired);
  console.log('  - button has loading class:', step4.hasLoading);
  console.log('  - button has done class:', step4.hasDone);
  console.log('  - feedback visible:', step4.feedbackVisible, ', text:', step4.feedbackText || '(none)');

  if (fetchFired || step4.hasLoading || step4.hasDone) {
    console.log('\nRESULT: Handler is running (fetch or loading/done state seen). Root cause (A) ruled out.');
    if (!fetchFired && (step4.feedbackVisible && step4.feedbackText.includes('No quote data'))) {
      console.log('ROOT CAUSE (B): getAddToJobPayload returned null (e.g. elements.length === 0 or jobUuid missing). Fix payload/quote state.');
    } else {
      console.log('Likely cause: timing or environment (in this run the flow worked).');
    }
  } else {
    console.log('\nRESULT: No fetch and no loading class → button click did not trigger handler logic.');
    console.log('ROOT CAUSE (A) LIKELY: Click listeners not attached to #jobConfirmAddBtn (elements were null when initJobConfirmationOverlay ran, or different nodes in DOM).');
    if (step4.feedbackVisible && step4.feedbackText) {
      console.log('(Feedback message present:', step4.feedbackText, '– handler may have run but returned before loading; re-check (B).)');
    }
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
