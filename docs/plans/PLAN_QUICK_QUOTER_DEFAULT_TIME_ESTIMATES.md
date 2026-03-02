# Plan: Default time estimates for Quick Quoter rules (Material Rules)

**Status:** Implemented (63.20). Production must have the migration applied: run `docs/quick_quoter_repair_types_default_time_minutes.sql` in Supabase (or apply via MCP). Applied via MCP for project `rlptjmkejfykisaefkeh` on 2025-03-03.

**Goal:** Allow admins to set a default time estimate (e.g. minutes per repair) for each Quick Quoter repair type in the Material Rules view. When the user completes Quick Quoter and opens the quote modal, the resolved response can include a suggested labour total (sum of default_time × quantity per selected repair type), and the quote modal can optionally prefill labour from that suggestion.

**Scope:** Backend (schema, API, resolve response), frontend Material Rules (Repair Types table + save/load), optional frontend quote flow (prefill labour when opening from Quick Quoter). Desktop admin for editing; quote modal is shared desktop + mobile. Railway-safe; Supabase only.

---

## 1. Current behaviour (code-accurate)

### Database

- **`public.quick_quoter_repair_types`** (created in `docs/quick_quoter_migration_a.sql`): columns `id`, `label`, `active`, `sort_order`, `requires_profile`, `requires_size_mm`, `created_at`, `updated_at`; later `updated_by` added in `docs/material_rules_migration.sql` (lines 82–83). No time/labour column.
- **`public.quick_quoter_part_templates`**: no time column; time is per repair type, not per template.

### Backend – list/serialize/validate/save repair types

- **`backend/app/material_rules.py`**
  - **Lines 215–223** `_list_quick_quoter_repair_types`: `.select("id, label, active, sort_order, requires_profile, requires_size_mm, created_at, updated_at, updated_by")`. Add `default_time_minutes` to the select list.
  - **Lines 181–191** `_serialize_quick_quoter_repair_type`: returns dict with id, label, active, sort_order, requires_profile, requires_size_mm, created_at, updated_at, updated_by. Add `default_time_minutes` (int or null).
  - **Lines 249–324** `_normalize_quick_quoter_repair_types`: validates and builds list of dicts for upsert; currently keys id, label, active, sort_order, requires_profile, requires_size_mm. Add validation and output for `default_time_minutes` (optional integer >= 0; null/absent → 0 or NULL in DB).
  - **Lines 533–541** `save_quick_quoter_repair_types`: builds `to_upsert` from normalized rows and upserts; new column will be included in row dict and written by Supabase.

### Backend – resolve and catalog

- **`backend/app/quick_quoter.py`**
  - **Lines 74–96** `get_quick_quoter_catalog`: selects `id, label, requires_profile, requires_size_mm, sort_order, active` from `quick_quoter_repair_types`. Optionally add `default_time_minutes` if mobile/QQ UI should show it; otherwise omit for catalog.
  - **Lines 100–336** `resolve_quick_quoter_selection`: builds `elements`, `missing_measurements`, `validation_errors`. Currently does **not** return labour. After building elements/missing_measurements (around line 236), query or reuse repair type rows to read `default_time_minutes` per repair type; compute `suggested_labour_minutes = sum(default_time_minutes(rt) * selection_qty(rt))` for selected repair types (only active, validated). Add to response, e.g. `out["suggested_labour_minutes"] = suggested_labour_minutes` (integer or null if none).

### Backend – API routes

- **`backend/main.py`**: `GET /api/admin/material-rules/quick-quoter` and `PUT /api/admin/material-rules/quick-quoter/repair-types` call into `material_rules.py`; no route signature change; payloads gain optional `default_time_minutes` per repair type.  
- **`POST /api/quick-quoter/resolve`** (in main.py, calls `resolve_quick_quoter_selection`): response gains optional `suggested_labour_minutes`; no request body change.

### Frontend – Material Rules (desktop admin)

- **`frontend/index.html`**  
  - **Lines 753–760**: Repair Types table `<thead>` with columns Reorder, Label, Requires profile, Requires size, Active. Add one column, e.g. **&lt;th scope="col"&gt;Default time (min)&lt;/th&gt;** before or after Active (suggest after Active).
- **`frontend/modules/admin-products-bonus.js`**
  - **Lines 2236–2257** `appendMaterialRulesRepairTypeRow(row)`: currently builds row with reorder, label input, requires-profile checkbox, requires-size checkbox, active checkbox. Add a numeric input for default time, e.g. `<input type="number" class="material-rules-repair-default-time-minutes" min="0" step="1" value="…" aria-label="Default time minutes" />`. Use `row?.default_time_minutes` (coerce to int; empty/undefined → "" or 0 for value).
  - **Lines 2548–2587** `collectMaterialRulesRepairTypesPayload()`: reads each row’s label, requires_profile, requires_size, active; push object with id, label, active, sort_order, requires_profile, requires_size_mm. Add read of `.material-rules-repair-default-time-minutes` (parseInt; allow empty → null or 0) and add `default_time_minutes` to each payload object.
  - **Load path:** When populating repair types from API (`materialRulesState.repairTypes`), rows already include the new field once backend returns it; no change needed except ensuring the new input is bound to `row.default_time_minutes` in `appendMaterialRulesRepairTypeRow`.

### Frontend – Quick Quoter resolve → quote modal

- **`frontend/app.js`**
  - **Lines 6450–6482** `mergeQuickQuoterElementsForQuote(resolvePayload)`: returns merged material elements + missing_measurements; currently does not pass labour. Optionally: if `resolvePayload.suggested_labour_minutes != null`, include it in the return value (e.g. `return { elements: …, missing_measurements: …, suggested_labour_minutes: resolvePayload.suggested_labour_minutes }`).
  - **Lines 3237–3332** `openQuoteModalForElements(elementsForQuote, triggerEl)`: currently accepts `elementsForQuote` (array of material rows); calls `ensureLabourRowsExist()`, then `calculateAndDisplayQuote()` if there are elements. **Optional prefill:** If the second argument is extended to an options object or a third argument carries `suggestedLabourMinutes`, after `ensureLabourRowsExist()` set the labour row(s) hours input to `suggestedLabourMinutes / 60` (convert minutes to hours for REP-LAB quantity). Alternatively keep signature and pass a wrapped object `{ elements, suggestedLabourMinutes }` as first argument; inside `openQuoteModalForElements` detect and branch. Document chosen convention in plan.
  - **Lines 6638–6642**: Call site `mergeQuickQuoterElementsForQuote(resolveData)` then `openQuoteModalForElements(mergedElements, quoteTrigger)`. If merged result carries `suggested_labour_minutes`, pass it through to `openQuoteModalForElements` and implement the prefill branch above.

### Quote modal labour representation

- Labour is stored as **hours** in the quote table and in `body.labour_elements` (e.g. REP-LAB, quantity = hours). `backend/main.py` **2095–2110** sums `e.quantity` as labour_hours. So suggested time must be converted **minutes → hours** when prefilling (e.g. `suggested_labour_minutes / 60`).

---

## 2. Implementation steps (when approved)

### 2.1 Database

- Add column **`default_time_minutes`** to `public.quick_quoter_repair_types`:
  - Type: **`integer null`** (nullable; null or 0 = no default).
  - Constraint: **`check (default_time_minutes is null or default_time_minutes >= 0)`**.
- Deliver as a new migration file (e.g. `docs/quick_quoter_repair_types_default_time_minutes.sql`) and apply via Supabase MCP `apply_migration` or run in SQL Editor. Idempotent: `ADD COLUMN IF NOT EXISTS` or equivalent.

### 2.2 Backend – material_rules.py

- **Select (lines 217–218):** Add `default_time_minutes` to the `.select(...)` string.
- **Serialize (lines 181–191):** Add `"default_time_minutes": _to_int(row.get("default_time_minutes"))` (or allow null; document that 0 and null both mean “no default” for display).
- **Normalize (lines 249–324):** For each repair type row, read `default_time_minutes` (e.g. _to_int); validate `>= 0` if present; append to output dict. Allow missing/null → store as null in DB.
- **Upsert:** No change; normalized row dict already includes the new key; Supabase upsert will write it.

### 2.3 Backend – quick_quoter.py

- **resolve_quick_quoter_selection:**
  - When fetching repair types (lines 183–191), add `default_time_minutes` to `.select(...)`.
  - After validation, before building `elements` (or after), compute:
    - `suggested_labour_minutes = 0`
    - For each `repair_type_id` in `selection_qty_by_repair_type` with a valid repair type row: `suggested_labour_minutes += (row.get("default_time_minutes") or 0) * selection_qty_by_repair_type[repair_type_id]`.
  - Set `out["suggested_labour_minutes"] = suggested_labour_minutes` (int; 0 if no defaults).
- **get_quick_quoter_catalog:** Only add `default_time_minutes` to the select if the mobile/QQ UI will display it; otherwise leave catalog as-is to avoid unnecessary payload growth.

### 2.4 Frontend – Material Rules (admin)

- **index.html (lines 753–760):** Add table header **Default time (min)** (or similar) to Repair Types table.
- **admin-products-bonus.js**
  - **appendMaterialRulesRepairTypeRow:** Add `<td>` with `<input type="number" class="material-rules-repair-default-time-minutes" min="0" step="1" ... />`, value from `row.default_time_minutes` (empty if null/0).
  - **collectMaterialRulesRepairTypesPayload:** Read `.material-rules-repair-default-time-minutes`, parse as integer; allow blank → null; push `default_time_minutes` into each payload object.

### 2.5 Frontend – quote modal prefill (optional)

- **mergeQuickQuoterElementsForQuote:** If `resolvePayload.suggested_labour_minutes != null` and `>= 0`, return object `{ elements, missing_measurements, suggested_labour_minutes }`; else return current shape (or object with `suggested_labour_minutes: null`).
- **openQuoteModalForElements:** Support a second parameter or a single object that includes `elements` and optional `suggestedLabourMinutes`. After building quote table and calling `ensureLabourRowsExist()`, if `suggestedLabourMinutes` is a number and > 0, set the first labour row’s hours input to `suggestedLabourMinutes / 60` (and optionally trigger a single `calculateAndDisplayQuote()` or existing sync so totals update).
- **Quick Quoter Done handler (app.js ~6638–6642):** Pass merged result (including `suggested_labour_minutes`) into `openQuoteModalForElements` so the prefill runs when opening from QQ.

### 2.6 Tests and docs

- **Backend:** Extend `backend/tests/test_material_rules_api.py` (and any repair-type payload tests) to include `default_time_minutes` in valid payloads and assert response contains it. Extend `backend/tests/test_quick_quoter.py` to assert `suggested_labour_minutes` in resolve response when repair types have default_time_minutes set.
- **Docs:** Update `docs/QUICK_QUOTER_BACKEND_DATABASE_INTEGRATION.md` and/or `docs/BACKEND_DATABASE.md` to document `default_time_minutes` and `suggested_labour_minutes` in the resolve response.

---

## 3. File and line reference summary

| Area | File | Key lines |
|------|------|-----------|
| DB schema | New migration (e.g. `docs/quick_quoter_repair_types_default_time_minutes.sql`) | Add column `default_time_minutes integer null check (... >= 0)` |
| List repair types | `backend/app/material_rules.py` | 215–223 (select), 181–191 (serialize) |
| Validate/save repair types | `backend/app/material_rules.py` | 249–324 (normalize), 533–541 (upsert) |
| Resolve response | `backend/app/quick_quoter.py` | 100–336 (resolve); 183–191 (repair type fetch); add suggested_labour_minutes |
| Catalog (optional) | `backend/app/quick_quoter.py` | 74–96 (get_quick_quoter_catalog) |
| Repair Types table header | `frontend/index.html` | 753–760 (Repair Types thead) |
| Repair type row UI | `frontend/modules/admin-products-bonus.js` | 2236–2257 (appendMaterialRulesRepairTypeRow) |
| Collect repair payload | `frontend/modules/admin-products-bonus.js` | 2548–2587 (collectMaterialRulesRepairTypesPayload) |
| Merge QQ elements | `frontend/app.js` | 6450–6482 (mergeQuickQuoterElementsForQuote) |
| Open quote modal | `frontend/app.js` | 3237–3332 (openQuoteModalForElements) |
| QQ Done handler | `frontend/app.js` | 6638–6642 (resolve then openQuoteModalForElements) |
| Calculate quote (labour) | `backend/main.py` | 2095–2110 (labour_elements, labour_hours) |

---

## 4. Edge cases

- **Null vs 0:** Treat both as “no default” for display and for resolve (0 minutes contribution). Backend and frontend should accept both and persist as null or 0 consistently (recommend: store 0 as 0, omit from payload or send 0; resolve uses `(row.get("default_time_minutes") or 0)`).
- **Existing rows:** Migration adds nullable column; existing repair types get `default_time_minutes = null`; no seed change required unless you want initial defaults.
- **Labour prefill:** If quote modal has multiple labour rows (e.g. multiple people), document whether suggested minutes apply to first row only or are split; plan assumes single labour row or “first row” for simplicity.
- **Units:** Backend and DB use **minutes**; quote API and modal use **hours** for labour_elements. Convert only at the boundary when prefilling (minutes / 60).

---

## 5. Task list

- Add **63.20** (or next free 63.x) in `docs/tasks/section-63.md` and a row in the uncompleted table in **TASK_LIST.md**. After implementation: check off subtasks; if section 63 is fully complete, update the index.
