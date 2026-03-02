# Plan: Supabase-Backed Display Group for Part Templates (Desktop Admin Only)

**Status:** Implemented (63.19.4). Migration applied; backfill run; backend and frontend use display_group_id.

**Goal:** Replace frontend heuristic grouping (product_id stem, colon fallback, SC/CL and 65/80 merge pass) with a single **display_group_id** stored in Supabase so the desktop admin Part Templates view is data-driven and easier to maintain. **Scope: desktop admin Material Rules only.** Mobile, quote modal, and Quick Quoter resolve are unchanged.

---

## 1. Current Approach (Frontend-Only)

- **Stem:** `getMaterialRulesProductFamilyStem(product_id)` (~line 2018) strips `-SC-`/`-CL-`/`-65`/`-80`; colon fallback for "Label: variant" style ids.
- **Length mode for grouping:** `getMaterialRulesLengthModeForGrouping(row)` (~2038) normalizes to `missing_measurement` vs `none`.
- **Group key:** `(qty_per_unit, length_mode, stem)`; empty product_id gets unique key `__empty_${index}` so rows don’t merge.
- **Merge pass:** Single-row groups that are SC/CL or 65/80 pairs with same qty/length_mode are merged into one group.
- **Cost:** ~100 lines of branching logic in `frontend/modules/admin-products-bonus.js`; fragile to mixed id formats; "why do these group?" is implicit.

**Exact references (admin-products-bonus.js):**

| Symbol | Approx. line |
|--------|---------------|
| `getMaterialRulesProductFamilyStem` | 2018 |
| `getMaterialRulesLengthModeForGrouping` | 2038 |
| `getMaterialRulesTemplateGroupsForSection` | 2052 |
| `formatMaterialRulesGroupSummaryLabel` | 2133 |
| Call site for grouping | 2508 (`getMaterialRulesTemplateGroupsForSection(section.rows)`) |

**Usage:** Grouping is used only when rendering Part Templates sections (`renderMaterialRulesTemplateSections`). Collect/save uses only `tr[data-material-rules-template-row="true"]` and does not send any grouping key today.

---

## 2. Data-Driven Approach (Supabase)

Store **display_group_id** (UUID, nullable) per template row. Rows in the same **repair type section** that share the same non-null value render as one logical part (summary row + expand/collapse). Backend returns it; frontend groups by it only. Grouping is scoped per section (per repair_type_id); the same UUID in different sections is two separate display groups.

### 2.1 Schema

- Add column on `public.quick_quoter_part_templates`: **`display_group_id uuid NULL`**.
- Rows with the same non-null value within a repair type form one display group. New rows: if omitted or null, backend defaults to row `id` (one row = one group).

### 2.2 Migration and Backfill

1. **Migration (Supabase):** `ALTER TABLE public.quick_quoter_part_templates ADD COLUMN IF NOT EXISTS display_group_id uuid NULL;` (e.g. in a new SQL migration file; apply via Supabase MCP or SQL Editor per project rules.)
2. **Backfill:** One-off pass over existing rows to preserve current behaviour: within each `repair_type_id`, compute current logical groups using the same rules as the frontend (stem + merge SC/CL and 65/80 pairs). For each resulting group, set `display_group_id = gen_random_uuid()` for all rows in that group. Rows that end up in a single-row group get `display_group_id = id`. Run as SQL or a small script that reads templates, groups in memory, then updates.

### 2.3 Backend (Python)

**File:** `backend/app/material_rules.py`.

- **`_list_quick_quoter_templates`** (select): Add `"display_group_id"` to the `.select(...)` list (~line 216).
- **`_serialize_quick_quoter_template`** (~182): Add `"display_group_id": _to_optional_uuid(row.get("display_group_id"))` (or return clean UUID string / null). Implement `_to_optional_uuid` if not present: accept UUID string or null, return str or None.
- **`_normalize_quick_quoter_templates`** (~313): From each `raw`, read `display_group_id` (optional). Validate as UUID string or null/empty. If null/omitted, set `display_group_id = template_id` for that row so new rows get a single-row group. Add `"display_group_id"` to the dict passed to `out.append({...})` (~424) so it is included in the payload sent to `save_quick_quoter_templates`. The upsert (~586) uses `**row`, so the new key will be persisted once the column exists.
- **`save_quick_quoter_templates`:** No signature change; it already upserts whatever is in `rows` (with `updated_at`, `updated_by`). Ensure only valid columns are sent (Supabase will ignore or error on unknown columns; the table must have `display_group_id` before deploy).

**File:** `backend/main.py`. No change to `AdminQuickQuoterTemplatesRequest` (templates remain `list[dict[str, Any]]`); the new field is optional in each dict.

### 2.4 Frontend (Desktop Admin Only)

**File:** `frontend/modules/admin-products-bonus.js`. Material Rules view is already desktop-only (guarded by `canAccessDesktopAdminUi()`; menu item and view hidden on mobile). No mobile or quote-modal code paths are touched.

- **Load / render**
  - **Grouping:** In `renderMaterialRulesTemplateSections`, replace `getMaterialRulesTemplateGroupsForSection(section.rows)` with grouping section rows by `display_group_id`: for each section, build groups with key `row.display_group_id ?? row.id` (null/undefined → each row its own group). Use a `Map` or `reduce` to build `{ summaryLabel, rows }[]` (do not assume `Object.groupBy` for broad browser support). Keep the same structure so existing summary row + member row rendering and expand/collapse logic can stay. Use `display_group_id` (or `row.id` when null) as the **groupId** passed to `appendMaterialRulesTemplateGroupSummaryRow` and `appendMaterialRulesTemplateRow` (so `data-material-rules-group-id` is the UUID string; expand/collapse continues to work).
  - **Summary label:** Keep `formatMaterialRulesGroupSummaryLabel(rows)` for the visible label (no stem needed for grouping; label is still derived from rows’ product_id/profile/size).
- **Row rendering:** In `appendMaterialRulesTemplateRow`, set `tr.dataset.displayGroupId = (row.display_group_id ?? '')` so the value is available for collect (HTML: `data-display-group-id`).
- **Collect:** In `collectMaterialRulesTemplatesPayload`, read `row.dataset.displayGroupId` (trim). If non-empty and valid UUID string, set `template.display_group_id = value`; otherwise omit or set null so backend can default to row id for new rows.
- **Remove:** Delete `getMaterialRulesProductFamilyStem`, `getMaterialRulesLengthModeForGrouping`, and `getMaterialRulesTemplateGroupsForSection`. Keep `formatMaterialRulesGroupSummaryLabel` for summary display only.

**Result:** One grouping key from API; no product_id parsing or merge heuristics; behaviour is explicit and robust to id format; future admin UI could change grouping by editing `display_group_id`.

### 2.5 Backend Tests

- **`backend/tests/test_material_rules_api.py`:** Where template payloads are built or asserted, add optional `display_group_id` (UUID string or null) so GET response and PUT request shapes remain valid. Add at least one test that round-trips templates with `display_group_id` set and one with null/omitted (backend default to row id).

### 2.6 Seed / Maintenance

- **`docs/quick_quoter_seed.sql`** (if used for new template rows): When inserting new rows, set `display_group_id` to a shared UUID for rows that should appear as one logical part, or to the row `id` for single-row groups. Alternatively, rely on backend default (null → row id) if seed is applied through the API after migration.

---

## 3. Pros / Costs

| Pros | Costs |
|------|--------|
| Simpler frontend: one grouping key, no stem/merge logic | One-time migration + backfill |
| Explicit, data-driven: grouping is in DB | API request/response and save payload include display_group_id |
| Robust to any product_id format and odd cases (e.g. 3 variants) | Seed/maintenance: new templates need display_group_id or backend default |
| Evolvable: future admin UI can change grouping without code change | Backend tests and normalization must handle new field |

---

## 4. Railway / Desktop vs Mobile

- **Railway:** No new env vars. Migration runs in Supabase (project `rlptjmkejfykisaefkeh`). Deploy and run remain as today (Procfile, nixpacks, `./scripts/run-server.sh`).
- **Desktop only:** Part Templates view lives in the desktop admin Material Rules UI (`view-material-rules`); access is already gated by `canAccessDesktopAdminUi()`. No changes to mobile layout, quote modal, or Quick Quoter resolve flow.

---

## 5. Task List (If Adopted)

Add an optional Section 63 follow-on task (e.g. **63.19.4**): “Part Templates display grouping: add display_group_id to quick_quoter_part_templates, backfill, API + frontend group by key; remove stem/merge heuristics (desktop admin only).” Plan: this document.
