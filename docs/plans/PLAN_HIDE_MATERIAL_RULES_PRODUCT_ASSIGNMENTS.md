# Plan: Hide Product Assignments from Material Rules View (Desktop-Only)

**Context:** Quote App single codebase (desktop + mobile), deployed on Railway. Material Rules view is desktop-only, admin-guarded (`view-material-rules` + `canAccessDesktopAdminUi()`). This plan hides the "Product assignments" form subgroup from the Measured-Length section without changing behaviour or API. No mobile impact; Railway-safe.

**Verification URL:** `http://127.0.0.1:8000/?viewport=desktop` (viewport query forces desktop mode via `VIEWPORT_MODE_QUERY_KEY` in app.js).

---

## 1. Investigation: Why Product Assignments Exists

- **Purpose:** The "Product assignments" subgroup (63.18.1) lets admins configure which product IDs are used when the backend infers accessories during quote calculation: screw product, bracket (SC/CL), saddle clip (65/80), adjustable clip (65/80). These map to `public.measured_material_rules` and are consumed by `expand_elements_with_gutter_accessories()` in `backend/app/gutter_accessories.py` via `POST /api/calculate-quote`.
- **Wiring:** `frontend/modules/admin-products-bonus.js`: `renderMaterialRulesMeasuredProductSelects()`, `populateMaterialRulesMeasuredForm()`, `collectMaterialRulesMeasuredPayload()` use the seven select IDs (`materialRulesScrewProductId`, `materialRulesBracketProductIdSc`, etc.). Load and Save still read/write these values; the backend continues to use whatever is stored in the DB.
- **Inclusion on screen:** It was added for admin configurability. Hiding it does not remove that configurability from the system—values remain in state and DB; only the UI block is hidden so the screen is simpler. If product assignments need to be edited later, they can be changed in the DB or the hide can be reverted.

---

## 2. Target DOM (Exact)

- **View:** `#view-material-rules` (desktop-only by route/menu).
- **Path:** `#view-material-rules > .material-rules-view-container > .material-rules-main > section[aria-labelledby="materialRulesMeasuredHeading"] > .material-rules-form-grid > .material-rules-form-group` (third group, index 2 in 0-based order).
- **Content:** The single `<div class="material-rules-form-group">` that contains:
  - `<h3 class="material-rules-form-group-title">Product assignments</h3>`
  - Labels/selects: Screw product ID, Bracket product (SC), Bracket product (CL), Saddle clip product (65), Saddle clip product (80), Adjustable clip product (65), Adjustable clip product (80).
- **File / lines:** `frontend/index.html` lines 702–724 (the full wrapper div for "Product assignments").

---

## 3. Proposed Implementation (No Assumptions)

### 3.1 Approach: CSS hide (recommended)

- **Rationale:** Keep the DOM and all existing JS unchanged. `populateMaterialRulesMeasuredForm()` and `collectMaterialRulesMeasuredPayload()` continue to run; hidden fields still receive and submit values. No risk of overwriting `measured_material_rules` with empty product IDs on Save. E2E (e.g. `e2e/run.js` around 464–499) only checks that the seven product select elements exist and are SELECTs; they remain in the DOM when hidden, so E2E stays green.
- **HTML:** Add a single class to the Product assignments form group wrapper for targeting, e.g. `material-rules-form-group--product-assignments-hidden` on the `<div class="material-rules-form-group">` that wraps "Product assignments" (lines 702–724).
- **CSS:** Under `#view-material-rules` (or `.material-rules-view-container`), add a rule that hides that group, e.g. `#view-material-rules .material-rules-form-group--product-assignments-hidden { display: none; }` in `frontend/styles.css` within the existing Material Rules block (~4145–4430). No `body[data-viewport-mode="desktop"]` scoping needed: the whole view is desktop-only.
- **JS:** No changes.
- **Backend / API:** No changes.

### 3.2 Alternative (if product assignments must be fully removed from DOM later)

- Remove the Product assignments `<div class="material-rules-form-group">` block from `index.html`.
- In `admin-products-bonus.js`: (1) In `populateMaterialRulesMeasuredForm()`, guard each of the seven product select `setValue()` calls with `getElementById` check and skip if null. (2) In `collectMaterialRulesMeasuredPayload()`, for the seven product-assignment keys use `materialRulesState.measuredRules` (or the last loaded measured payload) instead of reading from the DOM, so Save does not send empty strings and wipe DB values. (3) In `renderMaterialRulesMeasuredProductSelects()`, guard each `getElementById` and skip if null. (4) Update E2E if it asserts presence of those selects (e.g. relax assertion or stub). This is more invasive; the plan recommends 3.1 unless product assignments must be removed from DOM.

---

## 4. Desktop vs Mobile

- **Desktop:** Material Rules is only reachable in desktop mode (menu item visible, `canAccessDesktopAdminUi()`). Hiding the Product assignments group only affects this view; `?viewport=desktop` shows the current code and the hidden group.
- **Mobile:** Material Rules menu is hidden and the view is not navigable on mobile; no change to mobile UI or behaviour.

---

## 5. Verification Checklist

1. Run `./scripts/run-server.sh`, open `http://127.0.0.1:8000/?viewport=desktop`, sign in as admin, open Material Rules from profile menu.
2. Confirm the "Product assignments" block (Screw product ID and bracket/clip dropdowns) is not visible; Spacing, Screws per item, and Clip selection remain visible.
3. Confirm Save Measured Rules still works (e.g. change Bracket spacing, Save, Reload) and no console errors.
4. Confirm Reload still loads measured rules (hidden fields are still populated from API).
5. Run E2E: `npm test` (or `./scripts/run-e2e.sh`); Desktop Material Rules regression should still pass (selects still exist in DOM).
6. Deploy to Railway and smoke-test Material Rules load/save once.

---

## 6. Files to Touch (Implementation)

| File | Change |
|-----|--------|
| `frontend/index.html` | Add class `material-rules-form-group--product-assignments-hidden` to the `<div class="material-rules-form-group">` that wraps "Product assignments" (lines 702–724). |
| `frontend/styles.css` | Add `#view-material-rules .material-rules-form-group--product-assignments-hidden { display: none; }` in the Material Rules block. |

No changes to `frontend/app.js`, `frontend/modules/admin-products-bonus.js`, backend, or E2E for the recommended approach.

---

## 7. Task List Reference

- **Section file:** `docs/tasks/section-63.md` — task **63.18.5** (Hide Product assignments subgroup from Material Rules view, desktop-only).
- **Index:** `TASK_LIST.md` — uncompleted table row for 63.18.5.
