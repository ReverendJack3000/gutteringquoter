# Plan: Section 59.9 — Job GP calculation

**Date:** 2026-02-24  
**Scope:** Backend only (calculation + rate reader + wire to job_performance). No UI, no sync changes.  
**Branch:** feature/section-59-cron-sync  
**Single source of truth:** TASK_LIST.md (59.9–59.23 row), docs/tasks/section-59.md (59.9 checkbox and sub-tasks).

---

## 1. Goal

Implement **Job Gross Profit** calculation from `job_performance`: a single, consistent formula used by the bonus engine (and later by period pot 59.10 and 60/40 split 59.11). Read the bonus labour rate from `public.company_settings` (or env `BONUS_LABOUR_RATE`); do not hardcode. Wire the result to job_performance (via API or shared helper) so job_personnel and period logic can consume it.

---

## 2. Desktop / mobile impact

- **Backend-only.** No frontend, no `data-viewport-mode`, no mobile UI or accessibility changes.
- Desktop and mobile production behaviour unchanged. Any future Admin UI (59.17) or technician UI (59.18) will call the same APIs.

---

## 3. Van Stock vs Parts Run Missed Materials (no new column)

Two scenarios must be handled differently:

| Scenario | Logic | Wiring |
|----------|--------|--------|
| **Van Stock** | Executor adds a part from their van (forgotten by Seller) to the ServiceM8 job. | Cron (59.7) pulls `materials_cost` from API; the part is on the job so `materials_cost` is higher → Job GP is organically lower. **No column or extra math.** |
| **Parts Run** | Seller's mistake forces Executor to leave site; Seller takes full hit (travel + parts). | **`missed_materials_cost`** in DB is **only** for this. **NOT** deducted from base Job GP; **post-split Seller penalty only** (59.14). |

---

## 4. Calculation order (59.9 → 59.14) — locked for Dev 1

| Step | Task(s) | Operation |
|------|---------|-----------|
| **1** | **59.9** | **Base Job GP** = `invoiced_revenue_exc_gst` − `materials_cost` − (`standard_parts_runs` × $20). Do **NOT** subtract `missed_materials_cost`, `callback_cost`, or `seller_fault_parts_runs` here. |
| **2** | **59.10** | **Period Pot** = Sum(Job GP × 0.10) for eligible jobs − **global_callback_costs** (callbacks at period level). |
| **3** | **59.11, 59.13** | **Base splits:** Estimation Accuracy rule; then Seller Base = Job GP × 0.60, Executor Base = Job GP × 0.40; Truck Share if multiple. |
| **4** | **59.14, 59.12** | **Post-split:** Seller Final = Seller Base − `missed_materials_cost` − (`seller_fault_parts_runs` × $20). Callbacks (59.12) void respective cut. |

---

## 5. Formula for 59.9 (locked)

**Base Job GP** = revenue − materials − (standard_parts_runs × $20) — see §4 for full calculation order (59.9–59.14).

| Term | Source | Notes |
|------|--------|--------|
| **revenue** | `job_performance.invoiced_revenue_exc_gst` | Already ex-GST (sync divides total_invoice_amount by 1.15). |
| **materials** | `job_performance.materials_cost` | From sync (59.7); van-stock missed materials already in this. |
| **standard_parts_runs** | `job_performance.standard_parts_runs` | $20 per run from Job GP. |

**NOT in Base Job GP:** `missed_materials_cost` (Step 4, Seller only); `callback_cost` (Step 2, period level); `seller_fault_parts_runs` (Step 4, Seller only). Edge: NULL/missing → 0; round to 2 dp; use `PARTS_RUN_DEDUCTION_DOLLARS = 20`.

---

## 6. Bonus labour rate (no hardcoding)

- **Primary:** Read from `public.company_settings`: single row where `id = 1`, column `bonus_labour_rate` (numeric, default 35). Schema: `add_company_settings_bonus_rate` (BACKEND_DATABASE.md §4).
- **Fallback:** If row missing or query fails, use env `BONUS_LABOUR_RATE` (float). Document in `backend/.env.example`.
- **Final fallback:** If env unset, use `35.0` so the app does not crash.
- **Usage in 59.9:** Implement the reader and use it where any code path needs the rate (e.g. future period pot or 60/40). For the Job GP formula itself, the rate is not used; the reader is required by task and will be used in 59.10+.

---

## 7. Implementation steps

### 7.1 Rate reader

- **Where:** New module e.g. `backend/app/company_settings.py` (or add to an existing bonus/calc module if preferred).
- **Function:** `get_bonus_labour_rate(supabase) -> float`. Query `company_settings` where `id = 1`; return `bonus_labour_rate`. On failure or no row: `os.environ.get("BONUS_LABOUR_RATE")` parsed as float; if invalid/missing, return `35.0`. Log fallback use.
- **Dependencies:** `get_supabase()` from `app.supabase_client`; no change to sync or job_performance_sync.

### 7.2 Job GP calculation (Base Job GP only)

- **Where:** New module e.g. `backend/app/bonus_calc.py` (or same as rate reader).
- **Function:** `compute_job_gp(job: dict) -> float`. Input: a single `job_performance` row (dict). Use **only** `invoiced_revenue_exc_gst`, `materials_cost`, `standard_parts_runs`. Formula: revenue − materials − (standard_parts_runs × 20). Do **not** use `missed_materials_cost` or `callback_cost` in this function. Treat None/missing as 0; use `PARTS_RUN_DEDUCTION_DOLLARS = 20`; return `round(..., 2)`.
- **Pure function:** No DB or env access inside this function; input is a dict. Callers pass the row from Supabase.

### 7.3 Wire to job_performance

- **Option A (recommended):** Add a read endpoint that returns one job_performance row plus computed `job_gp`, e.g. `GET /api/bonus/job-performance/{job_performance_id}` (admin only, consistent with existing bonus routes). Response includes all needed job_performance fields plus `job_gp` (computed). This “wires” the calculation to the API so 59.16 “get job list for period” can later return the same shape.
- **Option B:** Only add the helper `compute_job_gp` and use it from 59.10/59.11 when building period/job lists. No new endpoint in 59.9.
- **Recommendation:** Do both: implement `compute_job_gp` and add `GET /api/bonus/job-performance/{id}` that returns the row + `job_gp`. Keeps 59.9 self-contained and gives Admin/59.16 a clear read path. Auth: `require_role(["admin"])` like other bonus routes in `main.py` (~748–849).

### 7.4 job_personnel

- No schema or API change to `job_personnel` for 59.9. “Wire to job_personnel where relevant for later 60/40” means: the **job-level** GP is what 59.11 will later split by seller/executor; no need to write to job_personnel in this task.

### 7.5 Sync

- **No change** to `backend/app/job_performance_sync.py`. SYNC_OWNED_COLUMNS stays as-is; calculation is separate from sync. Job GP is computed on read (or when building period summary), not stored in the table. If a stored `job_gp` column is added later, that would be a separate decision/task.

### 7.6 Documentation and env

- **backend/.env.example:** Add optional `# BONUS_LABOUR_RATE=35` with a one-line comment (fallback when company_settings is missing).
- **docs/BACKEND_DATABASE.md:** In §4 (Bonus / job performance) or Section 59 decisions, add one short subsection “Job GP calculation (59.9)”: formula and that rate comes from company_settings or BONUS_LABOUR_RATE.

---

## 8. Files to touch (summary)

| File | Change |
|------|--------|
| `backend/app/company_settings.py` (new) | `get_bonus_labour_rate(supabase) -> float`. |
| `backend/app/bonus_calc.py` (new) | `compute_job_gp(job: dict) -> float`, `PARTS_RUN_DEDUCTION_DOLLARS = 20`. |
| `backend/main.py` | Register `GET /api/bonus/job-performance/{job_performance_id}` (admin), use `compute_job_gp` on the fetched row and add `job_gp` to response. |
| `backend/.env.example` | Optional `BONUS_LABOUR_RATE` with comment. |
| `docs/BACKEND_DATABASE.md` | Short “Job GP calculation (59.9)” subsection (formula + rate source). |

**Not changed:** `job_performance_sync.py`, `bonus_periods.py`, frontend, migrations (no new column).

---

## 9. Edge cases and assumptions

- **Null/missing fields:** All numeric inputs to `compute_job_gp` default to 0 so existing rows (e.g. standard_parts_runs not yet set) still get a defined GP.
- **Negative GP:** Formula can yield negative (e.g. high materials or parts-run deductions). Return as-is; period pot (59.10) can decide whether to include negative jobs.
- **company_settings row:** If the migration added the table but no row exists, we fall back to env then 35.0; no insert in 59.9 (optional: document “ensure row id=1 exists” in deployment docs in 59.23).
- **Assumption:** `invoiced_revenue_exc_gst` and `materials_cost` are always set by sync (or 0); no separate “revenue source” switch in 59.9.

---

## 10. Task list update (after implementation)

- In **docs/tasks/section-59.md**: mark **59.9** and sub-tasks **59.9.1**, **59.9.2**, **59.9.3** as done (`[x]`).
- **TASK_LIST.md**: No change to the uncompleted table (59.9–59.23 row remains until more of the section is complete).

---

## 11. References

- Task: docs/tasks/section-59.md (59.9, 59.9.1–59.9.3)
- Decisions: docs/plans/2026-02-23-section-59-data-flow-decisions.md (revenue, rate, who populates what)
- Schema: docs/plans/2026-02-23-bonus-periods-job-performance-schema.md (job_performance columns); docs/BACKEND_DATABASE.md §4
- Sync: backend/app/job_performance_sync.py (SYNC_OWNED_COLUMNS; no change)
- Bonus routes: backend/main.py ~748–849
