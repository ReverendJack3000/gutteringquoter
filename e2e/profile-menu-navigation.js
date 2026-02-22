/**
 * E2E: Desktop profile menu → Product Management / User Permissions navigation.
 * Verifies that clicking #menuItemProducts and #menuItemUserPermissions switches
 * to #view-products and #view-user-permissions (and diagnoses when it does not).
 *
 * Run (local):     node e2e/profile-menu-navigation.js
 * Run (production): BASE_URL=https://your-app.up.railway.app node e2e/profile-menu-navigation.js
 *
 * Start local server first: ./scripts/run-server.sh  or  cd backend && uvicorn main:app --reload --host 127.0.0.1 --port 8000
 */
const puppeteer = require('puppeteer');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8000';
const HEADED = process.env.HEADED === '1' || process.env.HEADED === 'true';

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function getVisibleViewId(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.app-view:not(.hidden)');
    return el ? el.id : null;
  });
}

async function ensureCanvasView(page) {
  await page.evaluate(() => {
    if (typeof window.__quoteAppSwitchView === 'function') {
      window.__quoteAppSwitchView('view-canvas');
    }
  });
  await delay(600);
}

async function main() {
  const browser = await puppeteer.launch({
    headless: !HEADED,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: null,
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);
  page.setDefaultNavigationTimeout(10000);

  const url = `${BASE_URL.replace(/\/$/, '')}/?viewport=desktop`;
  console.log('Loading', url);
  const res = await page.goto(url, { waitUntil: 'networkidle2' });
  if (!res || !res.ok()) {
    console.error('Page load failed:', res ? res.status() : 'no response');
    await browser.close();
    process.exit(1);
  }

  await page.waitForSelector('.app', { timeout: 8000 });
  await delay(1500);

  await ensureCanvasView(page);

  const wrap = await page.$('#userProfileWrap');
  const dropdown = await page.$('#profileDropdown');
  const menuProducts = await page.$('#menuItemProducts');
  const menuUserPerms = await page.$('#menuItemUserPermissions');

  const diag = await page.evaluate(() => {
    const wrap = document.getElementById('userProfileWrap');
    const dropdown = document.getElementById('profileDropdown');
    const products = document.getElementById('menuItemProducts');
    const perms = document.getElementById('menuItemUserPermissions');
    const viewProducts = document.getElementById('view-products');
    const viewPerms = document.getElementById('view-user-permissions');
    return {
      userProfileWrapExists: !!wrap,
      userProfileWrapHidden: wrap ? wrap.hidden : true,
      profileDropdownExists: !!dropdown,
      profileDropdownHidden: dropdown ? dropdown.hidden : true,
      menuItemProductsExists: !!products,
      menuItemUserPermissionsExists: !!perms,
      viewProductsExists: !!viewProducts,
      viewProductsHidden: viewProducts ? viewProducts.classList.contains('hidden') : true,
      viewUserPermissionsExists: !!viewPerms,
      viewUserPermissionsHidden: viewPerms ? viewPerms.classList.contains('hidden') : true,
      visibleViewId: (document.querySelector('.app-view:not(.hidden)') || {}).id || null,
    };
  });
  console.log('Initial DOM state:', JSON.stringify(diag, null, 2));

  if (!menuProducts) {
    console.error('FAIL: #menuItemProducts not found in DOM');
    await browser.close();
    process.exit(1);
  }

  // Force profile dropdown visible so we can click the item (avoids requiring real auth in CI).
  await page.evaluate(() => {
    const wrap = document.getElementById('userProfileWrap');
    const dropdown = document.getElementById('profileDropdown');
    if (wrap) wrap.hidden = false;
    if (dropdown) dropdown.hidden = false;
  });
  await delay(200);

  // Real mouse click on "Product Management" (bubbles like user click; reproduces production).
  const visibleBefore = await getVisibleViewId(page);
  console.log('Visible view before click:', visibleBefore);

  const menuProductsHandle = await page.$('#menuItemProducts');
  if (!menuProductsHandle) {
    console.error('FAIL: #menuItemProducts not found after forcing dropdown visible');
    await browser.close();
    process.exit(1);
  }
  await menuProductsHandle.click();
  await menuProductsHandle.dispose();
  await delay(500);

  const visibleAfterProducts = await getVisibleViewId(page);
  console.log('Visible view after clicking Product Management:', visibleAfterProducts);

  const viewProductsHidden = await page.evaluate(() => {
    const v = document.getElementById('view-products');
    return v ? v.classList.contains('hidden') : true;
  });

  if (visibleAfterProducts !== 'view-products' || viewProductsHidden) {
    const diagAfter = await page.evaluate(() => {
      const wrap = document.getElementById('userProfileWrap');
      const dropdown = document.getElementById('profileDropdown');
      const viewProducts = document.getElementById('view-products');
      return {
        visibleViewId: (document.querySelector('.app-view:not(.hidden)') || {}).id || null,
        viewProductsHidden: viewProducts ? viewProducts.classList.contains('hidden') : true,
        profileDropdownHidden: dropdown ? dropdown.hidden : true,
        userProfileWrapHidden: wrap ? wrap.hidden : true,
        hasSwitchView: typeof window.__quoteAppSwitchView === 'function',
      };
    });
    console.error('FAIL: After clicking Product Management, expected visible view view-products.');
    console.error('Diagnostics:', JSON.stringify(diagAfter, null, 2));

    // Sanity: can we switch view programmatically? (rules out switchView/view DOM broken)
    await page.evaluate(() => {
      if (typeof window.__quoteAppSwitchView === 'function') {
        window.__quoteAppSwitchView('view-products');
      }
    });
    await delay(300);
    const visibleAfterProgrammatic = await getVisibleViewId(page);
    console.error('After __quoteAppSwitchView("view-products") visible view:', visibleAfterProgrammatic);
    if (visibleAfterProgrammatic === 'view-products') {
      console.error('→ Conclusion: switchView works; the menu item click is not triggering it (event order or target).');
    } else {
      console.error('→ Conclusion: programmatic switchView also did not show view-products.');
    }
    await browser.close();
    process.exit(1);
  }
  console.log('  ✓ Product Management click → view-products visible');

  // Back to canvas then test User Permissions (optional; menu item may be hidden for non-admin).
  await page.evaluate(() => {
    if (typeof window.__quoteAppSwitchView === 'function') {
      window.__quoteAppSwitchView('view-canvas');
    }
  });
  await delay(400);

  await page.evaluate(() => {
    const wrap = document.getElementById('userProfileWrap');
    const dropdown = document.getElementById('profileDropdown');
    if (wrap) wrap.hidden = false;
    if (dropdown) dropdown.hidden = false;
  });
  await delay(200);

  const userPermsVisible = await page.evaluate(() => {
    const el = document.getElementById('menuItemUserPermissions');
    return el && !el.hidden;
  });
  if (userPermsVisible) {
    const menuPermsHandle = await page.$('#menuItemUserPermissions');
    if (menuPermsHandle) {
      await menuPermsHandle.click();
      await menuPermsHandle.dispose();
    }
    await delay(500);
    const visibleAfterPerms = await getVisibleViewId(page);
    const viewPermsHidden = await page.evaluate(() => {
      const v = document.getElementById('view-user-permissions');
      return v ? v.classList.contains('hidden') : true;
    });
    if (visibleAfterPerms !== 'view-user-permissions' || viewPermsHidden) {
      console.error('FAIL: After clicking User Permissions, expected visible view view-user-permissions. Got:', visibleAfterPerms, 'view-user-permissions hidden:', viewPermsHidden);
      await browser.close();
      process.exit(1);
    }
    console.log('  ✓ User Permissions click → view-user-permissions visible');
  } else {
    console.log('  ⊘ User Permissions menu item not visible (expected when not admin), skip');
  }

  await browser.close();
  console.log('Profile menu navigation E2E: all checks passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
