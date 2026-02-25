# Material Rules Plan: Hide Sort Columns + Drag Reorder (No Wiring Breaks)

Date: 2026-02-25  
Scope: Desktop-only Material Rules UI (`view-material-rules`) for admin/super-admin.  
Implementation status: **Plan only** (no code changes in this step).

## Goal
Hide the `Sort` inputs from Repair Types and Part Templates, and replace manual ordering with row drag-reorder.  
Keep backend/API contracts unchanged by continuing to send `sort_order` integers derived from current row order at save time.

## Hard Constraints
1. Do not change mobile behavior or mobile UI.
2. Keep Railway deployment safe: no new env vars, no migration required.
3. Do not change endpoint signatures or remove required backend fields.
4. Preserve existing save order: Repair Types save first, Templates second.

## Current Wiring Map (Key Files + References)

### Frontend Markup
1. Material Rules view/table headers:
   - `frontend/index.html:680`
   - Repair Types table has `Sort` header at `frontend/index.html:697`
   - Templates table has `Sort` header at `frontend/index.html:725`

### Frontend Material Rules Logic
1. Status/error wiring:
   - `frontend/app.js:14752`
2. Repair Types row render currently includes `sort` input:
   - `frontend/app.js:14902`
   - `frontend/app.js:14917`
3. Templates row render currently includes `sort` input:
   - `frontend/app.js:14925`
   - `frontend/app.js:14979`
4. Repair Types payload currently reads `sort` from input:
   - `frontend/app.js:15044`
   - `frontend/app.js:15058`
5. Templates payload currently reads `sort` from input:
   - `frontend/app.js:15088`
   - `frontend/app.js:15110`
6. Save flow (must remain):
   - Repair types PUT then templates PUT:
   - `frontend/app.js:15313`
   - `frontend/app.js:15335`
   - `frontend/app.js:15346`
7. Add-template default object currently seeds `sort_order`:
   - `frontend/app.js:15436`
   - `frontend/app.js:15447`
8. Desktop-only access guard (must remain):
   - `frontend/app.js:15221`
   - `frontend/app.js:17269`

### Frontend Styles
1. Material Rules table/layout classes:
   - `frontend/styles.css:3984`
   - `frontend/styles.css:3991`
   - `frontend/styles.css:3997`
   - `frontend/styles.css:4001`
   - `frontend/styles.css:4063`

### Backend/API Contract (Must Stay Compatible)
1. Admin endpoints:
   - `backend/main.py:1893`
   - `backend/main.py:1907`
   - `backend/main.py:1930`
2. `sort_order` is required/validated in normalization:
   - Repair types: `backend/app/material_rules.py:257`, `:272`, `:302`
   - Templates: `backend/app/material_rules.py:346`, `:416`, `:446`
3. DB read ordering uses `sort_order`:
   - Repair types list: `backend/app/material_rules.py:201`, `:205`
   - Templates list: `backend/app/material_rules.py:212`, `:221`
4. Quick Quoter runtime behavior depends on `sort_order` ordering from DB:
   - Catalog: `backend/app/quick_quoter.py:75`, `:80`
   - Template query ordering: `backend/app/quick_quoter.py:239`, `:248`

### Existing Tests Touching This Contract
1. API validation/write tests include `sort_order`:
   - `backend/tests/test_material_rules_api.py:433`
   - `backend/tests/test_material_rules_api.py:489`
2. Quick Quoter resolver tests depend on ordered templates:
   - `backend/tests/test_quick_quoter.py:129`
3. Desktop E2E Material Rules checks:
   - `e2e/run.js:280`

## Change Strategy (No Backend Break)

### Step 1: Hide Sort UI fields, add reorder affordance
1. Remove `Sort` header/cell inputs from both Material Rules tables.
2. Add drag handle cell to each row (Repair Types + Templates).
3. Keep row identity attributes unchanged:
   - Repair Types: `data-repair-type-id`
   - Templates: `data-template-id`

### Step 2: Add row reorder behavior in frontend only
1. Implement row drag-reorder handlers on table rows (desktop pointer/mouse).
2. Add visual drag state classes (`dragging`, `drop-target`) for clarity.
3. Keep this logic scoped to Material Rules view only; do not reuse global canvas drag systems.

### Step 3: Preserve backend contract by deriving `sort_order` from DOM order
1. In `collectMaterialRulesRepairTypesPayload`, stop reading removed sort input.
2. Compute `sort_order` from current row index, e.g. `(index + 1) * 10`.
3. In `collectMaterialRulesTemplatesPayload`, same DOM-order derivation.
4. Keep payload schema unchanged (`sort_order` remains integer on every row).

### Step 4: Keep save and security wiring unchanged
1. Do not alter endpoint URLs or request wrappers.
2. Keep save sequence:
   - `PUT /repair-types` then `PUT /templates`
3. Keep desktop/admin guard checks unchanged.

### Step 5: Accessibility + UX safety
1. Ensure drag handle has clear `aria-label` and focusability.
2. Add keyboard fallback controls (`Move up` / `Move down`) if drag-only is not accessible enough.
3. Maintain table spacing and sticky header behavior after column changes.

## Do-Not-Break Checklist
1. Backend must still receive `sort_order` for every repair type/template row.
2. `repair_type_id` locking and reserved `other` behavior must remain untouched.
3. Template `id` handling (`existing UUID` vs `new-*`) must remain untouched.
4. Product dropdown constraints/validation must remain untouched.
5. Quick Quoter catalog and resolver order must still map to DB `sort_order`.
6. Mobile view must remain inaccessible for Material Rules.

## Test Plan For Implementation Chat
1. Backend:
   - `./scripts/run-backend-tests.sh`
2. Frontend/E2E:
   - `npm test`
3. New/updated checks to add:
   - Sort columns are not visible.
   - Drag handles exist.
   - Reordering rows changes emitted `sort_order` order on save request payload.
   - Existing admin/desktop guard behavior still passes.
4. Manual desktop smoke:
   - Reorder Repair Types, save, reload, verify order persists.
   - Reorder Templates, save, resolve quick quoter, verify rule order remains deterministic.

## Recommended Implementation Notes
1. Prefer computing `sort_order` only at payload build time to avoid stale hidden state.
2. Keep numeric spacing by 10s (10, 20, 30) for readability and future insertions.
3. Avoid backend changes unless absolutely required; current APIs already support this feature via existing `sort_order`.

