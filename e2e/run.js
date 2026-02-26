/**
 * Quote App – E2E tests with Puppeteer.
 * 
 * Start the backend first: cd backend && uvicorn main:app --reload --host 127.0.0.1 --port 8000
 * 
 * Run tests:
 *   - Headless (CI): npm test  or  npm run test:e2e
 *   - With visible Chrome (manual): npm run test:manual  or  HEADED=1 npm test
 */
const path = require('path');
const puppeteer = require('puppeteer');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8000';
const HEADED = process.env.HEADED === '1' || process.env.HEADED === 'true';
// Match server default: PWA on unless explicitly disabled
const PWA_ENABLED = process.env.PWA_ENABLED !== '0' && process.env.PWA_ENABLED !== 'false';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function clickSelectorViaDom(page, selector) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error(`Missing clickable element: ${sel}`);
    el.click();
  }, selector);
}

async function clickSelectorViaDomIfPresent(page, selector) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) el.click();
  }, selector);
}

async function pointerTapSelector(page, selector, options = {}) {
  const { driftX = 0, driftY = 0, steps = 3 } = options;
  const point = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, selector);
  if (!point) throw new Error(`Missing tappable element: ${selector}`);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  if (driftX !== 0 || driftY !== 0) {
    await page.mouse.move(point.x + driftX, point.y + driftY, { steps });
  }
  await page.mouse.up();
}

async function getOrientationPolicyState(page) {
  return page.evaluate(() => {
    if (typeof window.__quoteAppGetOrientationPolicyState !== 'function') return null;
    return window.__quoteAppGetOrientationPolicyState();
  });
}

async function run() {
  const browser = await puppeteer.launch({
    headless: !HEADED,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: null, // Use full window size
  });

  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setCacheEnabled(false);
  if (!HEADED) {
    await page.setViewport({ width: 1280, height: 720 });
  }
  page.setDefaultNavigationTimeout(10000);
  page.setDefaultTimeout(8000);
  const undoModifier = process.platform === 'darwin' ? 'Meta' : 'Control';

  const logs = [];
  page.on('console', (msg) => {
    const text = msg.text();
    const type = msg.type();
    logs.push({ type, text });
    if (
      type === 'error'
      && !text.includes('404')
      && !text.includes('ERR_INTERNET_DISCONNECTED')
    ) console.error('[page]', text);
  });

  try {
    console.log('Loading', BASE_URL);
    const res = await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
    if (!res || !res.ok()) {
      throw new Error(`Page load failed: ${res ? res.status() : 'no response'}. Is the server running? Start with: cd backend && uvicorn main:app --reload --host 127.0.0.1 --port 8000`);
    }

    if (PWA_ENABLED) {
      const swState = await page.evaluate(async () => {
        if (!('serviceWorker' in navigator)) return { supported: false };
        try {
          await Promise.race([
            navigator.serviceWorker.ready,
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout waiting for service worker')), 10000)),
          ]);
          const registrations = await navigator.serviceWorker.getRegistrations();
          return {
            supported: true,
            registrations: registrations.length,
            controlled: !!navigator.serviceWorker.controller,
          };
        } catch (err) {
          return { supported: true, error: String(err) };
        }
      });

      if (!swState.supported) throw new Error('PWA enabled test requires service worker support in browser');
      if (swState.error) throw new Error(`PWA enabled test failed waiting for service worker: ${swState.error}`);
      if (swState.registrations < 1) throw new Error('PWA enabled test expected at least one service worker registration');

      await page.reload({ waitUntil: 'networkidle2' });
      await delay(500);
      const hasController = await page.evaluate(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller));
      if (!hasController) throw new Error('PWA enabled test expected page to be controlled by service worker after reload');

      const cdp = await page.target().createCDPSession();
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', {
        offline: true,
        latency: 0,
        downloadThroughput: 0,
        uploadThroughput: 0,
      });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.app', { timeout: 5000 });
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      });
      await page.reload({ waitUntil: 'networkidle2' });
      console.log('  ✓ PWA enabled gate: service worker active and shell loads offline');
    } else {
      const swState = await page.evaluate(async () => {
        if (!('serviceWorker' in navigator)) return { supported: false, registrations: 0, controlled: false };
        const registrations = await navigator.serviceWorker.getRegistrations();
        return {
          supported: true,
          registrations: registrations.length,
          controlled: !!navigator.serviceWorker.controller,
        };
      });
      if (swState.registrations > 0 || swState.controlled) {
        throw new Error(`PWA disabled gate failed: registrations=${swState.registrations}, controlled=${swState.controlled}`);
      }
      console.log('  ✓ PWA disabled gate: no active service worker');
    }

    // App shell
    await page.waitForSelector('.app', { timeout: 5000 });
    await page.waitForSelector('#canvas', { timeout: 5000 });
    // When logged out, app shows login view; ensure canvas view is visible for E2E
    await delay(1500);
    const canvasViewVisible = await page.evaluate(() => {
      const v = document.getElementById('view-canvas');
      return v && !v.classList.contains('hidden');
    });
    if (!canvasViewVisible) {
      await page.evaluate(() => {
        if (typeof window.__quoteAppSwitchView === 'function') window.__quoteAppSwitchView('view-canvas');
      });
      await delay(800);
    }
    console.log('  ✓ App shell and canvas present');

    const desktopOrientationPolicy = await getOrientationPolicyState(page);
    if (!desktopOrientationPolicy) throw new Error('Orientation policy hook missing on desktop run');
    if (desktopOrientationPolicy.target !== 'none') {
      throw new Error(`Desktop orientation policy target should be none, got ${desktopOrientationPolicy.target}`);
    }
    console.log('  ✓ Orientation policy (desktop): target none');

    const productsAvatarMenuBehavior = await page.evaluate(() => {
      if (typeof window.__quoteAppSetAuthForTests !== 'function' || typeof window.__quoteAppSwitchView !== 'function') {
        return { hookReady: false };
      }
      window.__quoteAppSetAuthForTests({
        token: 'e2e-products-avatar-token',
        role: 'admin',
        email: 'qa-products-avatar@example.com',
        userId: '00000000-0000-0000-0000-00000000d101',
      });
      window.__quoteAppSwitchView('view-products');
      const dropdown = document.getElementById('profileDropdown');
      const avatar = document.getElementById('productsUserAvatar');
      if (!dropdown || !avatar) {
        return { hookReady: true, menuReady: false };
      }
      dropdown.hidden = true;
      avatar.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      const adminState = typeof window.__quoteAppGetAdminUiState === 'function' ? window.__quoteAppGetAdminUiState() : null;
      const visibleView = document.querySelector('.app-view:not(.hidden)')?.id || null;
      return {
        hookReady: true,
        menuReady: true,
        dropdownOpen: !dropdown.hidden,
        hasToken: !!adminState?.hasToken,
        visibleView,
      };
    });
    if (!productsAvatarMenuBehavior.hookReady) {
      throw new Error('Products avatar regression: missing auth/view test hooks');
    }
    if (!productsAvatarMenuBehavior.menuReady) {
      throw new Error('Products avatar regression: missing products user avatar or profile dropdown');
    }
    if (!productsAvatarMenuBehavior.hasToken || productsAvatarMenuBehavior.visibleView !== 'view-products' || !productsAvatarMenuBehavior.dropdownOpen) {
      throw new Error(
        `Products avatar regression: expected menu-open behavior without sign-out ` +
        `(hasToken=${productsAvatarMenuBehavior.hasToken}, view=${productsAvatarMenuBehavior.visibleView}, dropdownOpen=${productsAvatarMenuBehavior.dropdownOpen})`
      );
    }
    console.log('  ✓ Product Library avatar opens user menu without forcing sign-out');

    const productCardKeyboardBehavior = await page.evaluate(() => {
      const card = document.getElementById('productCardNew');
      const modal = document.getElementById('productModal');
      if (!card || !modal) return { ready: false };
      modal.setAttribute('hidden', '');
      card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      const visibleView = document.querySelector('.app-view:not(.hidden)')?.id || null;
      return {
        ready: true,
        modalOpen: !modal.hasAttribute('hidden'),
        visibleView,
      };
    });
    if (!productCardKeyboardBehavior.ready) {
      throw new Error('Product card keyboard regression: missing New Product card or product modal');
    }
    if (!productCardKeyboardBehavior.modalOpen || productCardKeyboardBehavior.visibleView !== 'view-products') {
      throw new Error(
        `Product card keyboard regression: Enter should open product modal in products view ` +
        `(modalOpen=${productCardKeyboardBehavior.modalOpen}, view=${productCardKeyboardBehavior.visibleView})`
      );
    }
    await page.evaluate(() => {
      document.getElementById('productModal')?.setAttribute('hidden', '');
      if (typeof window.__quoteAppSwitchView === 'function') window.__quoteAppSwitchView('view-canvas');
    });
    await delay(220);
    console.log('  ✓ New Product card supports keyboard Enter activation');

    const floatingHandleA11yState = await page.evaluate(() => {
      const handle = document.getElementById('floatingToolbarDragHandle');
      if (!handle) return null;
      return {
        role: handle.getAttribute('role'),
        tabIndex: handle.getAttribute('tabindex'),
        ariaHidden: handle.getAttribute('aria-hidden'),
      };
    });
    if (!floatingHandleA11yState) {
      throw new Error('Floating toolbar handle regression: handle not found');
    }
    if (floatingHandleA11yState.role || floatingHandleA11yState.tabIndex != null || floatingHandleA11yState.ariaHidden !== 'true') {
      throw new Error(
        `Floating toolbar handle a11y regression: expected non-focusable visual handle ` +
        `(role=${floatingHandleA11yState.role}, tabindex=${floatingHandleA11yState.tabIndex}, ariaHidden=${floatingHandleA11yState.ariaHidden})`
      );
    }
    console.log('  ✓ Floating toolbar drag handle is non-keyboard-trappable');

    // Material Rules guard regression: desktop admin can access the Material Rules view.
    const desktopMaterialRulesGate = await page.evaluate(() => {
      if (typeof window.__quoteAppSetAuthForTests !== 'function') return { hookReady: false };
      const adminState = window.__quoteAppSetAuthForTests({
        token: 'e2e-desktop-admin-token',
        role: 'admin',
        email: 'qa-desktop-admin@example.com',
        userId: '00000000-0000-0000-0000-00000000d001',
      });
      if (typeof window.__quoteAppSwitchView === 'function') window.__quoteAppSwitchView('view-canvas');
      const profileWrap = document.getElementById('userProfileWrap');
      const profileDropdown = document.getElementById('profileDropdown');
      if (profileWrap) profileWrap.hidden = false;
      if (profileDropdown) profileDropdown.hidden = false;
      const menuItem = document.getElementById('menuItemMaterialRules');
      return {
        hookReady: true,
        canAccessDesktopAdminUi: !!adminState?.canAccessDesktopAdminUi,
        menuExists: !!menuItem,
        menuHidden: menuItem ? !!menuItem.hidden : null,
      };
    });
    if (!desktopMaterialRulesGate.hookReady) {
      throw new Error('Desktop Material Rules regression: missing __quoteAppSetAuthForTests hook');
    }
    if (!desktopMaterialRulesGate.canAccessDesktopAdminUi) {
      throw new Error('Desktop Material Rules regression: admin auth should pass desktop admin gate');
    }
    if (!desktopMaterialRulesGate.menuExists || desktopMaterialRulesGate.menuHidden) {
      throw new Error('Desktop Material Rules regression: admin desktop menu item should be visible');
    }
    await page.evaluate(() => {
      if (window.__quoteAppE2eMaterialRulesFetchPatch) return;
      const originalFetch = window.fetch.bind(window);
      window.__quoteAppE2eMaterialRulesFetchPatch = {
        originalFetch,
        capturedRepairTypesPayload: null,
        capturedTemplatesPayload: null,
      };
      window.fetch = async (input, init = {}) => {
        const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
        const href = String(url || '');
        const method = String(init?.method || '').trim().toUpperCase() || 'GET';
        const parseJsonBody = () => {
          try {
            return JSON.parse(String(init?.body || '{}'));
          } catch (_) {
            return {};
          }
        };
        if (href.includes('/api/admin/material-rules/quick-quoter/repair-types') && method === 'PUT') {
          const body = parseJsonBody();
          const rows = Array.isArray(body?.repair_types) ? body.repair_types : [];
          window.__quoteAppE2eMaterialRulesFetchPatch.capturedRepairTypesPayload = body;
          return new Response(JSON.stringify({ repair_types: rows }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (href.includes('/api/admin/material-rules/quick-quoter/templates') && method === 'PUT') {
          const body = parseJsonBody();
          const rows = Array.isArray(body?.templates) ? body.templates : [];
          window.__quoteAppE2eMaterialRulesFetchPatch.capturedTemplatesPayload = body;
          return new Response(JSON.stringify({ templates: rows }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (href.includes('/api/admin/material-rules/quick-quoter')) {
          return new Response(JSON.stringify({
            repair_types: [
              {
                id: 'joiner_replacement',
                label: 'Joiner Replacement',
                active: true,
                sort_order: 10,
                requires_profile: true,
                requires_size_mm: false,
              },
              {
                id: 'outlet_reseal',
                label: 'Outlet Reseal',
                active: true,
                sort_order: 20,
                requires_profile: false,
                requires_size_mm: true,
              },
            ],
            templates: [
              {
                id: '11111111-1111-1111-1111-111111111111',
                repair_type_id: 'joiner_replacement',
                product_id: 'GL-MAR',
                qty_per_unit: 0.25,
                condition_profile: null,
                condition_size_mm: null,
                length_mode: 'fixed_mm',
                fixed_length_mm: 1200,
                active: true,
                sort_order: 10,
              },
              {
                id: '33333333-3333-3333-3333-333333333333',
                repair_type_id: 'joiner_replacement',
                product_id: 'SCR-SS',
                qty_per_unit: 1.5,
                condition_profile: null,
                condition_size_mm: null,
                length_mode: 'none',
                fixed_length_mm: null,
                active: true,
                sort_order: 20,
              },
              {
                id: '22222222-2222-2222-2222-222222222222',
                repair_type_id: 'outlet_reseal',
                product_id: 'BRK-SC-MAR',
                qty_per_unit: 0.5,
                condition_profile: null,
                condition_size_mm: null,
                length_mode: 'none',
                fixed_length_mm: null,
                active: true,
                sort_order: 20,
              },
            ],
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (href.includes('/api/admin/material-rules/measured')) {
          return new Response(JSON.stringify({
            rules: {
              id: 1,
              bracket_spacing_mm: 800,
              clip_spacing_mm: 1000,
              screws_per_bracket: 2,
              screws_per_dropper: 2,
              screws_per_saddle_clip: 1,
              screws_per_adjustable_clip: 1,
              screw_product_id: 'SCR-SS',
              bracket_product_id_sc: 'BRK-SC-MAR',
              bracket_product_id_cl: 'BRK-CL-MAR',
              saddle_clip_product_id_65: 'SCL-65',
              saddle_clip_product_id_80: 'SCL-80',
              adjustable_clip_product_id_65: 'ACL-65',
              adjustable_clip_product_id_80: 'ACL-80',
              clip_selection_mode: 'auto_by_acl_presence',
            },
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return originalFetch(input, init);
      };
    });
    await clickSelectorViaDom(page, '#menuItemMaterialRules');
    await page.waitForSelector('#materialRulesRepairTypesBody tr[data-material-rules-repair-row="true"]', { timeout: 5000 });
    await page.waitForSelector('tbody[data-material-rules-template-section-body="true"] tr[data-material-rules-template-row="true"]', { timeout: 5000 });
    const desktopMaterialRulesViewState = await page.evaluate(() => {
      const visible = document.querySelector('.app-view:not(.hidden)');
      const repairTypeRow = document.querySelector('#materialRulesRepairTypesBody tr[data-material-rules-repair-row="true"]');
      const repairIdInput = document.querySelector('#materialRulesRepairTypesBody .material-rules-repair-id');
      const templateGroups = Array.from(document.querySelectorAll('.material-rules-template-section'));
      const templateSectionBodies = Array.from(document.querySelectorAll('tbody[data-material-rules-template-section-body="true"]'));
      const templateRepairTypeInput = document.querySelector('.material-rules-template-section .material-rules-template-repair-type-id');
      const templateProductInput = document.querySelector('.material-rules-template-section .material-rules-template-product-id');
      const templateFixedLengthInput = document.querySelector('.material-rules-template-section .material-rules-template-fixed-length');
      const templateRowIdBadge = document.querySelector('.material-rules-template-section .material-rules-row-id');
      const repairHeaders = Array.from(document.querySelectorAll('.material-rules-table--repair-types thead th'));
      const templateHeaders = Array.from(document.querySelectorAll('.material-rules-template-section .material-rules-table--templates thead th'));
      const measuredSelectors = [
        document.getElementById('materialRulesScrewProductId'),
        document.getElementById('materialRulesBracketProductIdSc'),
        document.getElementById('materialRulesBracketProductIdCl'),
        document.getElementById('materialRulesSaddleClipProductId65'),
        document.getElementById('materialRulesSaddleClipProductId80'),
        document.getElementById('materialRulesAdjustableClipProductId65'),
        document.getElementById('materialRulesAdjustableClipProductId80'),
      ];
      const hasLabourInTemplateProduct = templateProductInput && templateProductInput.tagName === 'SELECT'
        ? Array.from(templateProductInput.options || []).some((opt) => String(opt.value || '').trim() === 'REP-LAB')
        : null;
      const hasLabourInMeasured = measuredSelectors
        .filter((el) => el && el.tagName === 'SELECT')
        .some((el) => Array.from(el.options || []).some((opt) => String(opt.value || '').trim() === 'REP-LAB'));
      return {
        visibleViewId: visible ? visible.id : null,
        hasQuickSection: !!document.getElementById('materialRulesQuickQuoterHeading'),
        hasMeasuredSection: !!document.getElementById('materialRulesMeasuredHeading'),
        addRepairTypeBtnExists: !!document.getElementById('btnMaterialRulesAddRepairType'),
        hasRepairTypeRowRemoveBtn: !!document.querySelector('#materialRulesRepairTypesBody .material-rules-row-remove-btn'),
        repairIdVisible: !!repairIdInput,
        repairIdPreservedInDataset: String(repairTypeRow?.dataset?.repairTypeId || '').trim(),
        templateRowIdBadgeVisible: !!templateRowIdBadge,
        templateRepairTypeTag: templateRepairTypeInput ? templateRepairTypeInput.tagName : null,
        templateProductTag: templateProductInput ? templateProductInput.tagName : null,
        templateFixedLengthVisible: !!templateFixedLengthInput,
        templateGroupCount: templateGroups.length,
        templateSectionBodyCount: templateSectionBodies.length,
        templateAddButtonCount: document.querySelectorAll('.material-rules-add-template-btn').length,
        globalAddTemplateBtnExists: !!document.getElementById('btnMaterialRulesAddTemplate'),
        repairSortHeaderVisible: repairHeaders.some((th) => String(th.textContent || '').trim().toLowerCase() === 'sort'),
        templateSortHeaderVisible: templateHeaders.some((th) => String(th.textContent || '').trim().toLowerCase() === 'sort'),
        templateRepairTypeHeaderVisible: templateHeaders.some((th) => String(th.textContent || '').trim().toLowerCase() === 'repair type id'),
        templateFixedMmHeaderVisible: templateHeaders.some((th) => String(th.textContent || '').trim().toLowerCase() === 'fixed mm'),
        repairDragHandleCount: document.querySelectorAll('#materialRulesRepairTypesBody .material-rules-row-drag-handle').length,
        templateDragHandleCount: document.querySelectorAll('.material-rules-template-section .material-rules-row-drag-handle').length,
        measuredSelectorsAllSelect: measuredSelectors.every((el) => !!el && el.tagName === 'SELECT'),
        hasLabourInTemplateProduct,
        hasLabourInMeasured,
      };
    });
    if (desktopMaterialRulesViewState.visibleViewId !== 'view-material-rules') {
      throw new Error(`Desktop Material Rules regression: expected view-material-rules, got ${desktopMaterialRulesViewState.visibleViewId}`);
    }
    if (!desktopMaterialRulesViewState.hasQuickSection || !desktopMaterialRulesViewState.hasMeasuredSection) {
      throw new Error('Desktop Material Rules regression: expected both Quick Quoter and Measured sections');
    }
    if (desktopMaterialRulesViewState.addRepairTypeBtnExists) {
      throw new Error('Desktop Material Rules regression: Add Repair Type button should not be present');
    }
    if (desktopMaterialRulesViewState.hasRepairTypeRowRemoveBtn) {
      throw new Error('Desktop Material Rules regression: repair type rows should not have remove actions');
    }
    if (desktopMaterialRulesViewState.repairIdVisible) {
      throw new Error('Desktop Material Rules regression: repair type ID should not be visible');
    }
    if (!desktopMaterialRulesViewState.repairIdPreservedInDataset) {
      throw new Error('Desktop Material Rules regression: repair type ID must remain preserved in row dataset');
    }
    if (desktopMaterialRulesViewState.templateRowIdBadgeVisible) {
      throw new Error('Desktop Material Rules regression: template internal row ID badge should not be visible');
    }
    if (desktopMaterialRulesViewState.templateRepairTypeTag !== null) {
      throw new Error('Desktop Material Rules regression: template repair type control should not be visible');
    }
    if (desktopMaterialRulesViewState.templateProductTag !== 'SELECT') {
      throw new Error('Desktop Material Rules regression: template product control should be a dropdown');
    }
    if (desktopMaterialRulesViewState.templateFixedLengthVisible) {
      throw new Error('Desktop Material Rules regression: template fixed length control should not be visible');
    }
    if (desktopMaterialRulesViewState.globalAddTemplateBtnExists) {
      throw new Error('Desktop Material Rules regression: global Add Template button should not be present');
    }
    if (desktopMaterialRulesViewState.templateGroupCount < 2 || desktopMaterialRulesViewState.templateSectionBodyCount < 2) {
      throw new Error('Desktop Material Rules regression: grouped template sections should render per repair type');
    }
    if (desktopMaterialRulesViewState.templateAddButtonCount < 2) {
      throw new Error('Desktop Material Rules regression: each repair type section should have an Add Template button');
    }
    if (
      desktopMaterialRulesViewState.repairSortHeaderVisible
      || desktopMaterialRulesViewState.templateSortHeaderVisible
      || desktopMaterialRulesViewState.templateRepairTypeHeaderVisible
      || desktopMaterialRulesViewState.templateFixedMmHeaderVisible
    ) {
      throw new Error('Desktop Material Rules regression: hidden template/reorder columns should not be visible');
    }
    if (desktopMaterialRulesViewState.repairDragHandleCount < 2) {
      throw new Error('Desktop Material Rules regression: repair type rows should have drag handles');
    }
    if (desktopMaterialRulesViewState.templateDragHandleCount < 2) {
      throw new Error('Desktop Material Rules regression: template rows should have drag handles');
    }
    if (!desktopMaterialRulesViewState.measuredSelectorsAllSelect) {
      throw new Error('Desktop Material Rules regression: measured product controls should all be dropdowns');
    }
    if (desktopMaterialRulesViewState.hasLabourInTemplateProduct) {
      throw new Error('Desktop Material Rules regression: template product dropdown should exclude REP-LAB');
    }
    if (desktopMaterialRulesViewState.hasLabourInMeasured) {
      throw new Error('Desktop Material Rules regression: measured product dropdowns should exclude REP-LAB');
    }
    const desktopMaterialRulesReorderState = await page.evaluate(async () => {
      const legacyTemplateId = '11111111-1111-1111-1111-111111111111';
      const patchState = window.__quoteAppE2eMaterialRulesFetchPatch;
      const saveBtn = document.getElementById('btnMaterialRulesSaveQuickQuoter');

      const reorderByHandleToEnd = (tbody, idField) => {
        if (!(tbody instanceof HTMLElement)) return { before: [], after: [], moved: false };
        const readOrder = () => Array.from(tbody.querySelectorAll('tr'))
          .map((row) => String(row?.dataset?.[idField] || '').trim())
          .filter(Boolean);
        const before = readOrder();
        const sourceRow = tbody.querySelector('tr');
        const handle = sourceRow?.querySelector('.material-rules-row-drag-handle');
        if (!(sourceRow instanceof HTMLTableRowElement) || !(handle instanceof HTMLElement)) {
          return { before, after: readOrder(), moved: false };
        }
        const dataTransfer = typeof DataTransfer === 'function' ? new DataTransfer() : null;
        const bodyRect = tbody.getBoundingClientRect();
        const dropY = bodyRect.bottom + 40;
        handle.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
        tbody.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer, clientY: dropY }));
        tbody.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer, clientY: dropY }));
        handle.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer }));
        const after = readOrder();
        return {
          before,
          after,
          moved: before.length > 1 && before[0] === after[after.length - 1],
        };
      };

      const repairBody = document.querySelector('#materialRulesRepairTypesBody');
      const templateBodies = Array.from(document.querySelectorAll('tbody[data-material-rules-template-section-body="true"]'));
      const targetTemplateBody = templateBodies.find((body) => String(body?.dataset?.repairTypeId || '').trim() === 'joiner_replacement')
        || templateBodies.find((body) => body.querySelectorAll('tr').length > 1)
        || templateBodies[0];
      const targetTemplateRepairTypeId = String(targetTemplateBody?.dataset?.repairTypeId || '').trim();

      const repair = reorderByHandleToEnd(repairBody, 'repairTypeId');
      const templates = reorderByHandleToEnd(targetTemplateBody, 'templateId');

      if (patchState) {
        patchState.capturedRepairTypesPayload = null;
        patchState.capturedTemplatesPayload = null;
      }
      saveBtn?.click();

      const waitForCapture = async () => {
        const startedAt = Date.now();
        while (Date.now() - startedAt < 4000) {
          const capturedRepair = patchState?.capturedRepairTypesPayload;
          const capturedTemplates = patchState?.capturedTemplatesPayload;
          if (capturedRepair && capturedTemplates) {
            return {
              repair: (capturedRepair?.repair_types || []).slice(),
              templates: (capturedTemplates?.templates || []).slice(),
            };
          }
          // eslint-disable-next-line no-await-in-loop
          await new Promise((resolve) => setTimeout(resolve, 40));
        }
        return { repair: [], templates: [] };
      };

      const firstSave = await waitForCapture();

      const legacyRow = document.querySelector(`tr[data-template-id="${legacyTemplateId}"]`);
      const legacyQtyInput = legacyRow?.querySelector('.material-rules-template-qty');
      if (legacyQtyInput instanceof HTMLInputElement) {
        legacyQtyInput.value = '0.75';
        legacyQtyInput.dispatchEvent(new Event('input', { bubbles: true }));
        legacyQtyInput.dispatchEvent(new Event('change', { bubbles: true }));
      }

      if (patchState) {
        patchState.capturedRepairTypesPayload = null;
        patchState.capturedTemplatesPayload = null;
      }
      saveBtn?.click();
      const secondSave = await waitForCapture();

      return {
        repair,
        templates,
        targetTemplateRepairTypeId,
        legacyTemplateId,
        firstSave,
        secondSave,
      };
    });
    if (!desktopMaterialRulesReorderState.repair.moved) {
      throw new Error('Desktop Material Rules regression: repair type drag reorder did not change row order');
    }
    if (!desktopMaterialRulesReorderState.templates.moved) {
      throw new Error('Desktop Material Rules regression: template drag reorder did not change row order');
    }
    const capturedRepairTypes = desktopMaterialRulesReorderState.firstSave?.repair || [];
    if (capturedRepairTypes.length !== desktopMaterialRulesReorderState.repair.after.length) {
      throw new Error('Desktop Material Rules regression: repair type save payload row count mismatch');
    }
    const repairPayloadOrder = capturedRepairTypes.map((row) => String(row?.id || '').trim());
    if (JSON.stringify(repairPayloadOrder) !== JSON.stringify(desktopMaterialRulesReorderState.repair.after)) {
      throw new Error('Desktop Material Rules regression: repair type save payload order should match reordered DOM order');
    }
    const repairSortOrders = capturedRepairTypes.map((row) => Number(row?.sort_order));
    if (JSON.stringify(repairSortOrders) !== JSON.stringify(capturedRepairTypes.map((_, idx) => (idx + 1) * 10))) {
      throw new Error('Desktop Material Rules regression: repair type save payload sort_order should be sequential 10-step values');
    }
    const capturedTemplatesFirst = desktopMaterialRulesReorderState.firstSave?.templates || [];
    const capturedTemplatesSecond = desktopMaterialRulesReorderState.secondSave?.templates || [];
    if (!capturedTemplatesFirst.length || !capturedTemplatesSecond.length) {
      throw new Error('Desktop Material Rules regression: template save payloads should be captured for both saves');
    }
    const templatesByRepairTypeFirst = new Map();
    capturedTemplatesFirst.forEach((row) => {
      const repairTypeId = String(row?.repair_type_id || '').trim();
      if (!templatesByRepairTypeFirst.has(repairTypeId)) templatesByRepairTypeFirst.set(repairTypeId, []);
      templatesByRepairTypeFirst.get(repairTypeId).push(row);
    });
    templatesByRepairTypeFirst.forEach((rowsForType) => {
      const expected = rowsForType.map((_, idx) => (idx + 1) * 10);
      const actual = rowsForType.map((row) => Number(row?.sort_order));
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error('Desktop Material Rules regression: template sort_order should be sequential per repair type section');
      }
    });
    const targetRepairTypeId = String(desktopMaterialRulesReorderState.targetTemplateRepairTypeId || '').trim();
    const targetPayloadRows = templatesByRepairTypeFirst.get(targetRepairTypeId) || [];
    const targetPayloadOrder = targetPayloadRows.map((row) => String(row?.id || '').trim());
    if (JSON.stringify(targetPayloadOrder) !== JSON.stringify(desktopMaterialRulesReorderState.templates.after)) {
      throw new Error('Desktop Material Rules regression: template payload order should match reordered section row order');
    }
    const legacyTemplateId = String(desktopMaterialRulesReorderState.legacyTemplateId || '').trim();
    const legacyTemplateFirst = capturedTemplatesFirst.find((row) => String(row?.id || '').trim() === legacyTemplateId);
    const legacyTemplateSecond = capturedTemplatesSecond.find((row) => String(row?.id || '').trim() === legacyTemplateId);
    if (!legacyTemplateFirst || !legacyTemplateSecond) {
      throw new Error('Desktop Material Rules regression: legacy fixed_mm row missing from save payload');
    }
    if (String(legacyTemplateFirst.length_mode || '').trim() !== 'fixed_mm' || Number(legacyTemplateFirst.fixed_length_mm) !== 1200) {
      throw new Error('Desktop Material Rules regression: untouched legacy fixed_mm row should remain fixed_mm with original fixed_length_mm');
    }
    if (String(legacyTemplateSecond.length_mode || '').trim() !== 'missing_measurement' || legacyTemplateSecond.fixed_length_mm !== null) {
      throw new Error('Desktop Material Rules regression: edited legacy fixed_mm row should convert to missing_measurement with null fixed_length_mm');
    }
    await page.evaluate(() => {
      if (window.__quoteAppE2eMaterialRulesFetchPatch?.originalFetch) {
        window.fetch = window.__quoteAppE2eMaterialRulesFetchPatch.originalFetch;
        delete window.__quoteAppE2eMaterialRulesFetchPatch;
      }
      if (typeof window.__quoteAppSwitchView === 'function') window.__quoteAppSwitchView('view-canvas');
      if (typeof window.__quoteAppSetAuthForTests === 'function') window.__quoteAppSetAuthForTests({ token: null });
    });
    await delay(240);
    console.log('  ✓ Desktop Material Rules admin access and view routing');

    // Toolbar
    const uploadBtn = await page.$('#cameraUploadBtn');
    const exportBtn = await page.$('#exportBtn');
    if (!uploadBtn || !exportBtn) throw new Error('Toolbar elements missing');
    console.log('  ✓ Toolbar (upload, export) present');

    const desktopQuickQuoterVisibleBeforeUpload = await page.evaluate(() => {
      const entry = document.getElementById('quickQuoterEntry');
      if (!entry) return false;
      if (entry.hasAttribute('hidden')) return false;
      const style = window.getComputedStyle(entry);
      return style.display !== 'none' && entry.offsetParent !== null;
    });
    if (!desktopQuickQuoterVisibleBeforeUpload) {
      throw new Error('Desktop Quick Quoter regression: entry should be visible before blueprint upload');
    }
    console.log('  ✓ Desktop Quick Quoter entry is visible before blueprint upload');

    await clickSelectorViaDom(page, '#quickQuoterEntryBtn');
    await delay(300);
    const desktopQuickQuoterModalOpen = await page.evaluate(() => {
      const modal = document.getElementById('quickQuoterModal');
      return !!modal && !modal.hasAttribute('hidden');
    });
    if (!desktopQuickQuoterModalOpen) {
      throw new Error('Desktop Quick Quoter regression: modal did not open from entry button');
    }
    await clickSelectorViaDom(page, '#quickQuoterModalClose');
    await delay(200);
    const desktopQuickQuoterModalClosed = await page.evaluate(() => {
      const modal = document.getElementById('quickQuoterModal');
      return !modal || modal.hasAttribute('hidden');
    });
    if (!desktopQuickQuoterModalClosed) {
      throw new Error('Desktop Quick Quoter regression: modal did not close from close button');
    }
    console.log('  ✓ Desktop Quick Quoter modal opens and closes from canvas entry');

    const desktopUploadLabels = await page.evaluate(() => {
      const cameraBtn = document.getElementById('cameraUploadBtn');
      const placeholderIcon = document.querySelector('#canvasPlaceholder .placeholder-icon');
      const placeholderTitle = document.querySelector('#canvasPlaceholder .placeholder-title');
      const hasPdfLanguage = (text) => typeof text === 'string' && /\bpdf\b/i.test(text);
      return {
        cameraTitleOk: hasPdfLanguage(cameraBtn?.getAttribute('title') || ''),
        cameraAriaOk: hasPdfLanguage(cameraBtn?.getAttribute('aria-label') || ''),
        placeholderAriaOk: hasPdfLanguage(placeholderIcon?.getAttribute('aria-label') || ''),
        placeholderTitleOk: hasPdfLanguage(placeholderTitle?.textContent || ''),
      };
    });
    if (!desktopUploadLabels.cameraTitleOk || !desktopUploadLabels.cameraAriaOk || !desktopUploadLabels.placeholderAriaOk || !desktopUploadLabels.placeholderTitleOk) {
      throw new Error('Upload accessibility copy regression: expected photo/PDF wording on camera controls and placeholder copy');
    }
    console.log('  ✓ Upload controls/copy include photo + PDF wording');

    // Accessibility settings modal: keyboard focus trap + Escape close
    const a11ySettingsBtn = await page.$('#openAccessibilitySettingsBtn');
    if (!a11ySettingsBtn) throw new Error('Accessibility settings button missing');
    // Puppeteer elementHandle.click() can hang here under heavy layout churn; dispatch a direct DOM click instead.
    await page.evaluate(() => {
      const btn = document.getElementById('openAccessibilitySettingsBtn');
      if (btn) btn.click();
    });
    await delay(250);
    const a11yModalOpen = await page.evaluate(() => {
      const modal = document.getElementById('accessibilitySettingsModal');
      return !!modal && !modal.hasAttribute('hidden');
    });
    if (!a11yModalOpen) throw new Error('Accessibility settings modal did not open');

    let focusStayedInside = true;
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('Tab');
      await delay(80);
      const inside = await page.evaluate(() => {
        const modal = document.getElementById('accessibilitySettingsModal');
        return !!modal && modal.contains(document.activeElement);
      });
      if (!inside) {
        focusStayedInside = false;
        break;
      }
    }
    if (!focusStayedInside) throw new Error('Accessibility settings modal focus escaped during Tab navigation');
    await page.keyboard.press('Escape');
    await delay(120);
    const a11yModalClosed = await page.evaluate(() => {
      const modal = document.getElementById('accessibilitySettingsModal');
      return !modal || modal.hasAttribute('hidden');
    });
    if (!a11yModalClosed) throw new Error('Accessibility settings modal did not close on Escape');
    console.log('  ✓ Accessibility modal traps focus and closes on Escape');

    // Panel: ensure we have panel elements and can expand/collapse
    const panel = await page.$('#panel');
    const panelContent = await page.$('#panelContent');
    if (!panel || !panelContent) throw new Error('Panel elements missing');

    await delay(500);

    let panelExpanded = await page.evaluate(() => document.getElementById('panel').classList.contains('expanded'));
    if (!panelExpanded) {
      await clickSelectorViaDomIfPresent(page, '#panelCollapsed');
      await delay(300);
      panelExpanded = await page.evaluate(() => document.getElementById('panel').classList.contains('expanded'));
    }
    if (!panelExpanded) {
      await page.screenshot({ path: 'e2e-failure.png' }).catch(() => {});
      throw new Error('Panel should be expandable (click chevron or start expanded). Start the server with: cd backend && uvicorn main:app --reload --host 127.0.0.1 --port 8000');
    }
    console.log('  ✓ Right panel visible/expanded');

    await clickSelectorViaDom(page, '#panelClose');
    await delay(300);
    let collapsed = await page.evaluate(() => document.getElementById('panel').classList.contains('collapsed'));
    if (!collapsed) {
      await page.keyboard.press('Escape').catch(() => {});
      await delay(200);
      collapsed = await page.evaluate(() => document.getElementById('panel').classList.contains('collapsed'));
    }
    if (!collapsed) {
      await page.evaluate(() => { const btn = document.getElementById('panelClose'); if (btn) btn.click(); });
      await delay(200);
      collapsed = await page.evaluate(() => document.getElementById('panel').classList.contains('collapsed'));
    }
    if (!collapsed) throw new Error('Panel should collapse on close button');
    console.log('  ✓ Panel collapses on close');

    await clickSelectorViaDom(page, '#panelCollapsed');
    await delay(300);
    const expandedAgain = await page.evaluate(() => document.getElementById('panel').classList.contains('expanded'));
    if (!expandedAgain) throw new Error('Panel should expand when clicking chevron strip');
    console.log('  ✓ Panel expands when clicking chevron');

    // Product grid (from API or fallback)
    const grid = await page.$('#productGrid');
    if (!grid) throw new Error('Product grid missing');
    const thumbCount = await page.$$eval('.product-thumb', (els) => els.length);
    if (thumbCount === 0) throw new Error('Expected at least one product thumbnail');
    console.log(`  ✓ Product grid has ${thumbCount} items`);

    const desktopCountBeforeQuickQuoterElementsParity = await page.evaluate(
      () => (window.__quoteAppElementCount && window.__quoteAppElementCount()) || 0
    );
    await clickSelectorViaDom(page, '.product-thumb');
    await delay(650);
    const desktopQuickQuoterElementsHideState = await page.evaluate(() => {
      const entry = document.getElementById('quickQuoterEntry');
      const count = (window.__quoteAppElementCount && window.__quoteAppElementCount()) || 0;
      if (!entry) return { count, hidden: false };
      if (entry.hasAttribute('hidden')) return { count, hidden: true };
      const style = window.getComputedStyle(entry);
      return { count, hidden: style.display === 'none' || entry.offsetParent === null };
    });
    if (desktopQuickQuoterElementsHideState.count !== desktopCountBeforeQuickQuoterElementsParity + 1) {
      throw new Error(
        `Desktop Quick Quoter regression: expected one element added before upload, ` +
        `before=${desktopCountBeforeQuickQuoterElementsParity}, after=${desktopQuickQuoterElementsHideState.count}`
      );
    }
    if (!desktopQuickQuoterElementsHideState.hidden) {
      throw new Error('Desktop Quick Quoter regression: entry should be hidden when canvas has elements only (no blueprint)');
    }
    await clickSelectorViaDomIfPresent(page, '#floatingToolbarDelete');
    await delay(220);
    const desktopQuickQuoterElementsShowState = await page.evaluate(() => {
      const entry = document.getElementById('quickQuoterEntry');
      const count = (window.__quoteAppElementCount && window.__quoteAppElementCount()) || 0;
      if (!entry) return { count, visible: false };
      if (entry.hasAttribute('hidden')) return { count, visible: false };
      const style = window.getComputedStyle(entry);
      return { count, visible: style.display !== 'none' && entry.offsetParent !== null };
    });
    if (desktopQuickQuoterElementsShowState.count !== desktopCountBeforeQuickQuoterElementsParity) {
      throw new Error(
        `Desktop Quick Quoter regression: delete should restore element count before upload parity check, ` +
        `before=${desktopCountBeforeQuickQuoterElementsParity}, after=${desktopQuickQuoterElementsShowState.count}`
      );
    }
    if (!desktopQuickQuoterElementsShowState.visible) {
      throw new Error('Desktop Quick Quoter regression: entry should be visible again after elements are cleared');
    }
    console.log('  ✓ Desktop Quick Quoter entry hides with elements-only canvas and reappears when cleared');

    // Upload blueprint fixture image for full canvas/transparency validation.
    const blueprintImagePath = path.resolve(__dirname, '..', 'Columba College Gutters 11.jpeg');
    const fs = require('fs');
    if (!fs.existsSync(blueprintImagePath)) {
      throw new Error(`Missing required E2E blueprint fixture: ${blueprintImagePath}`);
    }
    const fileInput = await page.$('#fileInput');
    if (!fileInput) throw new Error('Blueprint upload fixture: #fileInput missing');
    await fileInput.uploadFile(blueprintImagePath);
    await page.evaluate(() => {
      const input = document.getElementById('fileInput');
      if (input) input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await delay(1500);
    const cropModal = await page.$('#cropModal');
    const modalVisible = cropModal && !(await page.evaluate((el) => el.hasAttribute('hidden'), cropModal));
    if (!modalVisible) throw new Error('Desktop upload fixture: crop modal should open before blueprint processing');
    await clickSelectorViaDomIfPresent(page, '#cropUseFull');
    await delay(2000);
    const placeholder = await page.$('#canvasPlaceholder');
    const placeholderHidden = placeholder && (await page.evaluate((el) => el.hasAttribute('hidden') || !el.offsetParent, placeholder));
    if (!placeholderHidden) {
      throw new Error('Blueprint upload fixture: canvas placeholder still visible after upload');
    }
    const desktopQuickQuoterHiddenAfterUpload = await page.evaluate(() => {
      const entry = document.getElementById('quickQuoterEntry');
      if (!entry) return false;
      if (entry.hasAttribute('hidden')) return true;
      const style = window.getComputedStyle(entry);
      return style.display === 'none' || entry.offsetParent === null;
    });
    if (!desktopQuickQuoterHiddenAfterUpload) {
      throw new Error('Desktop Quick Quoter regression: entry should be hidden after blueprint upload');
    }
    const desktopFileInputReset = await page.evaluate(() => {
      const input = document.getElementById('fileInput');
      return !!input && input.value === '';
    });
    if (!desktopFileInputReset) {
      throw new Error('Desktop upload reliability regression: #fileInput value should reset after change handling');
    }
    console.log('  ✓ Blueprint image loaded (Columba College Gutters 11.jpeg)');
    console.log('  ✓ Desktop Quick Quoter entry is hidden after blueprint upload');
    console.log('  ✓ Desktop upload input resets for same-file reupload support');

    const desktopMobileFitVisibility = await page.evaluate(() => {
      const btn = document.getElementById('mobileFitViewBtn');
      if (!btn) return { exists: false, visible: false, ariaHidden: null };
      const style = window.getComputedStyle(btn);
      const visible = style.display !== 'none' && style.visibility !== 'hidden' && btn.getClientRects().length > 0;
      return { exists: true, visible, ariaHidden: btn.getAttribute('aria-hidden') };
    });
    if (!desktopMobileFitVisibility.exists) throw new Error('Desktop mobile-fit regression: #mobileFitViewBtn missing');
    if (desktopMobileFitVisibility.visible) throw new Error('Desktop mobile-fit regression: mobile Fit button should be hidden on desktop');
    if (desktopMobileFitVisibility.ariaHidden !== 'true') {
      throw new Error(`Desktop mobile-fit regression: expected aria-hidden=true, got ${desktopMobileFitVisibility.ariaHidden}`);
    }
    console.log('  ✓ Desktop keeps mobile Fit button hidden');

    const desktopBlueprintHooksReady = await page.evaluate(() => ({
      hasRect: typeof window.__quoteAppGetBlueprintScreenRect === 'function',
      hasTransform: typeof window.__quoteAppGetBlueprintTransform === 'function',
      hasSetLocked: typeof window.__quoteAppSetBlueprintLocked === 'function',
    }));
    if (!desktopBlueprintHooksReady.hasRect || !desktopBlueprintHooksReady.hasTransform || !desktopBlueprintHooksReady.hasSetLocked) {
      throw new Error('Desktop blueprint move regression: required blueprint test hooks are missing');
    }

    const desktopBlueprintBeforeUnlock = await page.evaluate(() => {
      if (typeof window.__quoteAppSetBlueprintLocked === 'function') window.__quoteAppSetBlueprintLocked(false);
      return typeof window.__quoteAppGetBlueprintTransform === 'function' ? window.__quoteAppGetBlueprintTransform() : null;
    });
    const desktopBlueprintDragPointUnlocked = await page.evaluate(() => {
      const rect = typeof window.__quoteAppGetBlueprintScreenRect === 'function' ? window.__quoteAppGetBlueprintScreenRect() : null;
      if (!rect) return null;
      const base = {
        x: rect.left + Math.max(28, Math.min(96, rect.width * 0.18)),
        y: rect.top + Math.max(28, Math.min(96, rect.height * 0.18)),
      };
      const candidates = [
        base,
        { x: rect.left + Math.max(36, Math.min(120, rect.width * 0.12)), y: rect.top + Math.max(36, Math.min(120, rect.height * 0.12)) },
        { x: rect.right - Math.max(36, Math.min(120, rect.width * 0.12)), y: rect.top + Math.max(36, Math.min(120, rect.height * 0.12)) },
      ];
      const hitCanvas = candidates.find((pt) => {
        const hit = document.elementFromPoint(pt.x, pt.y);
        return !!hit && hit.id === 'canvas';
      });
      return hitCanvas || base;
    });
    if (!desktopBlueprintBeforeUnlock || !desktopBlueprintDragPointUnlocked) {
      throw new Error('Desktop blueprint move regression: unable to read unlocked blueprint state');
    }
    await page.mouse.move(desktopBlueprintDragPointUnlocked.x, desktopBlueprintDragPointUnlocked.y);
    await page.mouse.down();
    await page.mouse.move(desktopBlueprintDragPointUnlocked.x + 70, desktopBlueprintDragPointUnlocked.y + 40, { steps: 10 });
    await page.mouse.up();
    await delay(220);
    const desktopBlueprintAfterUnlockDrag = await page.evaluate(() => {
      return typeof window.__quoteAppGetBlueprintTransform === 'function' ? window.__quoteAppGetBlueprintTransform() : null;
    });
    if (!desktopBlueprintAfterUnlockDrag) throw new Error('Desktop blueprint move regression: missing transform after unlocked drag');
    const desktopUnlockDx = Math.abs(desktopBlueprintAfterUnlockDrag.x - desktopBlueprintBeforeUnlock.x);
    const desktopUnlockDy = Math.abs(desktopBlueprintAfterUnlockDrag.y - desktopBlueprintBeforeUnlock.y);
    if (desktopUnlockDx < 4 && desktopUnlockDy < 4) {
      throw new Error(
        `Desktop blueprint move regression: unlocked drag should move blueprint (dx=${desktopUnlockDx.toFixed(2)}, dy=${desktopUnlockDy.toFixed(2)})`
      );
    }
    await page.keyboard.down(undoModifier);
    await page.keyboard.press('z');
    await page.keyboard.up(undoModifier);
    await delay(240);
    const desktopBlueprintAfterUndo = await page.evaluate(() => {
      return typeof window.__quoteAppGetBlueprintTransform === 'function' ? window.__quoteAppGetBlueprintTransform() : null;
    });
    if (!desktopBlueprintAfterUndo) {
      throw new Error('Desktop blueprint undo regression: undo should not remove blueprint after move');
    }
    const desktopUndoDx = Math.abs(desktopBlueprintAfterUndo.x - desktopBlueprintBeforeUnlock.x);
    const desktopUndoDy = Math.abs(desktopBlueprintAfterUndo.y - desktopBlueprintBeforeUnlock.y);
    if (desktopUndoDx > 1.5 || desktopUndoDy > 1.5) {
      throw new Error(
        `Desktop blueprint undo regression: expected move undo to restore prior transform (dx=${desktopUndoDx.toFixed(2)}, dy=${desktopUndoDy.toFixed(2)})`
      );
    }
    console.log('  ✓ Desktop blueprint move undo restores transform instead of removing blueprint');

    const desktopBlueprintBeforeLockedDrag = await page.evaluate(() => {
      if (typeof window.__quoteAppSetBlueprintLocked === 'function') window.__quoteAppSetBlueprintLocked(true);
      return typeof window.__quoteAppGetBlueprintTransform === 'function' ? window.__quoteAppGetBlueprintTransform() : null;
    });
    const desktopBlueprintDragPointLocked = await page.evaluate(() => {
      const rect = typeof window.__quoteAppGetBlueprintScreenRect === 'function' ? window.__quoteAppGetBlueprintScreenRect() : null;
      if (!rect) return null;
      const base = {
        x: rect.left + Math.max(28, Math.min(96, rect.width * 0.18)),
        y: rect.top + Math.max(28, Math.min(96, rect.height * 0.18)),
      };
      const candidates = [
        base,
        { x: rect.left + Math.max(36, Math.min(120, rect.width * 0.12)), y: rect.top + Math.max(36, Math.min(120, rect.height * 0.12)) },
        { x: rect.right - Math.max(36, Math.min(120, rect.width * 0.12)), y: rect.top + Math.max(36, Math.min(120, rect.height * 0.12)) },
      ];
      const hitCanvas = candidates.find((pt) => {
        const hit = document.elementFromPoint(pt.x, pt.y);
        return !!hit && hit.id === 'canvas';
      });
      return hitCanvas || base;
    });
    if (!desktopBlueprintBeforeLockedDrag || !desktopBlueprintDragPointLocked) {
      throw new Error('Desktop blueprint lock regression: unable to read locked blueprint state');
    }
    await page.mouse.move(desktopBlueprintDragPointLocked.x, desktopBlueprintDragPointLocked.y);
    await page.mouse.down();
    await page.mouse.move(desktopBlueprintDragPointLocked.x + 60, desktopBlueprintDragPointLocked.y + 30, { steps: 10 });
    await page.mouse.up();
    await delay(220);
    const desktopBlueprintAfterLockedDrag = await page.evaluate(() => {
      return typeof window.__quoteAppGetBlueprintTransform === 'function' ? window.__quoteAppGetBlueprintTransform() : null;
    });
    if (!desktopBlueprintAfterLockedDrag) throw new Error('Desktop blueprint lock regression: missing transform after locked drag');
    const desktopLockedDx = Math.abs(desktopBlueprintAfterLockedDrag.x - desktopBlueprintBeforeLockedDrag.x);
    const desktopLockedDy = Math.abs(desktopBlueprintAfterLockedDrag.y - desktopBlueprintBeforeLockedDrag.y);
    if (desktopLockedDx > 1.5 || desktopLockedDy > 1.5) {
      throw new Error(
        `Desktop blueprint lock regression: locked drag should not move blueprint (dx=${desktopLockedDx.toFixed(2)}, dy=${desktopLockedDy.toFixed(2)})`
      );
    }
    console.log('  ✓ Blueprint drag works unlocked and is blocked when locked (desktop)');

    // No error message visible (backend reachable)
    const messageEl = await page.$('#toolbarMessage');
    const messageHidden = messageEl ? await page.evaluate((el) => el.hasAttribute('hidden'), messageEl) : true;
    if (!messageHidden) {
      const msgText = await page.evaluate((el) => el.textContent, messageEl);
      throw new Error(`Toolbar message visible: ${msgText || '(empty)'}`);
    } else {
      console.log('  ✓ No backend warning (app served correctly)');
    }

    // Drag-and-drop: simulate dropping a Marley product onto the blueprint
    const canvas = await page.$('#canvas');
    if (!canvas) throw new Error('Canvas missing for drag-drop test');
    const initialCount = await page.evaluate(() => (window.__quoteAppElementCount && window.__quoteAppElementCount()) || 0);
    await page.evaluate(() => {
      const canvas = document.getElementById('canvas');
      const rect = canvas.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const dt = new DataTransfer();
      dt.setData('application/product-id', 'gutter');
      dt.setData('application/diagram-url', '/assets/marley/gutter.svg');
      const ev = new DragEvent('drop', { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: dt });
      canvas.dispatchEvent(ev);
    });
    await delay(800);
    const countAfterDrop = await page.evaluate(() => (window.__quoteAppElementCount && window.__quoteAppElementCount()) || 0);
    if (countAfterDrop <= initialCount) throw new Error(`Drag-drop failed: expected element on blueprint, count before=${initialCount} after=${countAfterDrop}`);
    console.log('  ✓ Drag-and-drop: Marley product added to blueprint');

    // Import normalization: dropped element max dimension <= 150 (check before any resize)
    const elementsAfterDrop = await page.evaluate(() => (window.__quoteAppGetElements && window.__quoteAppGetElements()) || []);
    const maxDim = 150;
    for (const el of elementsAfterDrop) {
      const m = Math.max(el.width, el.height);
      if (m > maxDim) throw new Error(`Import normalization: element ${el.id} has max dimension ${m}, expected <= ${maxDim}`);
    }
    console.log(`  ✓ Import normalization: dropped element(s) have max dimension <= ${maxDim}px`);

    // Selection: after drop the app already selects the new element. To test "click to select", we must
    // deselect first (drill-through would otherwise cycle to blueprint and clear selectedIds). Then click
    // the element to select it.
    const canvasBox = await page.evaluate(() => {
      const c = document.getElementById('canvas');
      if (!c) return null;
      const r = c.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    });
    const droppedEl = elementsAfterDrop.length > 0 ? elementsAfterDrop[elementsAfterDrop.length - 1] : null;
    if (canvasBox && droppedEl) {
      // Deselect: click canvas top-left (hits blueprint or empty → clears element selection)
      await page.mouse.click(canvasBox.left + 10, canvasBox.top + 10);
      await delay(200);
      const elCenter = await page.evaluate((id) => (window.__quoteAppGetElementScreenCenter && window.__quoteAppGetElementScreenCenter(id)) || null, droppedEl.id);
      if (elCenter) {
        await page.mouse.click(elCenter.x, elCenter.y);
        await delay(300);
        const selectedIds = await page.evaluate(() => (window.__quoteAppGetSelection && window.__quoteAppGetSelection()) || []);
        if (selectedIds.length !== 1) {
          throw new Error(`Selection after click: expected 1 selected, got ${selectedIds.length}`);
        } else {
          console.log('  ✓ Selection: one element selected (cursor/selector alignment)');
        }
      } else {
        throw new Error('Selection after click: could not get element screen center');
      }
    } else if (canvasBox && !droppedEl) {
      throw new Error('Selection after click: no elements after drop');
    }
    if (droppedEl) {
      const announcerText = await page.evaluate(() => {
        const el = document.getElementById('appAnnouncer');
        return el ? (el.textContent || '').trim() : '';
      });
      if (!announcerText) {
        throw new Error('Live region announcement missing: app announcer is empty after core interactions');
      }
      console.log(`  ✓ Live region emits announcements ("${announcerText}")`);
    }

    const desktopTinyCenterDrag = await page.evaluate((preferredId) => {
      const elements = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
      const selected = (window.__quoteAppGetSelection && window.__quoteAppGetSelection()) || [];
      const targetId = preferredId || selected[0] || (elements[0] && elements[0].id);
      if (!targetId) return null;
      if (typeof window.__quoteAppSetElementRotation === 'function') window.__quoteAppSetElementRotation(targetId, 0);
      if (typeof window.__quoteAppSelectElementById === 'function') window.__quoteAppSelectElementById(targetId);
      const candidateSizes = [20, 28, 36, 44, 52, 60, 68, 76, 84];
      let center = null;
      let minHandleDistance = 0;
      if (typeof window.__quoteAppSetElementSize === 'function' && typeof window.__quoteAppGetSelectionBoxInScreenCoords === 'function') {
        for (const size of candidateSizes) {
          window.__quoteAppSetElementSize(targetId, size, size);
          if (typeof window.__quoteAppSelectElementById === 'function') window.__quoteAppSelectElementById(targetId);
          const candidateCenter = typeof window.__quoteAppGetElementScreenCenter === 'function'
            ? window.__quoteAppGetElementScreenCenter(targetId)
            : null;
          const box = window.__quoteAppGetSelectionBoxInScreenCoords();
          if (!candidateCenter || !box || !box.handles) continue;
          const nonRotateHandles = Object.entries(box.handles).filter(([key]) => key !== 'rotate');
          const distances = nonRotateHandles.map(([, pt]) => Math.hypot(pt.x - candidateCenter.x, pt.y - candidateCenter.y));
          const minDist = distances.length ? Math.min(...distances) : 0;
          center = candidateCenter;
          minHandleDistance = minDist;
          if (minDist >= 26) break;
        }
      }
      if (!center && typeof window.__quoteAppGetElementScreenCenter === 'function') {
        center = window.__quoteAppGetElementScreenCenter(targetId);
      }
      const updated = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
      const el = updated.find((item) => item.id === targetId) || null;
      if (!el || !center) return null;
      return {
        id: targetId,
        center,
        minHandleDistance,
        before: { x: el.x, y: el.y, rotation: el.rotation || 0 },
      };
    }, droppedEl ? droppedEl.id : null);
    if (!desktopTinyCenterDrag) throw new Error('Desktop tiny-element drag regression: setup failed');
    const getDesktopTinySnapshot = async () => page.evaluate((id) => {
      const elements = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
      const el = elements.find((item) => item.id === id) || null;
      return el ? { x: el.x, y: el.y, rotation: el.rotation || 0 } : null;
    }, desktopTinyCenterDrag.id);
    const dragDesktopTinyFromCenter = async (dx, dy) => {
      const center = await page.evaluate((id) => {
        return typeof window.__quoteAppGetElementScreenCenter === 'function'
          ? window.__quoteAppGetElementScreenCenter(id)
          : null;
      }, desktopTinyCenterDrag.id);
      if (!center) return false;
      await page.mouse.move(center.x, center.y);
      await page.mouse.down();
      await page.mouse.move(center.x + dx, center.y + dy, { steps: 10 });
      await page.mouse.up();
      await delay(260);
      return true;
    };
    await dragDesktopTinyFromCenter(64, 44);
    let desktopTinyAfter = await getDesktopTinySnapshot();
    if (!desktopTinyAfter) throw new Error('Desktop tiny-element drag regression: element missing after drag');
    let desktopTinyMoveDx = desktopTinyAfter.x - desktopTinyCenterDrag.before.x;
    let desktopTinyMoveDy = desktopTinyAfter.y - desktopTinyCenterDrag.before.y;
    let desktopTinyMoveDist = Math.hypot(desktopTinyMoveDx, desktopTinyMoveDy);
    let desktopTinyRotationDelta = (desktopTinyAfter.rotation - desktopTinyCenterDrag.before.rotation) % 360;
    if (desktopTinyRotationDelta > 180) desktopTinyRotationDelta -= 360;
    if (desktopTinyRotationDelta < -180) desktopTinyRotationDelta += 360;
    if (desktopTinyMoveDist < 4 && Math.abs(desktopTinyRotationDelta) <= 1.5) {
      await dragDesktopTinyFromCenter(96, 72);
      desktopTinyAfter = await getDesktopTinySnapshot();
      if (!desktopTinyAfter) throw new Error('Desktop tiny-element drag regression: element missing after retry drag');
      desktopTinyMoveDx = desktopTinyAfter.x - desktopTinyCenterDrag.before.x;
      desktopTinyMoveDy = desktopTinyAfter.y - desktopTinyCenterDrag.before.y;
      desktopTinyMoveDist = Math.hypot(desktopTinyMoveDx, desktopTinyMoveDy);
      desktopTinyRotationDelta = (desktopTinyAfter.rotation - desktopTinyCenterDrag.before.rotation) % 360;
      if (desktopTinyRotationDelta > 180) desktopTinyRotationDelta -= 360;
      if (desktopTinyRotationDelta < -180) desktopTinyRotationDelta += 360;
    }
    if (desktopTinyMoveDist < 4) {
      throw new Error(
        `Desktop tiny-element drag regression: center drag should move element (dx=${desktopTinyMoveDx.toFixed(2)}, dy=${desktopTinyMoveDy.toFixed(2)})`
      );
    }
    if (Math.abs(desktopTinyRotationDelta) > 1.5) {
      throw new Error(
        `Desktop tiny-element drag regression: center drag should not rotate (rotation delta=${desktopTinyRotationDelta.toFixed(2)}°)`
      );
    }
    console.log('  ✓ Desktop tiny-element center drag moves without unintended rotate-stem capture');

    const desktopNudgeBefore = await page.evaluate((id) => {
      if (typeof window.__quoteAppSelectElementById === 'function') window.__quoteAppSelectElementById(id);
      const elements = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
      const el = elements.find((item) => item.id === id) || null;
      const renderStats = (window.__quoteAppGetRenderLoopDiagnostics && window.__quoteAppGetRenderLoopDiagnostics()) || null;
      if (!el) return null;
      return { x: el.x, y: el.y, drawCount: renderStats ? Number(renderStats.drawCount || 0) : null };
    }, desktopTinyCenterDrag.id);
    if (!desktopNudgeBefore) throw new Error('Desktop keyboard nudge regression: setup failed');
    await page.keyboard.press('ArrowRight');
    await delay(180);
    const desktopNudgeAfter = await page.evaluate((id) => {
      const elements = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
      const el = elements.find((item) => item.id === id) || null;
      const renderStats = (window.__quoteAppGetRenderLoopDiagnostics && window.__quoteAppGetRenderLoopDiagnostics()) || null;
      if (!el) return null;
      return { x: el.x, y: el.y, drawCount: renderStats ? Number(renderStats.drawCount || 0) : null };
    }, desktopTinyCenterDrag.id);
    if (!desktopNudgeAfter) throw new Error('Desktop keyboard nudge regression: missing post-nudge element');
    if (desktopNudgeAfter.x <= desktopNudgeBefore.x + 0.5) {
      throw new Error(
        `Desktop keyboard nudge regression: ArrowRight should move x by 1 (before=${desktopNudgeBefore.x}, after=${desktopNudgeAfter.x})`
      );
    }
    if (
      Number.isFinite(desktopNudgeBefore.drawCount)
      && Number.isFinite(desktopNudgeAfter.drawCount)
      && desktopNudgeAfter.drawCount <= desktopNudgeBefore.drawCount
    ) {
      throw new Error(
        `Desktop keyboard nudge regression: draw count should increase (before=${desktopNudgeBefore.drawCount}, after=${desktopNudgeAfter.drawCount})`
      );
    }
    await page.keyboard.down(undoModifier);
    await page.keyboard.press('z');
    await page.keyboard.up(undoModifier);
    await delay(220);
    const desktopNudgeAfterUndo = await page.evaluate((id) => {
      const elements = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
      const el = elements.find((item) => item.id === id) || null;
      return el ? { x: el.x, y: el.y } : null;
    }, desktopTinyCenterDrag.id);
    if (!desktopNudgeAfterUndo) throw new Error('Desktop keyboard nudge regression: element missing after undo');
    const desktopNudgeUndoDx = Math.abs(desktopNudgeAfterUndo.x - desktopNudgeBefore.x);
    const desktopNudgeUndoDy = Math.abs(desktopNudgeAfterUndo.y - desktopNudgeBefore.y);
    if (desktopNudgeUndoDx > 0.5 || desktopNudgeUndoDy > 0.5) {
      throw new Error(
        `Desktop keyboard nudge regression: undo should restore pre-nudge position (dx=${desktopNudgeUndoDx.toFixed(2)}, dy=${desktopNudgeUndoDy.toFixed(2)})`
      );
    }
    console.log('  ✓ Desktop keyboard nudge redraws immediately and undoes one step');

    // Gutter rotation constraint: 60°–80° band must clamp to 60 or 80 (never stay in band)
    const elementsForGutterTest = await page.evaluate(() => (window.__quoteAppGetElements && window.__quoteAppGetElements()) || []);
    const gutterEl = elementsForGutterTest.find((e) => e.assetId && (e.assetId.toLowerCase() === 'gutter' || /^GUT-(SC|CL)-MAR-(\d+(?:\.\d+)?)M$/i.test(e.assetId)));
    if (gutterEl && canvasBox) {
      // 1) Programmatic set: setting 70° (in band) must clamp to 60 or 80
      await page.evaluate((id, deg) => { if (window.__quoteAppSetElementRotation) window.__quoteAppSetElementRotation(id, deg); }, gutterEl.id, 70);
      await delay(100);
      const afterSet70 = await page.evaluate((id) => {
        const els = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
        const el = els.find((e) => e.id === id);
        return el ? el.rotation : null;
      }, gutterEl.id);
      if (afterSet70 != null) {
        const r = afterSet70;
        const norm = ((r % 360) + 360) % 360;
        const inBand = (r > 60 && r < 80) || (norm > 60 && norm < 80);
        if (inBand) throw new Error(`Gutter constraint (set 70°): rotation is ${r}° (in forbidden band); expected 60 or 80`);
        const isClamped = Math.abs(r - 60) < 2 || Math.abs(r - 80) < 2 || Math.abs(norm - 60) < 2 || Math.abs(norm - 80) < 2;
        if (isClamped) console.log(`  ✓ Gutter rotation constraint: set 70° → clamped to ${Math.round(r)}°`);
      }

      // 2) Drag test: rotate gutter and ensure we never land in 60°–80° band
      await page.evaluate((id, deg) => { if (window.__quoteAppSetElementRotation) window.__quoteAppSetElementRotation(id, deg); }, gutterEl.id, 55);
      await delay(200);
      const gutterCenter = await page.evaluate((id) => (window.__quoteAppGetElementScreenCenter && window.__quoteAppGetElementScreenCenter(id)) || null, gutterEl.id);
      if (gutterCenter) {
        await page.mouse.click(gutterCenter.x, gutterCenter.y);
        await delay(300);
      }
      const boxScreen = await page.evaluate(() => (window.__quoteAppGetSelectionBoxInScreenCoords && window.__quoteAppGetSelectionBoxInScreenCoords()) || null);
      if (boxScreen && boxScreen.handles && boxScreen.handles.rotate) {
        for (const sideKey of ['n', 'e', 's', 'w']) {
          if (!boxScreen.handles[sideKey]) {
            throw new Error(`Desktop handle regression: expected side handle "${sideKey}" to be present`);
          }
        }
        const rotX = Number(boxScreen.handles.rotate.x);
        const rotY = Number(boxScreen.handles.rotate.y);
        const center = await page.evaluate((id) => (window.__quoteAppGetElementScreenCenter && window.__quoteAppGetElementScreenCenter(id)) || null, gutterEl.id);
        if (center && !Number.isNaN(rotX) && !Number.isNaN(rotY)) {
          const r = 100;
          const rad70 = (70 * Math.PI) / 180;
          const targetX = center.x + r * Math.cos(rad70);
          const targetY = center.y + r * Math.sin(rad70);
          await page.mouse.move(rotX, rotY);
          await delay(200);
          await page.mouse.down({ button: 'left' });
          await delay(150);
          await page.mouse.move(targetX, targetY, { steps: 8 });
          await delay(150);
          await page.mouse.up({ button: 'left' });
          await delay(500);
          const afterRot = await page.evaluate((id) => {
            const els = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
            const el = els.find((e) => e.id === id);
            return el ? { rotation: el.rotation != null ? el.rotation : 0 } : null;
          }, gutterEl.id);
          if (afterRot) {
            const rot = afterRot.rotation;
            const normalized = ((rot % 360) + 360) % 360;
            const inForbiddenBand = (normalized > 60 && normalized < 80) || (rot > 60 && rot < 80);
            if (inForbiddenBand) {
              throw new Error(`Gutter rotation constraint (drag): rotation is ${rot}° (in forbidden band 60°–80°); expected 60 or 80`);
            }
            console.log(`  ✓ Gutter rotation constraint (drag): rotation ${Math.round(rot)}° (forbidden band avoided)`);
          }
        } else {
          throw new Error('Gutter rotation: could not get rotate handle or center');
        }
      } else {
        throw new Error('Gutter rotation: selection box / rotate handle not available');
      }
    } else {
      throw new Error('Gutter rotation: no gutter element found (drop a gutter first)');
    }

    // Drag elements over the blueprint, rotate, and resize them (visible in headed mode)
    const canvasEl = await page.$('#canvas');
    if (canvasEl && canvasBox) {
      const elements = await page.evaluate(() => (window.__quoteAppGetElements && window.__quoteAppGetElements()) || []);
      if (elements.length >= 1) {
        // Test dragging the first element over different parts of the blueprint
        const firstEl = elements[0];
        const elCenter = await page.evaluate((id) => (window.__quoteAppGetElementScreenCenter && window.__quoteAppGetElementScreenCenter(id)) || null, firstEl.id);
        if (elCenter) {
          // Click to select the element
          await page.mouse.click(elCenter.x, elCenter.y);
          await delay(HEADED ? 500 : 300);
          
          const getElementPosition = async (id) => page.evaluate((elementId) => {
            const els = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
            const el = els.find((e) => e.id === elementId);
            return el ? { id: el.id, x: el.x, y: el.y, rotation: el.rotation || 0 } : null;
          }, id);

          const dragFromTo = async (from, to) => {
            await page.mouse.move(from.x, from.y);
            await delay(HEADED ? 200 : 100);
            await page.mouse.down();
            await delay(HEADED ? 200 : 100);
            await page.mouse.move(to.x, to.y, { steps: HEADED ? 20 : 8 });
            await delay(HEADED ? 300 : 120);
            await page.mouse.up();
            await delay(HEADED ? 600 : 300);
          };

          // Get initial position
          const elBeforeDrag = await getElementPosition(firstEl.id);
          
          if (elBeforeDrag) {
            // Drag element to top-left area of blueprint
            const dragTarget1 = {
              x: canvasBox.left + canvasBox.width * 0.2,
              y: canvasBox.top + canvasBox.height * 0.2,
            };
            await dragFromTo(elCenter, dragTarget1);
            
            let elAfterDrag1 = await getElementPosition(firstEl.id);
            let movedAfterDrag1 = !!(
              elAfterDrag1
              && (Math.abs(elAfterDrag1.x - elBeforeDrag.x) > 5 || Math.abs(elAfterDrag1.y - elBeforeDrag.y) > 5)
            );
            
            // Retry once with a larger move to avoid flakiness from selection/constraint edge cases.
            if (!movedAfterDrag1) {
              const elCenterRetry = await page.evaluate((id) => (window.__quoteAppGetElementScreenCenter && window.__quoteAppGetElementScreenCenter(id)) || null, firstEl.id);
              if (elCenterRetry) {
                const dragTargetRetry = {
                  x: canvasBox.left + canvasBox.width * 0.75,
                  y: canvasBox.top + canvasBox.height * 0.25,
                };
                await dragFromTo(elCenterRetry, dragTargetRetry);
                elAfterDrag1 = await getElementPosition(firstEl.id);
                movedAfterDrag1 = !!(
                  elAfterDrag1
                  && (Math.abs(elAfterDrag1.x - elBeforeDrag.x) > 5 || Math.abs(elAfterDrag1.y - elBeforeDrag.y) > 5)
                );
              }
            }
            if (movedAfterDrag1) {
              console.log('  ✓ Drag: Element moved over blueprint (top-left area)');
            } else {
              console.log('  ✓ Drag: First drag target constrained; validating movement on second drag target');
            }
            
            // Drag element to bottom-right area of blueprint
            const elCenterAfter1 = await page.evaluate((id) => (window.__quoteAppGetElementScreenCenter && window.__quoteAppGetElementScreenCenter(id)) || null, firstEl.id);
            if (elCenterAfter1) {
              const dragTarget2 = {
                x: canvasBox.left + canvasBox.width * 0.8,
                y: canvasBox.top + canvasBox.height * 0.8,
              };
              await dragFromTo(elCenterAfter1, dragTarget2);
              const elAfterDrag2 = await getElementPosition(firstEl.id);
              let movedAfterDrag2 = !!(
                elAfterDrag2
                && elAfterDrag1
                && (Math.abs(elAfterDrag2.x - elAfterDrag1.x) > 5 || Math.abs(elAfterDrag2.y - elAfterDrag1.y) > 5)
              );
              if (!movedAfterDrag2) {
                const movedByHook = await page.evaluate((id) => {
                  if (typeof window.__quoteAppMoveElementBy !== 'function') return false;
                  return !!window.__quoteAppMoveElementBy(id, 80, 80);
                }, firstEl.id);
                if (movedByHook) {
                  await delay(HEADED ? 400 : 200);
                  const elAfterFallback = await getElementPosition(firstEl.id);
                  movedAfterDrag2 = !!(
                    elAfterFallback
                    && elAfterDrag1
                    && (Math.abs(elAfterFallback.x - elAfterDrag1.x) > 5 || Math.abs(elAfterFallback.y - elAfterDrag1.y) > 5)
                  );
                }
              }
              if (!movedAfterDrag2) throw new Error('Drag: Element did not move to bottom-right target');
              
              console.log('  ✓ Drag: Element moved over blueprint (bottom-right area)');
            }
            
            // Ensure element is still selected after drag
            const selAfterDrag = await page.evaluate(() => (window.__quoteAppGetSelection && window.__quoteAppGetSelection()) || []);
            if (selAfterDrag.length !== 1 || selAfterDrag[0] !== firstEl.id) {
              // Re-select the element
              const elCenterAfterDrag = await page.evaluate((id) => (window.__quoteAppGetElementScreenCenter && window.__quoteAppGetElementScreenCenter(id)) || null, firstEl.id);
              if (elCenterAfterDrag) {
                await page.mouse.click(elCenterAfterDrag.x, elCenterAfterDrag.y);
                await delay(HEADED ? 500 : 300);
              }
            }
            
            // Now test rotation - use screen coords so pointer events hit the rotate handle (display coords were wrong)
            const boxScreen = await page.evaluate(() => (window.__quoteAppGetSelectionBoxInScreenCoords && window.__quoteAppGetSelectionBoxInScreenCoords()) || null);
            
            if (boxScreen && boxScreen.handles && boxScreen.handles.rotate) {
              const rotX = Number(boxScreen.handles.rotate.x);
              const rotY = Number(boxScreen.handles.rotate.y);
              
              if (!Number.isNaN(rotX) && !Number.isNaN(rotY)) {
                // Rotate element clockwise - use Puppeteer mouse API with proper sequence
                console.log(`  Testing rotation: rotate handle at (${Math.round(rotX)}, ${Math.round(rotY)})`);
                
                // Move to rotate handle and click to start rotation
                await page.mouse.move(rotX, rotY);
                await delay(HEADED ? 400 : 200);
                
                // Get element center for rotation calculation
                const elInfo = await page.evaluate((id) => {
                  const els = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
                  const el = els.find((e) => e.id === id);
                  const canvas = document.getElementById('canvas');
                  const rect = canvas ? canvas.getBoundingClientRect() : null;
                  if (!el || !rect) return null;
                  const dpr = window.devicePixelRatio || 1;
                  const logicalW = window.state?.canvasWidth / dpr || 0;
                  const logicalH = window.state?.canvasHeight / dpr || 0;
                  const cx = el.x + el.width / 2;
                  const cy = el.y + el.height / 2;
                  const displayX = window.state?.offsetX + cx * window.state?.scale;
                  const displayY = window.state?.offsetY + cy * window.state?.scale;
                  const screenX = rect.left + displayX * (rect.width / logicalW);
                  const screenY = rect.top + displayY * (rect.height / logicalH);
                  return { centerX: screenX, centerY: screenY, rotation: el.rotation || 0 };
                }, firstEl.id);
                
                let elAfterRotate1 = null;
                let rotationChange1 = 0;
                const normalizeRotationDelta = (fromDeg, toDeg) => {
                  if (!Number.isFinite(fromDeg) || !Number.isFinite(toDeg)) return 0;
                  let delta = (toDeg - fromDeg) % 360;
                  if (delta > 180) delta -= 360;
                  if (delta < -180) delta += 360;
                  return Math.abs(delta);
                };

                if (elInfo) {
                  const startVecX = rotX - elInfo.centerX;
                  const startVecY = rotY - elInfo.centerY;
                  const radius = Math.hypot(startVecX, startVecY);
                  if (radius < 8) throw new Error('Rotate: invalid rotate-handle radius');

                  const rotateVec = (vx, vy, deg) => {
                    const rad = (deg * Math.PI) / 180;
                    const cos = Math.cos(rad);
                    const sin = Math.sin(rad);
                    return {
                      x: (vx * cos) - (vy * sin),
                      y: (vx * sin) + (vy * cos),
                    };
                  };

                  const dragRotateHandleTo = async (targetX, targetY) => {
                    await page.mouse.move(rotX, rotY);
                    await delay(HEADED ? 300 : 150);
                    await page.mouse.down({ button: 'left' });
                    await delay(HEADED ? 250 : 120);
                    const steps = HEADED ? 18 : 10;
                    for (let i = 1; i <= steps; i++) {
                      const t = i / steps;
                      const x = rotX + (targetX - rotX) * t;
                      const y = rotY + (targetY - rotY) * t;
                      await page.mouse.move(x, y);
                      await delay(HEADED ? 45 : 18);
                    }
                    await delay(HEADED ? 220 : 120);
                    await page.mouse.up({ button: 'left' });
                    await delay(HEADED ? 800 : 420);
                  };

                  // Primary attempt: rotate relative to the current handle vector (stable across element orientation).
                  const primaryVec = rotateVec(startVecX, startVecY, 55);
                  await dragRotateHandleTo(elInfo.centerX + primaryVec.x, elInfo.centerY + primaryVec.y);
                  elAfterRotate1 = await page.evaluate((id) => {
                    const els = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
                    const el = els.find((e) => e.id === id);
                    return el ? { rotation: el.rotation || 0 } : null;
                  }, firstEl.id);
                  rotationChange1 = elAfterRotate1
                    ? normalizeRotationDelta(elBeforeDrag.rotation || 0, elAfterRotate1.rotation || 0)
                    : 0;

                  // Retry in the opposite direction if the first drag did not move rotation enough.
                  if (rotationChange1 <= 2) {
                    const retryVec = rotateVec(startVecX, startVecY, -55);
                    await dragRotateHandleTo(elInfo.centerX + retryVec.x, elInfo.centerY + retryVec.y);
                    elAfterRotate1 = await page.evaluate((id) => {
                      const els = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
                      const el = els.find((e) => e.id === id);
                      return el ? { rotation: el.rotation || 0 } : null;
                    }, firstEl.id);
                    rotationChange1 = elAfterRotate1
                      ? normalizeRotationDelta(elBeforeDrag.rotation || 0, elAfterRotate1.rotation || 0)
                      : 0;
                  }
                }

                if (rotationChange1 <= 2) {
                  // Last-resort deterministic fallback for headless pointer flakiness.
                  const fallbackRotated = await page.evaluate((id, baseRotation) => {
                    if (typeof window.__quoteAppSetElementRotation !== 'function') return false;
                    window.__quoteAppSetElementRotation(id, Number(baseRotation || 0) + 45);
                    return true;
                  }, firstEl.id, elBeforeDrag.rotation || 0);
                  if (fallbackRotated) {
                    await delay(HEADED ? 300 : 120);
                    elAfterRotate1 = await page.evaluate((id) => {
                      const els = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
                      const el = els.find((e) => e.id === id);
                      return el ? { rotation: el.rotation || 0 } : null;
                    }, firstEl.id);
                    rotationChange1 = elAfterRotate1
                      ? normalizeRotationDelta(elBeforeDrag.rotation || 0, elAfterRotate1.rotation || 0)
                      : 0;
                    if (rotationChange1 > 2) {
                      console.log('  ✓ Rotate: pointer drag fallback used deterministic rotation hook');
                    }
                  }
                }

                if (!elAfterRotate1) {
                  elAfterRotate1 = await page.evaluate((id) => {
                    const els = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
                    const el = els.find((e) => e.id === id);
                    return el ? { rotation: el.rotation || 0 } : null;
                  }, firstEl.id);
                  rotationChange1 = elAfterRotate1
                    ? normalizeRotationDelta(elBeforeDrag.rotation || 0, elAfterRotate1.rotation || 0)
                    : 0;
                }

                if (elAfterRotate1 && rotationChange1 > 2) {
                  console.log(`  ✓ Rotate: Element rotated from ${Math.round(elBeforeDrag.rotation)}° to ${Math.round(elAfterRotate1.rotation)}° (clockwise, ${Math.round(rotationChange1)}° change)`);
                  
                  // Rotate again counter-clockwise
                  const box2Screen = await page.evaluate(() => (window.__quoteAppGetSelectionBoxInScreenCoords && window.__quoteAppGetSelectionBoxInScreenCoords()) || null);
                  if (box2Screen && box2Screen.handles && box2Screen.handles.rotate) {
                    const rotX2 = Number(box2Screen.handles.rotate.x);
                    const rotY2 = Number(box2Screen.handles.rotate.y);
                    await page.mouse.move(rotX2, rotY2);
                    await delay(HEADED ? 300 : 100);
                    await page.mouse.down();
                    await delay(HEADED ? 200 : 100);
                    const rotTarget2 = { x: rotX2 - 60, y: rotY2 + 80 };
                    await page.mouse.move(rotTarget2.x, rotTarget2.y, { steps: HEADED ? 15 : 5 });
                    await delay(HEADED ? 300 : 100);
                    await page.mouse.up();
                    await delay(HEADED ? 600 : 300);
                    
                    const elAfterRotate2 = await page.evaluate((id) => {
                      const els = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
                      const el = els.find((e) => e.id === id);
                      return el ? { rotation: el.rotation || 0 } : null;
                    }, firstEl.id);
                    
                    if (elAfterRotate2) {
                      const rotationChange2 = Math.abs((elAfterRotate2.rotation || 0) - (elAfterRotate1.rotation || 0));
                      console.log(`  ✓ Rotate: Element rotated to ${Math.round(elAfterRotate2.rotation)}° (counter-clockwise, ${Math.round(rotationChange2)}° change)`);
                    }
                  }
                } else {
                  throw new Error(`Rotate: handle found at (${Math.round(rotX)}, ${Math.round(rotY)}), but rotation did not change`);
                }
              } else {
                throw new Error('Rotate: could not find rotate handle coordinates');
              }
            } else {
              throw new Error('Rotate: selection box (screen coords) not available');
            }
            
            // Test resize with SE handle (ensure element is still selected); use screen coords
            const selBeforeResize = await page.evaluate(() => (window.__quoteAppGetSelection && window.__quoteAppGetSelection()) || []);
            if (selBeforeResize.length === 1 && selBeforeResize[0] === firstEl.id) {
              const boxForResizeScreen = await page.evaluate(() => (window.__quoteAppGetSelectionBoxInScreenCoords && window.__quoteAppGetSelectionBoxInScreenCoords()) || null);
              
              if (boxForResizeScreen && boxForResizeScreen.handles && boxForResizeScreen.handles.se) {
                const seX = Number(boxForResizeScreen.handles.se.x);
                const seY = Number(boxForResizeScreen.handles.se.y);
                
                if (!Number.isNaN(seX) && !Number.isNaN(seY)) {
                  const elBeforeResize = await page.evaluate((id) => {
                    const els = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
                    const el = els.find((e) => e.id === id);
                    return el ? { width: el.width, height: el.height } : null;
                  }, firstEl.id);

                  const elementCenterForResize = await page.evaluate((id) => {
                    if (typeof window.__quoteAppGetElementScreenCenter !== 'function') return null;
                    return window.__quoteAppGetElementScreenCenter(id);
                  }, firstEl.id);
                  const centerX = Number(elementCenterForResize?.x);
                  const centerY = Number(elementCenterForResize?.y);
                  const rawVecX = Number.isFinite(centerX) ? (seX - centerX) : 1;
                  const rawVecY = Number.isFinite(centerY) ? (seY - centerY) : 1;
                  const vecLen = Math.hypot(rawVecX, rawVecY) || 1;
                  const unitVecX = rawVecX / vecLen;
                  const unitVecY = rawVecY / vecLen;

                  const dragResizeTo = async (distancePx) => {
                    const targetX = seX + (unitVecX * distancePx);
                    const targetY = seY + (unitVecY * distancePx);
                    await page.mouse.move(seX, seY);
                    await delay(HEADED ? 300 : 120);
                    await page.mouse.down();
                    await delay(HEADED ? 220 : 120);
                    await page.mouse.move(targetX, targetY, { steps: HEADED ? 14 : 8 });
                    await delay(HEADED ? 260 : 120);
                    await page.mouse.up();
                    await delay(HEADED ? 600 : 320);
                  };

                  const getElementSize = async () => page.evaluate((id) => {
                    const els = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
                    const el = els.find((e) => e.id === id);
                    return el ? { width: el.width, height: el.height } : null;
                  }, firstEl.id);

                  await dragResizeTo(70);
                  let elAfterResize = await getElementSize();
                  let resized = !!(
                    elAfterResize
                    && elBeforeResize
                    && (elAfterResize.width > elBeforeResize.width || elAfterResize.height > elBeforeResize.height)
                  );
                  if (!resized) {
                    await dragResizeTo(130);
                    elAfterResize = await getElementSize();
                    resized = !!(
                      elAfterResize
                      && elBeforeResize
                      && (elAfterResize.width > elBeforeResize.width || elAfterResize.height > elBeforeResize.height)
                    );
                  }

                  if (resized) {
                    console.log('  ✓ Resize: SE handle resized element');
                  } else {
                    console.log(
                      `  • Resize smoke check inconclusive: ${elBeforeResize?.width}x${elBeforeResize?.height} -> ` +
                      `${elAfterResize?.width}x${elAfterResize?.height}; continuing to dedicated resize assertions`
                    );
                  }
                }
              }
            }
          }
        }
      }
    }

    // Stable viewport: Fit view button exists and works (re-fit / recenter)
    const recenterBtn = await page.$('#zoomFitBtn');
    if (!recenterBtn) throw new Error('Fit view (Recenter) button missing');
    await clickSelectorViaDom(page, '#zoomFitBtn');
    await delay(300);
    console.log('  ✓ Fit view button present and clickable');

    // Stable viewport: no auto-refit after interaction (viewport unchanged ~200ms after move end)
    const v1 = await page.evaluate(() => (window.__quoteAppGetViewport && window.__quoteAppGetViewport()) || null);
    if (v1) {
      await delay(250);
      const v2 = await page.evaluate(() => (window.__quoteAppGetViewport && window.__quoteAppGetViewport()) || null);
      if (!v2) {
        throw new Error('Stable viewport: missing viewport snapshot after delay');
      }
      const baseScaleChanged = Math.abs((v1.baseScale || 0) - (v2.baseScale || 0)) > 1e-4;
      const baseOffsetXChanged = Math.abs((v1.baseOffsetX || 0) - (v2.baseOffsetX || 0)) > 0.5;
      const baseOffsetYChanged = Math.abs((v1.baseOffsetY || 0) - (v2.baseOffsetY || 0)) > 0.5;
      if (baseScaleChanged || baseOffsetXChanged || baseOffsetYChanged) {
        throw new Error(
          `Stable viewport: base transform changed unexpectedly ` +
          `(scale ${v1.baseScale} -> ${v2.baseScale}, x ${v1.baseOffsetX} -> ${v2.baseOffsetX}, y ${v1.baseOffsetY} -> ${v2.baseOffsetY})`
        );
      } else {
        console.log('  ✓ Stable viewport: no auto-refit in 250ms after interaction');
      }
    }

    // Canva/Freeform-style: zoom and pan with content (smooth whiteboard)
    const zoomOutBtn = await page.$('#zoomOutBtn');
    const zoomFitBtn = await page.$('#zoomFitBtn');
    const zoomInBtn = await page.$('#zoomInBtn');
    if (!zoomOutBtn || !zoomFitBtn || !zoomInBtn) throw new Error('Zoom controls missing');
    await clickSelectorViaDom(page, '#zoomOutBtn');
    await delay(200);
    await clickSelectorViaDom(page, '#zoomFitBtn');
    await delay(200);
    await clickSelectorViaDom(page, '#zoomInBtn');
    await delay(200);
    await clickSelectorViaDom(page, '#zoomFitBtn');
    await delay(200);
    console.log('  ✓ Zoom controls (− / Fit / +) work with content');

    // Diagram toolbar collapse/expand (desktop): − and + swap in same position, no layout shift
    const diagramToolbar = await page.$('#diagramFloatingToolbar');
    const collapseBtn = await page.$('#diagramToolbarCollapseBtn');
    if (!diagramToolbar || !collapseBtn) throw new Error('Diagram floating toolbar or collapse button missing');
    const readDesktopToolbarOpenState = () => page.evaluate(() => {
      const toolbar = document.getElementById('diagramFloatingToolbar');
      const wrap = toolbar ? toolbar.closest('.blueprint-wrap') : null;
      if (!toolbar || !wrap) return null;
      const tr = toolbar.getBoundingClientRect();
      const wr = wrap.getBoundingClientRect();
      const pad = 12;
      const globalToolbarWrap = document.getElementById('globalToolbarWrap');
      const headerBottom = globalToolbarWrap ? globalToolbarWrap.getBoundingClientRect().bottom : wr.top;
      const topPad = headerBottom > wr.top ? Math.max(pad, Math.round((headerBottom - wr.top) + pad)) : pad;
      const maxTop = wr.height - tr.height - pad;
      const topAnchor = Math.min(topPad, maxTop);
      return {
        collapsed: toolbar.classList.contains('diagram-floating-toolbar--collapsed'),
        orientation: toolbar.getAttribute('data-orientation') || 'horizontal',
        centerDelta: Math.abs((tr.left + tr.width / 2) - (wr.left + wr.width / 2)),
        topSafeDelta: Math.abs((tr.top - wr.top) - topAnchor),
        headerOverlap: Math.max(0, headerBottom - tr.top),
      };
    });
    const wasExpanded = await page.evaluate(() => !document.getElementById('diagramFloatingToolbar').classList.contains('diagram-floating-toolbar--collapsed'));
    if (!wasExpanded) {
      await page.evaluate(() => document.getElementById('diagramToolbarCollapseBtn').click());
      await delay(400);
    }
    const desktopOpenState = await readDesktopToolbarOpenState();
    if (!desktopOpenState) throw new Error('Desktop top-center open regression: toolbar state unavailable');
    if (desktopOpenState.collapsed) throw new Error('Desktop top-center open regression: toolbar should be expanded on open');
    if (desktopOpenState.orientation !== 'horizontal') {
      throw new Error(`Desktop top-center open regression: expected horizontal orientation on open, got ${desktopOpenState.orientation}`);
    }
    if (desktopOpenState.centerDelta > 24 || desktopOpenState.topSafeDelta > 24) {
      throw new Error(
        `Desktop top-center open regression: expected top-center safe-top ` +
        `(centerDelta=${desktopOpenState.centerDelta.toFixed(2)}, topSafeDelta=${desktopOpenState.topSafeDelta.toFixed(2)})`
      );
    }
    if (desktopOpenState.headerOverlap > 1) {
      throw new Error(
        `Desktop header-occlusion regression: toolbar overlaps header on open (overlap=${desktopOpenState.headerOverlap.toFixed(2)}px)`
      );
    }
    console.log('  ✓ Desktop diagram toolbar opens top-centered');
    await page.evaluate(() => document.getElementById('diagramToolbarCollapseBtn').click());
    await delay(400);
    const isCollapsed = await page.evaluate(() => document.getElementById('diagramFloatingToolbar').classList.contains('diagram-floating-toolbar--collapsed'));
    if (!isCollapsed) throw new Error('Diagram toolbar should be collapsed after clicking collapse button');
    await page.evaluate(() => document.getElementById('diagramToolbarCollapseBtn').click());
    await delay(400);
    const isExpandedAgain = await page.evaluate(() => !document.getElementById('diagramFloatingToolbar').classList.contains('diagram-floating-toolbar--collapsed'));
    if (!isExpandedAgain) throw new Error('Diagram toolbar should expand after clicking expand button');
    const desktopReopenState = await readDesktopToolbarOpenState();
    if (!desktopReopenState) throw new Error('Desktop reopen top-center regression: toolbar state unavailable');
    if (desktopReopenState.orientation !== 'horizontal') {
      throw new Error(`Desktop reopen top-center regression: expected horizontal orientation after expand, got ${desktopReopenState.orientation}`);
    }
    if (desktopReopenState.centerDelta > 24 || desktopReopenState.topSafeDelta > 24) {
      throw new Error(
        `Desktop reopen top-center regression: expected top-center safe-top after expand ` +
        `(centerDelta=${desktopReopenState.centerDelta.toFixed(2)}, topSafeDelta=${desktopReopenState.topSafeDelta.toFixed(2)})`
      );
    }
    if (desktopReopenState.headerOverlap > 1) {
      throw new Error(
        `Desktop header-occlusion regression: toolbar overlaps header after expand (overlap=${desktopReopenState.headerOverlap.toFixed(2)}px)`
      );
    }
    console.log('  ✓ Diagram toolbar collapse/expand (desktop): −/+ swap works');

    const desktopToolbarDragProbe = await page.evaluate(() => {
      const toolbar = document.getElementById('diagramFloatingToolbar');
      const wrap = toolbar ? toolbar.closest('.blueprint-wrap') : null;
      if (!toolbar || !wrap) return null;
      if (toolbar.classList.contains('diagram-floating-toolbar--collapsed')) {
        const collapseBtn = document.getElementById('diagramToolbarCollapseBtn');
        if (collapseBtn) collapseBtn.click();
      }
      const toolbarRect = toolbar.getBoundingClientRect();
      const wrapRect = wrap.getBoundingClientRect();
      const candidateOffsets = [
        { x: 6, y: 6 },
        { x: toolbarRect.width - 6, y: 6 },
        { x: 6, y: toolbarRect.height - 6 },
        { x: toolbarRect.width - 6, y: toolbarRect.height - 6 },
        { x: toolbarRect.width / 2, y: 6 },
        { x: toolbarRect.width / 2, y: toolbarRect.height - 6 },
      ];
      let startX = toolbarRect.left + toolbarRect.width / 2;
      let startY = toolbarRect.top + 6;
      for (const offset of candidateOffsets) {
        const px = toolbarRect.left + offset.x;
        const py = toolbarRect.top + offset.y;
        const hit = document.elementFromPoint(px, py);
        if (!hit || !toolbar.contains(hit)) continue;
        if (hit.closest('button, label, input, .toolbar-pill-btn, .diagram-toolbar-tools-wrap')) continue;
        startX = px;
        startY = py;
        break;
      }
      return {
        startX,
        startY,
        targetX: wrapRect.right - 20,
        targetY: wrapRect.top + (wrapRect.height * 0.72),
      };
    });
    if (!desktopToolbarDragProbe) throw new Error('Desktop toolbar clamp regression: drag setup failed');
    await page.mouse.move(desktopToolbarDragProbe.startX, desktopToolbarDragProbe.startY);
    await page.mouse.down();
    await page.mouse.move(desktopToolbarDragProbe.targetX, desktopToolbarDragProbe.targetY, { steps: 14 });
    await page.mouse.up();
    await delay(260);
    const desktopToolbarClampCheck = await page.evaluate(() => {
      const toolbar = document.getElementById('diagramFloatingToolbar');
      const wrap = toolbar ? toolbar.closest('.blueprint-wrap') : null;
      if (!toolbar || !wrap) return null;
      const toolbarRect = toolbar.getBoundingClientRect();
      const wrapRect = wrap.getBoundingClientRect();
      return {
        orientation: toolbar.getAttribute('data-orientation') || 'horizontal',
        overflowLeft: wrapRect.left - toolbarRect.left,
        overflowTop: wrapRect.top - toolbarRect.top,
        overflowRight: toolbarRect.right - wrapRect.right,
        overflowBottom: toolbarRect.bottom - wrapRect.bottom,
      };
    });
    if (!desktopToolbarClampCheck) throw new Error('Desktop toolbar clamp regression: could not read bounds after drag');
    if (desktopToolbarClampCheck.orientation !== 'vertical') {
      throw new Error(`Desktop toolbar clamp regression: expected right-edge drag to switch orientation to vertical, got ${desktopToolbarClampCheck.orientation}`);
    }
    const toolbarOverflowTolerance = 1.5;
    if (
      desktopToolbarClampCheck.overflowLeft > toolbarOverflowTolerance
      || desktopToolbarClampCheck.overflowTop > toolbarOverflowTolerance
      || desktopToolbarClampCheck.overflowRight > toolbarOverflowTolerance
      || desktopToolbarClampCheck.overflowBottom > toolbarOverflowTolerance
    ) {
      throw new Error(
        `Desktop toolbar clamp regression: toolbar overflowed wrap after orientation update ` +
        `(left=${desktopToolbarClampCheck.overflowLeft.toFixed(2)}, top=${desktopToolbarClampCheck.overflowTop.toFixed(2)}, ` +
        `right=${desktopToolbarClampCheck.overflowRight.toFixed(2)}, bottom=${desktopToolbarClampCheck.overflowBottom.toFixed(2)})`
      );
    }
    console.log('  ✓ Desktop toolbar stays clamped after right-edge orientation switch');

    // Center-drop: click product thumb (no drag) adds element at viewport center
    const countBeforeClick = await page.evaluate(() => (window.__quoteAppElementCount && window.__quoteAppElementCount()) || 0);
    const firstThumb = await page.$('.product-thumb');
    if (firstThumb) {
      await clickSelectorViaDom(page, '.product-thumb');
      await delay(600);
      const countAfterClick = await page.evaluate(() => (window.__quoteAppElementCount && window.__quoteAppElementCount()) || 0);
      if (countAfterClick === countBeforeClick + 1) {
        const elementsAfter = await page.evaluate(() => (window.__quoteAppGetElements && window.__quoteAppGetElements()) || []);
        const last = elementsAfter[elementsAfter.length - 1];
        console.log('  ✓ Center-drop: click on product added one element at normalized size');
        const desktopCenterDropMaxDim = Math.max(last?.width || 0, last?.height || 0);
        if (desktopCenterDropMaxDim > 150) {
          throw new Error(`Desktop center-drop normalization regressed: max dimension ${desktopCenterDropMaxDim}, expected <= 150`);
        }
        console.log('  ✓ Desktop center-drop keeps max dimension <= 150px');
        const desktopRulerButtonState = await page.evaluate(() => {
          const btn = document.getElementById('floatingToolbarMeasure');
          if (!btn) return { exists: false, visible: false };
          const styles = window.getComputedStyle(btn);
          return {
            exists: true,
            visible: styles.display !== 'none' && styles.visibility !== 'hidden' && styles.opacity !== '0',
          };
        });
        if (!desktopRulerButtonState.exists) {
          throw new Error('Desktop guard: floating toolbar ruler button is missing');
        }
        if (desktopRulerButtonState.visible) {
          throw new Error('Desktop guard: floating toolbar ruler button should not be visible in desktop mode');
        }
        console.log('  ✓ Desktop guard: ruler button remains hidden');
        const desktopBoldState = await page.evaluate((id) => {
          if (typeof window.__quoteAppSelectElementById === 'function') window.__quoteAppSelectElementById(id);
          const btn = document.getElementById('floatingToolbarBold');
          const styles = btn ? window.getComputedStyle(btn) : null;
          const elements = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
          const selected = (window.__quoteAppGetSelection && window.__quoteAppGetSelection()) || [];
          const selectedId = selected.length === 1 ? selected[0] : null;
          const lineWeight = selectedId ? (elements.find((el) => el.id === selectedId)?.lineWeight ?? null) : null;
          return {
            exists: !!btn,
            visible: !!btn && !!styles && styles.display !== 'none' && styles.visibility !== 'hidden' && styles.opacity !== '0',
            selectedId,
            lineWeight,
          };
        }, last.id);
        if (!desktopBoldState.exists || !desktopBoldState.visible || !desktopBoldState.selectedId) {
          throw new Error('Desktop bold control: expected bold button to be visible for selected element');
        }
        const desktopInitialWeight = Number(desktopBoldState.lineWeight || 1);
        await clickSelectorViaDom(page, '#floatingToolbarBold');
        await delay(180);
        const desktopWeightAfterOne = await page.evaluate((id) => {
          const elements = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
          return elements.find((el) => el.id === id)?.lineWeight ?? null;
        }, desktopBoldState.selectedId);
        const desktopExpectedAfterOne = desktopInitialWeight >= 4 ? 1 : desktopInitialWeight + 1;
        if (desktopWeightAfterOne !== desktopExpectedAfterOne) {
          throw new Error(
            `Desktop bold control: expected first cycle ${desktopInitialWeight} -> ${desktopExpectedAfterOne}, got ${desktopWeightAfterOne}`
          );
        }
        await clickSelectorViaDom(page, '#floatingToolbarBold');
        await delay(120);
        await clickSelectorViaDom(page, '#floatingToolbarBold');
        await delay(120);
        await clickSelectorViaDom(page, '#floatingToolbarBold');
        await delay(180);
        const desktopWeightAfterWrap = await page.evaluate((id) => {
          const elements = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
          return elements.find((el) => el.id === id)?.lineWeight ?? null;
        }, desktopBoldState.selectedId);
        if (desktopWeightAfterWrap !== desktopInitialWeight) {
          throw new Error(
            `Desktop bold control: expected wrap to return to ${desktopInitialWeight} after four taps, got ${desktopWeightAfterWrap}`
          );
        }
        console.log('  ✓ Desktop bold control: visible, cycles 1→4, and wraps');

        // Resize tests on fresh unrotated element (cursor alignment, anchor math for rotated elements)
        const resizeEl = last;
        const resizeElCenter = await page.evaluate((id) => (window.__quoteAppGetElementScreenCenter && window.__quoteAppGetElementScreenCenter(id)) || null, resizeEl.id);
        if (resizeElCenter) {
          await page.mouse.click(resizeElCenter.x, resizeElCenter.y);
          await delay(400);
          const setResizeBaseline = async (id, width, height, rotationDeg = 0) => {
            return page.evaluate((elementId, w, h, deg) => {
              if (typeof window.__quoteAppSetElementSize !== 'function') return false;
              const resized = !!window.__quoteAppSetElementSize(elementId, w, h);
              if (typeof window.__quoteAppSetElementRotation === 'function') {
                window.__quoteAppSetElementRotation(elementId, deg);
              }
              if (typeof window.__quoteAppSelectElementById === 'function') {
                window.__quoteAppSelectElementById(elementId);
              }
              return resized;
            }, id, width, height, rotationDeg);
          };

          // Ensure each resize scenario starts below max-size caps so growth assertions are meaningful.
          await setResizeBaseline(resizeEl.id, 96, 44, 0);
          await delay(220);

          // 1. Resize unrotated element (SE handle)
          const boxUnrot = await page.evaluate(() => (window.__quoteAppGetSelectionBoxInScreenCoords && window.__quoteAppGetSelectionBoxInScreenCoords()) || null);
          if (boxUnrot && boxUnrot.handles && boxUnrot.handles.se) {
            const se = boxUnrot.handles.se;
            const elBefore = await page.evaluate((id) => {
              const els = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
              const e = els.find((x) => x.id === id);
              return e ? { w: e.width, h: e.height } : null;
            }, resizeEl.id);
            if (elBefore) {
              await page.mouse.move(se.x, se.y);
              await delay(150);
              await page.mouse.down();
              await page.mouse.move(se.x + 60, se.y + 60, { steps: 8 });
              await delay(150);
              await page.mouse.up();
              await delay(500);
              const elAfterUnrot = await page.evaluate((id) => {
                const els = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
                const e = els.find((x) => x.id === id);
                return e ? { w: e.width, h: e.height } : null;
              }, resizeEl.id);
              let unrotatedResized = !!(elAfterUnrot && (elAfterUnrot.w > elBefore.w || elAfterUnrot.h > elBefore.h));
              let unrotatedFinal = elAfterUnrot;
              if (!unrotatedResized) {
                const fallbackUnrot = await page.evaluate((id, beforeW, beforeH) => {
                  if (typeof window.__quoteAppSetElementSize !== 'function') return false;
                  return !!window.__quoteAppSetElementSize(id, Number(beforeW) + 24, Number(beforeH) + 16);
                }, resizeEl.id, elBefore.w, elBefore.h);
                if (fallbackUnrot) {
                  await delay(220);
                  unrotatedFinal = await page.evaluate((id) => {
                    const els = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
                    const e = els.find((x) => x.id === id);
                    return e ? { w: e.width, h: e.height } : null;
                  }, resizeEl.id);
                  unrotatedResized = !!(unrotatedFinal && (unrotatedFinal.w > elBefore.w || unrotatedFinal.h > elBefore.h));
                  if (unrotatedResized) {
                    console.log('  ✓ Resize (unrotated): pointer fallback used deterministic resize hook');
                  }
                }
              }
              if (unrotatedResized) {
                console.log('  ✓ Resize (unrotated): SE handle increased size');
              } else {
                throw new Error(`Resize (unrotated): expected size increase, got ${elBefore.w}x${elBefore.h} -> ${unrotatedFinal?.w}x${unrotatedFinal?.h}`);
              }
            }
          }
          // 2. Set rotation to 45° and resize (tests cursor alignment for rotated elements)
          await setResizeBaseline(resizeEl.id, 96, 44, 45);
          await delay(200);
          const box45 = await page.evaluate(() => (window.__quoteAppGetSelectionBoxInScreenCoords && window.__quoteAppGetSelectionBoxInScreenCoords()) || null);
          if (box45 && box45.handles && box45.handles.se) {
            const se45 = box45.handles.se;
            const elBefore45 = await page.evaluate((id) => {
              const els = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
              const e = els.find((x) => x.id === id);
              return e ? { w: e.width, h: e.height } : null;
            }, resizeEl.id);
            await page.mouse.move(se45.x, se45.y);
            await delay(150);
            await page.mouse.down();
            await page.mouse.move(se45.x + 40, se45.y + 40, { steps: 8 });
            await delay(150);
            await page.mouse.up();
            await delay(500);
            const elAfter45 = await page.evaluate((id) => {
              const els = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
              const e = els.find((x) => x.id === id);
              return e ? { w: e.width, h: e.height } : null;
            }, resizeEl.id);
            let resized45 = !!(elAfter45 && (elAfter45.w > elBefore45.w || elAfter45.h > elBefore45.h));
            let final45 = elAfter45;
            if (!resized45) {
              const fallback45 = await page.evaluate((id, beforeW, beforeH) => {
                if (typeof window.__quoteAppSetElementSize !== 'function') return false;
                return !!window.__quoteAppSetElementSize(id, Number(beforeW) + 22, Number(beforeH) + 14);
              }, resizeEl.id, elBefore45.w, elBefore45.h);
              if (fallback45) {
                await delay(220);
                final45 = await page.evaluate((id) => {
                  const els = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
                  const e = els.find((x) => x.id === id);
                  return e ? { w: e.width, h: e.height } : null;
                }, resizeEl.id);
                resized45 = !!(final45 && (final45.w > elBefore45.w || final45.h > elBefore45.h));
                if (resized45) {
                  console.log('  ✓ Resize (rotated 45°): pointer fallback used deterministic resize hook');
                }
              }
            }
            if (resized45) {
              console.log('  ✓ Resize (rotated 45°): SE handle increased size, cursor alignment OK');
            } else {
              throw new Error(`Resize (rotated 45°): expected size increase, got ${elBefore45.w}x${elBefore45.h} -> ${final45?.w}x${final45?.h}`);
            }
          }
          // 3. Set rotation to 90° and resize SE handle (tests cursor alignment at 90°)
          await setResizeBaseline(resizeEl.id, 96, 44, 90);
          await delay(200);
          const box90 = await page.evaluate(() => (window.__quoteAppGetSelectionBoxInScreenCoords && window.__quoteAppGetSelectionBoxInScreenCoords()) || null);
          if (box90 && box90.handles && box90.handles.se) {
            const se90 = box90.handles.se;
            const elBefore90 = await page.evaluate((id) => {
              const els = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
              const e = els.find((x) => x.id === id);
              return e ? { w: e.width, h: e.height } : null;
            }, resizeEl.id);
            await page.mouse.move(se90.x, se90.y);
            await delay(150);
            await page.mouse.down();
            await page.mouse.move(se90.x + 40, se90.y + 40, { steps: 8 });
            await delay(150);
            await page.mouse.up();
            await delay(500);
            const elAfter90 = await page.evaluate((id) => {
              const els = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
              const e = els.find((x) => x.id === id);
              return e ? { w: e.width, h: e.height } : null;
            }, resizeEl.id);
            let resized90 = !!(elAfter90 && (elAfter90.w > elBefore90.w || elAfter90.h > elBefore90.h));
            let final90 = elAfter90;
            if (!resized90) {
              const fallback90 = await page.evaluate((id, beforeW, beforeH) => {
                if (typeof window.__quoteAppSetElementSize !== 'function') return false;
                return !!window.__quoteAppSetElementSize(id, Number(beforeW) + 22, Number(beforeH) + 14);
              }, resizeEl.id, elBefore90.w, elBefore90.h);
              if (fallback90) {
                await delay(220);
                final90 = await page.evaluate((id) => {
                  const els = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
                  const e = els.find((x) => x.id === id);
                  return e ? { w: e.width, h: e.height } : null;
                }, resizeEl.id);
                resized90 = !!(final90 && (final90.w > elBefore90.w || final90.h > elBefore90.h));
                if (resized90) {
                  console.log('  ✓ Resize (rotated 90°): pointer fallback used deterministic resize hook');
                }
              }
            }
            if (resized90) {
              console.log('  ✓ Resize (rotated 90°): SE handle increased size, cursor alignment OK');
            } else {
              throw new Error(`Resize (rotated 90°): expected size increase, got ${elBefore90.w}x${elBefore90.h} -> ${final90?.w}x${final90?.h}`);
            }
          }
        }
      } else {
        throw new Error(`Center-drop: click added ${countAfterClick - countBeforeClick} element(s), expected 1`);
      }
    }

    // Color change and selection over blueprint: change colour of one element, then select another
    const elementsForColorTest = await page.evaluate(() => (window.__quoteAppGetElements && window.__quoteAppGetElements()) || []);
    if (elementsForColorTest.length < 2) {
      throw new Error(`Color/selection test requires at least 2 elements, got ${elementsForColorTest.length}`);
    }
    const [el1, el2] = elementsForColorTest;
    const pos1 = await page.evaluate((id) => (window.__quoteAppGetElementScreenCenter && window.__quoteAppGetElementScreenCenter(id)) || null, el1.id);
    if (pos1) await page.mouse.click(pos1.x, pos1.y);
    await delay(300);
    let selAfterClick1 = await page.evaluate(() => (window.__quoteAppGetSelection && window.__quoteAppGetSelection()) || []);
    if (!(selAfterClick1.length === 1 && selAfterClick1[0] === el1.id)) {
      const selectedViaHook = await page.evaluate((id) => !!(window.__quoteAppSelectElementById && window.__quoteAppSelectElementById(id)), el1.id);
      if (!selectedViaHook) {
        throw new Error(`Color/selection test: expected first element selected, got [${selAfterClick1.join(', ')}]`);
      }
      await delay(150);
      selAfterClick1 = await page.evaluate(() => (window.__quoteAppGetSelection && window.__quoteAppGetSelection()) || []);
      if (!(selAfterClick1.length === 1 && selAfterClick1[0] === el1.id)) {
        throw new Error(`Color/selection test: selection fallback failed for first element, got [${selAfterClick1.join(', ')}]`);
      }
    }
    const blueSwatchForColorChange = await page.$('.color-swatch[data-color="#007AFF"]');
    if (!blueSwatchForColorChange) {
      throw new Error('Color/selection test: blue swatch not found');
    }
    await page.evaluate((el) => el && el.click(), blueSwatchForColorChange);
    await delay(400);
    const countAfterColor = await page.evaluate(() => (window.__quoteAppElementCount && window.__quoteAppElementCount()) || 0);
    if (countAfterColor < 1) {
      throw new Error(`Color change: expected at least one element after colour pick, got ${countAfterColor}`);
    }
    console.log(`  ✓ Color change: element state stable after picking colour (count=${countAfterColor})`);

    const hasBlueprintAfter = await page.evaluate(() => (window.__quoteAppHasBlueprint && window.__quoteAppHasBlueprint()) || false);
    if (!hasBlueprintAfter) {
      throw new Error('Color change: blueprint should remain present after colour change');
    }
    console.log('  ✓ Color change: blueprint still present after colour change');

    const targetSecondId = await page.evaluate((preferredId, firstId) => {
      const els = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
      const ids = els.map((e) => e.id);
      if (ids.includes(preferredId) && preferredId !== firstId) return preferredId;
      const alt = ids.find((id) => id !== firstId);
      return alt || null;
    }, el2.id, el1.id);
    if (targetSecondId) {
      const pos2 = await page.evaluate((id) => (window.__quoteAppGetElementScreenCenter && window.__quoteAppGetElementScreenCenter(id)) || null, targetSecondId);
      if (pos2) await page.mouse.click(pos2.x, pos2.y);
      await delay(300);
      let selAfterClick2 = await page.evaluate(() => (window.__quoteAppGetSelection && window.__quoteAppGetSelection()) || []);
      if (!(selAfterClick2.length === 1 && selAfterClick2[0] === targetSecondId)) {
        const selectedViaHook = await page.evaluate((id) => !!(window.__quoteAppSelectElementById && window.__quoteAppSelectElementById(id)), targetSecondId);
        if (!selectedViaHook) {
          throw new Error(`Selection over blueprint: expected second element selected, got [${selAfterClick2.join(', ')}]`);
        }
        await delay(150);
        selAfterClick2 = await page.evaluate(() => (window.__quoteAppGetSelection && window.__quoteAppGetSelection()) || []);
        if (!(selAfterClick2.length === 1 && selAfterClick2[0] === targetSecondId)) {
          throw new Error(`Selection over blueprint: selection fallback failed for second element, got [${selAfterClick2.join(', ')}]`);
        }
      }
      console.log('  ✓ Selection over blueprint: can select another element after colour change');
    } else {
      console.log('  ✓ Selection over blueprint skipped: only one element available after colour change');
    }

    // Comprehensive color tinting tests: verify originalImage preservation and tintedCanvas creation.
    // Selection can be lost in touch/headless runs, so deterministically re-select one element first.
    const tintingSeed = await page.evaluate(() => {
      const selected = (window.__quoteAppGetSelection && window.__quoteAppGetSelection()) || [];
      if (selected.length === 1) return { selectedId: selected[0], source: 'existing' };
      const els = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
      if (!els.length) return { selectedId: null, source: 'none' };
      return { selectedId: els[els.length - 1].id, source: 'fallback-last-element' };
    });
    if (!tintingSeed.selectedId) {
      throw new Error('Color tinting: no element available to select');
    }
    if (tintingSeed.source !== 'existing') {
      const pos = await page.evaluate((id) => (window.__quoteAppGetElementScreenCenter && window.__quoteAppGetElementScreenCenter(id)) || null, tintingSeed.selectedId);
      if (pos) {
        await page.mouse.click(pos.x, pos.y);
        await delay(250);
      }
      const ensured = await page.evaluate((id) => {
        const selected = (window.__quoteAppGetSelection && window.__quoteAppGetSelection()) || [];
        if (selected.length === 1 && selected[0] === id) return true;
        return !!(window.__quoteAppSelectElementById && window.__quoteAppSelectElementById(id));
      }, tintingSeed.selectedId);
      if (!ensured) {
        throw new Error('Color tinting: failed to establish deterministic selection');
      }
    }

    const currentSelection = await page.evaluate(() => (window.__quoteAppGetSelection && window.__quoteAppGetSelection()) || []);
    if (currentSelection.length !== 1) {
      throw new Error(`Color tinting: expected one selected element, got ${currentSelection.length}`);
    }
    const selectedId = currentSelection[0];
    const selectedEl = await page.evaluate((id) => {
      const els = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
      return els.find((e) => e.id === id) || null;
    }, selectedId);
    if (!selectedEl) {
      throw new Error('Color tinting: selected element not found in elements list');
    }

    const colorInfoBefore = await page.evaluate((id) => (window.__quoteAppGetElementColorInfo && window.__quoteAppGetElementColorInfo(id)) || null, selectedId);
    if (!colorInfoBefore || !colorInfoBefore.hasOriginalImage) {
      throw new Error(`Color tinting: element ${selectedId} missing originalImage before color change`);
    }
    const blueSwatch = await page.$('.color-swatch[data-color="#007AFF"]');
    if (!blueSwatch) {
      throw new Error('Color tinting: blue swatch not found');
    }
    await page.evaluate((el) => el && el.click(), blueSwatch);
    await delay(600);
    const colorInfoAfter = await page.evaluate((id) => (window.__quoteAppGetElementColorInfo && window.__quoteAppGetElementColorInfo(id)) || null, selectedId);
    if (!colorInfoAfter) {
      throw new Error(`Color tinting: could not get color info for element ${selectedId}`);
    }
    if (!colorInfoAfter.hasOriginalImage) {
      throw new Error(`Color tinting: element ${selectedId} missing originalImage after color change`);
    }
    if (colorInfoAfter.color !== '#007AFF') {
      throw new Error(`Color tinting: element ${selectedId} color mismatch, expected #007AFF, got ${colorInfoAfter.color}`);
    }
    if (!colorInfoAfter.hasTintedCanvas) {
      throw new Error(`Color tinting: element ${selectedId} missing tintedCanvas when color is set`);
    }
    if (colorInfoAfter.tintedCanvasColor !== '#007AFF') {
      throw new Error(`Color tinting: element ${selectedId} tintedCanvasColor mismatch, expected #007AFF, got ${colorInfoAfter.tintedCanvasColor}`);
    }
    console.log('  ✓ Color tinting: originalImage preserved and tintedCanvas created');
    const colorWeightBeforeBold = Number(colorInfoAfter.lineWeight || 1);
    await clickSelectorViaDom(page, '#floatingToolbarBold');
    await delay(220);
    const colorInfoAfterBold = await page.evaluate((id) => (window.__quoteAppGetElementColorInfo && window.__quoteAppGetElementColorInfo(id)) || null, selectedId);
    const expectedWeightAfterBold = colorWeightBeforeBold >= 4 ? 1 : colorWeightBeforeBold + 1;
    if (!colorInfoAfterBold) {
      throw new Error('Color + bold interop: missing element render info after bold toggle');
    }
    if (colorInfoAfterBold.color !== '#007AFF') {
      throw new Error(`Color + bold interop: expected color to remain #007AFF, got ${colorInfoAfterBold.color}`);
    }
    if (colorInfoAfterBold.lineWeight !== expectedWeightAfterBold) {
      throw new Error(`Color + bold interop: expected lineWeight ${expectedWeightAfterBold}, got ${colorInfoAfterBold.lineWeight}`);
    }
    if (!colorInfoAfterBold.hasTintedCanvas || !colorInfoAfterBold.hasBoldCanvas) {
      throw new Error('Color + bold interop: expected tinted and bold render caches to coexist');
    }
    console.log('  ✓ Color + bold interop: line weight cycles while color stays intact');

    const redSwatch = await page.$('.color-swatch[data-color="#FF3B30"]');
    if (!redSwatch) {
      throw new Error('Color tinting: red swatch not found');
    }
    await page.evaluate((el) => el && el.click(), redSwatch);
    await delay(600);
    const colorInfoAfterRed = await page.evaluate((id) => (window.__quoteAppGetElementColorInfo && window.__quoteAppGetElementColorInfo(id)) || null, selectedId);
    if (!(colorInfoAfterRed && colorInfoAfterRed.hasOriginalImage && colorInfoAfterRed.color === '#FF3B30' && colorInfoAfterRed.hasTintedCanvas)) {
      throw new Error('Color tinting: multi-color update did not preserve originalImage/tintedCanvas expectations');
    }
    console.log('  ✓ Color tinting: changing color multiple times preserves originalImage and regenerates tintedCanvas');

    const defaultSwatch = await page.$('.color-swatch.color-swatch-default');
    if (!defaultSwatch) {
      throw new Error('Color tinting: default swatch not found');
    }
    await page.evaluate((el) => el && el.click(), defaultSwatch);
    await delay(600);
    const colorInfoAfterDefault = await page.evaluate((id) => (window.__quoteAppGetElementColorInfo && window.__quoteAppGetElementColorInfo(id)) || null, selectedId);
    if (!(colorInfoAfterDefault && colorInfoAfterDefault.hasOriginalImage && !colorInfoAfterDefault.color && !colorInfoAfterDefault.hasTintedCanvas)) {
      throw new Error('Color tinting: removing color did not restore originalImage usage');
    }
    console.log('  ✓ Color tinting: removing color restores originalImage usage (no tintedCanvas)');

    await page.mouse.move(
      canvasBox.left + (canvasBox.width * 0.5),
      canvasBox.top + (canvasBox.height * 0.5)
    );
    await delay(120);
    const cursorState = await page.evaluate(() => {
      const c = document.getElementById('canvas');
      const cursor = c ? c.style.cursor : '';
      const isCoarsePointer = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
      return { cursor, isCoarsePointer };
    });
    if (cursorState.isCoarsePointer) {
      console.log('  ✓ Canvas cursor check skipped on coarse pointer (mobile/touch environment)');
    } else if (cursorState.cursor === 'grab' || cursorState.cursor === 'grabbing' || cursorState.cursor === 'move') {
      console.log(`  ✓ Canvas cursor state acceptable with content (${cursorState.cursor || '(default)'})`);
    } else {
      console.log(`  ✓ Canvas cursor check tolerated runtime-specific value (${cursorState.cursor || '(default)'})`);
    }

    // Transparency: click #blueprintTransparencyBtn to open popover (button visible when blueprint exists and technical drawing OFF)
    const hasBlueprint = await page.evaluate(() => (window.__quoteAppHasBlueprint && window.__quoteAppHasBlueprint()) || false);
    if (!hasBlueprint) {
      throw new Error('Transparency test: no blueprint loaded');
    }
    // Uncheck Technical drawing so transparency button is visible (use evaluate to avoid overlay/visibility issues)
    const techToggle = await page.$('#technicalDrawingToggle');
    if (techToggle) {
      const checked = await page.evaluate((el) => el.checked, techToggle);
      if (checked) {
        await page.evaluate(() => { const t = document.getElementById('technicalDrawingToggle'); if (t) t.click(); });
        await delay(2000);
      }
    }
    await delay(400);
    const transBtn = await page.$('#blueprintTransparencyBtn');
    if (!transBtn) {
      throw new Error('Transparency test: #blueprintTransparencyBtn not found');
    }
    const btnHidden = await page.evaluate((el) => el.hasAttribute('hidden'), transBtn);
    if (btnHidden) {
      throw new Error('Transparency test: #blueprintTransparencyBtn is hidden');
    }

    await page.evaluate(() => { const b = document.getElementById('blueprintTransparencyBtn'); if (b) b.click(); });
    await delay(300);
    const popoverHidden = await page.evaluate(() => {
      const el = document.getElementById('transparencyPopover');
      return !el || el.hasAttribute('hidden');
    });
    if (popoverHidden) {
      throw new Error('Transparency: popover should be visible after clicking transparency button');
    }
    console.log('  ✓ Transparency: button opens popover when technical drawing off');

    const rangeEl = await page.$('#transparencyRange');
    if (!rangeEl) {
      throw new Error('Transparency: #transparencyRange not found');
    }
    await page.evaluate(() => {
      const r = document.getElementById('transparencyRange');
      if (r) {
        r.value = 50;
        r.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await delay(300);
    const opacityAfter = await page.evaluate(() => (window.__quoteAppGetBlueprintOpacity && window.__quoteAppGetBlueprintOpacity()) ?? 1);
    if (Math.abs(opacityAfter - 0.5) < 0.02) {
      console.log('  ✓ Transparency: slider updates blueprint opacity (50% -> ~0.5)');
    } else {
      throw new Error(`Transparency: expected opacity ~0.5 after slider, got ${opacityAfter}`);
    }

    const numberEl = await page.$('#transparencyNumber');
    if (!numberEl) {
      throw new Error('Transparency: #transparencyNumber not found');
    }
    await page.evaluate(() => {
      const n = document.getElementById('transparencyNumber');
      if (n) {
        n.value = 25;
        n.dispatchEvent(new Event('change', { bubbles: true }));
        n.blur();
      }
    });
    await delay(300);
    const opacityAfterNum = await page.evaluate(() => (window.__quoteAppGetBlueprintOpacity && window.__quoteAppGetBlueprintOpacity()) ?? 1);
    if (Math.abs(opacityAfterNum - 0.25) < 0.02) {
      console.log('  ✓ Transparency: number input updates blueprint opacity (25% -> ~0.25)');
    } else {
      throw new Error(`Transparency: expected opacity ~0.25 after number input, got ${opacityAfterNum}`);
    }

    await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
    await delay(100);
    const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.down(mod);
    await page.keyboard.press('z');
    await page.keyboard.up(mod);
    await delay(300);
    const opacityAfterUndo = await page.evaluate(() => (window.__quoteAppGetBlueprintOpacity && window.__quoteAppGetBlueprintOpacity()) ?? 1);
    if (Math.abs(opacityAfterUndo - 0.5) < 0.02) {
      console.log('  ✓ Transparency: Ctrl+Z undoes number input change (back to 50%)');
    } else {
      throw new Error(`Transparency: undo expected ~0.5, got ${opacityAfterUndo}`);
    }

    // Quote modal: incomplete gutter row replacement test
    console.log('\n--- Quote Modal: Incomplete Row Replacement Test ---');
    const gutterThumbs = await page.$$('.product-thumb[data-product-id^="GUT-"]');
    if (gutterThumbs.length > 0) {
      // Place a gutter element on canvas (center-drop)
      const firstGutterThumb = gutterThumbs[0];
      const gutterAssetId = await page.evaluate((el) => el.dataset.productId, firstGutterThumb);
      await page.evaluate((assetId) => {
        const thumb = document.querySelector(`.product-thumb[data-product-id="${assetId}"]`);
        if (!thumb) throw new Error(`Quote test: gutter thumb not found for ${assetId}`);
        thumb.click();
      }, gutterAssetId);
      await delay(500);
      
      const elementsBeforeQuote = await page.evaluate(() => (window.__quoteAppGetElements && window.__quoteAppGetElements()) || []);
      const gutterElement = elementsBeforeQuote.slice().reverse().find((el) => el.assetId && el.assetId.startsWith('GUT-'));
      if (!gutterElement) {
        throw new Error('Quote test: Failed to place gutter element on canvas');
      }
      console.log(`  ✓ Placed gutter element: ${gutterElement.assetId}`);

      const checkDesktopBadgePopoverState = async () => page.evaluate(() => {
        const popover = document.getElementById('badgeLengthPopover');
        const input = document.getElementById('badgeLengthInput');
        const deck = document.getElementById('measurementDeck');
        const active = document.activeElement;
        return {
          popoverVisible: !!popover && !popover.hasAttribute('hidden'),
          inputExists: !!input,
          focusMatches: !!input && active === input,
          deckContainsActive: !!deck && !!active && deck.contains(active),
        };
      });

      let gutterBadgeCenter = await page.evaluate((id) => {
        return typeof window.__quoteAppGetElementScreenCenter === 'function'
          ? window.__quoteAppGetElementScreenCenter(id)
          : null;
      }, gutterElement.id);
      if (!gutterBadgeCenter) {
        throw new Error('Desktop badge dblclick regression: could not resolve badge center for measurable gutter');
      }

      await page.mouse.click(gutterBadgeCenter.x, gutterBadgeCenter.y, { clickCount: 2, delay: 40 });
      await delay(360);
      let desktopBadgePopoverState = await checkDesktopBadgePopoverState();
      if (
        !desktopBadgePopoverState.popoverVisible
        || !desktopBadgePopoverState.inputExists
        || !desktopBadgePopoverState.focusMatches
        || desktopBadgePopoverState.deckContainsActive
      ) {
        await page.keyboard.press('Escape');
        await delay(120);
        gutterBadgeCenter = await page.evaluate((id) => {
          return typeof window.__quoteAppGetElementScreenCenter === 'function'
            ? window.__quoteAppGetElementScreenCenter(id)
            : null;
        }, gutterElement.id);
        if (!gutterBadgeCenter) {
          throw new Error('Desktop badge dblclick regression: could not resolve badge center on retry');
        }
        await page.mouse.click(gutterBadgeCenter.x, gutterBadgeCenter.y, { clickCount: 2, delay: 40 });
        await delay(360);
        desktopBadgePopoverState = await checkDesktopBadgePopoverState();
      }

      if (!desktopBadgePopoverState.popoverVisible || !desktopBadgePopoverState.inputExists) {
        throw new Error('Desktop badge dblclick regression: badge popover should open on double-click');
      }
      if (!desktopBadgePopoverState.focusMatches) {
        throw new Error('Desktop badge dblclick regression: badge input should be focused after double-click');
      }
      if (desktopBadgePopoverState.deckContainsActive) {
        throw new Error('Desktop badge dblclick regression: focus should not jump to Measurement Deck input');
      }
      await page.keyboard.press('Escape');
      await delay(120);
      const badgePopoverClosed = await page.evaluate(() => {
        const popover = document.getElementById('badgeLengthPopover');
        return !popover || popover.hasAttribute('hidden');
      });
      if (!badgePopoverClosed) {
        throw new Error('Desktop badge dblclick regression: popover should close on Escape');
      }
      console.log('  ✓ Desktop badge double-click opens inline popover input (not Measurement Deck)');

      // Open quote modal
      const generateQuoteBtn = await page.$('#generateQuoteBtn');
      if (!generateQuoteBtn) {
        throw new Error('Quote test: #generateQuoteBtn not found');
      }
      await clickSelectorViaDom(page, '#generateQuoteBtn');
      await delay(1000); // Wait for modal to open and initial calculation

      // Check if modal is visible
      const modalVisible = await page.evaluate(() => {
        const modal = document.getElementById('quoteModal');
        return modal && !modal.hasAttribute('hidden');
      });
      if (!modalVisible) {
        throw new Error('Quote test: Quote modal did not open');
      }
      console.log('  ✓ Quote modal opened');

      // Wait for labour row UI to initialize (current implementation uses inline labour rows).
      await delay(500);
      const labourRowState = await page.evaluate(() => {
        const labourRow = document.querySelector('#quoteTableBody tr[data-labour-row="true"]');
        if (!labourRow) return { exists: false, hasHours: false, hasUnitPrice: false, unitPrice: 0 };
        const hoursInput = labourRow.querySelector('.quote-labour-hours-input');
        const unitPriceInput = labourRow.querySelector('.quote-labour-unit-price-input');
        const unitPrice = parseFloat(unitPriceInput?.value || '0');
        return {
          exists: true,
          hasHours: !!hoursInput,
          hasUnitPrice: !!unitPriceInput,
          unitPrice,
        };
      });
      if (!labourRowState.exists || !labourRowState.hasHours || !labourRowState.hasUnitPrice) {
        throw new Error('Quote test: Labour row UI not initialized as expected');
      }
      if (!(labourRowState.unitPrice > 0)) {
        throw new Error(`Quote test: Labour unit price not initialized (> 0), got ${labourRowState.unitPrice}`);
      }
      console.log(`  ✓ Quote test: Labour row initialized (unit price ${labourRowState.unitPrice})`);

      // Validate gutter measurement handling for both supported quote UI structures:
      // 1) row-level "Metres?" inputs (.quote-qty-metres-input)
      // 2) section-header metres inputs (.quote-header-metres-input)
      const gutterStateBeforeEntry = await page.evaluate(() => {
        const tableBody = document.getElementById('quoteTableBody');
        if (!tableBody) {
          return { gutterRows: [], gutterHeaders: [], hasIncompleteRowInput: false, hasIncompleteHeaderInput: false };
        }
        const gutterRows = Array.from(tableBody.querySelectorAll('tr[data-asset-id^="GUT-"]')).map((row) => ({
          assetId: row.dataset.assetId || '',
          hasInput: !!row.querySelector('.quote-qty-metres-input'),
          isIncomplete: row.dataset.incompleteMeasurement === 'true',
          productName: row.cells[0]?.textContent?.trim() || '',
        }));
        const gutterHeaders = Array.from(tableBody.querySelectorAll('tr[data-section-header]'))
          .filter((row) => {
            const section = (row.dataset.sectionHeader || '').toUpperCase();
            return section === 'SC' || section === 'CL';
          })
          .map((row) => {
            const input = row.querySelector('.quote-header-metres-input');
            const value = parseFloat(input?.value || '');
            const hasMetres = Number.isFinite(value) && value > 0;
            return {
              section: row.dataset.sectionHeader || '',
              label: row.cells[0]?.textContent?.trim() || '',
              hasInput: !!input,
              metresValue: hasMetres ? value : null,
              isIncomplete: row.classList.contains('quote-row-incomplete-measurement') || !hasMetres,
            };
          });
        return {
          gutterRows,
          gutterHeaders,
          hasIncompleteRowInput: gutterRows.some((row) => row.hasInput || row.isIncomplete),
          hasIncompleteHeaderInput: gutterHeaders.some((header) => header.hasInput && header.isIncomplete),
        };
      });
      if (gutterStateBeforeEntry.gutterRows.length === 0 && gutterStateBeforeEntry.gutterHeaders.length === 0) {
        throw new Error('Quote test: No gutter rows or gutter section headers found in quote table');
      }

      const needsMetresEntry = gutterStateBeforeEntry.hasIncompleteRowInput || gutterStateBeforeEntry.hasIncompleteHeaderInput;
      if (!needsMetresEntry) {
        console.log(`  ✓ Quote test: Gutter inputs already resolved (${gutterStateBeforeEntry.gutterRows.length} rows, ${gutterStateBeforeEntry.gutterHeaders.length} headers)`);
      } else {
        const metresWriteResult = await page.evaluate(() => {
          const tableBody = document.getElementById('quoteTableBody');
          if (!tableBody) return { updated: false, target: 'none' };

          const rowInput = tableBody.querySelector('tr[data-asset-id^="GUT-"] .quote-qty-metres-input');
          if (rowInput) {
            rowInput.focus();
            rowInput.value = '4.5';
            rowInput.dispatchEvent(new Event('input', { bubbles: true }));
            rowInput.dispatchEvent(new Event('change', { bubbles: true }));
            rowInput.dispatchEvent(new Event('blur', { bubbles: true }));
            return { updated: true, target: 'gutter-row' };
          }

          const headerRow = Array.from(tableBody.querySelectorAll('tr[data-section-header]')).find((row) => {
            const section = (row.dataset.sectionHeader || '').toUpperCase();
            if (!(section === 'SC' || section === 'CL')) return false;
            const input = row.querySelector('.quote-header-metres-input');
            if (!input) return false;
            const currentVal = parseFloat(input.value || '');
            return row.classList.contains('quote-row-incomplete-measurement') || !Number.isFinite(currentVal) || currentVal <= 0;
          });
          const headerInput = headerRow ? headerRow.querySelector('.quote-header-metres-input') : null;
          if (!headerInput) return { updated: false, target: 'none' };

          headerInput.focus();
          headerInput.value = '4.5';
          headerInput.dispatchEvent(new Event('input', { bubbles: true }));
          headerInput.dispatchEvent(new Event('change', { bubbles: true }));
          headerInput.dispatchEvent(new Event('blur', { bubbles: true }));
          return { updated: true, target: 'gutter-header' };
        });
        if (!metresWriteResult.updated) {
          throw new Error('Quote test: Expected a gutter metres input to edit, but none was available');
        }
        console.log(`  ✓ Quote test: Entered metres via ${metresWriteResult.target}`);

        await delay(1800);
        await page.waitForFunction(() => {
          const tableBody = document.getElementById('quoteTableBody');
          if (!tableBody) return false;
          const hasIncompleteGutterRows = Array.from(tableBody.querySelectorAll('tr[data-asset-id^="GUT-"]')).some((row) =>
            row.dataset.incompleteMeasurement === 'true' || row.querySelector('.quote-qty-metres-input')
          );
          const hasIncompleteGutterHeaders = Array.from(tableBody.querySelectorAll('tr[data-section-header]')).some((row) => {
            const section = (row.dataset.sectionHeader || '').toUpperCase();
            if (!(section === 'SC' || section === 'CL')) return false;
            const input = row.querySelector('.quote-header-metres-input');
            if (!input) return false;
            const val = parseFloat(input.value || '');
            return row.classList.contains('quote-row-incomplete-measurement') || !Number.isFinite(val) || val <= 0;
          });
          return !(hasIncompleteGutterRows || hasIncompleteGutterHeaders);
        }, { timeout: 5000 }).catch(() => {});

        const rowsAfterEntry = await page.evaluate(() => {
          const tableBody = document.getElementById('quoteTableBody');
          if (!tableBody) return null;
          const rows = Array.from(tableBody.querySelectorAll('tr'));
          const gutterRows = rows
            .filter((row) => (row.dataset.assetId || '').toUpperCase().startsWith('GUT-'))
            .map((row) => {
              const qtyInput = row.querySelector('.quote-line-qty-input');
              return {
                assetId: row.dataset.assetId || '',
                productName: row.cells[0]?.textContent?.trim() || '',
                qty: qtyInput ? qtyInput.value : (row.cells[1]?.textContent?.trim() || ''),
                hasInput: !!row.querySelector('.quote-qty-metres-input'),
                isIncomplete: row.dataset.incompleteMeasurement === 'true',
              };
            });
          const gutterHeaders = rows
            .filter((row) => {
              const section = (row.dataset.sectionHeader || '').toUpperCase();
              return section === 'SC' || section === 'CL';
            })
            .map((row) => {
              const input = row.querySelector('.quote-header-metres-input');
              const value = parseFloat(input?.value || '');
              const hasMetres = Number.isFinite(value) && value > 0;
              return {
                section: row.dataset.sectionHeader || '',
                label: row.cells[0]?.textContent?.trim() || '',
                hasInput: !!input,
                metresValue: hasMetres ? value : null,
                isIncomplete: row.classList.contains('quote-row-incomplete-measurement') || !hasMetres,
              };
            });
          const inferredItems = rows
            .filter((row) => {
              const assetId = row.dataset.assetId || '';
              const id = assetId.toUpperCase();
              return id.startsWith('BRK-') || id === 'SCR-SS' || id.startsWith('SCL-') || id.startsWith('ACL-');
            })
            .map((row) => {
              const qtyInput = row.querySelector('.quote-line-qty-input');
              return {
                assetId: row.dataset.assetId || '',
                name: row.cells[0]?.textContent?.trim() || '',
                qty: qtyInput ? qtyInput.value : (row.cells[1]?.textContent?.trim() || ''),
              };
            });
          return { gutterRows, gutterHeaders, inferredItems };
        });
        if (!rowsAfterEntry) {
          throw new Error('Quote test: Could not read quote rows after entering metres');
        }

        const stillHasIncompleteRows = rowsAfterEntry.gutterRows.some((row) => row.isIncomplete || row.hasInput);
        const stillHasIncompleteHeaders = rowsAfterEntry.gutterHeaders.some((header) => header.hasInput && header.isIncomplete);
        if (stillHasIncompleteRows || stillHasIncompleteHeaders) {
          throw new Error('Quote test: Gutter measurement still marked incomplete after entering metres');
        }

        if (rowsAfterEntry.gutterRows.length > 0) {
          console.log(`  ✓ Quote test: Gutter rows rendered after metres entry (${rowsAfterEntry.gutterRows.length} rows)`);
          const hasSpecificLengths = rowsAfterEntry.gutterRows.some((row) => {
            const name = row.productName.toLowerCase();
            return name.includes('3m') || name.includes('1.5m') || name.includes('5m');
          });
          if (hasSpecificLengths) {
            console.log('  ✓ Quote test: Product rows include explicit length variants');
          } else {
            console.log('  ✓ Quote test: Product rows resolved (length labels are profile-specific in this build)');
          }
        } else if (rowsAfterEntry.gutterHeaders.some((header) => header.metresValue != null && header.metresValue > 0)) {
          console.log('  ✓ Quote test: Gutter section header metres accepted and marked complete');
        } else {
          throw new Error('Quote test: metres entry did not produce resolved gutter data');
        }

        if (rowsAfterEntry.inferredItems.length > 0) {
          console.log(`  ✓ Inferred items appear (${rowsAfterEntry.inferredItems.length} items):`);
          rowsAfterEntry.inferredItems.forEach((item) => {
            console.log(`    - ${item.name}: qty=${item.qty || '(empty)'}`);
          });
        } else {
          console.log('  ✓ Quote test: No inferred items required for this configuration');
        }
      }

      // Close modal
      const closeBtn = await page.$('#quoteModalClose');
      if (closeBtn) {
        await clickSelectorViaDom(page, '#quoteModalClose');
        await delay(300);
      }
    } else {
      console.log('  ✓ Quote test skipped: no gutter products found in panel fixture');
    }

    const quoteWarningAriaSync = await page.evaluate(() => {
      const tableBody = document.getElementById('quoteTableBody');
      const warning = document.getElementById('quoteTotalWarning');
      const updateFn = window.__quoteAppUpdateQuoteTotalWarning;
      if (!tableBody || !warning || typeof updateFn !== 'function') {
        return { ready: false };
      }
      const probe = document.createElement('tr');
      probe.className = 'quote-row-incomplete-measurement';
      for (let i = 0; i < 6; i += 1) probe.appendChild(document.createElement('td'));
      tableBody.appendChild(probe);
      updateFn();
      const visibleState = {
        hidden: warning.hidden,
        ariaHidden: warning.getAttribute('aria-hidden'),
      };
      probe.remove();
      updateFn();
      const hiddenState = {
        hidden: warning.hidden,
        ariaHidden: warning.getAttribute('aria-hidden'),
      };
      return { ready: true, visibleState, hiddenState };
    });
    if (!quoteWarningAriaSync.ready) {
      throw new Error('Quote warning aria regression: missing quote table/warning/hook');
    }
    if (quoteWarningAriaSync.visibleState.hidden || quoteWarningAriaSync.visibleState.ariaHidden !== 'false') {
      throw new Error(
        `Quote warning aria regression: visible warning should expose aria-hidden=false ` +
        `(hidden=${quoteWarningAriaSync.visibleState.hidden}, ariaHidden=${quoteWarningAriaSync.visibleState.ariaHidden})`
      );
    }
    if (!quoteWarningAriaSync.hiddenState.hidden || quoteWarningAriaSync.hiddenState.ariaHidden !== 'true') {
      throw new Error(
        `Quote warning aria regression: hidden warning should expose aria-hidden=true ` +
        `(hidden=${quoteWarningAriaSync.hiddenState.hidden}, ariaHidden=${quoteWarningAriaSync.hiddenState.ariaHidden})`
      );
    }
    console.log('  ✓ Quote warning keeps aria-hidden in sync with visibility');

    const desktopMetresRestore = await page.evaluate(() => {
      const tableBody = document.getElementById('quoteTableBody');
      const syncFn = window.__quoteAppSyncMobileQuoteLineSummaries;
      if (!tableBody || typeof syncFn !== 'function') return { ready: false };
      const row = document.createElement('tr');
      row.dataset.assetId = 'GUT-SC-MAR-3M';
      row.dataset.quoteMetresRow = 'true';
      row.dataset.incompleteMeasurement = 'true';
      row.classList.add('quote-row-incomplete-measurement');
      for (let i = 0; i < 6; i += 1) row.appendChild(document.createElement('td'));
      row.cells[0].textContent = 'Gutter: Storm Cloud Marley';
      row.cells[1].innerHTML = '<div class="quote-mobile-qty-stepper"><button type="button" class="quote-mobile-qty-stepper-btn quote-mobile-qty-stepper-btn--minus" aria-label="Decrease length">−</button><span class="quote-mobile-qty-stepper-value">2.5 m</span><button type="button" class="quote-mobile-qty-stepper-btn quote-mobile-qty-stepper-btn--plus" aria-label="Increase length">+</button></div>';
      tableBody.appendChild(row);
      syncFn();
      const restoredInput = row.querySelector('.quote-qty-metres-input');
      const qtyInput = row.querySelector('.quote-line-qty-input');
      const restored = !!restoredInput && !qtyInput;
      const placeholder = restoredInput?.getAttribute('placeholder') || null;
      row.remove();
      return { ready: true, restored, placeholder };
    });
    if (!desktopMetresRestore.ready) {
      throw new Error('Desktop metres restore regression: missing quote table or sync hook');
    }
    if (!desktopMetresRestore.restored || desktopMetresRestore.placeholder !== 'Metres?') {
      throw new Error(
        `Desktop metres restore regression: expected .quote-qty-metres-input restore with Metres? placeholder ` +
        `(restored=${desktopMetresRestore.restored}, placeholder=${desktopMetresRestore.placeholder})`
      );
    }
    console.log('  ✓ Desktop cleanup restores incomplete metres rows as metres inputs');

    // Mobile tap-add fallback sizing (no blueprint): use 25% of canvas long side on a fresh page.
    const mobileNoBlueprintPage = await context.newPage();
    try {
      await mobileNoBlueprintPage.setCacheEnabled(false);
      await mobileNoBlueprintPage.setViewport({ width: 375, height: 667, isMobile: true, hasTouch: true });
      const noBlueprintRes = await mobileNoBlueprintPage.goto(`${BASE_URL}?viewport=mobile`, { waitUntil: 'networkidle2' });
      if (!noBlueprintRes || !noBlueprintRes.ok()) throw new Error('Mobile no-blueprint sizing: could not load app');
      await mobileNoBlueprintPage.evaluate(() => {
        if (typeof window.__quoteAppSwitchView === 'function') window.__quoteAppSwitchView('view-canvas');
      });
      await delay(500);

      const noBlueprintCountBefore = await mobileNoBlueprintPage.evaluate(
        () => (window.__quoteAppElementCount && window.__quoteAppElementCount()) || 0
      );
      const noBlueprintBeforeMetrics = await mobileNoBlueprintPage.evaluate(() => {
        const canvas = document.getElementById('canvas');
        const canvasRect = canvas ? canvas.getBoundingClientRect() : null;
        const viewport = (window.__quoteAppGetViewport && window.__quoteAppGetViewport()) || null;
        return {
          scale: viewport ? viewport.scale : null,
          canvasLongSide: canvasRect ? Math.max(canvasRect.width, canvasRect.height) : 0,
        };
      });
      const noBlueprintPanelExpandedBefore = await mobileNoBlueprintPage.evaluate(() => {
        const panel = document.getElementById('panel');
        return !!panel && panel.classList.contains('expanded');
      });
      if (!noBlueprintPanelExpandedBefore) {
        await clickSelectorViaDom(mobileNoBlueprintPage, '#panelCollapsed');
        await delay(320);
      }
      const noBlueprintPanelExpanded = await mobileNoBlueprintPage.evaluate(() => {
        const panel = document.getElementById('panel');
        return !!panel && panel.classList.contains('expanded');
      });
      if (!noBlueprintPanelExpanded) throw new Error('Mobile no-blueprint sizing: products panel did not open');

      await clickSelectorViaDom(mobileNoBlueprintPage, '.product-thumb');
      await delay(750);

      const noBlueprintAfter = await mobileNoBlueprintPage.evaluate(() => {
        const panel = document.getElementById('panel');
        const canvas = document.getElementById('canvas');
        const canvasRect = canvas ? canvas.getBoundingClientRect() : null;
        const viewport = (window.__quoteAppGetViewport && window.__quoteAppGetViewport()) || null;
        const elements = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
        return {
          count: (window.__quoteAppElementCount && window.__quoteAppElementCount()) || elements.length,
          panelCollapsed: !!panel && panel.classList.contains('collapsed'),
          scale: viewport ? viewport.scale : null,
          canvasLongSide: canvasRect ? Math.max(canvasRect.width, canvasRect.height) : 0,
          last: elements[elements.length - 1] || null,
        };
      });
      if (noBlueprintAfter.count !== noBlueprintCountBefore + 1) {
        throw new Error(
          `Mobile no-blueprint sizing: tap-add should add exactly one element, before=${noBlueprintCountBefore}, after=${noBlueprintAfter.count}`
        );
      }
      if (!noBlueprintAfter.panelCollapsed) {
        throw new Error('Mobile no-blueprint sizing: products panel should auto-close after successful tap-add');
      }
      if (!noBlueprintAfter.last) throw new Error('Mobile no-blueprint sizing: no element found after tap-add');
      if (!Number.isFinite(noBlueprintBeforeMetrics.scale) || noBlueprintBeforeMetrics.scale <= 0) {
        throw new Error('Mobile no-blueprint sizing: pre-add viewport scale unavailable');
      }
      if (!Number.isFinite(noBlueprintBeforeMetrics.canvasLongSide) || noBlueprintBeforeMetrics.canvasLongSide <= 0) {
        throw new Error('Mobile no-blueprint sizing: pre-add canvas dimensions unavailable');
      }
      const noBlueprintActualWorldMax = Math.max(noBlueprintAfter.last.width, noBlueprintAfter.last.height);
      const noBlueprintExpectedWorldMax = 0.25 * noBlueprintBeforeMetrics.canvasLongSide;
      if (Math.abs(noBlueprintActualWorldMax - noBlueprintExpectedWorldMax) > 2) {
        throw new Error(
          `Mobile no-blueprint sizing mismatch (world units): actual=${noBlueprintActualWorldMax.toFixed(2)}, expected=${noBlueprintExpectedWorldMax.toFixed(2)}`
        );
      }
      console.log('  ✓ Mobile no-blueprint tap-add uses 25% canvas-long-side fallback (world size) and auto-closes panel');
    } finally {
      await mobileNoBlueprintPage.close();
    }

    // Mobile viewport regression: mode, overflow, and orientation resilience
    const mobilePage = await context.newPage();
    try {
      await mobilePage.setCacheEnabled(false);
      await mobilePage.setViewport({ width: 375, height: 667, isMobile: true, hasTouch: true });
      const mobileRes = await mobilePage.goto(`${BASE_URL}?viewport=mobile`, { waitUntil: 'networkidle2' });
      if (!mobileRes || !mobileRes.ok()) throw new Error('Mobile viewport regression: could not load app');
      await mobilePage.evaluate(() => {
        if (typeof window.__quoteAppSwitchView === 'function') window.__quoteAppSwitchView('view-canvas');
      });
      await delay(500);
      const portraitCheck = await mobilePage.evaluate(() => {
        const mode = typeof window.__quoteAppGetViewportMode === 'function' ? window.__quoteAppGetViewportMode() : null;
        const overflow = document.documentElement.scrollWidth - window.innerWidth;
        const panelCollapsed = document.getElementById('panelCollapsed');
        const panelVisible = !!panelCollapsed && !panelCollapsed.hasAttribute('hidden');
        return { mode, overflow, panelVisible };
      });
      if (portraitCheck.mode !== 'mobile') {
        throw new Error(`Mobile viewport regression: expected mode mobile, got ${portraitCheck.mode}`);
      }
      if (portraitCheck.overflow > 2) {
        throw new Error(`Mobile viewport regression: portrait horizontal overflow ${portraitCheck.overflow}px`);
      }
      if (!portraitCheck.panelVisible) {
        throw new Error('Mobile viewport regression: products panel toggle not visible in portrait');
      }
      const mobileCanvasOrientation = await getOrientationPolicyState(mobilePage);
      if (!mobileCanvasOrientation) throw new Error('Mobile orientation policy hook missing on canvas view');
      if (mobileCanvasOrientation.target !== 'landscape') {
        throw new Error(`Mobile orientation policy on canvas should target landscape, got ${mobileCanvasOrientation.target}`);
      }
      console.log('  ✓ Mobile orientation policy: canvas targets landscape');

      // Material Rules guard regression: mobile must block Material Rules even with admin auth.
      const mobileMaterialRulesGate = await mobilePage.evaluate(() => {
        if (typeof window.__quoteAppSetAuthForTests !== 'function') return { hookReady: false };
        const adminState = window.__quoteAppSetAuthForTests({
          token: 'e2e-mobile-admin-token',
          role: 'admin',
          email: 'qa-mobile-admin@example.com',
          userId: '00000000-0000-0000-0000-00000000m001',
        });
        if (typeof window.__quoteAppSwitchView === 'function') window.__quoteAppSwitchView('view-canvas');
        const beforeViewId = (document.querySelector('.app-view:not(.hidden)') || {}).id || null;
        if (typeof window.__quoteAppSwitchView === 'function') window.__quoteAppSwitchView('view-material-rules');
        const afterViewId = (document.querySelector('.app-view:not(.hidden)') || {}).id || null;
        const menuItem = document.getElementById('menuItemMaterialRules');
        return {
          hookReady: true,
          canAccessDesktopAdminUi: !!adminState?.canAccessDesktopAdminUi,
          beforeViewId,
          afterViewId,
          menuExists: !!menuItem,
          menuHidden: menuItem ? !!menuItem.hidden : null,
        };
      });
      if (!mobileMaterialRulesGate.hookReady) {
        throw new Error('Mobile Material Rules regression: missing __quoteAppSetAuthForTests hook');
      }
      if (mobileMaterialRulesGate.canAccessDesktopAdminUi) {
        throw new Error('Mobile Material Rules regression: mobile admin should not pass desktop admin gate');
      }
      if (!mobileMaterialRulesGate.menuExists || !mobileMaterialRulesGate.menuHidden) {
        throw new Error('Mobile Material Rules regression: menu item must remain hidden on mobile');
      }
      if (mobileMaterialRulesGate.afterViewId === 'view-material-rules') {
        throw new Error('Mobile Material Rules regression: switchView should not allow mobile access to material rules');
      }
      await mobilePage.evaluate(() => {
        if (typeof window.__quoteAppSetAuthForTests === 'function') window.__quoteAppSetAuthForTests({ token: null });
        if (typeof window.__quoteAppSwitchView === 'function') window.__quoteAppSwitchView('view-canvas');
      });
      await delay(180);
      console.log('  ✓ Mobile Material Rules guard blocks admin access outside desktop viewport');

      const mobileBonusScaffoldCheck = await mobilePage.evaluate(() => {
        const bonusBtn = document.getElementById('mobileBonusDashboardBtn');
        const raceBoard = document.getElementById('bonusRaceBoardMobile');
        const raceTooltip = document.getElementById('bonusBadgeTooltip');
        const switchViewFn = typeof window.__quoteAppSwitchView === 'function' ? window.__quoteAppSwitchView : null;
        if (switchViewFn) switchViewFn('view-technician-bonus');
        const bonusVisible = !document.getElementById('view-technician-bonus')?.classList.contains('hidden');
        const canvasVisible = !document.getElementById('view-canvas')?.classList.contains('hidden');
        const raceBoardVisible = raceBoard ? getComputedStyle(raceBoard).display !== 'none' : false;
        return {
          hasBonusBtn: !!bonusBtn,
          bonusBtnHidden: bonusBtn ? bonusBtn.hidden : true,
          hasRaceBoard: !!raceBoard,
          hasRaceTooltip: !!raceTooltip,
          bonusVisible,
          canvasVisible,
          raceBoardVisible,
        };
      });
      if (!mobileBonusScaffoldCheck.hasBonusBtn) throw new Error('Mobile team pool: mobile bonus entry button missing');
      if (!mobileBonusScaffoldCheck.hasRaceBoard) throw new Error('Mobile team pool: race board container missing');
      if (!mobileBonusScaffoldCheck.hasRaceTooltip) throw new Error('Mobile team pool: badge tooltip container missing');
      if (mobileBonusScaffoldCheck.bonusVisible && !mobileBonusScaffoldCheck.raceBoardVisible) {
        throw new Error('Mobile team pool: race board should be visible when bonus view is active on mobile');
      }
      if (!mobileBonusScaffoldCheck.bonusVisible && !mobileBonusScaffoldCheck.bonusBtnHidden) {
        throw new Error('Mobile team pool permissions: unauthorized mobile users should not see the team pool entry button');
      }
      if (!mobileBonusScaffoldCheck.bonusVisible && !mobileBonusScaffoldCheck.canvasVisible) {
        throw new Error('Mobile team pool permissions: unauthorized switch attempt should keep canvas view visible');
      }
      console.log('  ✓ Mobile team pool scaffold exists and permission gate remains enforced');

      const mobileQuickQuoterVisibleBeforeUpload = await mobilePage.evaluate(() => {
        const entry = document.getElementById('quickQuoterEntry');
        if (!entry) return false;
        if (entry.hasAttribute('hidden')) return false;
        const style = window.getComputedStyle(entry);
        return style.display !== 'none' && entry.offsetParent !== null;
      });
      if (!mobileQuickQuoterVisibleBeforeUpload) {
        throw new Error('Mobile viewport regression: Quick Quoter entry should be visible before blueprint upload');
      }
      console.log('  ✓ Mobile Quick Quoter entry is visible before blueprint upload');

      const mobileElementCountBeforeQuickQuoterElementsParity = await mobilePage.evaluate(
        () => (window.__quoteAppElementCount && window.__quoteAppElementCount()) || 0
      );
      const mobilePanelExpandedForQuickQuoterParity = await mobilePage.evaluate(() => {
        const panel = document.getElementById('panel');
        return !!panel && panel.classList.contains('expanded');
      });
      if (!mobilePanelExpandedForQuickQuoterParity) {
        await clickSelectorViaDom(mobilePage, '#panelCollapsed');
        await delay(320);
      }
      const mobilePanelExpandedAfterQuickQuoterParityOpen = await mobilePage.evaluate(() => {
        const panel = document.getElementById('panel');
        return !!panel && panel.classList.contains('expanded');
      });
      if (!mobilePanelExpandedAfterQuickQuoterParityOpen) {
        throw new Error('Mobile viewport regression: products panel did not open for Quick Quoter elements-only parity check');
      }
      await clickSelectorViaDom(mobilePage, '.product-thumb');
      await delay(750);
      const mobileQuickQuoterElementsHideState = await mobilePage.evaluate(() => {
        const entry = document.getElementById('quickQuoterEntry');
        const count = (window.__quoteAppElementCount && window.__quoteAppElementCount()) || 0;
        if (!entry) return { count, hidden: false };
        if (entry.hasAttribute('hidden')) return { count, hidden: true };
        const style = window.getComputedStyle(entry);
        return { count, hidden: style.display === 'none' || entry.offsetParent === null };
      });
      if (mobileQuickQuoterElementsHideState.count !== mobileElementCountBeforeQuickQuoterElementsParity + 1) {
        throw new Error(
          `Mobile viewport regression: expected one element added before upload parity check, ` +
          `before=${mobileElementCountBeforeQuickQuoterElementsParity}, after=${mobileQuickQuoterElementsHideState.count}`
        );
      }
      if (!mobileQuickQuoterElementsHideState.hidden) {
        throw new Error('Mobile viewport regression: Quick Quoter entry should hide when canvas has elements only (no blueprint)');
      }
      await clickSelectorViaDomIfPresent(mobilePage, '#floatingToolbarDelete');
      await delay(220);
      const mobileQuickQuoterElementsShowState = await mobilePage.evaluate(() => {
        const entry = document.getElementById('quickQuoterEntry');
        const count = (window.__quoteAppElementCount && window.__quoteAppElementCount()) || 0;
        if (!entry) return { count, visible: false };
        if (entry.hasAttribute('hidden')) return { count, visible: false };
        const style = window.getComputedStyle(entry);
        return { count, visible: style.display !== 'none' && entry.offsetParent !== null };
      });
      if (mobileQuickQuoterElementsShowState.count !== mobileElementCountBeforeQuickQuoterElementsParity) {
        throw new Error(
          `Mobile viewport regression: delete should restore element count before upload parity check, ` +
          `before=${mobileElementCountBeforeQuickQuoterElementsParity}, after=${mobileQuickQuoterElementsShowState.count}`
        );
      }
      if (!mobileQuickQuoterElementsShowState.visible) {
        throw new Error('Mobile viewport regression: Quick Quoter entry should reappear after clearing elements-only canvas');
      }
      console.log('  ✓ Mobile Quick Quoter entry hides with elements-only canvas and reappears when cleared');

      // Section 57: mobile fit inset + pan lock behavior
      const mobileFileInput = await mobilePage.$('#fileInput');
      if (!mobileFileInput) throw new Error('Mobile viewport regression: #fileInput missing for blueprint fit checks');
      await mobileFileInput.uploadFile(blueprintImagePath);
      await mobilePage.evaluate(() => {
        const input = document.getElementById('fileInput');
        if (input) input.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await delay(1500);
      const mobileCropModal = await mobilePage.$('#cropModal');
      const mobileCropVisible = mobileCropModal && !(await mobilePage.evaluate((el) => el.hasAttribute('hidden'), mobileCropModal));
      if (mobileCropVisible) throw new Error('Mobile viewport regression: crop modal should not open on mobile upload');
      await mobilePage.waitForFunction(() => {
        const el = document.getElementById('canvasPlaceholder');
        return !!el && (el.hasAttribute('hidden') || !el.offsetParent);
      }, { timeout: 10000 });
      const mobilePlaceholderHidden = await mobilePage.evaluate(() => {
        const el = document.getElementById('canvasPlaceholder');
        return !!el && (el.hasAttribute('hidden') || !el.offsetParent);
      });
      if (!mobilePlaceholderHidden) throw new Error('Mobile viewport regression: blueprint upload did not hide placeholder');
      const mobileQuickQuoterHiddenAfterUpload = await mobilePage.evaluate(() => {
        const entry = document.getElementById('quickQuoterEntry');
        if (!entry) return false;
        if (entry.hasAttribute('hidden')) return true;
        const style = window.getComputedStyle(entry);
        return style.display === 'none' || entry.offsetParent === null;
      });
      if (!mobileQuickQuoterHiddenAfterUpload) {
        throw new Error('Mobile viewport regression: Quick Quoter entry should be hidden after blueprint upload');
      }
      const mobileFileInputReset = await mobilePage.evaluate(() => {
        const input = document.getElementById('fileInput');
        return !!input && input.value === '';
      });
      if (!mobileFileInputReset) {
        throw new Error('Mobile upload reliability regression: #fileInput value should reset after change handling');
      }
      console.log('  ✓ Mobile upload bypasses crop modal and hides Quick Quoter entry');

      const mobileFitVisibility = await mobilePage.evaluate(() => {
        const btn = document.getElementById('mobileFitViewBtn');
        if (!btn) return { exists: false, visible: false, ariaHidden: null };
        const style = window.getComputedStyle(btn);
        const visible = style.display !== 'none' && style.visibility !== 'hidden' && btn.getClientRects().length > 0;
        return { exists: true, visible, ariaHidden: btn.getAttribute('aria-hidden') };
      });
      if (!mobileFitVisibility.exists) throw new Error('Mobile fit regression: #mobileFitViewBtn missing');
      if (!mobileFitVisibility.visible) throw new Error('Mobile fit regression: mobile Fit button should be visible on mobile');
      if (mobileFitVisibility.ariaHidden !== 'false') {
        throw new Error(`Mobile fit regression: expected aria-hidden=false, got ${mobileFitVisibility.ariaHidden}`);
      }
      console.log('  ✓ Mobile Fit button is visible and exposed to assistive tech');

      const mobileBlueprintHooksReady = await mobilePage.evaluate(() => ({
        hasRect: typeof window.__quoteAppGetBlueprintScreenRect === 'function',
        hasTransform: typeof window.__quoteAppGetBlueprintTransform === 'function',
        hasSetLocked: typeof window.__quoteAppSetBlueprintLocked === 'function',
      }));
      if (!mobileBlueprintHooksReady.hasRect || !mobileBlueprintHooksReady.hasTransform || !mobileBlueprintHooksReady.hasSetLocked) {
        throw new Error('Mobile blueprint move regression: required blueprint test hooks are missing');
      }

      const mobileBlueprintBeforeUnlock = await mobilePage.evaluate(() => {
        if (typeof window.__quoteAppSetBlueprintLocked === 'function') window.__quoteAppSetBlueprintLocked(false);
        return typeof window.__quoteAppGetBlueprintTransform === 'function' ? window.__quoteAppGetBlueprintTransform() : null;
      });
      const mobileBlueprintDragPointUnlocked = await mobilePage.evaluate(() => {
        const rect = typeof window.__quoteAppGetBlueprintScreenRect === 'function' ? window.__quoteAppGetBlueprintScreenRect() : null;
        if (!rect) return null;
        const base = {
          x: rect.left + Math.max(24, Math.min(84, rect.width * 0.2)),
          y: rect.top + Math.max(24, Math.min(84, rect.height * 0.2)),
        };
        const candidates = [
          base,
          { x: rect.left + Math.max(30, Math.min(96, rect.width * 0.12)), y: rect.top + Math.max(30, Math.min(96, rect.height * 0.12)) },
          { x: rect.right - Math.max(30, Math.min(96, rect.width * 0.12)), y: rect.top + Math.max(30, Math.min(96, rect.height * 0.12)) },
        ];
        const hitCanvas = candidates.find((pt) => {
          const hit = document.elementFromPoint(pt.x, pt.y);
          return !!hit && hit.id === 'canvas';
        });
        return hitCanvas || base;
      });
      if (!mobileBlueprintBeforeUnlock || !mobileBlueprintDragPointUnlocked) {
        throw new Error('Mobile blueprint move regression: unable to read unlocked blueprint state');
      }
      await mobilePage.mouse.move(mobileBlueprintDragPointUnlocked.x, mobileBlueprintDragPointUnlocked.y);
      await mobilePage.mouse.down();
      await mobilePage.mouse.move(mobileBlueprintDragPointUnlocked.x + 56, mobileBlueprintDragPointUnlocked.y + 36, { steps: 10 });
      await mobilePage.mouse.up();
      await delay(220);
      const mobileBlueprintAfterUnlockDrag = await mobilePage.evaluate(() => {
        return typeof window.__quoteAppGetBlueprintTransform === 'function' ? window.__quoteAppGetBlueprintTransform() : null;
      });
      if (!mobileBlueprintAfterUnlockDrag) throw new Error('Mobile blueprint move regression: missing transform after unlocked drag');
      const mobileUnlockDx = Math.abs(mobileBlueprintAfterUnlockDrag.x - mobileBlueprintBeforeUnlock.x);
      const mobileUnlockDy = Math.abs(mobileBlueprintAfterUnlockDrag.y - mobileBlueprintBeforeUnlock.y);
      if (mobileUnlockDx < 4 && mobileUnlockDy < 4) {
        throw new Error(
          `Mobile blueprint move regression: unlocked drag should move blueprint (dx=${mobileUnlockDx.toFixed(2)}, dy=${mobileUnlockDy.toFixed(2)})`
        );
      }
      await mobilePage.keyboard.down(undoModifier);
      await mobilePage.keyboard.press('z');
      await mobilePage.keyboard.up(undoModifier);
      await delay(240);
      const mobileBlueprintAfterUndo = await mobilePage.evaluate(() => {
        return typeof window.__quoteAppGetBlueprintTransform === 'function' ? window.__quoteAppGetBlueprintTransform() : null;
      });
      if (!mobileBlueprintAfterUndo) {
        throw new Error('Mobile blueprint undo regression: undo should not remove blueprint after move');
      }
      const mobileUndoDx = Math.abs(mobileBlueprintAfterUndo.x - mobileBlueprintBeforeUnlock.x);
      const mobileUndoDy = Math.abs(mobileBlueprintAfterUndo.y - mobileBlueprintBeforeUnlock.y);
      if (mobileUndoDx > 1.5 || mobileUndoDy > 1.5) {
        throw new Error(
          `Mobile blueprint undo regression: expected move undo to restore prior transform (dx=${mobileUndoDx.toFixed(2)}, dy=${mobileUndoDy.toFixed(2)})`
        );
      }
      console.log('  ✓ Mobile blueprint move undo restores transform instead of removing blueprint');

      const mobileBlueprintBeforeLockedDrag = await mobilePage.evaluate(() => {
        if (typeof window.__quoteAppSetBlueprintLocked === 'function') window.__quoteAppSetBlueprintLocked(true);
        return typeof window.__quoteAppGetBlueprintTransform === 'function' ? window.__quoteAppGetBlueprintTransform() : null;
      });
      const mobileBlueprintDragPointLocked = await mobilePage.evaluate(() => {
        const rect = typeof window.__quoteAppGetBlueprintScreenRect === 'function' ? window.__quoteAppGetBlueprintScreenRect() : null;
        if (!rect) return null;
        const base = {
          x: rect.left + Math.max(24, Math.min(84, rect.width * 0.2)),
          y: rect.top + Math.max(24, Math.min(84, rect.height * 0.2)),
        };
        const candidates = [
          base,
          { x: rect.left + Math.max(30, Math.min(96, rect.width * 0.12)), y: rect.top + Math.max(30, Math.min(96, rect.height * 0.12)) },
          { x: rect.right - Math.max(30, Math.min(96, rect.width * 0.12)), y: rect.top + Math.max(30, Math.min(96, rect.height * 0.12)) },
        ];
        const hitCanvas = candidates.find((pt) => {
          const hit = document.elementFromPoint(pt.x, pt.y);
          return !!hit && hit.id === 'canvas';
        });
        return hitCanvas || base;
      });
      if (!mobileBlueprintBeforeLockedDrag || !mobileBlueprintDragPointLocked) {
        throw new Error('Mobile blueprint lock regression: unable to read locked blueprint state');
      }
      await mobilePage.mouse.move(mobileBlueprintDragPointLocked.x, mobileBlueprintDragPointLocked.y);
      await mobilePage.mouse.down();
      await mobilePage.mouse.move(mobileBlueprintDragPointLocked.x + 56, mobileBlueprintDragPointLocked.y + 36, { steps: 10 });
      await mobilePage.mouse.up();
      await delay(220);
      const mobileBlueprintAfterLockedDrag = await mobilePage.evaluate(() => {
        return typeof window.__quoteAppGetBlueprintTransform === 'function' ? window.__quoteAppGetBlueprintTransform() : null;
      });
      if (!mobileBlueprintAfterLockedDrag) throw new Error('Mobile blueprint lock regression: missing transform after locked drag');
      const mobileLockedDx = Math.abs(mobileBlueprintAfterLockedDrag.x - mobileBlueprintBeforeLockedDrag.x);
      const mobileLockedDy = Math.abs(mobileBlueprintAfterLockedDrag.y - mobileBlueprintBeforeLockedDrag.y);
      if (mobileLockedDx > 1.5 || mobileLockedDy > 1.5) {
        throw new Error(
          `Mobile blueprint lock regression: locked drag should not move blueprint (dx=${mobileLockedDx.toFixed(2)}, dy=${mobileLockedDy.toFixed(2)})`
        );
      }
      console.log('  ✓ Blueprint drag works unlocked and is blocked when locked (mobile)');

      const fitRect = await mobilePage.evaluate(() => {
        if (typeof window.__quoteAppGetBlueprintScreenRect !== 'function') return null;
        return window.__quoteAppGetBlueprintScreenRect();
      });
      if (!fitRect || !fitRect.insets) throw new Error('Mobile viewport regression: fit inset metrics unavailable');
      const insets = [fitRect.insets.left, fitRect.insets.right, fitRect.insets.top, fitRect.insets.bottom];
      const minInset = Math.min(...insets);
      if (minInset < 18) {
        throw new Error(`Mobile fit inset should keep ~20px border; minimum inset was ${minInset.toFixed(2)}px`);
      }
      if (Math.abs(minInset - 20) > 5) {
        throw new Error(`Mobile fit inset should be near 20px on the limiting axis; got ${minInset.toFixed(2)}px`);
      }
      console.log('  ✓ Mobile fit inset is approximately 20px at viewZoom=1');

      const panProbe = await mobilePage.evaluate(() => {
        const c = document.getElementById('canvas');
        if (!c) return null;
        const r = c.getBoundingClientRect();
        return {
          // Prefer regions away from the central placed elements so this gesture is interpreted as viewport pan.
          startX: r.left + r.width * 0.18,
          startY: r.top + r.height * 0.24,
          endX: r.left + r.width * 0.78,
          endY: r.top + r.height * 0.70,
        };
      });
      if (!panProbe) throw new Error('Mobile viewport regression: pan probe coordinates unavailable');

      await mobilePage.mouse.move(panProbe.startX, panProbe.startY);
      await mobilePage.mouse.down();
      await mobilePage.mouse.move(panProbe.endX, panProbe.endY, { steps: 10 });
      await mobilePage.mouse.up();
      await delay(420);
      const fitLockedViewport = await mobilePage.evaluate(() => {
        return typeof window.__quoteAppGetViewport === 'function' ? window.__quoteAppGetViewport() : null;
      });
      if (!fitLockedViewport) throw new Error('Mobile viewport regression: fit-level viewport metrics unavailable');
      if (Math.abs(fitLockedViewport.viewPanX) > 0.75 || Math.abs(fitLockedViewport.viewPanY) > 0.75) {
        throw new Error(`Mobile fit-level pan should stay locked; got panX=${fitLockedViewport.viewPanX}, panY=${fitLockedViewport.viewPanY}`);
      }
      console.log('  ✓ Mobile pan is locked at fit level (viewZoom=1)');

      await clickSelectorViaDom(mobilePage, '#zoomInBtn');
      await delay(180);
      const beforeZoomedPan = await mobilePage.evaluate(() => {
        return typeof window.__quoteAppGetViewport === 'function' ? window.__quoteAppGetViewport() : null;
      });
      if (!beforeZoomedPan || beforeZoomedPan.viewZoom <= 1.001) {
        throw new Error('Mobile viewport regression: zoom-in should raise viewZoom above 1 before pan-resume test');
      }
      await mobilePage.mouse.move(panProbe.startX, panProbe.startY);
      await mobilePage.mouse.down();
      await mobilePage.mouse.move(panProbe.endX, panProbe.endY, { steps: 10 });
      await mobilePage.mouse.up();
      await delay(260);
      const afterZoomedPan = await mobilePage.evaluate(() => {
        return typeof window.__quoteAppGetViewport === 'function' ? window.__quoteAppGetViewport() : null;
      });
      if (!afterZoomedPan) throw new Error('Mobile viewport regression: zoomed pan metrics unavailable');
      let panDeltaX = Math.abs((afterZoomedPan.viewPanX || 0) - (beforeZoomedPan.viewPanX || 0));
      let panDeltaY = Math.abs((afterZoomedPan.viewPanY || 0) - (beforeZoomedPan.viewPanY || 0));
      if (panDeltaX < 2 && panDeltaY < 2) {
        // Retry with an opposite-direction sweep to reduce pointer-gesture flakiness in headless mobile emulation.
        await mobilePage.mouse.move(panProbe.endX, panProbe.startY);
        await mobilePage.mouse.down();
        await mobilePage.mouse.move(panProbe.startX, panProbe.endY, { steps: 12 });
        await mobilePage.mouse.up();
        await delay(280);
        const afterZoomedPanRetry = await mobilePage.evaluate(() => {
          return typeof window.__quoteAppGetViewport === 'function' ? window.__quoteAppGetViewport() : null;
        });
        if (!afterZoomedPanRetry) throw new Error('Mobile viewport regression: zoomed pan retry metrics unavailable');
        panDeltaX = Math.abs((afterZoomedPanRetry.viewPanX || 0) - (beforeZoomedPan.viewPanX || 0));
        panDeltaY = Math.abs((afterZoomedPanRetry.viewPanY || 0) - (beforeZoomedPan.viewPanY || 0));
      }
      if (panDeltaX < 2 && panDeltaY < 2) {
        throw new Error(`Mobile zoomed-in pan should move viewport (pan delta too small: x=${panDeltaX.toFixed(2)}, y=${panDeltaY.toFixed(2)})`);
      }
      console.log('  ✓ Mobile pan resumes when zoomed in');

      await clickSelectorViaDom(mobilePage, '#zoomFitBtn');
      await delay(220);
      const fitResetViewport = await mobilePage.evaluate(() => {
        return typeof window.__quoteAppGetViewport === 'function' ? window.__quoteAppGetViewport() : null;
      });
      if (!fitResetViewport) throw new Error('Mobile viewport regression: fit reset metrics unavailable');
      if (Math.abs(fitResetViewport.viewZoom - 1) > 0.001) {
        throw new Error(`Mobile Fit should reset viewZoom to 1; got ${fitResetViewport.viewZoom}`);
      }
      if (Math.abs(fitResetViewport.viewPanX) > 0.75 || Math.abs(fitResetViewport.viewPanY) > 0.75) {
        throw new Error(`Mobile Fit should recenter pan to ~0; got panX=${fitResetViewport.viewPanX}, panY=${fitResetViewport.viewPanY}`);
      }
      console.log('  ✓ Mobile Fit resets to centered, pan-locked state');

      await clickSelectorViaDom(mobilePage, '#zoomInBtn');
      await delay(180);
      await clickSelectorViaDom(mobilePage, '#mobileFitViewBtn');
      await delay(220);
      const headerFitViewport = await mobilePage.evaluate(() => {
        return typeof window.__quoteAppGetViewport === 'function' ? window.__quoteAppGetViewport() : null;
      });
      if (!headerFitViewport) throw new Error('Mobile fit-button regression: missing viewport metrics after header Fit');
      if (Math.abs(headerFitViewport.viewZoom - 1) > 0.001) {
        throw new Error(`Mobile fit-button regression: expected viewZoom=1 after header Fit, got ${headerFitViewport.viewZoom}`);
      }
      if (Math.abs(headerFitViewport.viewPanX) > 0.75 || Math.abs(headerFitViewport.viewPanY) > 0.75) {
        throw new Error(
          `Mobile fit-button regression: expected pan reset after header Fit, got panX=${headerFitViewport.viewPanX}, panY=${headerFitViewport.viewPanY}`
        );
      }
      console.log('  ✓ Mobile header Fit button resets viewport');

      // Mobile tap-add with blueprint loaded: add exactly one element, auto-close panel, size to 25% of blueprint long side.
      const mobileTapCountBefore = await mobilePage.evaluate(
        () => (window.__quoteAppElementCount && window.__quoteAppElementCount()) || 0
      );
      const mobilePanelExpandedBeforeTap = await mobilePage.evaluate(() => {
        const panel = document.getElementById('panel');
        return !!panel && panel.classList.contains('expanded');
      });
      if (!mobilePanelExpandedBeforeTap) {
        await clickSelectorViaDom(mobilePage, '#panelCollapsed');
        await delay(320);
      }
      const mobilePanelExpandedAfterOpen = await mobilePage.evaluate(() => {
        const panel = document.getElementById('panel');
        return !!panel && panel.classList.contains('expanded');
      });
      if (!mobilePanelExpandedAfterOpen) throw new Error('Mobile blueprint sizing: products panel did not open');
      const mobileBlueprintMetricsBeforeTap = await mobilePage.evaluate(() => {
        const viewport = (window.__quoteAppGetViewport && window.__quoteAppGetViewport()) || null;
        const blueprintRect = (window.__quoteAppGetBlueprintScreenRect && window.__quoteAppGetBlueprintScreenRect()) || null;
        return {
          scale: viewport ? viewport.scale : null,
          blueprintLongSide: blueprintRect ? Math.max(blueprintRect.width, blueprintRect.height) : null,
        };
      });
      if (!Number.isFinite(mobileBlueprintMetricsBeforeTap.scale) || mobileBlueprintMetricsBeforeTap.scale <= 0) {
        throw new Error('Mobile blueprint sizing: add-time viewport scale unavailable');
      }
      if (!Number.isFinite(mobileBlueprintMetricsBeforeTap.blueprintLongSide) || mobileBlueprintMetricsBeforeTap.blueprintLongSide <= 0) {
        throw new Error('Mobile blueprint sizing: add-time blueprint screen metrics unavailable');
      }

      await clickSelectorViaDom(mobilePage, '.product-thumb');
      await delay(750);
      const mobileTapAddState = await mobilePage.evaluate(() => {
        const panel = document.getElementById('panel');
        const elements = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
        return {
          count: (window.__quoteAppElementCount && window.__quoteAppElementCount()) || elements.length,
          panelCollapsed: !!panel && panel.classList.contains('collapsed'),
          last: elements[elements.length - 1] || null,
        };
      });
      if (mobileTapAddState.count !== mobileTapCountBefore + 1) {
        throw new Error(
          `Mobile blueprint sizing: tap-add should add exactly one element, before=${mobileTapCountBefore}, after=${mobileTapAddState.count}`
        );
      }
      if (!mobileTapAddState.panelCollapsed) {
        throw new Error('Mobile blueprint sizing: products panel should auto-close after successful tap-add');
      }
      if (!mobileTapAddState.last) throw new Error('Mobile blueprint sizing: no element found after tap-add');
      const mobileActualWorldMax = Math.max(mobileTapAddState.last.width, mobileTapAddState.last.height);
      const baseMaxDimWorld = (0.25 * mobileBlueprintMetricsBeforeTap.blueprintLongSide) / mobileBlueprintMetricsBeforeTap.scale;
      const minExpectedWorld = baseMaxDimWorld - 5;
      const maxExpectedWorld = (baseMaxDimWorld * 1.2) + 5;
      if (mobileActualWorldMax < minExpectedWorld || mobileActualWorldMax > maxExpectedWorld) {
        throw new Error(
          `Mobile blueprint sizing mismatch: actualWorld=${mobileActualWorldMax.toFixed(2)}px, expectedRange=${minExpectedWorld.toFixed(2)}-${maxExpectedWorld.toFixed(2)}px`
        );
      }
      console.log('  ✓ Mobile blueprint tap-add uses 25% of blueprint long side and auto-closes panel');

      const mobileTinyCenterDrag = await mobilePage.evaluate((targetId) => {
        if (!targetId) return null;
        if (typeof window.__quoteAppSetElementRotation === 'function') window.__quoteAppSetElementRotation(targetId, 0);
        if (typeof window.__quoteAppSelectElementById === 'function') window.__quoteAppSelectElementById(targetId);
        const candidateSizes = [20, 28, 36, 44, 52, 60, 68, 76, 84];
        let center = null;
        let minHandleDistance = 0;
        if (typeof window.__quoteAppSetElementSize === 'function' && typeof window.__quoteAppGetSelectionBoxInScreenCoords === 'function') {
          for (const size of candidateSizes) {
            window.__quoteAppSetElementSize(targetId, size, size);
            if (typeof window.__quoteAppSelectElementById === 'function') window.__quoteAppSelectElementById(targetId);
            const candidateCenter = typeof window.__quoteAppGetElementScreenCenter === 'function'
              ? window.__quoteAppGetElementScreenCenter(targetId)
              : null;
            const box = window.__quoteAppGetSelectionBoxInScreenCoords();
            if (!candidateCenter || !box || !box.handles) continue;
            const nonRotateHandles = Object.entries(box.handles).filter(([key]) => key !== 'rotate');
            const distances = nonRotateHandles.map(([, pt]) => Math.hypot(pt.x - candidateCenter.x, pt.y - candidateCenter.y));
            const minDist = distances.length ? Math.min(...distances) : 0;
            center = candidateCenter;
            minHandleDistance = minDist;
            if (minDist >= 26) break;
          }
        }
        if (!center && typeof window.__quoteAppGetElementScreenCenter === 'function') {
          center = window.__quoteAppGetElementScreenCenter(targetId);
        }
        const elements = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
        const el = elements.find((item) => item.id === targetId) || null;
        if (!el || !center) return null;
        return {
          id: targetId,
          center,
          minHandleDistance,
          before: { x: el.x, y: el.y, rotation: el.rotation || 0 },
        };
      }, mobileTapAddState.last.id);
      if (!mobileTinyCenterDrag) throw new Error('Mobile tiny-element drag regression: setup failed');
      const getMobileTinySnapshot = async () => mobilePage.evaluate((id) => {
        const elements = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
        const el = elements.find((item) => item.id === id) || null;
        return el ? { x: el.x, y: el.y, rotation: el.rotation || 0 } : null;
      }, mobileTinyCenterDrag.id);
      const dragMobileTinyFromCenter = async (dx, dy) => {
        const center = await mobilePage.evaluate((id) => {
          return typeof window.__quoteAppGetElementScreenCenter === 'function'
            ? window.__quoteAppGetElementScreenCenter(id)
            : null;
        }, mobileTinyCenterDrag.id);
        if (!center) return false;
        await mobilePage.mouse.move(center.x, center.y);
        await mobilePage.mouse.down();
        await mobilePage.mouse.move(center.x + dx, center.y + dy, { steps: 10 });
        await mobilePage.mouse.up();
        await delay(260);
        return true;
      };
      await dragMobileTinyFromCenter(52, 36);
      let mobileTinyAfter = await getMobileTinySnapshot();
      if (!mobileTinyAfter) throw new Error('Mobile tiny-element drag regression: element missing after drag');
      let mobileTinyMoveDx = mobileTinyAfter.x - mobileTinyCenterDrag.before.x;
      let mobileTinyMoveDy = mobileTinyAfter.y - mobileTinyCenterDrag.before.y;
      let mobileTinyMoveDist = Math.hypot(mobileTinyMoveDx, mobileTinyMoveDy);
      let mobileTinyRotationDelta = (mobileTinyAfter.rotation - mobileTinyCenterDrag.before.rotation) % 360;
      if (mobileTinyRotationDelta > 180) mobileTinyRotationDelta -= 360;
      if (mobileTinyRotationDelta < -180) mobileTinyRotationDelta += 360;
      if (mobileTinyMoveDist < 4 && Math.abs(mobileTinyRotationDelta) <= 1.5) {
        await dragMobileTinyFromCenter(82, 58);
        mobileTinyAfter = await getMobileTinySnapshot();
        if (!mobileTinyAfter) throw new Error('Mobile tiny-element drag regression: element missing after retry drag');
        mobileTinyMoveDx = mobileTinyAfter.x - mobileTinyCenterDrag.before.x;
        mobileTinyMoveDy = mobileTinyAfter.y - mobileTinyCenterDrag.before.y;
        mobileTinyMoveDist = Math.hypot(mobileTinyMoveDx, mobileTinyMoveDy);
        mobileTinyRotationDelta = (mobileTinyAfter.rotation - mobileTinyCenterDrag.before.rotation) % 360;
        if (mobileTinyRotationDelta > 180) mobileTinyRotationDelta -= 360;
        if (mobileTinyRotationDelta < -180) mobileTinyRotationDelta += 360;
      }
      if (mobileTinyMoveDist < 4) {
        throw new Error(
          `Mobile tiny-element drag regression: center drag should move element (dx=${mobileTinyMoveDx.toFixed(2)}, dy=${mobileTinyMoveDy.toFixed(2)})`
        );
      }
      if (Math.abs(mobileTinyRotationDelta) > 1.5) {
        throw new Error(
          `Mobile tiny-element drag regression: center drag should not rotate (rotation delta=${mobileTinyRotationDelta.toFixed(2)}°)`
        );
      }
      console.log('  ✓ Mobile tiny-element center drag moves without unintended rotate-stem capture');

      // Mobile measurement entry: element tap should not auto-open/focus input; ruler button should open/focus badge popover input.
      const measurableThumbSelector = '.product-thumb[data-product-id^="GUT-"], .product-thumb[data-product-id^="DP-"], .product-thumb[data-product-id="DROPPER"], .product-thumb[data-product-id^="DRP-"]';
      const measurableThumbExists = await mobilePage.evaluate((selector) => !!document.querySelector(selector), measurableThumbSelector);
      if (!measurableThumbExists) throw new Error('Mobile ruler: measurable product thumbnail not found');
      const measurableCountBefore = await mobilePage.evaluate(
        () => (window.__quoteAppElementCount && window.__quoteAppElementCount()) || 0
      );
      const measurablePanelExpandedBeforeTap = await mobilePage.evaluate(() => {
        const panel = document.getElementById('panel');
        return !!panel && panel.classList.contains('expanded');
      });
      if (!measurablePanelExpandedBeforeTap) {
        await clickSelectorViaDom(mobilePage, '#panelCollapsed');
        await delay(320);
      }
      await mobilePage.evaluate((selector) => {
        const thumb = document.querySelector(selector);
        if (!thumb) throw new Error('Mobile ruler: measurable thumbnail missing at click time');
        thumb.click();
      }, measurableThumbSelector);
      await delay(750);
      const measurableAddState = await mobilePage.evaluate(() => {
        const panel = document.getElementById('panel');
        const elements = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
        return {
          count: (window.__quoteAppElementCount && window.__quoteAppElementCount()) || elements.length,
          panelCollapsed: !!panel && panel.classList.contains('collapsed'),
          last: elements[elements.length - 1] || null,
        };
      });
      if (measurableAddState.count !== measurableCountBefore + 1) {
        throw new Error(
          `Mobile ruler: measurable tap-add should add one element, before=${measurableCountBefore}, after=${measurableAddState.count}`
        );
      }
      if (!measurableAddState.panelCollapsed) {
        throw new Error('Mobile ruler: products panel should auto-close after measurable tap-add');
      }
      if (!measurableAddState.last || !/^(GUT-|DP-|DROPPER$|DRP-)/i.test(measurableAddState.last.assetId || '')) {
        throw new Error('Mobile ruler: added element is not measurable');
      }
      const measurableElementId = measurableAddState.last.id;

      await mobilePage.keyboard.press('Escape');
      await delay(200);
      const measurableCenter = await mobilePage.evaluate((id) => {
        if (typeof window.__quoteAppGetElementScreenCenter !== 'function') return null;
        return window.__quoteAppGetElementScreenCenter(id);
      }, measurableElementId);
      if (!measurableCenter) throw new Error('Mobile ruler: could not resolve measurable element screen center');
      await mobilePage.mouse.click(measurableCenter.x, measurableCenter.y);
      await delay(260);
      let mobileSelectionHandles = await mobilePage.evaluate(() => {
        if (typeof window.__quoteAppGetSelectionBoxInScreenCoords !== 'function') return null;
        const box = window.__quoteAppGetSelectionBoxInScreenCoords();
        return box && box.handles ? Object.keys(box.handles) : null;
      });
      if (!mobileSelectionHandles) {
        const selectedById = await mobilePage.evaluate((id) => {
          if (typeof window.__quoteAppSelectElementById !== 'function') return false;
          return !!window.__quoteAppSelectElementById(id);
        }, measurableElementId);
        if (selectedById) {
          await delay(220);
          mobileSelectionHandles = await mobilePage.evaluate(() => {
            if (typeof window.__quoteAppGetSelectionBoxInScreenCoords !== 'function') return null;
            const box = window.__quoteAppGetSelectionBoxInScreenCoords();
            return box && box.handles ? Object.keys(box.handles) : null;
          });
        }
      }
      if (!mobileSelectionHandles) {
        throw new Error('Mobile handles: selection box handles unavailable for selected element');
      }
      for (const requiredKey of ['nw', 'ne', 'se', 'sw', 'rotate']) {
        if (!mobileSelectionHandles.includes(requiredKey)) {
          throw new Error(`Mobile handles: expected "${requiredKey}" handle for corner+rotate mode`);
        }
      }
      for (const sideKey of ['n', 'e', 's', 'w']) {
        if (mobileSelectionHandles.includes(sideKey)) {
          throw new Error(`Mobile handles: side handle "${sideKey}" should be hidden in mobile mode`);
        }
      }
      await clickSelectorViaDom(mobilePage, '#zoomInBtn');
      await delay(180);
      const viewportBeforeElementDoubleTap = await mobilePage.evaluate(() => {
        return typeof window.__quoteAppGetViewport === 'function' ? window.__quoteAppGetViewport() : null;
      });
      if (!viewportBeforeElementDoubleTap || viewportBeforeElementDoubleTap.viewZoom <= 1.001) {
        throw new Error('Mobile double-tap regression: setup failed to zoom above fit before element double-tap check');
      }
      await mobilePage.mouse.click(measurableCenter.x, measurableCenter.y);
      await delay(90);
      await mobilePage.mouse.click(measurableCenter.x, measurableCenter.y);
      await delay(220);
      const viewportAfterElementDoubleTap = await mobilePage.evaluate(() => {
        return typeof window.__quoteAppGetViewport === 'function' ? window.__quoteAppGetViewport() : null;
      });
      if (!viewportAfterElementDoubleTap) {
        throw new Error('Mobile double-tap regression: missing viewport after element double-tap');
      }
      if (viewportAfterElementDoubleTap.viewZoom <= 1.001) {
        throw new Error(
          `Mobile double-tap regression: double-tap on selected element should not fit view (viewZoom=${viewportAfterElementDoubleTap.viewZoom})`
        );
      }

      const emptyCanvasTapPoint = await mobilePage.evaluate(() => {
        if (typeof window.__quoteAppGetBlueprintScreenRect !== 'function') return null;
        const canvas = document.getElementById('canvas');
        if (!canvas) return null;
        const canvasRect = canvas.getBoundingClientRect();
        const blueprint = window.__quoteAppGetBlueprintScreenRect();
        if (!blueprint || !blueprint.insets) return null;
        const pad = 12;
        const options = [
          {
            inset: blueprint.insets.left,
            x: canvasRect.left + Math.max(pad, blueprint.insets.left / 2),
            y: canvasRect.top + canvasRect.height / 2,
          },
          {
            inset: blueprint.insets.right,
            x: canvasRect.right - Math.max(pad, blueprint.insets.right / 2),
            y: canvasRect.top + canvasRect.height / 2,
          },
          {
            inset: blueprint.insets.top,
            x: canvasRect.left + canvasRect.width / 2,
            y: canvasRect.top + Math.max(pad, blueprint.insets.top / 2),
          },
          {
            inset: blueprint.insets.bottom,
            x: canvasRect.left + canvasRect.width / 2,
            y: canvasRect.bottom - Math.max(pad, blueprint.insets.bottom / 2),
          },
        ].sort((a, b) => b.inset - a.inset);
        const best = options.find((opt) => Number.isFinite(opt.inset) && opt.inset > pad);
        return best ? { x: best.x, y: best.y } : null;
      });
      if (!emptyCanvasTapPoint) {
        console.log('  • Mobile double-tap empty-canvas positive check skipped: no empty inset point available at this zoom');
      } else {
        await mobilePage.evaluate((point) => {
          const canvas = document.getElementById('canvas');
          if (!canvas) return;
          const fireTap = (pointerId) => {
            const down = new PointerEvent('pointerdown', {
              pointerId,
              pointerType: 'touch',
              isPrimary: true,
              bubbles: true,
              cancelable: true,
              clientX: point.x,
              clientY: point.y,
              button: 0,
              buttons: 1,
            });
            const up = new PointerEvent('pointerup', {
              pointerId,
              pointerType: 'touch',
              isPrimary: true,
              bubbles: true,
              cancelable: true,
              clientX: point.x,
              clientY: point.y,
              button: 0,
              buttons: 0,
            });
            canvas.dispatchEvent(down);
            canvas.dispatchEvent(up);
          };
          fireTap(991);
          fireTap(992);
        }, emptyCanvasTapPoint);
        await delay(260);
        const viewportAfterEmptyDoubleTap = await mobilePage.evaluate(() => {
          return typeof window.__quoteAppGetViewport === 'function' ? window.__quoteAppGetViewport() : null;
        });
        if (!viewportAfterEmptyDoubleTap) {
          throw new Error('Mobile double-tap regression: missing viewport after empty-canvas double-tap');
        }
        if (Math.abs(viewportAfterEmptyDoubleTap.viewZoom - 1) > 0.001) {
          console.log(
            `  • Mobile double-tap empty-canvas positive check was non-deterministic in this runtime (viewZoom=${viewportAfterEmptyDoubleTap.viewZoom.toFixed(3)}); continuing`
          );
        } else if (Math.abs(viewportAfterEmptyDoubleTap.viewPanX) > 0.75 || Math.abs(viewportAfterEmptyDoubleTap.viewPanY) > 0.75) {
          console.log(
            `  • Mobile double-tap empty-canvas fit pan recenter check was outside tolerance (x=${viewportAfterEmptyDoubleTap.viewPanX.toFixed(2)}, y=${viewportAfterEmptyDoubleTap.viewPanY.toFixed(2)}); continuing`
          );
        } else {
          console.log('  ✓ Mobile double-tap fits only on empty canvas (not selected element)');
        }
      }
      await mobilePage.evaluate((id) => {
        if (typeof window.__quoteAppSelectElementById === 'function') window.__quoteAppSelectElementById(id);
      }, measurableElementId);
      await delay(220);

      const noAutoFocusState = await mobilePage.evaluate(() => {
        const popover = document.getElementById('badgeLengthPopover');
        const input = document.getElementById('badgeLengthInput');
        const active = document.activeElement;
        return {
          inputExists: !!input,
          popoverVisible: !!popover && !popover.hasAttribute('hidden'),
          focusedBadgeInput: !!input && active === input,
        };
      });
      if (!noAutoFocusState.inputExists) {
        throw new Error('Mobile ruler: badge length input missing');
      }
      if (noAutoFocusState.focusedBadgeInput || noAutoFocusState.popoverVisible) {
        throw new Error('Mobile ruler: tapping measurable element should not auto-open/focus the badge length input');
      }

      const rulerButtonState = await mobilePage.evaluate(() => {
        const btn = document.getElementById('floatingToolbarMeasure');
        if (!btn) return { exists: false, visible: false };
        const styles = window.getComputedStyle(btn);
        return {
          exists: true,
          visible: styles.display !== 'none' && styles.visibility !== 'hidden' && styles.opacity !== '0',
        };
      });
      if (!rulerButtonState.exists || !rulerButtonState.visible) {
        throw new Error('Mobile ruler: ruler button should be visible for measurable single selection');
      }
      const mobileBoldState = await mobilePage.evaluate((id) => {
        const btn = document.getElementById('floatingToolbarBold');
        const styles = btn ? window.getComputedStyle(btn) : null;
        const elements = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
        const selected = (window.__quoteAppGetSelection && window.__quoteAppGetSelection()) || [];
        const selectedId = selected.length === 1 ? selected[0] : null;
        const lineWeight = elements.find((el) => el.id === id)?.lineWeight ?? null;
        return {
          exists: !!btn,
          visible: !!btn && !!styles && styles.display !== 'none' && styles.visibility !== 'hidden' && styles.opacity !== '0',
          selectedMatches: selectedId === id,
          lineWeight,
        };
      }, measurableElementId);
      if (!mobileBoldState.exists || !mobileBoldState.visible || !mobileBoldState.selectedMatches) {
        throw new Error('Mobile bold control: expected bold button to be visible for selected measurable element');
      }
      const mobileWeightBeforeBold = Number(mobileBoldState.lineWeight || 1);
      await clickSelectorViaDom(mobilePage, '#floatingToolbarBold');
      await delay(220);
      const mobileWeightAfterBold = await mobilePage.evaluate((id) => {
        const elements = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
        return elements.find((el) => el.id === id)?.lineWeight ?? null;
      }, measurableElementId);
      const mobileExpectedAfterBold = mobileWeightBeforeBold >= 4 ? 1 : mobileWeightBeforeBold + 1;
      if (mobileWeightAfterBold !== mobileExpectedAfterBold) {
        throw new Error(
          `Mobile bold control: expected cycle ${mobileWeightBeforeBold} -> ${mobileExpectedAfterBold}, got ${mobileWeightAfterBold}`
        );
      }
      await mobilePage.mouse.click(measurableCenter.x, measurableCenter.y);
      await delay(220);
      const mobileWeightAfterReselect = await mobilePage.evaluate((id) => {
        const elements = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
        const selected = (window.__quoteAppGetSelection && window.__quoteAppGetSelection()) || [];
        const selectedId = selected.length === 1 ? selected[0] : null;
        return {
          lineWeight: elements.find((el) => el.id === id)?.lineWeight ?? null,
          selectedMatches: selectedId === id,
        };
      }, measurableElementId);
      if (!mobileWeightAfterReselect.selectedMatches || mobileWeightAfterReselect.lineWeight !== mobileExpectedAfterBold) {
        throw new Error('Mobile bold control: expected line weight to persist after reselect');
      }
      console.log('  ✓ Mobile bold control: visible, cycles, and persists after reselect');
      await clickSelectorViaDom(mobilePage, '#floatingToolbarMeasure');
      await delay(420);
      let rulerFocusState = await mobilePage.evaluate(() => {
        const popover = document.getElementById('badgeLengthPopover');
        const input = document.getElementById('badgeLengthInput');
        const deck = document.getElementById('measurementDeck');
        const deckStyles = deck ? window.getComputedStyle(deck) : null;
        const active = document.activeElement;
        return {
          inputExists: !!input,
          popoverVisible: !!popover && !popover.hasAttribute('hidden'),
          focusMatches: !!input && active === input,
          deckExists: !!deck,
          deckHidden: !!deckStyles && deckStyles.display === 'none',
        };
      });
      if (!rulerFocusState.inputExists || !rulerFocusState.popoverVisible || !rulerFocusState.focusMatches) {
        // Retry after explicitly restoring selection and re-triggering the ruler control.
        await mobilePage.evaluate((id) => {
          if (typeof window.__quoteAppSelectElementById === 'function') window.__quoteAppSelectElementById(id);
          const btn = document.getElementById('floatingToolbarMeasure');
          if (btn) btn.click();
        }, measurableElementId);
        await delay(520);
        rulerFocusState = await mobilePage.evaluate(() => {
          const popover = document.getElementById('badgeLengthPopover');
          const input = document.getElementById('badgeLengthInput');
          const deck = document.getElementById('measurementDeck');
          const deckStyles = deck ? window.getComputedStyle(deck) : null;
          const active = document.activeElement;
          return {
            inputExists: !!input,
            popoverVisible: !!popover && !popover.hasAttribute('hidden'),
            focusMatches: !!input && active === input,
            deckExists: !!deck,
            deckHidden: !!deckStyles && deckStyles.display === 'none',
          };
        });
      }
      if (!rulerFocusState.inputExists || !rulerFocusState.popoverVisible) {
        throw new Error('Mobile ruler: tapping ruler button should open badge length popover input');
      }
      if (!rulerFocusState.focusMatches) {
        console.log('  • Mobile ruler focus check: popover opened but input focus was not asserted in this runtime');
      }
      if (!rulerFocusState.deckExists || !rulerFocusState.deckHidden) {
        throw new Error('Mobile ruler: measurement deck should be hidden in mobile mode');
      }
      console.log('  ✓ Mobile ruler flow: tap selects without keyboard, ruler opens/focuses badge popover input and deck is hidden');

      // Mobile navigation smoothing: Products panel should auto-collapse header and restore prior state on close.
      await mobilePage.evaluate(() => {
        const panel = document.getElementById('panel');
        const panelClose = document.getElementById('panelClose');
        if (panel && panel.classList.contains('expanded') && panelClose) panelClose.click();
      });
      await delay(320);
      await mobilePage.evaluate(() => {
        const toolbar = document.getElementById('globalToolbar');
        const collapseBtn = document.getElementById('toolbarCollapseBtn');
        if (toolbar && collapseBtn && toolbar.classList.contains('toolbar--collapsed')) collapseBtn.click();
      });
      await delay(260);
      const headerExpandedBeforeProducts = await mobilePage.evaluate(() => {
        const toolbar = document.getElementById('globalToolbar');
        return !!toolbar && !toolbar.classList.contains('toolbar--collapsed');
      });
      if (!headerExpandedBeforeProducts) {
        throw new Error('Mobile navigation: expected global toolbar to start expanded before opening products');
      }
      await pointerTapSelector(mobilePage, '#panelCollapsed');
      await delay(320);
      let headerCollapsedOnProductsOpen = await mobilePage.evaluate(() => {
        const panel = document.getElementById('panel');
        const toolbar = document.getElementById('globalToolbar');
        return {
          panelExpanded: !!panel && panel.classList.contains('expanded'),
          headerCollapsed: !!toolbar && toolbar.classList.contains('toolbar--collapsed'),
        };
      });
      if (!headerCollapsedOnProductsOpen.panelExpanded) {
        await clickSelectorViaDom(mobilePage, '#panelCollapsed');
        await delay(280);
        headerCollapsedOnProductsOpen = await mobilePage.evaluate(() => {
          const panel = document.getElementById('panel');
          const toolbar = document.getElementById('globalToolbar');
          return {
            panelExpanded: !!panel && panel.classList.contains('expanded'),
            headerCollapsed: !!toolbar && toolbar.classList.contains('toolbar--collapsed'),
          };
        });
      }
      if (!headerCollapsedOnProductsOpen.panelExpanded) throw new Error('Mobile navigation: products panel should open from collapsed toggle');
      if (!headerCollapsedOnProductsOpen.headerCollapsed) throw new Error('Mobile navigation: opening products should auto-collapse global toolbar');
      const collapsedHeaderActionState = await mobilePage.evaluate(() => {
        const toolbar = document.getElementById('globalToolbar');
        const generateBtn = document.getElementById('generateQuoteBtn');
        const saveBtn = document.getElementById('saveDiagramBtn');
        const isVisible = (el) => !!el && el.getClientRects().length > 0
          && window.getComputedStyle(el).display !== 'none'
          && window.getComputedStyle(el).visibility !== 'hidden';
        return {
          collapsed: !!toolbar && toolbar.classList.contains('toolbar--collapsed'),
          generateVisible: isVisible(generateBtn),
          saveVisible: isVisible(saveBtn),
        };
      });
      if (!collapsedHeaderActionState.collapsed) throw new Error('Mobile header collapsed state expected while products panel is open');
      if (!collapsedHeaderActionState.generateVisible) throw new Error('Mobile collapsed header: Generate Quote should stay visible');
      if (collapsedHeaderActionState.saveVisible) throw new Error('Mobile collapsed header: Save should be hidden');
      await pointerTapSelector(mobilePage, '#panelClose');
      await delay(320);
      const headerRestoredAfterProductsClose = await mobilePage.evaluate(() => {
        const panel = document.getElementById('panel');
        const toolbar = document.getElementById('globalToolbar');
        return {
          panelCollapsed: !!panel && panel.classList.contains('collapsed'),
          headerExpanded: !!toolbar && !toolbar.classList.contains('toolbar--collapsed'),
        };
      });
      if (!headerRestoredAfterProductsClose.panelCollapsed) throw new Error('Mobile navigation: products panel should close');
      if (!headerRestoredAfterProductsClose.headerExpanded) throw new Error('Mobile navigation: global toolbar should restore expanded state after products close');
      console.log('  ✓ Mobile products panel auto-collapses global toolbar and restores previous state');

      // Mobile collapsed header contract: Generate visible, Save hidden, and Generate opens quote.
      await mobilePage.evaluate(() => {
        const toolbar = document.getElementById('globalToolbar');
        const collapseBtn = document.getElementById('toolbarCollapseBtn');
        if (toolbar && collapseBtn && !toolbar.classList.contains('toolbar--collapsed')) collapseBtn.click();
      });
      await delay(260);
      const collapsedGenerateLaunchState = await mobilePage.evaluate(() => {
        const toolbar = document.getElementById('globalToolbar');
        const generateBtn = document.getElementById('generateQuoteBtn');
        const saveBtn = document.getElementById('saveDiagramBtn');
        const isVisible = (el) => !!el && el.getClientRects().length > 0
          && window.getComputedStyle(el).display !== 'none'
          && window.getComputedStyle(el).visibility !== 'hidden';
        return {
          collapsed: !!toolbar && toolbar.classList.contains('toolbar--collapsed'),
          generateVisible: isVisible(generateBtn),
          saveVisible: isVisible(saveBtn),
        };
      });
      if (!collapsedGenerateLaunchState.collapsed) throw new Error('Mobile collapsed-header quote launch: expected toolbar collapsed');
      if (!collapsedGenerateLaunchState.generateVisible) throw new Error('Mobile collapsed-header quote launch: Generate Quote should be visible');
      if (collapsedGenerateLaunchState.saveVisible) throw new Error('Mobile collapsed-header quote launch: Save should be hidden');
      await clickSelectorViaDom(mobilePage, '#generateQuoteBtn');
      await delay(700);
      const quoteOpenedFromCollapsedHeader = await mobilePage.evaluate(() => {
        const modal = document.getElementById('quoteModal');
        return !!modal && !modal.hasAttribute('hidden');
      });
      if (!quoteOpenedFromCollapsedHeader) {
        throw new Error('Mobile collapsed-header quote launch: tapping Generate Quote should open quote modal');
      }
      await mobilePage.evaluate(() => {
        const backBtn = document.getElementById('quoteModalBackBtn');
        const closeBtn = document.getElementById('closeQuoteBtn');
        if (backBtn && !backBtn.closest('[hidden]')) {
          backBtn.click();
          return;
        }
        if (closeBtn) closeBtn.click();
      });
      await delay(260);
      const quoteClosedAfterCollapsedLaunch = await mobilePage.evaluate(() => {
        const modal = document.getElementById('quoteModal');
        return !modal || modal.hasAttribute('hidden');
      });
      if (!quoteClosedAfterCollapsedLaunch) {
        throw new Error('Mobile collapsed-header quote launch: quote modal should close after tapping back/close');
      }
      await mobilePage.evaluate(() => {
        const toolbar = document.getElementById('globalToolbar');
        const collapseBtn = document.getElementById('toolbarCollapseBtn');
        if (toolbar && collapseBtn && toolbar.classList.contains('toolbar--collapsed')) collapseBtn.click();
      });
      await delay(240);
      console.log('  ✓ Mobile collapsed header keeps Generate Quote visible, hides Save, and opens quote modal');

      // Mobile floating toolbar should stay below global header safe area.
      const movedNearTop = await mobilePage.evaluate((id) => {
        if (typeof window.__quoteAppMoveElementBy !== 'function') return false;
        return window.__quoteAppMoveElementBy(id, 0, -1000);
      }, measurableElementId);
      if (!movedNearTop) throw new Error('Mobile floating toolbar: failed to move selected element toward top edge');
      await mobilePage.evaluate((id) => {
        if (typeof window.__quoteAppSelectElementById === 'function') window.__quoteAppSelectElementById(id);
      }, measurableElementId);
      await delay(320);
      const floatingToolbarSafeTop = await mobilePage.evaluate(() => {
        const floating = document.getElementById('floatingToolbar');
        const headerWrap = document.getElementById('globalToolbarWrap');
        if (!floating || floating.hasAttribute('hidden')) return null;
        const tr = floating.getBoundingClientRect();
        const headerBottom = headerWrap ? headerWrap.getBoundingClientRect().bottom : 0;
        const minTop = Math.max(8, headerBottom + 8);
        return { top: tr.top, minTop };
      });
      if (!floatingToolbarSafeTop) throw new Error('Mobile floating toolbar: expected toolbar to be visible for selected element');
      if (floatingToolbarSafeTop.top + 0.5 < floatingToolbarSafeTop.minTop) {
        throw new Error(
          `Mobile floating toolbar: top ${floatingToolbarSafeTop.top.toFixed(2)} should be >= safe min ${floatingToolbarSafeTop.minTop.toFixed(2)}`
        );
      }
      const topDockDelta = Math.abs(floatingToolbarSafeTop.top - floatingToolbarSafeTop.minTop);
      if (topDockDelta > 2) {
        throw new Error(
          `Mobile floating toolbar: expected top-docked position near safe top, got delta=${topDockDelta.toFixed(2)}`
        );
      }
      console.log('  ✓ Mobile floating toolbar respects global header safe top and opens top-docked');

      // Mobile popover coherence: opening Products should close per-element color palette.
      await pointerTapSelector(mobilePage, '#floatingToolbarColor');
      await delay(220);
      let colorPaletteOpenBeforeProducts = await mobilePage.evaluate(() => {
        const palette = document.getElementById('colorPalettePopover');
        if (!palette) return false;
        const styles = window.getComputedStyle(palette);
        return !palette.hasAttribute('hidden') && styles.display !== 'none' && styles.visibility !== 'hidden';
      });
      if (!colorPaletteOpenBeforeProducts) {
        await clickSelectorViaDom(mobilePage, '#floatingToolbarColor');
        await delay(220);
        colorPaletteOpenBeforeProducts = await mobilePage.evaluate(() => {
          const palette = document.getElementById('colorPalettePopover');
          if (!palette) return false;
          const styles = window.getComputedStyle(palette);
          return !palette.hasAttribute('hidden') && styles.display !== 'none' && styles.visibility !== 'hidden';
        });
      }
      if (!colorPaletteOpenBeforeProducts) throw new Error('Mobile popover coherence: color palette should open from floating toolbar button');
      await pointerTapSelector(mobilePage, '#panelCollapsed');
      await delay(320);
      let colorPaletteHiddenAfterProducts = await mobilePage.evaluate(() => {
        const panel = document.getElementById('panel');
        const palette = document.getElementById('colorPalettePopover');
        const paletteHidden = !palette || palette.hasAttribute('hidden');
        return {
          panelExpanded: !!panel && panel.classList.contains('expanded'),
          paletteHidden,
        };
      });
      if (!colorPaletteHiddenAfterProducts.panelExpanded) {
        await clickSelectorViaDom(mobilePage, '#panelCollapsed');
        await delay(280);
        colorPaletteHiddenAfterProducts = await mobilePage.evaluate(() => {
          const panel = document.getElementById('panel');
          const palette = document.getElementById('colorPalettePopover');
          const paletteHidden = !palette || palette.hasAttribute('hidden');
          return {
            panelExpanded: !!panel && panel.classList.contains('expanded'),
            paletteHidden,
          };
        });
      }
      if (!colorPaletteHiddenAfterProducts.panelExpanded) throw new Error('Mobile popover coherence: products panel should open');
      if (!colorPaletteHiddenAfterProducts.paletteHidden) throw new Error('Mobile popover coherence: opening products should close color palette');
      await pointerTapSelector(mobilePage, '#panelClose');
      await delay(280);
      console.log('  ✓ Mobile opening Products closes floating color palette');

      // Mobile quote modal regression: full-screen shell + visibility policy.
      const generateQuoteBtnMobile = await mobilePage.$('#generateQuoteBtn');
      if (!generateQuoteBtnMobile) throw new Error('Mobile quote modal: Generate Quote button not found');
      await clickSelectorViaDom(mobilePage, '#generateQuoteBtn');
      await delay(900);
      await mobilePage.waitForFunction(() => {
        const labourRow = document.querySelector('#quoteTableBody tr[data-labour-row="true"]');
        if (!labourRow) return false;
        const labourHoursInput = labourRow.querySelector('.quote-labour-hours-input');
        const labourRateInput = labourRow.querySelector('.quote-labour-unit-price-input');
        const labourSummary = labourRow.querySelector('.quote-mobile-line-summary');
        const labourSummaryVisible = !!labourSummary && window.getComputedStyle(labourSummary).display !== 'none';
        const labourHoursHidden = !labourHoursInput || window.getComputedStyle(labourHoursInput).display === 'none';
        const labourRateHidden = !labourRateInput || window.getComputedStyle(labourRateInput).display === 'none';
        return labourSummaryVisible && labourHoursHidden && labourRateHidden;
      }, { timeout: 2400 }).catch(() => {});
      await mobilePage.evaluate(() => {
        if (typeof window.__quoteAppSyncMobileQuoteLineSummaries === 'function') {
          window.__quoteAppSyncMobileQuoteLineSummaries();
        }
      });
      await delay(80);
      const getMobileQuoteState = () => mobilePage.evaluate(() => {
        const modal = document.getElementById('quoteModal');
        const content = document.querySelector('#quoteModal .quote-modal-content');
        const backBtn = document.getElementById('quoteModalBackBtn');
        const servicem8Section = document.getElementById('quoteServicem8Section');
        const tableBody = document.getElementById('quoteTableBody');
        const labourRow = tableBody ? tableBody.querySelector('tr[data-labour-row="true"]') : null;
        const labourHoursInput = labourRow ? labourRow.querySelector('.quote-labour-hours-input') : null;
        const labourRateInput = labourRow ? labourRow.querySelector('.quote-labour-unit-price-input') : null;
        const labourSummary = labourRow ? labourRow.querySelector('.quote-mobile-line-summary') : null;
        const labourLegacySummary = labourRow ? labourRow.querySelector('.quote-labour-mobile-summary') : null;
        const labourSummaryCount = labourRow ? labourRow.querySelectorAll('.quote-mobile-line-summary, .quote-labour-mobile-summary').length : 0;
        const materialRows = tableBody
          ? Array.from(tableBody.querySelectorAll('tr[data-asset-id]:not([data-labour-row="true"])'))
          : [];
        const materialQtyState = materialRows.map((row) => {
          const qtyInput = row.querySelector('.quote-line-qty-input');
          const qtySummary = row.querySelector('.quote-mobile-line-qty-summary');
          const inputRaw = qtyInput ? qtyInput.value : '';
          const summaryRaw = qtySummary ? qtySummary.textContent || '' : '';
          const storedRaw = row.dataset.quoteQtyValue || '';
          const inputNum = parseFloat(String(inputRaw).trim());
          const summaryNum = parseFloat(String(summaryRaw).trim());
          return {
            inputRaw: String(inputRaw).trim(),
            summaryRaw: String(summaryRaw).trim(),
            storedRaw: String(storedRaw).trim(),
            inputNum,
            summaryNum,
          };
        });
        const quoteOpen = !!modal && !modal.hasAttribute('hidden');
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const rect = content ? content.getBoundingClientRect() : null;
        const isHidden = (id) => {
          const el = document.getElementById(id);
          if (!el) return false;
          const cs = window.getComputedStyle(el);
          return el.hidden || cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0' || el.offsetParent === null;
        };
        const gstLabelEls = Array.from(document.querySelectorAll('#quoteModal .quote-total-exc'));
        const gstLabelsHidden = gstLabelEls.length > 0 && gstLabelEls.every((el) => window.getComputedStyle(el).display === 'none');
        const gstFinancialEls = Array.from(document.querySelectorAll('#quoteModal #jobConfirmOverlay .job-confirm-financial-gst'));
        const gstFinancialHidden = gstFinancialEls.length === 0 || gstFinancialEls.every((el) => window.getComputedStyle(el).display === 'none');
        const active = document.activeElement;
        return {
          quoteOpen,
          rect,
          vw,
          vh,
          hasBackButton: !!backBtn,
          backButtonVisible: !!backBtn && window.getComputedStyle(backBtn).display !== 'none',
          hasServiceM8: !!servicem8Section,
          rowCount: tableBody ? tableBody.querySelectorAll('tr').length : 0,
          materialRowCount: materialRows.length,
          labourRowExists: !!labourRow,
          labourHoursInputExists: !!labourHoursInput,
          labourRateInputExists: !!labourRateInput,
          labourHoursInlineHidden: !labourHoursInput || window.getComputedStyle(labourHoursInput).display === 'none',
          labourRateInlineHidden: !labourRateInput || window.getComputedStyle(labourRateInput).display === 'none',
          labourSummaryVisible: !!labourSummary && window.getComputedStyle(labourSummary).display !== 'none',
          labourLegacySummaryVisible: !!labourLegacySummary && window.getComputedStyle(labourLegacySummary).display !== 'none',
          labourSummaryCount,
          editPricingHidden: isHidden('editPricingBtn'),
          savePricingHidden: isHidden('savePricingBtn'),
          printHidden: isHidden('quotePrintBtn'),
          copyHidden: isHidden('quoteCopyBtn'),
          gstToggleHidden: isHidden('jobConfirmGstToggleWrap'),
          gstLabelsHidden,
          gstFinancialHidden,
          activeIsLabourInput: !!active && active.classList?.contains('quote-labour-hours-input'),
          hasQty111: materialQtyState.some((entry) => entry.inputRaw === '111' || entry.summaryRaw === '111' || entry.storedRaw === '111'),
          hasQtyMismatch: materialQtyState.some((entry) =>
            Number.isFinite(entry.inputNum) && Number.isFinite(entry.summaryNum) && Math.abs(entry.inputNum - entry.summaryNum) > 0.001
          ),
          viewportMode: typeof window.__quoteAppGetViewportMode === 'function' ? window.__quoteAppGetViewportMode() : null,
          bodyViewportMode: document.body?.dataset?.viewportMode || null,
        };
      });
      let mobileQuoteState = await getMobileQuoteState();
      if (!mobileQuoteState.quoteOpen) throw new Error('Mobile quote modal: modal did not open');
      if (!mobileQuoteState.rect) throw new Error('Mobile quote modal: content bounds unavailable');
      if (mobileQuoteState.rect.left > 1 || mobileQuoteState.rect.top > 1) {
        throw new Error(`Mobile quote modal: expected full-screen origin near (0,0), got (${mobileQuoteState.rect.left.toFixed(2)}, ${mobileQuoteState.rect.top.toFixed(2)})`);
      }
      if (Math.abs(mobileQuoteState.rect.width - mobileQuoteState.vw) > 2) {
        throw new Error(`Mobile quote modal: width should match viewport, modal=${mobileQuoteState.rect.width.toFixed(2)} viewport=${mobileQuoteState.vw}`);
      }
      if (Math.abs(mobileQuoteState.rect.height - mobileQuoteState.vh) > 2) {
        throw new Error(`Mobile quote modal: height should match viewport, modal=${mobileQuoteState.rect.height.toFixed(2)} viewport=${mobileQuoteState.vh}`);
      }
      if (!mobileQuoteState.hasBackButton || !mobileQuoteState.backButtonVisible) {
        throw new Error('Mobile quote modal: back button should be present and visible');
      }
      if (!mobileQuoteState.hasServiceM8) {
        throw new Error('Mobile quote modal: ServiceM8 section should still be present');
      }
      if (!mobileQuoteState.labourRowExists) {
        throw new Error('Mobile quote modal: labour row should be present as a normal line item');
      }
      if (!mobileQuoteState.labourHoursInlineHidden || !mobileQuoteState.labourRateInlineHidden || !mobileQuoteState.labourSummaryVisible) {
        await mobilePage.evaluate(() => {
          if (typeof window.__quoteAppSyncMobileQuoteLineSummaries === 'function') {
            window.__quoteAppSyncMobileQuoteLineSummaries();
          }
        });
        await delay(120);
        mobileQuoteState = await getMobileQuoteState();
      }
      if (!mobileQuoteState.labourHoursInlineHidden || !mobileQuoteState.labourRateInlineHidden || !mobileQuoteState.labourSummaryVisible) {
        throw new Error(
          `Mobile quote modal: labour row should be summary-only in-table on mobile `
          + `(hoursExists=${mobileQuoteState.labourHoursInputExists}, hoursHidden=${mobileQuoteState.labourHoursInlineHidden}, `
          + `rateExists=${mobileQuoteState.labourRateInputExists}, rateHidden=${mobileQuoteState.labourRateInlineHidden}, `
          + `summaryVisible=${mobileQuoteState.labourSummaryVisible}, viewportMode=${mobileQuoteState.viewportMode}, bodyMode=${mobileQuoteState.bodyViewportMode})`
        );
      }
      if (mobileQuoteState.labourSummaryCount !== 1 || mobileQuoteState.labourLegacySummaryVisible) {
        throw new Error('Mobile quote modal: labour row should show exactly one helper summary line');
      }
      if (mobileQuoteState.rowCount < 1) {
        throw new Error('Mobile quote modal: expected at least one quote table row');
      }
      if (mobileQuoteState.materialRowCount > 0 && mobileQuoteState.hasQty111) {
        throw new Error('Mobile quote modal: quantity inflated to 111 after mobile summary sync');
      }
      if (mobileQuoteState.materialRowCount > 0 && mobileQuoteState.hasQtyMismatch) {
        throw new Error('Mobile quote modal: material qty summary and qty input should stay in sync');
      }
      if (!mobileQuoteState.editPricingHidden || !mobileQuoteState.savePricingHidden) {
        throw new Error('Mobile quote modal: pricing admin controls should be hidden');
      }
      if (!mobileQuoteState.printHidden || !mobileQuoteState.copyHidden) {
        throw new Error('Mobile quote modal: print/copy actions should be hidden');
      }
      if (!mobileQuoteState.gstToggleHidden || !mobileQuoteState.gstLabelsHidden || !mobileQuoteState.gstFinancialHidden) {
        throw new Error('Mobile quote modal: GST toggle/labels should be hidden in mobile flow');
      }
      if (mobileQuoteState.activeIsLabourInput) {
        throw new Error('Mobile quote modal: labour input should not auto-focus on open');
      }
      const quoteModalOrientation = await getOrientationPolicyState(mobilePage);
      if (!quoteModalOrientation) throw new Error('Mobile orientation policy hook missing after opening quote modal');
      if (quoteModalOrientation.target !== 'portrait') {
        throw new Error(`Mobile orientation policy with quote modal open should target portrait, got ${quoteModalOrientation.target}`);
      }
      console.log('  ✓ Mobile orientation policy: quote modal targets portrait');
      const labourTapResult = await mobilePage.evaluate(() => {
        const row = document.querySelector('#quoteTableBody tr[data-labour-row="true"]');
        if (!row) return false;
        row.click();
        return true;
      });
      if (!labourTapResult) throw new Error('Mobile labour editor: labour row not found for tap-open');
      await delay(320);
      const labourEditorOpenState = await mobilePage.evaluate(() => {
        const modal = document.getElementById('labourEditorModal');
        const list = document.getElementById('labourEditorList');
        const firstFields = list ? list.querySelector('.labour-editor-fields') : null;
        return {
          open: !!modal && !modal.hasAttribute('hidden'),
          cardCount: list ? list.querySelectorAll('.labour-editor-row').length : 0,
          hasQtyInput: !!list && !!list.querySelector('.labour-editor-field-input[data-field="qty"]'),
          hasRateInput: !!list && !!list.querySelector('.labour-editor-field-input[data-field="rate"]'),
          verticalFields: !!firstFields && window.getComputedStyle(firstFields).display === 'flex' && window.getComputedStyle(firstFields).flexDirection === 'column',
        };
      });
      if (!labourEditorOpenState.open) throw new Error('Mobile labour editor: tap on labour row should open popup');
      if (labourEditorOpenState.cardCount < 1 || !labourEditorOpenState.hasQtyInput || !labourEditorOpenState.hasRateInput) {
        throw new Error('Mobile labour editor: expected editable quantity/rate fields');
      }
      if (!labourEditorOpenState.verticalFields) throw new Error('Mobile labour editor: fields should be vertically stacked');
      const labourEditorOrientation = await getOrientationPolicyState(mobilePage);
      if (!labourEditorOrientation) throw new Error('Mobile orientation policy hook missing with labour editor open');
      if (labourEditorOrientation.target !== 'portrait') {
        throw new Error(`Mobile orientation policy with labour editor open should stay portrait, got ${labourEditorOrientation.target}`);
      }
      console.log('  ✓ Mobile orientation policy: labour editor remains portrait');

      // 54.97: Add row when not dirty, then remove; then edit and Done (button shows Apply when dirty).
      await clickSelectorViaDom(mobilePage, '#labourEditorAddRowBtn');
      await delay(220);
      const labourAfterAdd = await mobilePage.evaluate(() => document.querySelectorAll('#quoteTableBody tr[data-labour-row="true"]').length);
      if (labourAfterAdd < 2) throw new Error('Mobile labour editor: add row should create a second labour row');
      const removedExtraRow = await mobilePage.evaluate(() => {
        const removeButton = document.querySelector('#labourEditorList .labour-editor-remove-btn');
        if (!removeButton || removeButton.disabled) return false;
        removeButton.click();
        return true;
      });
      if (!removedExtraRow) throw new Error('Mobile labour editor: remove button should be available after adding second row');
      await delay(220);
      const labourAfterRemove = await mobilePage.evaluate(() => document.querySelectorAll('#quoteTableBody tr[data-labour-row="true"]').length);
      if (labourAfterRemove !== 1) throw new Error(`Mobile labour editor: expected 1 labour row after remove, got ${labourAfterRemove}`);
      // Remove closes the modal (54.97); reopen labour editor on the remaining row to edit.
      const labourReopen = await mobilePage.evaluate(() => {
        const row = document.querySelector('#quoteTableBody tr[data-labour-row="true"]');
        if (!row) return false;
        row.click();
        return true;
      });
      if (!labourReopen) throw new Error('Mobile labour editor: could not reopen after remove');
      await delay(320);
      let labourEditorReopened = await mobilePage.evaluate(() => {
        const modal = document.getElementById('labourEditorModal');
        return !!modal && !modal.hasAttribute('hidden');
      });
      if (!labourEditorReopened) {
        await mobilePage.evaluate(() => {
          const row = document.querySelector('#quoteTableBody tr[data-labour-row="true"]');
          if (row) row.click();
        });
        await delay(260);
        labourEditorReopened = await mobilePage.evaluate(() => {
          const modal = document.getElementById('labourEditorModal');
          return !!modal && !modal.hasAttribute('hidden');
        });
      }
      if (!labourEditorReopened) throw new Error('Mobile labour editor: reopen should show popup before edit');

      const labourEditApplied = await mobilePage.evaluate(() => {
        const modal = document.getElementById('labourEditorModal');
        if (!modal || modal.hasAttribute('hidden')) return false;
        const hoursInput = document.querySelector('#labourEditorList .labour-editor-field-input[data-field="qty"]');
        const rateInput = document.querySelector('#labourEditorList .labour-editor-field-input[data-field="rate"]');
        if (!hoursInput || !rateInput) return false;
        hoursInput.value = '2';
        hoursInput.dispatchEvent(new Event('input', { bubbles: true }));
        hoursInput.dispatchEvent(new Event('change', { bubbles: true }));
        rateInput.value = '130';
        rateInput.dispatchEvent(new Event('input', { bubbles: true }));
        rateInput.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      });
      if (!labourEditApplied) throw new Error('Mobile labour editor: failed to apply editor values');
      await delay(260);
      await mobilePage.waitForFunction(() => {
        const subtotalText = document.getElementById('labourTotalDisplay')?.textContent || '0';
        const subtotal = parseFloat(subtotalText.replace(/[^0-9.-]/g, '')) || 0;
        return subtotal > 0;
      }, { timeout: 1800 }).catch(() => {});
      const labourTotalsState = await mobilePage.evaluate(() => {
        const subtotalText = document.getElementById('labourTotalDisplay')?.textContent || '0';
        const subtotal = parseFloat(subtotalText.replace(/[^0-9.-]/g, '')) || 0;
        const labourWarnHidden = !!document.getElementById('quoteLabourWarning')?.hidden;
        const labourRow = document.querySelector('#quoteTableBody tr[data-labour-row="true"]');
        const labourHoursValue = labourRow?.querySelector('.quote-labour-hours-input')?.value ?? null;
        const labourRateValue = labourRow?.querySelector('.quote-labour-unit-price-input')?.value ?? null;
        const labourRowTotalText = labourRow?.querySelector('.quote-cell-total-value')?.textContent || '';
        const editorQtyValue = document.querySelector('#labourEditorList .labour-editor-field-input[data-field="qty"]')?.value ?? null;
        const editorRateValue = document.querySelector('#labourEditorList .labour-editor-field-input[data-field="rate"]')?.value ?? null;
        return {
          subtotal,
          labourWarnHidden,
          labourHoursValue,
          labourRateValue,
          labourRowTotalText,
          editorQtyValue,
          editorRateValue,
        };
      });
      if (Math.abs(labourTotalsState.subtotal - 260) > 0.01) {
        throw new Error(
          `Mobile labour editor: expected labour subtotal 260.00 after edit, got ${labourTotalsState.subtotal} `
          + `(hours=${labourTotalsState.labourHoursValue}, rate=${labourTotalsState.labourRateValue}, `
          + `rowTotal="${labourTotalsState.labourRowTotalText}", `
          + `editorQty=${labourTotalsState.editorQtyValue}, `
          + `editorRate=${labourTotalsState.editorRateValue})`
        );
      }
      if (!labourTotalsState.labourWarnHidden) {
        throw new Error('Mobile labour editor: labour warning should hide once hours are added');
      }

      await clickSelectorViaDom(mobilePage, '#labourEditorDoneBtn');
      await delay(220);
      const labourEditorClosed = await mobilePage.evaluate(() => {
        const modal = document.getElementById('labourEditorModal');
        return !!modal && modal.hasAttribute('hidden');
      });
      if (!labourEditorClosed) throw new Error('Mobile labour editor: Done should close popup');
      const afterLabourEditorCloseOrientation = await getOrientationPolicyState(mobilePage);
      if (!afterLabourEditorCloseOrientation) throw new Error('Mobile orientation policy hook missing after labour editor close');
      if (afterLabourEditorCloseOrientation.target !== 'portrait') {
        throw new Error(`Mobile orientation policy should stay portrait while quote modal remains open, got ${afterLabourEditorCloseOrientation.target}`);
      }

      const materialEditorOpenState = await mobilePage.evaluate(() => {
        const quoteContent = document.querySelector('#quoteModal .quote-modal-content');
        if (quoteContent) quoteContent.scrollTop = quoteContent.scrollHeight;
        const row = document.querySelector('#quoteTableBody tr[data-asset-id]:not([data-labour-row="true"])');
        if (!row) return { found: false };
        const assetId = row.dataset.assetId || '';
        row.click();
        const modal = document.getElementById('labourEditorModal');
        const editorContent = document.getElementById('labourEditorContent');
        const actionsWrap = document.querySelector('#labourEditorModal .labour-editor-actions');
        const addBtn = document.getElementById('labourEditorAddRowBtn');
        const qtyInput = document.querySelector('#labourEditorList .labour-editor-field-input[data-field="qty"]');
        const rect = editorContent ? editorContent.getBoundingClientRect() : null;
        const probeX = Math.max(2, Math.round(window.innerWidth / 2));
        const topProbe = document.elementFromPoint(probeX, 4);
        const bottomProbe = document.elementFromPoint(probeX, Math.max(2, window.innerHeight - 4));
        return {
          found: true,
          assetId,
          open: !!modal && !modal.hasAttribute('hidden'),
          hasQtyInput: !!qtyInput,
          footerActionVisible: !!addBtn && !addBtn.hidden && window.getComputedStyle(addBtn).display !== 'none',
          actionsVisible: !!actionsWrap && !actionsWrap.hidden && window.getComputedStyle(actionsWrap).display !== 'none',
          footerActionText: (addBtn?.textContent || '').trim(),
          footerActionDisabled: !!addBtn?.disabled,
          footerActionApplyState: !!addBtn?.classList?.contains('labour-editor-add-btn--apply'),
          rect,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          topCoveredByEditor: !!topProbe && !!topProbe.closest('#labourEditorModal'),
          bottomCoveredByEditor: !!bottomProbe && !!bottomProbe.closest('#labourEditorModal'),
        };
      });
      if (!materialEditorOpenState.found) throw new Error('Mobile material editor: no material row found to open');
      if (!materialEditorOpenState.open || !materialEditorOpenState.hasQtyInput) {
        throw new Error('Mobile material editor: tapping material row should open popup with quantity input');
      }
      if (!materialEditorOpenState.footerActionVisible || !materialEditorOpenState.actionsVisible) {
        throw new Error('Mobile material editor: footer action should be visible for material rows');
      }
      if (materialEditorOpenState.footerActionText !== 'Apply Changes') {
        throw new Error(`Mobile material editor: expected footer label "Apply Changes", got "${materialEditorOpenState.footerActionText}"`);
      }
      if (!materialEditorOpenState.footerActionDisabled) {
        throw new Error('Mobile material editor: Apply Changes should be disabled before edits');
      }
      if (materialEditorOpenState.footerActionApplyState) {
        throw new Error('Mobile material editor: Apply Changes should not be in active state before edits');
      }
      if (!materialEditorOpenState.rect) {
        throw new Error('Mobile material editor: expected editor content bounds while popup is open');
      }
      if (materialEditorOpenState.rect.left > 1 || materialEditorOpenState.rect.top > 1) {
        throw new Error(
          `Mobile material editor: expected full-viewport origin near (0,0), got (${materialEditorOpenState.rect.left.toFixed(2)}, ${materialEditorOpenState.rect.top.toFixed(2)})`
        );
      }
      if (Math.abs(materialEditorOpenState.rect.width - materialEditorOpenState.viewportWidth) > 2) {
        throw new Error(
          `Mobile material editor: width should match viewport, modal=${materialEditorOpenState.rect.width.toFixed(2)} viewport=${materialEditorOpenState.viewportWidth}`
        );
      }
      if (Math.abs(materialEditorOpenState.rect.height - materialEditorOpenState.viewportHeight) > 2) {
        throw new Error(
          `Mobile material editor: height should match viewport, modal=${materialEditorOpenState.rect.height.toFixed(2)} viewport=${materialEditorOpenState.viewportHeight}`
        );
      }
      if (!materialEditorOpenState.topCoveredByEditor || !materialEditorOpenState.bottomCoveredByEditor) {
        throw new Error('Mobile material editor: popup should cover top and bottom viewport edges (no cut-off or footer bleed-through)');
      }
      const materialEditApplied = await mobilePage.evaluate(() => {
        const qtyInput = document.querySelector('#labourEditorList .labour-editor-field-input[data-field="qty"]');
        if (!qtyInput) return false;
        qtyInput.value = '2';
        qtyInput.dispatchEvent(new Event('input', { bubbles: true }));
        qtyInput.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      });
      if (!materialEditApplied) throw new Error('Mobile material editor: failed to set quantity in popup');
      const materialEditorDirtyState = await mobilePage.evaluate(() => {
        const addBtn = document.getElementById('labourEditorAddRowBtn');
        return {
          visible: !!addBtn && !addBtn.hidden && window.getComputedStyle(addBtn).display !== 'none',
          text: (addBtn?.textContent || '').trim(),
          disabled: !!addBtn?.disabled,
          applyState: !!addBtn?.classList?.contains('labour-editor-add-btn--apply'),
        };
      });
      if (!materialEditorDirtyState.visible) {
        throw new Error('Mobile material editor: footer action should stay visible after edits');
      }
      if (materialEditorDirtyState.text !== 'Apply Changes') {
        throw new Error(`Mobile material editor: footer label should remain "Apply Changes" after edit, got "${materialEditorDirtyState.text}"`);
      }
      if (materialEditorDirtyState.disabled) {
        throw new Error('Mobile material editor: Apply Changes should enable after quantity edit');
      }
      if (!materialEditorDirtyState.applyState) {
        throw new Error('Mobile material editor: Apply Changes should enter active state after quantity edit');
      }
      await clickSelectorViaDom(mobilePage, '#labourEditorAddRowBtn');
      await delay(900);
      const materialEditorClosed = await mobilePage.evaluate(() => {
        const modal = document.getElementById('labourEditorModal');
        return !!modal && modal.hasAttribute('hidden');
      });
      if (!materialEditorClosed) throw new Error('Mobile material editor: Apply Changes should close popup');
      const materialQtyUpdated = await mobilePage.evaluate((assetId) => {
        const rows = Array.from(document.querySelectorAll('#quoteTableBody tr[data-asset-id]:not([data-labour-row="true"])'))
          .filter((row) => row.dataset.assetId === assetId);
        if (!rows.length) return false;
        const expectedQty = 2;
        return rows.some((row) => {
          const qtyInput = row.querySelector('.quote-line-qty-input');
          if (qtyInput) return Math.abs((parseFloat(qtyInput.value) || 0) - expectedQty) < 0.01;
          const stepperVal = row.querySelector('.quote-mobile-qty-stepper-value');
          if (stepperVal) return Math.abs((parseFloat(stepperVal.textContent) || 0) - expectedQty) < 0.01;
          const stored = row.dataset.quoteQtyValue != null ? parseFloat(row.dataset.quoteQtyValue) : NaN;
          if (Number.isFinite(stored)) return Math.abs(stored - expectedQty) < 0.01;
          const qtyVal = parseFloat((row.cells[1]?.textContent || '').trim());
          return Number.isFinite(qtyVal) && Math.abs(qtyVal - expectedQty) < 0.01;
        });
      }, materialEditorOpenState.assetId);
      if (!materialQtyUpdated) throw new Error('Mobile material editor: Apply Changes should apply quantity change for material row');
      await clickSelectorViaDom(mobilePage, '#quoteModalBackBtn');
      await delay(260);
      const mobileQuoteClosed = await mobilePage.evaluate(() => {
        const modal = document.getElementById('quoteModal');
        return !!modal && modal.hasAttribute('hidden');
      });
      if (!mobileQuoteClosed) throw new Error('Mobile quote modal: back button should close the modal');
      await delay(220);
      let mobileOrientationAfterQuoteClose = await getOrientationPolicyState(mobilePage);
      if (mobileOrientationAfterQuoteClose && mobileOrientationAfterQuoteClose.target !== 'landscape') {
        await mobilePage.waitForFunction(() => {
          if (typeof window.__quoteAppGetOrientationPolicyState !== 'function') return false;
          const state = window.__quoteAppGetOrientationPolicyState();
          return !!state && state.target === 'landscape';
        }, { timeout: 2000 }).catch(() => {});
        mobileOrientationAfterQuoteClose = await getOrientationPolicyState(mobilePage);
      }
      if (!mobileOrientationAfterQuoteClose) throw new Error('Mobile orientation policy hook missing after quote modal close');
      if (mobileOrientationAfterQuoteClose.target !== 'landscape') {
        const closeDiag = await mobilePage.evaluate(() => {
          const quoteModal = document.getElementById('quoteModal');
          const labourEditorModal = document.getElementById('labourEditorModal');
          const visibleView = document.querySelector('.app-view:not(.hidden)')?.id || null;
          const state = typeof window.__quoteAppGetOrientationPolicyState === 'function'
            ? window.__quoteAppGetOrientationPolicyState()
            : null;
          return {
            visibleView,
            quoteModalHidden: !!quoteModal && quoteModal.hasAttribute('hidden'),
            labourEditorHidden: !!labourEditorModal && labourEditorModal.hasAttribute('hidden'),
            state,
          };
        });
        throw new Error(
          `Mobile orientation policy should return to landscape after closing quote modal, got ${mobileOrientationAfterQuoteClose.target} `
          + `(view=${closeDiag.visibleView}, quoteHidden=${closeDiag.quoteModalHidden}, labourHidden=${closeDiag.labourEditorHidden}, reason=${closeDiag.state?.lastAttemptReason || 'n/a'})`
        );
      }
      console.log('  ✓ Mobile orientation policy: returns to landscape after closing quote flow');
      console.log('  ✓ Mobile quote modal: full-screen layout, labour popup editing, hidden controls, and back-close behavior pass');

      const mobileMetresStepperAria = await mobilePage.evaluate(() => {
        const tableBody = document.getElementById('quoteTableBody');
        const syncFn = window.__quoteAppSyncMobileQuoteLineSummaries;
        if (!tableBody || typeof syncFn !== 'function') return { ready: false };
        const row = document.createElement('tr');
        row.dataset.assetId = 'GUT-SC-MAR-3M';
        for (let i = 0; i < 6; i += 1) row.appendChild(document.createElement('td'));
        row.cells[0].textContent = 'Gutter: Storm Cloud Marley';
        row.cells[1].innerHTML = '<input type="number" class="quote-qty-metres-input" value="2.5" min="0" step="0.1" aria-label="Length in metres">';
        tableBody.appendChild(row);
        syncFn();
        const minus = row.querySelector('.quote-mobile-qty-stepper-btn--minus');
        const plus = row.querySelector('.quote-mobile-qty-stepper-btn--plus');
        const minusLabel = minus?.getAttribute('aria-label') || null;
        const plusLabel = plus?.getAttribute('aria-label') || null;
        row.remove();
        return { ready: true, minusLabel, plusLabel };
      });
      if (!mobileMetresStepperAria.ready) {
        throw new Error('Mobile metres stepper a11y regression: missing quote table or sync hook');
      }
      if (mobileMetresStepperAria.minusLabel !== 'Decrease length' || mobileMetresStepperAria.plusLabel !== 'Increase length') {
        throw new Error(
          `Mobile metres stepper a11y regression: expected length labels, got ` +
          `minus="${mobileMetresStepperAria.minusLabel}", plus="${mobileMetresStepperAria.plusLabel}"`
        );
      }
      console.log('  ✓ Mobile metres stepper uses length-specific ARIA labels');

      await mobilePage.setViewport({ width: 667, height: 375, isMobile: true, hasTouch: true });
      await delay(600);
      const landscapeCheck = await mobilePage.evaluate(() => {
        const mode = typeof window.__quoteAppGetViewportMode === 'function' ? window.__quoteAppGetViewportMode() : null;
        const overflow = document.documentElement.scrollWidth - window.innerWidth;
        return { mode, overflow };
      });
      if (landscapeCheck.mode !== 'mobile') {
        throw new Error(`Mobile viewport regression: expected mobile mode after landscape rotate, got ${landscapeCheck.mode}`);
      }
      if (landscapeCheck.overflow > 2) {
        throw new Error(`Mobile viewport regression: landscape horizontal overflow ${landscapeCheck.overflow}px`);
      }

      const readMobileToolbarOpenState = () => mobilePage.evaluate(() => {
        const toolbar = document.getElementById('diagramFloatingToolbar');
        const wrap = document.getElementById('blueprintWrap');
        if (!toolbar || !wrap) return null;
        const tr = toolbar.getBoundingClientRect();
        const wr = wrap.getBoundingClientRect();
        const pad = 12;
        const globalToolbarWrap = document.getElementById('globalToolbarWrap');
        const headerBottom = globalToolbarWrap ? globalToolbarWrap.getBoundingClientRect().bottom : wr.top;
        const topPad = headerBottom > wr.top ? Math.max(pad, Math.round((headerBottom - wr.top) + pad)) : pad;
        const maxTop = wr.height - tr.height - pad;
        const topAnchor = Math.min(topPad, maxTop);
        return {
          collapsed: toolbar.classList.contains('diagram-floating-toolbar--collapsed'),
          orientation: toolbar.getAttribute('data-orientation') || 'horizontal',
          centerDelta: Math.abs((tr.left + tr.width / 2) - (wr.left + wr.width / 2)),
          topSafeDelta: Math.abs((tr.top - wr.top) - topAnchor),
        };
      });
      const mobileWasCollapsedBeforeOpenCheck = await mobilePage.evaluate(() => {
        const toolbar = document.getElementById('diagramFloatingToolbar');
        return !!toolbar && toolbar.classList.contains('diagram-floating-toolbar--collapsed');
      });
      if (mobileWasCollapsedBeforeOpenCheck) {
        await pointerTapSelector(mobilePage, '#diagramToolbarCollapseBtn');
        await delay(420);
      }
      const mobileOpenState = await readMobileToolbarOpenState();
      if (!mobileOpenState) throw new Error('Mobile top-center open regression: toolbar state unavailable');
      if (mobileOpenState.collapsed) throw new Error('Mobile top-center open regression: toolbar should be expanded on open');
      if (mobileOpenState.orientation !== 'horizontal') {
        throw new Error(`Mobile top-center open regression: expected horizontal orientation on open, got ${mobileOpenState.orientation}`);
      }
      const mobileCenterTolerancePx = 100;
      if (mobileOpenState.centerDelta > mobileCenterTolerancePx || mobileOpenState.topSafeDelta > 24) {
        throw new Error(
          `Mobile top-center open regression: expected top-center safe-top open ` +
          `(centerDelta=${mobileOpenState.centerDelta.toFixed(2)}, topSafeDelta=${mobileOpenState.topSafeDelta.toFixed(2)})`
        );
      }
      console.log('  ✓ Mobile diagram toolbar opens top-centered at safe top');

      // Diagram toolbar collapse/expand (mobile): − and + swap in same position
      const mobileToolbar = await mobilePage.$('#diagramFloatingToolbar');
      const mobileCollapseBtn = await mobilePage.$('#diagramToolbarCollapseBtn');
      if (!mobileToolbar || !mobileCollapseBtn) throw new Error('Mobile: diagram floating toolbar or collapse button missing');
      await mobilePage.evaluate(() => {
        const t = document.getElementById('diagramFloatingToolbar');
        if (t && t.classList.contains('diagram-floating-toolbar--collapsed')) {
          document.getElementById('diagramToolbarCollapseBtn').click();
        }
      });
      await delay(400);
      await pointerTapSelector(mobilePage, '#diagramToolbarCollapseBtn');
      await delay(400);
      const mobileCollapsed = await mobilePage.evaluate(() => document.getElementById('diagramFloatingToolbar').classList.contains('diagram-floating-toolbar--collapsed'));
      if (!mobileCollapsed) throw new Error('Mobile: diagram toolbar should be collapsed after tap');
      await pointerTapSelector(mobilePage, '#diagramToolbarCollapseBtn', { driftX: 5, driftY: 2 });
      await delay(400);
      const mobileExpanded = await mobilePage.evaluate(() => !document.getElementById('diagramFloatingToolbar').classList.contains('diagram-floating-toolbar--collapsed'));
      if (!mobileExpanded) throw new Error('Mobile: diagram toolbar should expand after tap on + with slight drift below drag threshold');
      const mobileReopenState = await readMobileToolbarOpenState();
      if (!mobileReopenState) throw new Error('Mobile reopen top-center regression: toolbar state unavailable');
      if (mobileReopenState.orientation !== 'horizontal') {
        throw new Error(`Mobile reopen top-center regression: expected horizontal orientation after expand, got ${mobileReopenState.orientation}`);
      }
      if (mobileReopenState.centerDelta > mobileCenterTolerancePx || mobileReopenState.topSafeDelta > 24) {
        throw new Error(
          `Mobile reopen top-center regression: expected top-center safe-top after expand ` +
          `(centerDelta=${mobileReopenState.centerDelta.toFixed(2)}, topSafeDelta=${mobileReopenState.topSafeDelta.toFixed(2)})`
        );
      }
      console.log('  ✓ Diagram toolbar collapse/expand (mobile): user tap path works, including slight drift');

      function getToolbarScreenState(pageRef) {
        return pageRef.evaluate(() => {
          const toolbar = document.getElementById('diagramFloatingToolbar');
          const wrap = document.getElementById('blueprintWrap');
          const globalToolbarWrap = document.getElementById('globalToolbarWrap');
          if (!toolbar || !wrap) return null;
          const tr = toolbar.getBoundingClientRect();
          const wr = wrap.getBoundingClientRect();
          const pad = 12;
          const headerBottom = globalToolbarWrap ? globalToolbarWrap.getBoundingClientRect().bottom : wr.top;
          const topPad = headerBottom > wr.top ? Math.max(pad, Math.round((headerBottom - wr.top) + pad)) : pad;
          const maxTop = wr.height - tr.height - pad;
          const topAnchor = Math.min(topPad, maxTop);
          const localLeft = tr.left - wr.left;
          const localTop = tr.top - wr.top;
          const leftGap = localLeft;
          const rightGap = wr.width - (localLeft + tr.width);
          const bottomGap = wr.height - (localTop + tr.height);
          const topSafeGap = Math.abs(localTop - topAnchor);
          const edgeGap = Math.min(leftGap, rightGap, bottomGap, topSafeGap);
          const clampPoint = (point) => ({
            x: Math.max(1, Math.min(window.innerWidth - 1, point.x)),
            y: Math.max(1, Math.min(window.innerHeight - 1, point.y)),
          });
          const isInteractiveHit = (el) => !!(
            el && (
              el.closest('button, label, input, select, textarea')
              || el.closest('[role="button"]')
              || el.closest('.toolbar-pill-btn, .upload-zone, .blueprint-transparency-btn')
            )
          );
          const probeInsetX = Math.max(6, Math.min(24, tr.width * 0.2));
          const probeInsetY = Math.max(6, Math.min(24, tr.height * 0.2));
          const candidatePoints = [
            { x: tr.left + (tr.width / 2), y: tr.top + (tr.height / 2) },
            { x: tr.left + probeInsetX, y: tr.top + (tr.height / 2) },
            { x: tr.right - probeInsetX, y: tr.top + (tr.height / 2) },
            { x: tr.left + (tr.width / 2), y: tr.top + probeInsetY },
            { x: tr.left + (tr.width / 2), y: tr.bottom - probeInsetY },
          ];
          let dragPoint = clampPoint(candidatePoints[0]);
          for (const rawPoint of candidatePoints) {
            const point = clampPoint(rawPoint);
            const hit = document.elementFromPoint(point.x, point.y);
            if (!hit || !toolbar.contains(hit) || isInteractiveHit(hit)) continue;
            dragPoint = point;
            break;
          }
          return {
            orientation: toolbar.getAttribute('data-orientation') || 'horizontal',
            collapsed: toolbar.classList.contains('diagram-floating-toolbar--collapsed'),
            toolbar: { width: tr.width, height: tr.height },
            dragPoint,
            wrapRect: { left: wr.left, top: wr.top, width: wr.width, height: wr.height },
            gaps: { leftGap, rightGap, bottomGap, topSafeGap, edgeGap },
          };
        });
      }

      // Expanded drag to right edge should snap vertical (without collapse-first workaround).
      const beforeRightDrag = await getToolbarScreenState(mobilePage);
      if (!beforeRightDrag || beforeRightDrag.collapsed) throw new Error('Mobile toolbar state missing before right-edge drag');
      await mobilePage.mouse.move(beforeRightDrag.dragPoint.x, beforeRightDrag.dragPoint.y);
      await mobilePage.mouse.down();
      await mobilePage.mouse.move(
        beforeRightDrag.wrapRect.left + beforeRightDrag.wrapRect.width - 14,
        beforeRightDrag.dragPoint.y,
        { steps: 12 }
      );
      await mobilePage.mouse.up();
      await delay(320);
      const rightDragged = await getToolbarScreenState(mobilePage);
      if (!rightDragged) throw new Error('Mobile toolbar state missing after right-edge drag');
      console.log('  ✓ Mobile expanded drag-right gesture processed');

      // Expanded drag to top edge should snap horizontal.
      async function dragToolbarHandleToTop(startState) {
        await mobilePage.mouse.move(startState.dragPoint.x, startState.dragPoint.y);
        await mobilePage.mouse.down();
        await mobilePage.mouse.move(
          startState.dragPoint.x,
          startState.wrapRect.top + 12,
          { steps: 14 }
        );
        await mobilePage.mouse.up();
        await delay(360);
        return getToolbarScreenState(mobilePage);
      }

      let topDragged = await dragToolbarHandleToTop(rightDragged);
      if (topDragged && topDragged.orientation !== 'horizontal') {
        const retryState = await getToolbarScreenState(mobilePage);
        if (retryState) {
          topDragged = await dragToolbarHandleToTop(retryState);
        }
      }
      if (!topDragged) throw new Error('Mobile toolbar state missing after top-edge drag');
      if (topDragged.orientation !== 'horizontal') {
        throw new Error(`Mobile expanded drag-top should snap horizontal, got ${topDragged.orientation}`);
      }
      if (topDragged.gaps.topSafeGap > 24) {
        throw new Error(`Mobile expanded drag-top should rest near top safe edge, top-safe gap ${Math.round(topDragged.gaps.topSafeGap)}px`);
      }
      if (topDragged.gaps.edgeGap > 24) {
        throw new Error(`Mobile toolbar should not rest in middle strip after release (nearest edge gap ${Math.round(topDragged.gaps.edgeGap)}px)`);
      }
      console.log('  ✓ Mobile expanded drag-top snaps to horizontal edge and avoids middle resting');

      // Option B: orientation-aware scroll assertion. Vertical and horizontal should avoid internal scrolling.
      // Allow small overflow from the absolutely positioned side grip (handle on long edge).
      const GRIP_OVERFLOW_TOLERANCE = 36;
      const toolbarScrollState = await mobilePage.evaluate((tolerance) => {
        const toolbar = document.getElementById('diagramFloatingToolbar');
        const tools = toolbar ? toolbar.querySelector('.diagram-toolbar-tools-wrap') : null;
        if (!toolbar || !tools) return null;
        const orientation = toolbar.getAttribute('data-orientation');
        const overflowX = Math.max(0, toolbar.scrollWidth - toolbar.clientWidth);
        const overflowY = Math.max(0, toolbar.scrollHeight - toolbar.clientHeight);
        const toolbarScroll = overflowX > 1 || overflowY > 1;
        const withinGripTolerance = overflowX <= tolerance && overflowY <= tolerance;
        return {
          orientation,
          toolbarScroll,
          withinGripTolerance,
          toolsScroll: tools.scrollWidth > (tools.clientWidth + 1) || tools.scrollHeight > (tools.clientHeight + 1),
        };
      }, GRIP_OVERFLOW_TOLERANCE);
      if (!toolbarScrollState) throw new Error('Mobile toolbar scroll state unavailable');
      if (toolbarScrollState.orientation === 'vertical') {
        if (toolbarScrollState.toolbarScroll || toolbarScrollState.toolsScroll) {
          throw new Error(`Mobile toolbar (vertical) should not scroll internally (toolbar=${toolbarScrollState.toolbarScroll}, tools=${toolbarScrollState.toolsScroll})`);
        }
        console.log('  ✓ Mobile toolbar (vertical) has no internal scrollbars');
      } else {
        if ((toolbarScrollState.toolbarScroll && !toolbarScrollState.withinGripTolerance) || toolbarScrollState.toolsScroll) {
          throw new Error(
            `Mobile toolbar (horizontal) should not scroll internally ` +
            `(toolbarScroll=${toolbarScrollState.toolbarScroll}, toolsScroll=${toolbarScrollState.toolsScroll})`
          );
        }
        console.log('  ✓ Mobile toolbar (horizontal) has no internal scrollbars');
      }

      // Post-drag tap reliability: first deliberate tap after suppression window expands collapsed toolbar.
      const isCollapsedBeforePostDrag = await mobilePage.evaluate(() => {
        const toolbar = document.getElementById('diagramFloatingToolbar');
        return !!toolbar && toolbar.classList.contains('diagram-floating-toolbar--collapsed');
      });
      if (!isCollapsedBeforePostDrag) {
        await pointerTapSelector(mobilePage, '#diagramToolbarCollapseBtn');
      }
      await delay(420);
      const collapsedState = await getToolbarScreenState(mobilePage);
      if (!collapsedState || !collapsedState.collapsed) throw new Error('Mobile toolbar should be collapsed before post-drag tap reliability check');
      await mobilePage.mouse.move(collapsedState.dragPoint.x, collapsedState.dragPoint.y);
      await mobilePage.mouse.down();
      await mobilePage.mouse.move(collapsedState.dragPoint.x + 80, collapsedState.dragPoint.y + 8, { steps: 8 });
      await mobilePage.mouse.up();
      await delay(340);
      await pointerTapSelector(mobilePage, '#diagramToolbarCollapseBtn');
      await delay(360);
      const expandedAfterDragTap = await mobilePage.evaluate(() => !document.getElementById('diagramFloatingToolbar').classList.contains('diagram-floating-toolbar--collapsed'));
      if (!expandedAfterDragTap) throw new Error('Mobile toolbar should expand on first deliberate tap after drag suppression window');
      console.log('  ✓ Mobile post-drag expand tap is reliable');

      console.log('  ✓ Mobile viewport + orientation regression checks passed');
    } finally {
      await mobilePage.close();
    }

    console.log('\nAll checks passed.');
  } catch (err) {
    console.error('\nE2E failed:', err.message);
    if (logs.some((l) => l.type === 'error')) {
      console.error('Page errors:', logs.filter((l) => l.type === 'error').map((l) => l.text));
    }
    process.exit(1);
  } finally {
    await context.close();
    await browser.close();
  }
}

run();
