# Plan: Auto-apply profile filter when adding Storm Cloud / Classic parts (and clear on canvas clear)

**Status:** Plan only — no code changes until approved.

**Goal:** When the user drags or clicks to add a **Storm Cloud** part onto the canvas, automatically set the right-hand panel’s **profile filter dropdown** to “Storm Cloud”. When they add a **Classic** part, set it to “Classic”. When the canvas is **cleared**, reset these automatic selections (profile and size filters back to “All” / empty) so the panel shows all parts again.

This makes it easier to keep choosing parts from the same profile without manually changing the dropdown; and clearing the canvas resets the panel to a neutral state.

---

## 1. Current behaviour (no change to this)

- **Panel filters:** The canvas right panel has:
  - **Profile filter** (`#profileFilter`): values `''` (All), `storm_cloud`, `classic`, `other`. Stored in `state.profileFilter`; used by `getPanelProducts()` to filter `state.products` before `renderProducts()`.
  - **Size filter** (`#sizeFilter`): `''` (mm), `65`, `80`. Stored in `state.sizeFilter`.
- **Adding parts:**
  - **Drag-drop:** Canvas `drop` handler (app.js ~9694) gets `productId` from `e.dataTransfer.getData('application/product-id')`, loads image, creates element with `assetId: productId`, pushes to `state.elements`. No filter update.
  - **Click (center-drop):** In `renderProducts()`, each thumb has a `click` handler (~13235) that has the full product `p` (with `p.id`, `p.profile`). It creates an element with `assetId: p.id`, pushes to `state.elements`, then (on mobile) closes the panel. No filter update.
- **Clearing canvas:** `clearCanvasToEmpty()` (~7429) resets elements, blueprint, selection, undo/redo, project name. It does **not** touch `state.profileFilter` or `state.sizeFilter`, and does not update the dropdown DOM.

Products from the API have `p.profile` as `storm_cloud` | `classic` | `other`. The panel filter uses the same values. There is also `getProfileFromAssetId(assetId)` which returns `'SC'` | `'CL'` | `null` for gutters/brackets by parsing asset id (e.g. GUT-SC-*, BRK-CL-*).

---

## 2. Desired behaviour

1. **On add (drag or click):**  
   - If the added part is **Storm Cloud** → set profile filter to Storm Cloud (`state.profileFilter = 'storm_cloud'`), sync `#profileFilter` and re-apply filters so the grid shows Storm Cloud only.  
   - If the added part is **Classic** → set profile filter to Classic (`state.profileFilter = 'classic'`), sync `#profileFilter` and re-apply filters.  
   - If the part is **other** / unknown → do **not** change the profile filter (leave user’s current selection).

2. **On canvas clear:**  
   - Reset profile and size filters to “All” / empty: `state.profileFilter = ''`, `state.sizeFilter = ''`.  
   - Sync both dropdowns (`#profileFilter`, `#sizeFilter`) to those values and re-apply filters so the panel shows all products again.

No change to desktop vs mobile behaviour beyond this: same logic for both viewports. No new API or backend changes.

---

## 3. Implementation plan

### 3.1 Helper: product profile → panel profile value

- **Where:** app.js (e.g. near `getProfileFromAssetId` or near `initProducts`).
- **What:** A small helper that, given a **product id** (and optionally the product object if already available), returns the panel profile value to use for auto-filter, or `null` if we should not change the filter.
  - Prefer: look up `state.products.find(p => p.id === productId)` and use `p.profile` (normalize to `storm_cloud` | `classic`; if `other` or missing, return `null`).
  - Fallback: if product not in list, use `getProfileFromAssetId(productId)` and map `'SC'` → `'storm_cloud'`, `'CL'` → `'classic'`, `null` → `null`.
- **Returns:** `'storm_cloud'` | `'classic'` | `null`. Caller only updates the filter when non-null.

### 3.2 Helper: apply profile (and optionally size) filter in the UI

- **Where:** app.js, near `applyProductFilters()`.
- **What:** A function that:
  - Sets `state.profileFilter` and/or `state.sizeFilter` to given values.
  - Sets `#profileFilter`.value and `#sizeFilter`.value to match (so the DOM is in sync).
  - For size, toggles `sizeFilter.classList.toggle('size-filter-default', !state.sizeFilter)` if that class is used.
  - Calls `ensurePanelProductsLoaded` if needed (same as existing filter change path), then `applyProductFilters()` so the grid re-renders.
- **Use:** From “on add” path (set only profile) and from “on clear” path (set both to `''`).

### 3.3 On add: drag-drop (canvas drop handler)

- **Where:** app.js, canvas `drop` listener (~9694–9753).
- **When:** After successfully pushing the new element to `state.elements` (after `state.elements.push(el)`), before or after `setSelection`, `updatePlaceholderVisibility`, etc.
- **What:**
  - Call the helper with `productId` to get the profile value to apply (e.g. `getProfileForPanelFilter(productId)`).
  - If the result is `'storm_cloud'` or `'classic'`, call the “apply profile filter in the UI” helper with that value (profile only; do not change size filter on add).

### 3.4 On add: click (center-drop) in panel

- **Where:** app.js, inside `renderProducts()`, in the thumb `click` handler (~13235–13297).
- **When:** After `state.elements.push(el)` and the rest of the add logic (selection, announce, placeholder, measurement deck, draw), and (on mobile) `setPanelExpanded(false)`.
- **What:**
  - We have the product `p`. Use `p.profile` (or the same helper with `p.id`) to get the panel profile value. If it’s `'storm_cloud'` or `'classic'`, call the “apply profile filter in the UI” helper so the dropdown and grid update. If the panel is closed on mobile, the next time the user opens it they will see the filter already set to the profile they just used.

### 3.5 On canvas clear

- **Where:** app.js, `clearCanvasToEmpty()` (~7429–7456).
- **When:** At the end of the function, after all state and DOM updates (before or after `updateUndoRedoButtons()`).
- **What:**
  - Set `state.profileFilter = ''` and `state.sizeFilter = ''`.
  - Sync `#profileFilter` and `#sizeFilter` select elements to `''` (e.g. set `.value = ''`).
  - Toggle `#sizeFilter` class for default state if used.
  - Call the same “ensure + apply filters” path so the panel grid re-renders with all products (e.g. call `applyProductFilters()`; if products aren’t loaded yet, the existing `ensurePanelProductsLoaded` on next panel open will still work). Optionally call `ensurePanelProductsLoaded` then `applyProductFilters()` so that if the panel is open when the user clears, it updates immediately.

### 3.6 Edge cases

- **Panel not open / products not loaded:** Setting `state.profileFilter`/`state.sizeFilter` and the select values is enough; when the user opens the panel or products load, `getPanelProducts()` and `applyProductFilters()` already use `state.*Filter`, so the grid will show the correct subset or “All”.
- **User had manually set “Other”:** Adding a Storm or Classic part will overwrite to Storm Cloud or Classic. This is intentional so the panel reflects the last-added profile.
- **Adding an “other” profile part:** We do not change the profile filter, so the user’s current filter selection is preserved.
- **Clear then add again:** After clear, both filters are “All”. Next add (Storm or Classic) will set the profile filter again as above.
- **Desktop vs mobile:** Same behaviour; no viewport checks needed for this feature.

### 3.7 No changes to

- HTML: no new elements; we only set existing `#profileFilter` and `#sizeFilter` values from JS.
- CSS: no new styles.
- Backend / API: no changes.
- Product Library view (`#view-products`): that view has its own `#productFilterProfile`; this plan only affects the **canvas right panel** filters (`#profileFilter`, `#sizeFilter`). If product library filter sync is desired later, it can be a separate task.

---

## 4. Testing (manual / E2E)

- **Add Storm Cloud part (drag):** Drag a Storm Cloud product onto the canvas → profile filter becomes “Storm Cloud”; grid shows only Storm Cloud products.
- **Add Classic part (click):** Click a Classic product to add at center → profile filter becomes “Classic”; grid shows only Classic products.
- **Add “other” part:** Add a product that is neither Storm nor Classic → profile filter unchanged.
- **Clear canvas:** Click New canvas → Delete draft (or equivalent clear path) → profile and size filters reset to “All” / “mm”; grid shows all products.
- **Regression:** Existing behaviour (drag, click-add, panel expand/collapse, mobile tap-add and panel close) unchanged; no desktop/mobile bleed.

---

## 5. Task list (draft)

- Add helper: product id → panel profile value (`'storm_cloud'` | `'classic'` | `null`), with product lookup + `getProfileFromAssetId` fallback.
- Add helper: set `state.profileFilter` / `state.sizeFilter`, sync select elements, call `applyProductFilters()` (and ensure products loaded if needed).
- In canvas `drop` handler: after adding element, if profile is Storm or Classic, apply profile filter.
- In panel thumb `click` handler (in `renderProducts()`): after adding element, if profile is Storm or Classic, apply profile filter.
- In `clearCanvasToEmpty()`: set both filters to `''`, sync both selects, re-apply filters so panel shows all products.
- Manual (and optional E2E) check: add Storm, add Classic, add other, clear canvas; confirm filters and grid behaviour; confirm no regressions on desktop and mobile.

---

## 6. File / area summary

| Area | File(s) | Change |
|------|---------|--------|
| Helpers | app.js | New: get profile for panel from product id; set panel filters (state + DOM) and re-apply. |
| Drag-add | app.js (canvas drop) | After push element, optionally set profile filter. |
| Click-add | app.js (renderProducts thumb click) | After push element, optionally set profile filter. |
| Clear canvas | app.js (clearCanvasToEmpty) | Set profile/size filter to '', sync selects, apply filters. |
| HTML/CSS/Backend | — | No change. |

---

*Plan created for auto profile/size filter on add and clear. Implement only after approval.*
