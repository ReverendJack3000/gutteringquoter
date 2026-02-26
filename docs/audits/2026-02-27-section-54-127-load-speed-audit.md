# 2026-02-27 Section 54.127 Load-Speed Implementation Audit

**Purpose:** Audit the 54.127 load-speed changes (lazy admin-products-bonus module, panel thumb pipeline, fingerprinting/cache) for regressions. No fixes are applied in this document; it provides file and line references so fixes can be implemented in a follow-up session.

---

## Scope

- **Lazy module:** `frontend/modules/admin-products-bonus.js` loaded via dynamic `import()` from `frontend/app.js`; init/fetch for products, user-permissions, material-rules, bonus-admin, technician-bonus routed through it.
- **Panel thumbs:** Versioned local PNG thumbs under `frontend/assets/marley/thumbs/`; `getVersionedLocalMarleyThumbUrl()` in app.js; single-path thumb hydration (IntersectionObserver + `data-thumb-img-src`); runtime filled-SVG blob transform path removed.
- **Fingerprinting/cache:** `STATIC_ASSET_VERSION` in app.js; `ASSET_VERSION` in service-worker.js; version query params in index.html; backend `_is_static_cacheable_path` and cache headers for `/modules/`.
- **Validation:** No code changes in this audit; findings only.

---

## Key Files and Line References

| File | Relevant lines | Purpose |
|------|----------------|--------|
| **frontend/app.js** | 1–10 | `STATIC_ASSET_VERSION`, toolbar import with version. |
| **frontend/app.js** | 11777–11840 | `ADMIN_PRODUCTS_BONUS_MODULE_URL`, `ensureAdminProductsBonusController()`, `getAdminProductsBonusDeps()`, `initProductsView()` (void + catch). |
| **frontend/app.js** | 11841–11988 | `renderProductLibrary()`, `update*MenuVisibility()`, `openTechnicianBonusView`, `syncAdminDesktopAccess`, `fetchUserPermissions`, `initUserPermissionsView`, `fetchMaterialRules`, `initMaterialRulesView`, `fetchBonusAdminPeriods`, `initBonusAdminView`, `startTechnicianBonusPolling`, `fetchTechnicianBonusDashboard`, `initTechnicianBonusView`. |
| **frontend/app.js** | 13111–13126 | `getVersionedLocalMarleyThumbUrl(url)` – returns `/assets/marley/thumbs/{stem}.png?v=...` only when path matches `/assets/marley/{stem}.svg`. |
| **frontend/app.js** | 13127–13354 | `renderProducts(products)` – grid thumb creation, `thumbImgSrc = getVersionedLocalMarleyThumbUrl(fallbackThumbSrc) \|\| fallbackThumbSrc`, `data-thumb-img-src`, IntersectionObserver callback, else-branch eager set of `img.src`; facepile (first 3) same `thumbImgSrc` logic, no `onerror`. |
| **frontend/app.js** | 14475–14553 | `switchView(viewId)` – `view-products` branch: `initProductsView()`, `renderProductLibrary()` (not awaited, no .catch). |
| **frontend/app.js** | 14567–14592 | `scheduleDeferredInitializers()` – `initProductsView()` in idle callback. |
| **frontend/index.html** | 15, 1368–1369 | Versioned links: `styles.css?v=20260226-loadspeed2`, `app.js?v=...`, `pwa.js?v=...`. |
| **frontend/service-worker.js** | 1–35 | `ASSET_VERSION`, `SHELL_ASSETS` including `/modules/admin-products-bonus.js?v=...`, install/activate. |
| **backend/main.py** | 992–1018 | `_is_static_cacheable_path()` (includes `/modules/`), `apply_static_cache_headers` middleware, fingerprint `v` query → immutable cache. |
| **backend/app/products.py** | 20–48 | `_diagram_url_with_normalized()`, `_row_to_product()` – `diagram_url`/`thumbnail_url` from DB, can be empty. |
| **frontend/assets/marley/thumbs/** | (39 PNGs) | Generated thumbs: names match diagram stems (e.g. `gutter-storm-cloud.png`, `elbow-43-65.png`), not product IDs (e.g. `GUT-SC-MAR`). |
| **scripts/generate_panel_thumbs.py** | (full file) | Generator for panel thumbs; input SVGs from `frontend/assets/marley`, output to `frontend/assets/marley/thumbs`. |

---

## Findings

### F1: Unhandled rejection when switching to Products view and module fails (Minor)

- **Location:** `frontend/app.js` – `switchView()` for `viewId === 'view-products'`.
- **Exact lines:** ~14536–14539:
  - `initProductsView();`
  - `renderProductLibrary();`
- **Issue:** `renderProductLibrary()` returns a Promise and is not awaited; it has no `.catch()`. If `ensureAdminProductsBonusController()` rejects (e.g. module 404 or factory missing), the rejection is unhandled. Console shows unhandled rejection; Products view may stay empty.
- **Severity:** Low when module is deployed and versioned correctly; appears when module URL is wrong or file is missing.
- **Fix (for next session):** In the `view-products` branch, either:
  - `void renderProductLibrary().catch((e) => console.warn('renderProductLibrary failed', e));`, or
  - Equivalent handling so the promise is never left unhandled.

---

### F2: Panel and facepile thumb images show broken when PNG 404s (Regression)

- **Locations:**
  - **Panel grid:** `frontend/app.js` – `renderProducts()`: thumb `<img>` created and later its `src` is set to `thumbImgSrc` (PNG or SVG). No `onerror` handler.
  - **Facepile (mobile collapsed):** same function, facepile block: `img.src = thumbImgSrc` with no `onerror`.
- **Exact lines:**
  - **Grid:** ~13174–13189: `fallbackThumbSrc` and `thumbImgSrc` computed; ~13184–13189: `thumb.dataset.thumbImgSrc = thumbImgSrc`; img created with `img.src = TRANSPARENT_PIXEL_DATA_URL`; later in IntersectionObserver callback ~13311: `imgEl.src = src`; in else branch ~13326–13328: `imgEl.src = src`.
  - **Facepile:** ~13336–13352: first 3 products, `thumbImgSrc = getVersionedLocalMarleyThumbUrl(fallbackThumbSrc) || fallbackThumbSrc`, `img.src = thumbImgSrc` (~13348).
- **Issue:** When `getVersionedLocalMarleyThumbUrl(fallbackThumbSrc)` returns a PNG URL that does not exist (e.g. product has no `diagram_url`, so `fallbackThumbSrc = /assets/marley/${p.id}.svg` → stem `GUT-SC-MAR` → request `/assets/marley/thumbs/GUT-SC-MAR.png` which is not in the 39 generated thumbs), the image request 404s and the `<img>` shows broken. There is no `onerror` to fall back to `fallbackThumbSrc` (SVG) or a placeholder.
- **Data path:** Backend `backend/app/products.py` – `_row_to_product()` uses `row.get("diagram_url", "")` and `row.get("thumbnail_url", "")`; both can be empty. Frontend then uses `/assets/marley/${p.id}.svg` and derives thumb URL from that, which can point to a non-existent PNG.
- **Severity:** Medium for products without `diagram_url`/`thumbnail_url` (e.g. legacy DB or manual product add); low when all products have correct diagram URLs that match generated thumb stems.
- **Fix (for next session):**
  - Store fallback for each thumb so `onerror` can use it (e.g. `data-fallback-src` or closure over `fallbackThumbSrc`).
  - In **panel grid:** when setting `img.src` (both in IntersectionObserver callback and in the else-branch eager path), add `img.onerror` that sets `img.src` to the stored fallback (and optionally to a data-URI placeholder if desired).
  - In **facepile:** add `img.onerror` that sets `img.src` to `fallbackThumbSrc` (or placeholder). Ensure `fallbackThumbSrc` is in scope or stored on the element.

---

### F3: Version and cache consistency (Pass)

- **Locations:** `frontend/app.js` (STATIC_ASSET_VERSION), `frontend/service-worker.js` (ASSET_VERSION), `frontend/index.html` (link/script `?v=`).
- **Exact lines:** `app.js` ~7; `service-worker.js` ~2; `index.html` ~15, ~1368–1369.
- **Finding:** All use `20260226-loadspeed2`. Versioned module URL gets immutable cache via backend when `v` query is present. No inconsistency found.

---

### F4: Backend `/modules/` static cache (Pass)

- **Location:** `backend/main.py` – `_is_static_cacheable_path()`, `apply_static_cache_headers`.
- **Exact lines:** ~992–995 (`/modules/` in path check), ~1012–1016 (fingerprinted request gets `FINGERPRINTED_CACHE_CONTROL`).
- **Finding:** Versioned `/modules/admin-products-bonus.js?v=...` receives long-lived immutable cache; new deploys use new version param. No regression.

---

### F5: Service worker precache (Pass)

- **Location:** `frontend/service-worker.js` – `SHELL_ASSETS`, install handler.
- **Exact lines:** ~9–26 (SHELL_ASSETS list), ~28–35 (install).
- **Finding:** Module is in precache list with version. Offline and cache invalidation behave as intended.

---

### F6: Canvas/diagram loading unchanged (Pass)

- **Locations:** `frontend/app.js` – `loadDiagramImageForDrop`, `resolveDiagramAssetUrl`, `loadDiagramImage`, `loadImage`.
- **Exact lines:** ~6683–6748.
- **Finding:** Panel thumb changes do not touch canvas/drop diagram loading. No regression.

---

### F7: Admin/bonus menu visibility when module not loaded (Pass)

- **Location:** `frontend/app.js` – `updateUserPermissionsMenuVisibility`, `updateMaterialRulesMenuVisibility`, etc.
- **Exact lines:** ~11852–11887.
- **Finding:** Each updates `menuItem.hidden` from app.js (e.g. `canAccessDesktopAdminUi()`); then calls `adminProductsBonusController?.update*()`. If module not loaded, optional update is skipped; core visibility still correct. No regression.

---

### F8: Desktop vs mobile (Pass)

- **Finding:** No new viewport- or mobile-specific logic in the changed paths. Thumb and lazy-module behaviour are shared. No desktop/mobile bleed identified.

---

## Summary Table

| ID | Area | Result | Action for next session |
|----|------|--------|-------------------------|
| F1 | Products view when module fails | Minor (unhandled rejection) | Add .catch (or equivalent) to `renderProductLibrary()` in `switchView` for `view-products`. |
| F2 | Panel/facepile thumb when PNG 404s | Regression (broken image) | Add `onerror` fallback to `fallbackThumbSrc` (and optional placeholder) for panel grid and facepile thumb `<img>` in `renderProducts()`. |
| F3 | Version/cache consistency | Pass | None. |
| F4 | Backend `/modules/` cache | Pass | None. |
| F5 | Service worker precache | Pass | None. |
| F6 | Canvas/diagram load | Pass | None. |
| F7 | Admin menu visibility | Pass | None. |
| F8 | Desktop/mobile | Pass | None. |

---

## Line Reference Quick Index (for fixes)

- **F1 fix:** `frontend/app.js` – in `switchView()`, the block that runs when `viewId === 'view-products'` (around lines 14536–14539). Change the bare `renderProductLibrary();` to a call that attaches a `.catch()` (e.g. `void renderProductLibrary().catch(...)`).
- **F2 fix – panel grid:** `frontend/app.js` – in `renderProducts()`:
  - Where `thumbImgSrc` and `fallbackThumbSrc` are set for each product (around 13177–13182), ensure fallback is available for the img (e.g. set `thumb.dataset.fallbackSrc = fallbackThumbSrc` or equivalent).
  - Where the IntersectionObserver sets `imgEl.src = src` (around 13311), add an `onerror` that sets `imgEl.src` to the fallback (from dataset or same closure).
  - In the else branch where `imgEl.src = src` is set (around 13326–13328), add the same `onerror` logic.
- **F2 fix – facepile:** `frontend/app.js` – in `renderProducts()`, facepile block (around 13336–13352). When creating the facepile `img` and setting `img.src = thumbImgSrc` (~13348), add `img.onerror = function () { this.src = fallbackThumbSrc; };` (with `fallbackThumbSrc` from the loop).

---

## Related Task and Docs

- **Section:** 54.127 (Mobile-first load-speed hardening).
- **Task file:** `docs/tasks/section-54.md` – 54.127.1–54.127.10.
- **Index:** `TASK_LIST.md` – Section 54 row removed for 54.127.1–54.127.10 after completion.
- **Generator:** `scripts/generate_panel_thumbs.py` – produces the 39 thumbs; naming is by SVG stem (e.g. `gutter-storm-cloud.svg` → `gutter-storm-cloud.png`), not by product id.

---

*Audit completed 2026-02-27. No code changes made; use this document to implement F1 and F2 in a follow-up session.*
