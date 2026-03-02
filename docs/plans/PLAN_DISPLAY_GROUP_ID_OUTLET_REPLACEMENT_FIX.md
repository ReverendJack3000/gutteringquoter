# Plan: Fix Multiple Profiles (Joiner / Expansion Outlet) in Material Rules Part Templates

**Status:** Implemented (verification + documentation).  
**Goal:** Understand why Outlet Replacement shows 6 separate rows (2 Joiner + 4 Expansion Outlet) with no summary grouping, and fix via data so the UI shows one summary row per logical part where intended.

**Verification result (production, 2026-03):** Query of `quick_quoter_part_templates` for `repair_type_id = 'outlet_replacement'` showed that the 2 Joiner rows (J-SC-MAR, J-CL-MAR) already share the same `display_group_id`, and the 4 Expansion Outlet rows (EO-SC-MAR-65/80, EO-CL-MAR-65/80) share another. No data fix was required in production. If the issue appears (e.g. after reseeding or in another environment), re-run the backfill or use one-off SQL per this plan; see TROUBLESHOOTING.md "Material Rules Part Templates: display_group_id and backfill".

---

## 1. Root cause (confirmed from codebase)

The UI groups rows only by **display_group_id** (or, when null, by **row.id**). So:

- **One row per group** → each of the 6 rows has a **different effective group key** (either a different `display_group_id` or, when `display_group_id` is null, its own `id`).
- **Behaviour is data-driven;** the grouping logic in the frontend and backend is working as designed.

**Relevant code:**

- **Frontend grouping:** `frontend/modules/admin-products-bonus.js` — `getMaterialRulesTemplateGroupsByDisplayGroupId(rows)` builds the group key as `row.display_group_id ?? row.id` (lines 2012–2027). No stem/merge heuristics remain; grouping is by this key only.
- **Backend default:** `backend/app/material_rules.py` — In `_normalize_quick_quoter_templates`, when `display_group_id` is null/omitted, the backend sets `display_group_id = template_id` for that row (lines 444–445, 476). So every row that is saved without a valid `display_group_id` becomes its own group.
- **Backfill:** `scripts/backfill_display_group_id.py` — One-off script that partitions by `repair_type_id`, groups within each section using stem + SC/CL and 65/80 merge (matching the old frontend heuristics), then assigns one UUID per group and updates all rows in that group. With **seed-style product_ids** (e.g. `J-SC-MAR`, `J-CL-MAR`, `EO-SC-MAR-65`, `EO-SC-MAR-80`, …), the backfill would produce **one group for Joiner (2 rows)** and **one group for Expansion Outlet (4 rows)** for `outlet_replacement`.

---

## 2. Plausible causes for 6 separate rows

| # | Cause | Explanation |
|---|--------|-------------|
| **1** | **Rows added or re-saved after the backfill** | The backfill ran once and set `display_group_id` only for the templates that existed at that time. If the Outlet Replacement templates were later **added**, **replaced** (e.g. full save from admin UI), or **re-seeded** without `display_group_id`, then on save the backend sets `display_group_id = id` for each row → one group per row → 6 separate rows. |
| **2** | **Outlet Replacement rows were never backfilled** | If `outlet_replacement` had no templates (or different ones) when the backfill ran, those rows would never have received a shared `display_group_id`. If they were later inserted by seed or manual SQL that does not set `display_group_id`, they stay NULL; the frontend then uses `row.id` as the group key → one group per row. |
| **3** | **Backfill grouped them differently (product_id format)** | If the **stored** `product_id` values differ from the seed (e.g. display names like "Joiner: Storm Cloud Marley" or codes that produce different stems), the backfill’s stem/merge logic could assign **different** `display_group_id`s (e.g. two groups for Joiner, four for Expansion Outlet) → multiple summary rows instead of one per logical part. |

---

## 3. Verification (before applying a fix)

1. **Query production (or target) Supabase** for `outlet_replacement` part templates:
   - Table: `public.quick_quoter_part_templates`
   - Filter: `repair_type_id = 'outlet_replacement'`
   - Select: `id`, `product_id`, `condition_profile`, `condition_size_mm`, `display_group_id`, `sort_order`

2. **Check:**
   - Do the 6 rows (2 Joiner + 4 Expansion Outlet) each have a **different** `display_group_id`, or `display_group_id = id`?
   - What are the actual `product_id` values (codes like `J-SC-MAR` vs display names)?

3. **Interpretation:**
   - If each of the 6 rows has a distinct `display_group_id` (or NULL/id): confirms cause 1 or 2 (post-backfill save or never backfilled).
   - If `product_id` values are not the seed codes and stems would differ: cause 3 is possible; re-running the backfill with current data will still reassign groups from current `product_id`/qty/length_mode.

---

## 4. Fix options (after verification)

### Option A: Re-run the backfill (recommended if data matches seed-style codes)

- **When:** Current `product_id` values in DB are seed-style (e.g. `J-SC-MAR`, `EO-SC-MAR-65`) so the backfill’s stem/merge logic will produce the desired groups (1 Joiner group, 1 Expansion Outlet group for `outlet_replacement`).
- **How:** From **project root**, with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `backend/.env`:
  ```bash
  PYTHONPATH=backend backend/.venv/bin/python scripts/backfill_display_group_id.py
  ```
  Or: `python scripts/backfill_display_group_id.py` if the backend is on `PYTHONPATH`.
- **Effect:** **All** existing template rows are re-assigned a `display_group_id` based on current (qty, length_mode, stem) + SC/CL and 65/80 merge. Rows that should be one logical part will share the same `display_group_id`.
- **Caution:** Re-running overwrites every row’s `display_group_id`. If any custom grouping was set manually, it will be replaced by the script’s logic.

### Option B: One-off SQL (when only Outlet Replacement or specific rows need fixing)

- **When:** You want to fix only `outlet_replacement` (or a few repair types) without touching others, or the backfill’s stem logic does not match desired grouping for current `product_id` format.
- **How:** In Supabase SQL Editor (project `rlptjmkejfykisaefkeh`):
  1. For **Joiner** (2 rows): pick one UUID (e.g. `gen_random_uuid()`), set `display_group_id = that_uuid` for rows where `repair_type_id = 'outlet_replacement'` and `product_id IN ('J-SC-MAR','J-CL-MAR')`.
  2. For **Expansion Outlet** (4 rows): pick another UUID, set `display_group_id = that_uuid` for rows where `repair_type_id = 'outlet_replacement'` and `product_id IN ('EO-SC-MAR-65','EO-SC-MAR-80','EO-CL-MAR-65','EO-CL-MAR-80')`.
- **Effect:** Only those 6 rows get updated; other repair types and templates are unchanged.

### Option C: Future — “Assign to group” in admin UI

- Not in scope for this plan; would allow editing `display_group_id` per row or per group in the Material Rules UI.

---

## 5. Prevention

- **Document backfill:** Add a short entry to `TROUBLESHOOTING.md` describing when and how to re-run `scripts/backfill_display_group_id.py` (e.g. after resetting part templates or if grouping appears as one row per template). See audit recommendation in `docs/audits/AUDIT_63_19_4_DISPLAY_GROUP_ID_QA.md`.
- **Seed:** `docs/quick_quoter_seed.sql` does **not** set `display_group_id`. For new environments, either run the backfill after applying the seed, or add optional `display_group_id` to the seed for grouped rows (per `PLAN_MATERIAL_RULES_DISPLAY_GROUP_ID.md` §2.6).
- **Save path:** The frontend already sends `display_group_id` when the row has a valid UUID in `data-display-group-id`; the backend persists it. So normal “Save” in Material Rules preserves grouping. Grouping is lost only when rows are saved **without** `display_group_id` (e.g. new rows, or payload from a client that doesn’t send it).

---

## 6. Summary

| Item | Conclusion |
|------|------------|
| **Why 6 rows?** | Each of the 6 rows has a different effective group key (`display_group_id` or `id`); the UI correctly shows one row per group. |
| **Cause** | Data: either (1) post-backfill save set `display_group_id = id` per row, (2) rows were never backfilled, or (3) backfill assigned multiple groups due to `product_id` format. |
| **Fix** | Set shared `display_group_id` for rows that should be one logical part: re-run backfill (Option A) or one-off SQL (Option B). |
| **Railway** | No deploy or code change required for the fix; Supabase data update only. Backfill is run manually from project root. |

---

## 7. Task list impact

- Add **63.19.5** (or equivalent) to Section 63: verify `display_group_id` for `outlet_replacement` (and optionally other types), apply Option A or B, document backfill in `TROUBLESHOOTING.md`, then complete 63.19.3 (desktop QA + Railway sign-off) as planned.
