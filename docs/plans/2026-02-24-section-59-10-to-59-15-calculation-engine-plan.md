# Plan: Section 59.10–59.15 — Calculation engine (verified)

**Date:** 2026-02-24  
**Branch:** feature/section-59-cron-sync  
**Single source of truth:** TASK_LIST.md, docs/tasks/section-59.md  
**Purpose:** Plan for 59.10 Period Pot through 59.15 Schedule Saver, 100% aligned with codebase and locked calculation order. No assumptions; desktop/mobile impact noted.

---

## 1. Validated facts from the codebase

- **bonus_calc.py:** `compute_job_gp(job)` and `PARTS_RUN_DEDUCTION_DOLLARS = 20` exist. Pure function: revenue − materials − (standard_parts_runs × 20). No use of missed_materials_cost, callback_cost, seller_fault_parts_runs.
- **company_settings.py:** `get_bonus_labour_rate(supabase)` exists; not used in Job GP or Period Pot formula (reserved for 59.10+ where needed).
- **main.py:** `BONUS_JOB_PERFORMANCE_COLUMNS` includes id, servicem8_job_id, servicem8_job_uuid, bonus_period_id, status, created_at, invoiced_revenue_exc_gst, materials_cost, quoted_labor_minutes, is_callback, callback_reason, callback_cost, standard_parts_runs, seller_fault_parts_runs, missed_materials_cost. `BONUS_JOB_PERSONNEL_COLUMNS` = id, job_performance_id, technician_id, is_seller, is_executor, onsite_minutes, travel_shopping_minutes.
- **job_performance_sync.py:** `SYNC_OWNED_COLUMNS` does not include callback or penalty fields; no change for 59.10–59.15.
- **BACKEND_DATABASE.md §4:** job_performance.status IN ('draft','verified','processed'). "Only verified/processed rows in period pot." bonus_periods.status IN ('open','processing','closed').
- **bonus_dashboard.py:** `select_period_jobs()` filters by period link (bonus_period_id or created_at fallback); it does **not** filter by job status. `build_provisional_ledger_rows()` uses `compute_provisional_job_gp` (revenue − materials only); must be replaced with canonical engine using `compute_job_gp` + 59.10–59.15 rules. Provisional hero: `compute_provisional_team_pot(period_jobs)` (10% of sum of provisional GP); callback_cost_total_raw summed but not subtracted from pot. Estimation: `_build_estimation_payload` uses tolerance = max(round(quoted*0.15), 30); "whichever is greater" is already correct.
- **Calculation order (locked):** Step 1 (59.9) Base Job GP ✓ → Step 2 (59.10) Period Pot → Step 3 (59.11, 59.13) base splits + estimation accuracy → Step 4 (59.14, 59.12) Seller final + callbacks void. Schedule Saver (59.15) is a correctness check on 59.11.

---

## 2. Eligibility for Period Pot (59.10)

- **Periods we calculate for:** Only periods with `bonus_periods.status` IN ('open', 'processing'). (Existing `_fetch_bonus_dashboard_period_rows` and `BONUS_PERIOD_READ_STATUSES` already restrict to open/processing.)
- **Eligible jobs within a period:** Jobs that belong to the period (via `bonus_period_id` or created_at fallback) **and** `job_performance.status` IN ('verified', 'processed'). Per BACKEND_DATABASE.md §4: "Only verified/processed rows in period pot."
- **Implementation note:** Current `_fetch_period_jobs_with_fallback` does not filter by job status. For 59.10 (and for canonical dashboard 59.18.2), either filter in Python after fetch or add `.in_("status", ["verified", "processed"])` when building period pot and ledger. Decision: filter when computing period pot and when building canonical ledger so that draft jobs are excluded from pot and from technician GP.

---

## 3. 59.10 — Period Pot (Step 2)

- **Formula:** Period Pot = Sum(Job GP × 0.10) for **eligible** jobs − **global_callback_costs**.
- **Eligible jobs:** In the period (bonus_period_id or created_at fallback) and job_performance.status IN ('verified', 'processed').
- **Job GP:** Use `compute_job_gp(job)` from `backend/app/bonus_calc` (already implemented).
- **global_callback_costs:** Sum of `job_performance.callback_cost` over the **same** eligible jobs. (Each job row has callback_cost; no separate table.)
- **Where to implement:** Add a function (e.g. in `bonus_calc.py` or `bonus_dashboard.py`) such as `compute_period_pot(eligible_jobs: list[dict]) -> float`: sum(compute_job_gp(j) * 0.10 for j in eligible_jobs) − sum(callback_cost for j in eligible_jobs); return round(..., 2). Callers must pass only eligible jobs (period-linked + verified/processed).
- **No new env or schema.** Desktop/mobile: backend only; no UI change in this task.

---

## 4. 59.11 — Tech GP and base splits (Step 3)

- **Per job:** Seller Base Cut = Job GP × 0.60; Executor Base Cut = Job GP × 0.40. Use `compute_job_gp(job)`.
- **Do it all, get it all:** One tech is both sole seller and sole executor → that tech gets 100% of Job GP for that job.
- **Truck share:** Multiple sellers and/or executors → split by headcount: each seller gets (Job GP × 0.60) / num_sellers; each executor gets (Job GP × 0.40) / num_executors. Same as current `build_provisional_ledger_rows` logic but using `compute_job_gp(job)` and later applying 59.12 (voids), 59.13 (estimation), 59.14 (Seller final).
- **Where:** Canonical ledger/split logic should live in one place (e.g. `bonus_dashboard.py` or a dedicated `bonus_calc.py` extension) so GET dashboard and any period-summary API return the same numbers. Refactor provisional `build_provisional_ledger_rows` into or alongside a `build_canonical_ledger_rows` that applies all steps 59.11–59.14 and 59.12/59.13.

---

## 5. 59.12 — Callback rules

- **Effect on GP credit (per job):** If `is_callback` and `callback_reason == 'poor_workmanship'` → Executor GP credit for that job = 0. If `is_callback` and `callback_reason == 'bad_scoping'` → Seller GP credit for that job = 0.
- **Effect on period pot:** callback_cost is already included in 59.10 (global_callback_costs deducted from period pot). No extra deduction here.
- **Implementation:** When computing per-tech per-job amounts (59.11), after computing Seller Base and Executor Base, set Executor share to 0 for that job if callback void executor; set Seller share to 0 for that job if callback void seller. Both can be voided on the same job if both reasons were recorded (task describes one reason per callback; schema allows one reason per job — single callback_reason per row).

---

## 6. 59.13 — Estimation accuracy (Step 3)

- **Rule:** Seller share applies only if actual labour is within 15% of quoted_labor_minutes **or** within 30 minutes, **whichever is greater** (i.e. tolerance = max(15% of quoted, 30)).
- **Actual labour:** Sum over job_personnel for that job: (onsite_minutes + travel_shopping_minutes) per row.
- **Edge cases (document):** (1) quoted_labor_minutes = 0 → tolerance = max(0, 30) = 30 minutes; (2) rounding: use consistent rounding (e.g. tolerance = max(round(quoted * 0.15), 30); within = abs(actual - quoted) <= tolerance).
- **Where:** Already partially in `_build_estimation_payload` (tolerance = max(round(quoted*0.15), 30)). Canonical path must use the same rule and **zero out Seller share for that job** when outside tolerance (instead of only showing a tag). So: when building canonical ledger, if tech is seller and estimation fails, Seller Base Cut for that job → 0 for that tech.

---

## 7. 59.14 — Post-split penalties (Step 4)

- **Seller Final Cut** = Seller Base Cut − `missed_materials_cost` − (`seller_fault_parts_runs` × $20). Use `PARTS_RUN_DEDUCTION_DOLLARS` (20) from bonus_calc for consistency.
- **Scope:** missed_materials_cost and seller_fault_parts_runs are per job (job_performance columns). Apply only to Seller share for that job; do not subtract from Job GP or Executor.
- **Van stock:** No column; already reflected in materials_cost and thus in Base Job GP. No code change.
- **Wire:** Read missed_materials_cost and seller_fault_parts_runs from job row; apply after 59.11/59.12/59.13 when computing final Seller amount per job.

---

## 8. 59.15 — Schedule Saver

- **Rule:** Seller keeps full 60% when they did not execute (is_seller true, is_executor false).
- **Check:** Current provisional logic gives Seller share = job_gp * 0.60 / len(seller_ids) when is_seller and not do_it_all; it does not reduce when is_executor is false. So Schedule Saver is already satisfied: non-executor seller still gets full 60% (split if multiple sellers). No code change to split logic if canonical path mirrors this.
- **Deliverable:** Document in BACKEND_DATABASE or section-59 that Schedule Saver is satisfied by 60/40 split by role (sellers split 60%, executors split 40%); add a test or assertion that when is_seller=true, is_executor=false, the seller receives 60% (or 60%/num_sellers) with no extra penalty.

---

## 9. Implementation order and wiring

1. **59.10:** Implement `compute_period_pot(eligible_jobs)` and define "eligible" (period + status verified/processed). Optionally add helper `get_eligible_period_jobs(period, period_jobs_source)` that filters by status.
2. **59.11:** Implement canonical base splits (Job GP from compute_job_gp; 60/40; do-it-all; truck share). Output: per-job per-tech base amounts before callbacks/estimation/penalties.
3. **59.12:** Apply callback voids to those amounts (zero Executor or Seller for the job when applicable).
4. **59.13:** Apply estimation accuracy: zero Seller share for the job when actual vs quoted outside tolerance. Document zero-quoted and rounding in BACKEND_DATABASE or code.
5. **59.14:** Apply Seller final: subtract missed_materials_cost and (seller_fault_parts_runs × 20) from Seller share for the job.
6. **59.15:** Document Schedule Saver; add test/check; no split logic change.
7. **59.18.2:** Replace provisional dashboard: use canonical period pot (59.10), canonical ledger (59.11–59.14), and lock payout display for closed periods.

---

## 10. Files to touch (summary)

| File | Change |
|------|--------|
| `backend/app/bonus_calc.py` | Add `compute_period_pot(eligible_jobs)` (and optionally export PARTS_RUN_DEDUCTION_DOLLARS for 59.14 reuse). |
| `backend/app/bonus_dashboard.py` | Add eligible-job filter (status verified/processed). Add canonical ledger builder that uses compute_job_gp, applies 59.11–59.14 and 59.12/59.13; replace provisional team pot with period pot from 59.10 when "final rules" path is used. |
| `backend/main.py` | When building dashboard payload for final rules: use eligible jobs, compute period pot via 59.10, use canonical ledger (59.11–59.14). No new endpoints required for 59.10–59.15; existing GET dashboard can switch to canonical when implemented. |
| `docs/BACKEND_DATABASE.md` | Document eligibility (verified/processed), estimation edge cases (zero quoted, rounding), Schedule Saver. |

**Not changed:** job_performance_sync.py, company_settings.py (already done), frontend until 59.18.2.

---

## 11. Desktop / mobile impact

- **59.10–59.15:** Backend calculation only. No frontend, no `data-viewport-mode`, no mobile UI or accessibility changes. Desktop and mobile both consume the same APIs; behaviour unchanged until 59.18.2.
- **59.18.2:** Replace provisional dashboard outputs with canonical metrics/ledger; mobile-first dashboard remains; desktop unchanged in layout. No new mobile-only logic.

---

## 12. Task list update (after implementation)

- In **docs/tasks/section-59.md:** Mark **59.10**, **59.11**, **59.12**, **59.13**, **59.14**, **59.15** as done (`[x]`) when each is complete.
- **TASK_LIST.md:** Uncompleted row for section 59 remains until 59.18.2 (and any other open items) are done; then remove row when section is fully complete.

---

## 13. References

- Task: docs/tasks/section-59.md (59.10–59.15)
- Calculation order: docs/plans/2026-02-24-section-59-9-job-gp-calculation-plan.md §4
- Schema: docs/plans/2026-02-23-bonus-periods-job-performance-schema.md; docs/BACKEND_DATABASE.md §4
- Code: backend/app/bonus_calc.py, backend/app/bonus_dashboard.py, backend/main.py (BONUS_JOB_PERFORMANCE_COLUMNS, BONUS_JOB_PERSONNEL_COLUMNS, _fetch_period_jobs_with_fallback, build_provisional_ledger_rows)
