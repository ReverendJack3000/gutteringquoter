# Audit Report: 63.19.4 Display Group ID Implementation

**Auditor role:** Strict Senior QA Engineer  
**Scope:** Implementation and tasks completed for display_group_id (Supabase-backed Part Templates grouping).  
**Constraints checked:** Desktop vs. Mobile production, Railway deployment safety, database/backend/UI-UX best practices.  
**Date:** 2026-03-02

---

## 1. Regression & Conflict Check

### 1.1 Desktop vs. Mobile Viewport / CSS

| Check | Result | Notes |
|-------|--------|--------|
| No new or changed CSS in `styles.css` for this feature | **Pass** | No edits to `frontend/styles.css`. |
| No new `data-viewport-mode` or viewport-specific branches in changed JS | **Pass** | All changes are in Material Rules (desktop-only); no `data-viewport-mode` or mobile-only paths touched. |
| Material Rules view remains gated by `canAccessDesktopAdminUi()` | **Pass** | Existing guards unchanged; menu and view still desktop-only. |
| No desktop-only styles accidentally applied in mobile viewport | **Pass** | Material Rules UI is not rendered on mobile (view hidden; menu item hidden when not desktop admin). |
| No mobile layout or mobile-specific selectors introduced | **Pass** | No mobile-only classes or media queries added. |

**Verdict: Pass** — No desktop/mobile bleed; scope remains desktop admin only.

---

### 1.2 Database & Backend

| Check | Result | Notes |
|-------|--------|--------|
| Migration applied only to intended table/column | **Pass** | `ALTER TABLE public.quick_quoter_part_templates ADD COLUMN display_group_id uuid NULL`. |
| Backfill script is read + update only; no table drops or destructive DDL | **Pass** | Script only SELECTs and UPDATEs `display_group_id`. |
| Backend validates `display_group_id` (UUID or empty) and rejects invalid | **Pass** | `_to_optional_uuid`; invalid non-empty value raises `invalid_display_group_id`. |
| Default when omitted: `display_group_id = template_id` | **Pass** | Logic in `_normalize_quick_quoter_templates` verified. |
| GET/PUT response and payload include `display_group_id`; backward compatible | **Pass** | Optional field; existing clients can ignore it. |
| No new environment variables required | **Pass** | Uses existing Supabase env only. |

**Verdict: Pass** — Database and backend behaviour correct and safe.

**Finding (non-blocking):** Migration was applied via Supabase MCP only. There is **no migration SQL file in the repo** (e.g. under `docs/` or a migrations folder). Other environments or future developers cannot replay the schema change from the codebase. **Recommendation:** Add a file (e.g. `docs/migrations/add_display_group_id_to_quick_quoter_part_templates.sql`) containing the same `ALTER TABLE` for traceability and replay.

---

### 1.3 Railway Deployment Safety

| Check | Result | Notes |
|-------|--------|--------|
| No change to Procfile, nixpacks, or build steps | **Pass** | Not modified. |
| No new env vars required in Railway | **Pass** | None. |
| Backend and frontend remain deployable with existing runbook | **Pass** | `./scripts/run-server.sh` and existing deploy flow unchanged. |
| Backfill is one-off; not invoked at deploy or startup | **Pass** | Script is manual; not referenced by Procfile or server. |

**Verdict: Pass** — Railway deployment safety unchanged.

---

### 1.4 Frontend Logic & UI/UX

| Check | Result | Notes |
|-------|--------|--------|
| Grouping key is stable for expand/collapse (same groupId per group) | **Pass** | `groupId` is `display_group_id` or `row.id` from API data. |
| Fallback when both `display_group_id` and `row.id` missing | **Fail** | See Logic Gap 1 below. |
| Collect payload: `display_group_id` sent when valid UUID from DOM | **Pass** | `row.dataset.displayGroupId` read; UUID regex; added to template only when valid. |
| New rows (no `display_group_id`): backend default applied | **Pass** | Empty string in dataset; not sent; backend sets to template id. |
| Summary row and expand/collapse still work | **Pass** | Same DOM structure and `data-material-rules-group-id`; only key source changed. |
| No removal of ARIA or keyboard behaviour | **Pass** | Existing aria-label and expand/collapse button unchanged. |
| Summary label still meaningful (product_id + profile/size) | **Pass** | `formatMaterialRulesGroupSummaryLabel` kept; uses first row product_id + suffix (stem removed as planned). |

**Verdict: Pass** with one logic gap (see below).

---

### 1.5 Tests & E2E

| Check | Result | Notes |
|-------|--------|--------|
| Backend unit tests pass and cover new field | **Pass** | `test_successful_writes_set_updated_by_and_updated_at` asserts default; `test_display_group_id_round_trip_and_validation` covers set/GET/invalid. |
| No E2E DOM assumptions broken (template row structure) | **Pass** | E2E expects absence of repair-id/fixed-length/row-id controls; we did not add them. Template rows still have same selectors used by E2E (`data-material-rules-template-row`, product dropdown, etc.). |
| E2E Material Rules flow not re-run in this audit | **Informational** | E2E was not executed as part of this audit. **Recommendation:** Run the Material Rules E2E block (desktop admin → Material Rules → save) to confirm no regression. |

**Verdict: Pass** — Tests and E2E assumptions align; manual E2E run recommended.

---

## 2. Logic Gaps & Bugs

### Logic Gap 1 (Low severity): Unstable groupId fallback

**Location:** `frontend/modules/admin-products-bonus.js` (render path), ~2411–2413:

```js
const groupId = group.rows[0]?.display_group_id != null
  ? String(group.rows[0].display_group_id)
  : (group.rows[0]?.id != null ? String(group.rows[0].id) : `g-${Math.random()}`);
```

**Issue:** If ever both `display_group_id` and `id` are null/undefined for the first row in a group, `groupId` becomes `g-${Math.random()}`. That value is not stable across re-renders, so expand/collapse state could not match summary row to member rows consistently.

**Likelihood:** Low. All API rows have `id`; backfill set `display_group_id` for all existing rows. Only theoretical for corrupted data or a bug elsewhere.

**Recommendation:** Replace with a stable fallback, e.g. use the first row’s `id` in the group if any, or a deterministic key from row indices, instead of `Math.random()`.

---

### Logic Gap 2 (Documentation): Stale references to removed functions

**Location:**  
- `docs/plans/PLAN_QUOTE_MODAL_CONSOLIDATE_MATERIALS_BY_PART.md` — still describes `getMaterialRulesProductFamilyStem` and `getMaterialRulesTemplateGroupsForSection` as the grouping implementation.  
- `docs/plans/PLAN_MATERIAL_RULES_DISPLAY_GROUP_ID.md` — still lists line numbers and function names for the *previous* (removed) implementation in “Current Approach”.

**Issue:** Future readers may look for code that no longer exists.

**Recommendation:** In PLAN_QUOTE_MODAL_CONSOLIDATE_MATERIALS_BY_PART.md add a short note that grouping is now driven by `display_group_id` (63.19.4). In PLAN_MATERIAL_RULES_DISPLAY_GROUP_ID.md update or remove the “Current Approach” section (or mark it “Historical – replaced by display_group_id”).

---

### Missing Cleanup / Traceability

1. **Migration SQL not in repo** (see §1.2). Add an on-disk migration file for `display_group_id` for replay and traceability.
2. **Backfill script not referenced in TROUBLESHOOTING or README.** The script is one-off and documented in-plan; adding a one-line note in TROUBLESHOOTING.md (e.g. “If you reset part templates and need to re-apply display grouping, run `PYTHONPATH=backend backend/.venv/bin/python scripts/backfill_display_group_id.py` from project root”) would help.
3. **README API section** does not mention `display_group_id` on GET/PUT quick-quoter templates. Optional doc improvement for API consumers.

---

## 3. Pass/Fail Summary by Category

| Category | Result |
|----------|--------|
| Regression & conflict (desktop vs. mobile) | **Pass** |
| Database & backend | **Pass** |
| Railway deployment safety | **Pass** |
| Frontend logic & UI/UX | **Pass** (with one low-severity logic gap) |
| Tests & E2E | **Pass** (E2E run recommended) |
| Documentation & traceability | **Fail** (migration file missing; stale plan refs; optional README/TROUBLESHOOTING updates) |

---

## 4. Summary

- **No regressions or scope bleed** between desktop and mobile; Material Rules remains desktop-only and no new viewport-specific CSS or logic was introduced.
- **Backend and database** behaviour is correct; Railway deploy is unchanged and safe.
- **One low-severity logic gap:** unstable `groupId` fallback when both `display_group_id` and `id` are missing; fix by using a stable fallback instead of `Math.random()`.
- **Documentation/traceability:** Add migration SQL to repo, update or mark historical plan references, and optionally document the backfill script in TROUBLESHOOTING and `display_group_id` in README.

No fix code has been written; awaiting your approval of this audit before implementing any changes.
