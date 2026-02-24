# Section 59.9 — Implementation plan (validated against codebase)

**Date:** 2026-02-24  
**Branch:** feature/section-59-cron-sync  
**Source:** User request + `docs/plans/2026-02-24-section-59-9-job-gp-calculation-plan.md`  
**Purpose:** Report a plan that is 100% correct based on this project’s code; no assumptions or oversights.

---

## 1. Validated facts from the codebase

- **job_performance PK:** `id` is **uuid** (schema: `docs/plans/2026-02-23-bonus-periods-job-performance-schema.md`). New route should accept UUID and fetch with `.eq("id", id)`.
- **Columns for Base Job GP:** `invoiced_revenue_exc_gst`, `materials_cost`, `standard_parts_runs` are all present.  
  - **main.py** `BONUS_JOB_PERFORMANCE_COLUMNS` (lines 295–299) already includes them; no new select list needed for the single-job endpoint — use the same constant and attach `job_gp`.
- **Sync:** `job_performance_sync.py` `SYNC_OWNED_COLUMNS` does **not** include `standard_parts_runs`, `missed_materials_cost`, `callback_cost`, or `seller_fault_parts_runs` (admin-edited). Plan is correct: no sync changes for 59.9.
- **company_settings:** `docs/BACKEND_DATABASE.md` §4: table `public.company_settings`, single row `id = 1`, column `bonus_labour_rate` (numeric, default 35). Migration: `add_company_settings_bonus_rate`.
- **Bonus routes / auth:** Bonus admin routes use `require_role(["admin"])` (e.g. PATCH periods, PATCH job-personnel). No existing `GET /api/bonus/job-performance/{id}`; add it with the same admin-only dependency.
- **.env.example:** No `BONUS_LABOUR_RATE` today; add optional `# BONUS_LABOUR_RATE=35` with a one-line comment as in the plan.
- **Desktop / mobile:** Backend-only change. No frontend, no `data-viewport-mode`, no mobile UI or accessibility changes. Desktop and mobile production behaviour unchanged.

---

## 2. Implementation plan (locked)

### 2.1 Rate reader (59.9.1)

- **Where:** New module `backend/app/company_settings.py`.
- **Function:** `get_bonus_labour_rate(supabase) -> float`.
  - Query `public.company_settings` where `id = 1`; return `bonus_labour_rate`.
  - On no row / query failure: read `os.environ.get("BONUS_LABOUR_RATE")`, parse as float; if invalid or missing, return `35.0`. Log when using env or default fallback.
- **Dependencies:** `get_supabase()` from `app.supabase_client`. No change to sync or job_performance_sync.
- **Usage in 59.9:** Implement only; the Job GP formula does not use the rate. It will be used in 59.10+.

### 2.2 Base Job GP calculation (59.9.2)

- **Where:** New module `backend/app/bonus_calc.py`.
- **Constant:** `PARTS_RUN_DEDUCTION_DOLLARS = 20`.
- **Function:** `compute_job_gp(job: dict) -> float`.
  - Input: one `job_performance` row (dict). Use **only** `invoiced_revenue_exc_gst`, `materials_cost`, `standard_parts_runs`.
  - Formula: `revenue − materials − (standard_parts_runs × 20)`. Treat `None`/missing as 0. Return `round(..., 2)`.
  - **Do not** use `missed_materials_cost`, `callback_cost`, or `seller_fault_parts_runs` in this function.
- **Pure function:** No DB or env access; callers pass the row from Supabase.

### 2.3 Wire to API (59.9.3)

- **Endpoint:** `GET /api/bonus/job-performance/{id}`.
  - **Path param:** `id` = job_performance row primary key (UUID). Validate with `uuid.UUID(id)`; 400 if invalid.
  - **Behaviour:** Fetch row by `id` using `BONUS_JOB_PERFORMANCE_COLUMNS` (same shape as existing bonus job reads). If not found, 404. Compute `job_gp = compute_job_gp(row)`, add to response. Return `{ **row, "job_gp": job_gp }`.
  - **Auth:** `require_role(["admin"])` (same as other bonus admin routes).
- **Location:** `backend/main.py` with the other bonus routes (~1005–1106). Add new GET after the existing bonus routes (e.g. after PATCH job-personnel, before GET technician/period-current).

### 2.4 Not changed

- **job_performance_sync.py:** No changes. SYNC_OWNED_COLUMNS and merge logic unchanged.
- **job_personnel:** No schema or API change for 59.9.
- **Frontend:** No changes. Desktop and mobile unchanged.
- **Migrations:** No new column or table for 59.9 (company_settings and job_performance already exist).

### 2.5 Documentation and env

- **backend/.env.example:** Add optional `# BONUS_LABOUR_RATE=35` with a one-line comment (fallback when company_settings is missing or unavailable).
- **docs/BACKEND_DATABASE.md:** Add a short subsection “Job GP calculation (59.9)”: formula (revenue − materials − (standard_parts_runs × 20)) and that the bonus labour rate is read from `company_settings` or `BONUS_LABOUR_RATE` (not used in this formula but documented for consistency).

---

## 3. Files to touch (summary)

| File | Change |
|------|--------|
| `backend/app/company_settings.py` (new) | `get_bonus_labour_rate(supabase) -> float`. |
| `backend/app/bonus_calc.py` (new) | `compute_job_gp(job: dict) -> float`, `PARTS_RUN_DEDUCTION_DOLLARS = 20`. |
| `backend/main.py` | Add `GET /api/bonus/job-performance/{id}` (admin), fetch row with `BONUS_JOB_PERFORMANCE_COLUMNS`, add `job_gp` via `compute_job_gp(row)`. Import `compute_job_gp` from `app.bonus_calc`; optionally import `get_bonus_labour_rate` from `app.company_settings` if we expose the rate in the response later (not required for 59.9). |
| `backend/.env.example` | Optional `BONUS_LABOUR_RATE` with comment. |
| `docs/BACKEND_DATABASE.md` | Short “Job GP calculation (59.9)” subsection. |

**Not changed:** `job_performance_sync.py`, `bonus_dashboard.py`, `bonus_periods.py`, frontend, migrations.

---

## 4. Edge cases (confirmed)

- **Null/missing fields:** All numeric inputs to `compute_job_gp` default to 0 (existing rows with unset `standard_parts_runs` get a defined GP).
- **Negative GP:** Formula can yield negative; return as-is; period pot (59.10) can decide inclusion later.
- **company_settings missing row:** Fallback to env then 35.0; no insert in 59.9 (optional: document “ensure row id=1 exists” in 59.23).
- **Invalid UUID for GET:** Return 400 with a clear message.

---

## 5. Task list (no changes needed)

- **docs/tasks/section-59.md:** 59.9 and 59.9.1–59.9.3 are already present and correctly scoped. No wording changes required.
- **TASK_LIST.md:** Uncompleted row “59 | 59.9–59.23 | …” remains until more of the section is complete; no update for 59.9 alone.

---

## 6. Assumptions explicitly avoided

- **Column names:** Taken from `BONUS_JOB_PERFORMANCE_COLUMNS` and schema docs; no guesswork.
- **company_settings:** Table and column names from BACKEND_DATABASE.md §4; id=1 from plan and docs.
- **Auth:** Reuse existing `require_role(["admin"])` pattern from bonus routes.
- **Id type:** job_performance.id is UUID per schema plan; validate and use as such.

This plan is ready for implementation with no further assumptions.
