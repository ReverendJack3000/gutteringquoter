# Plan: Section 59.18.2 — Final dashboard pass (canonical rule engine)

**Date:** 2026-02-24  
**Branch:** feature/section-59-cron-sync  
**Single source of truth:** TASK_LIST.md, docs/tasks/section-59.md  
**Purpose:** Plan for 59.18.2: switch provisional metrics/ledger to canonical rule engine (59.9–59.15), remove provisional placeholders where no longer needed, and lock payout display for closed periods. No assumptions; verified against current code.

---

## 1. Verified codebase state

### 1.1 Backend

- **main.py**
  - `_build_provisional_technician_dashboard_payload` (lines 446–531): builds dashboard payload.
  - Uses `select_period_jobs(period, period_jobs_source)` → all jobs linked to period (no status filter).
  - Uses `build_provisional_ledger_rows(period_jobs, personnel_by_job, technician_id)` (line 496).
  - Uses `compute_provisional_team_pot(period_jobs)` (line 501).
  - `callback_cost_total` summed over **all** period_jobs (line 503–506); not subtracted from pot in provisional.
  - Call sites: line 1207 (GET dashboard), line 1250 (GET jobs — builds same payload, returns ledger subset).
  - Imports from `app.bonus_dashboard`: `build_provisional_ledger_rows`, `compute_provisional_team_pot`, `compute_technician_contribution_total`, `group_personnel_by_job`, `select_current_period`, `select_period_jobs`.
  - Imports from `app.bonus_calc`: `compute_job_gp` only (not `compute_period_pot`, `filter_eligible_period_jobs`, or apply_*).

- **bonus_dashboard.py**
  - `filter_eligible_period_jobs(period_jobs)` (137–148): returns jobs with `status` in `ELIGIBLE_JOB_STATUSES` ('verified', 'processed').
  - `compute_provisional_team_pot(period_jobs)` (158–162): 10% of sum(provisional job GP); no callback deduction.
  - `build_provisional_ledger_rows(period_jobs, personnel_by_job, technician_id)` (206–364): returns list of ledger row dicts; only includes jobs where the viewing technician is in personnel. Row shape: `job_performance_id`, `servicem8_job_id`, `servicem8_job_uuid`, `job_identifier`, `created_at`, `status`, `period_link_method`, `is_provisional`, `role_badges`, `seller_count`, `executor_count`, `truck_share_applied`, `job_gp`, `my_job_gp_contribution`, `estimation`, `penalty_tags`, `pending_reasons`, `pending_reason_messages`, `explanations`.

- **bonus_calc.py**
  - `compute_period_pot(eligible_jobs)` (33–43): Sum(Job GP × 0.10) − sum(callback_cost); caller must pass eligible jobs only.
  - `compute_job_base_splits(job, personnel)` (54–92): 60/40, do-it-all, truck share; returns `{ technician_id: { seller_base, executor_base } }`.
  - Pipeline order (must be preserved): **base_splits → callback_voids → estimation_accuracy → seller_penalties.**
  - `apply_callback_voids(job, splits)` (162–183).
  - `apply_estimation_accuracy(job, personnel, splits)` (106–133).
  - `apply_seller_penalties(job, personnel, splits)` (134–161).

- **Period selection**
  - `BONUS_PERIOD_READ_STATUSES = ("open", "processing")` (main.py 295). `_fetch_bonus_dashboard_period_rows` only returns open/processing. `_resolve_bonus_dashboard_period`: when `period_id` is explicitly provided, fetches that period and raises 400 if `status not in BONUS_PERIOD_READ_STATUSES` (380–381). So **closed periods cannot be viewed** today.

### 1.2 Frontend

- **app.js** uses `hero.total_team_pot`, `ledger.jobs`, and related payload shape. No change to response shape; only source of values and new fields (e.g. `period.status` for lock) may be added.

### 1.3 Constraints (from user and rules)

- One codebase for desktop and mobile; no breaking production.
- Deploy via `./scripts/run-server.sh` / Railway; no new required env.
- Unless specified, changes are to **mobile UI / accessibility**; desktop layout unchanged. Dashboard is mobile-first and shared; canonical data and closed-period lock apply to both viewports.

---

## 2. Scope of 59.18.2

- Switch dashboard **metrics and ledger** from provisional to **canonical** (filter_eligible_period_jobs, compute_period_pot, canonical ledger using bonus_calc pipeline).
- Remove provisional placeholders from the **dashboard code path** (no longer call build_provisional_ledger_rows / compute_provisional_team_pot for the main payload).
- **Lock payout display for closed periods**: allow viewing a closed period when requested by `period_id`, and expose so UI can show payout as final/locked (e.g. `period.status` in payload; frontend shows “Final Payout” / read-only when `period.status === 'closed'`).

Optional sub-tasks 59.18.2.1–59.18.2.5 (GP Race layout, pot motion, podium/badge UX, mobile QA) follow after 59.18.2 and are not in scope for this plan.

---

## 3. Implementation plan (step-by-step)

### 3.1 backend/app/bonus_dashboard.py

1. **Add `build_canonical_ledger_rows(eligible_jobs, personnel_by_job, technician_id)`**
   - Inputs: same as `build_provisional_ledger_rows` but **eligible_jobs** (already filtered by status verified/processed).
   - For each job in eligible_jobs where the viewing technician is in personnel (same filter as provisional):
     - Get `personnel = personnel_by_job.get(job_id)`.
     - `splits0 = compute_job_base_splits(job, personnel)` (from bonus_calc).
     - `splits1 = apply_callback_voids(job, splits0)`.
     - `splits2 = apply_estimation_accuracy(job, personnel, splits1)`.
     - `splits3 = apply_seller_penalties(job, personnel, splits2)`.
     - `job_gp = compute_job_gp(job)`.
     - For viewing tech: `my_job_gp_contribution = splits3[tech_id]["seller_base"] + splits3[tech_id]["executor_base"]`.
     - Build one row with **same shape** as provisional: `job_performance_id`, `servicem8_job_id`, `servicem8_job_uuid`, `job_identifier`, `created_at`, `status`, `period_link_method`, `role_badges`, `seller_count`, `executor_count`, `truck_share_applied`, `job_gp`, `my_job_gp_contribution`, `estimation` (reuse `_build_estimation_payload`), `penalty_tags`, `explanations`, `pending_reasons` / `pending_reason_messages`. Set **`is_provisional`: False**. Omit `final_rules_not_implemented` and `expected_payout_pending` from `pending_reasons` for canonical rows (keep other reasons e.g. period_link_fallback, roles_unverified, quoted_labour_missing, job_not_verified where applicable).
   - Sort by created_at desc, job_performance_id (same as provisional).
   - Imports from bonus_calc: `compute_job_gp`, `compute_job_base_splits`, `apply_callback_voids`, `apply_estimation_accuracy`, `apply_seller_penalties`.

2. **Add `compute_total_contributed_gp(eligible_jobs, personnel_by_job)`**
   - For each job in eligible_jobs, get personnel; run same pipeline (base_splits → callback_voids → estimation_accuracy → seller_penalties). Sum over all techs: `seller_base + executor_base` for that job. Sum over all jobs. Return `round(total, 2)`. Used so dashboard can compute `my_expected_payout = period_pot * (my_gp / total_contributed_gp)` when total_contributed_gp > 0.

3. **Exports**
   - Keep existing exports. New: `build_canonical_ledger_rows`, `compute_total_contributed_gp`. `filter_eligible_period_jobs` already exists.

4. **Provisional functions**
   - Do **not** delete `build_provisional_ledger_rows` or `compute_provisional_team_pot` in this task (could be useful for tests or reference). Remove them from the **call path** in main only.

### 3.2 backend/main.py

1. **Imports**
   - From `app.bonus_calc`: add `compute_period_pot`.
   - From `app.bonus_dashboard`: add `filter_eligible_period_jobs`, `build_canonical_ledger_rows`, `compute_total_contributed_gp`. Keep `build_provisional_ledger_rows`, `compute_provisional_team_pot` only if still used; otherwise remove from imports when switching the path.

2. **Dashboard payload (canonical path)**
   - In `_build_provisional_technician_dashboard_payload` (name can stay for now to avoid route changes):
     - After `period_jobs = select_period_jobs(period, period_jobs_source)`, compute **`eligible_jobs = filter_eligible_period_jobs(period_jobs)`**.
     - **Period job IDs for personnel fetch:** use `eligible_jobs` only: `period_job_ids = [str((j or {}).get("id") or "").strip() for j in eligible_jobs if str((j or {}).get("id") or "").strip()]`.
     - Fetch personnel: `personnel_rows = _fetch_job_personnel_rows_for_jobs(supabase=supabase, job_performance_ids=period_job_ids)`; `personnel_by_job = group_personnel_by_job(personnel_rows)`.
     - **Team pot:** `team_pot = compute_period_pot(eligible_jobs)` (from bonus_calc).
     - **Ledger:** `ledger_rows = build_canonical_ledger_rows(eligible_jobs, personnel_by_job, technician_id)`.
     - **Technician GP:** `technician_gp = compute_technician_contribution_total(ledger_rows)`.
     - **Total contributed GP:** `total_contributed_gp = compute_total_contributed_gp(eligible_jobs, personnel_by_job)`.
     - **My expected payout:** `my_expected_payout = round(team_pot * (technician_gp / total_contributed_gp), 2) if total_contributed_gp > 0 else 0.0` (or `None` when period has no eligible jobs; keep consistent with current hero shape).
     - **Callback cost for hero:** keep `callback_cost_total` as sum of `callback_cost` over **eligible_jobs** (for transparency); optional to keep or drop from hero.
     - **Provisional flags:** set `is_provisional`: False. Set `expected_payout_status`: `"final"` when `period.get("status") == "closed"`, else `"computed"`. Hero `pending_reasons`: remove `final_rules_not_implemented` and `expected_payout_pending` when using canonical path; optionally keep a single reason when period is open (e.g. “Payout may change until period is closed”) if product wants it.
     - **period_job_count / technician_job_count:** use `len(eligible_jobs)` and `len(ledger_rows)` for consistency.

3. **Closed-period read-only view**
   - In `_resolve_bonus_dashboard_period`, when `requested_period_id` is provided and the period is fetched by id: allow status **open**, **processing**, or **closed** (so explicit request can view a closed period). Change: if `status not in ("open", "processing", "closed")` then 400; else return `(period, "explicit_period_id")`. Do **not** add "closed" to `_fetch_bonus_dashboard_period_rows` (current-period dropdown remains open/processing only).
   - Payload already includes `period` with `status`. Frontend can use `period.status === 'closed'` to show payout as final and locked.

4. **Empty / no period**
   - When `period` is None, keep existing early return (no change).
   - When `eligible_jobs` is empty: `team_pot = 0`, `ledger_rows = []`, `technician_gp = 0`, `total_contributed_gp = 0`, `my_expected_payout = 0.0` (or None per product preference). No division by zero.

### 3.3 Frontend (mobile-first; desktop layout unchanged)

1. **Use canonical payload**
   - No change to API response shape. Frontend already consumes `hero.total_team_pot`, `ledger.jobs`, etc. Values will now be canonical.

2. **Lock payout for closed periods**
   - When `period && period.status === 'closed'`: show payout as **final** and **locked** (read-only, e.g. label “Final Payout” or “Payout (locked)”). No editing; no “expected” or “pending” wording.
   - When `is_provisional === false` and `expected_payout_status === 'computed'` or `'final'`: show `my_expected_payout` and do not show “pending final rules” / “expected payout pending” messaging.

3. **Scope**
   - One codebase; same bonus dashboard for desktop and mobile. Closed-period lock and canonical labels apply to both viewports. No `data-viewport-mode` branching unless needed for a future sub-task (59.18.2.1–59.18.2.5).

### 3.4 Remove provisional from dashboard path

- In main.py, the single dashboard builder function uses **canonical** only (filter_eligible_period_jobs → compute_period_pot, build_canonical_ledger_rows, compute_total_contributed_gp). Remove use of `build_provisional_ledger_rows` and `compute_provisional_team_pot` in that path. Provisional functions can remain in bonus_dashboard.py unused, or be removed in a follow-up.

---

## 4. Edge cases and safeguards

- **Empty eligible_jobs:** team_pot = 0, ledger = [], technician_gp = 0, total_contributed_gp = 0; `my_expected_payout = 0.0` (or None); no division by zero.
- **All jobs voided/zero after pipeline:** total_contributed_gp = 0; my_expected_payout = 0.0 (or None).
- **Period None:** existing early return; no change.
- **Closed period:** only viewable when explicitly requested via `period_id`; current-period selection still open/processing only.
- **Personnel missing for a job:** canonical ledger (like provisional) only includes jobs where the viewing tech is in personnel; no row for that job for that tech. No change to contract.

---

## 5. Desktop vs mobile impact

- **Backend:** Same API for both; no viewport or device logic.
- **Frontend:** Same payload and same UI rules (canonical values, closed-period lock). Desktop layout unchanged; mobile-first dashboard unchanged in structure. Optional sub-tasks 59.18.2.1–59.18.2.5 may add mobile-specific layout/UX later.

---

## 6. Files to touch (summary)

| File | Change |
|------|--------|
| `backend/app/bonus_dashboard.py` | Add `build_canonical_ledger_rows`, `compute_total_contributed_gp`; import from bonus_calc: compute_job_gp, compute_job_base_splits, apply_callback_voids, apply_estimation_accuracy, apply_seller_penalties. |
| `backend/main.py` | Import filter_eligible_period_jobs, compute_period_pot, build_canonical_ledger_rows, compute_total_contributed_gp; wire dashboard payload to eligible_jobs, compute_period_pot, build_canonical_ledger_rows, compute_total_contributed_gp; set is_provisional False, expected_payout_status, my_expected_payout; allow closed period when requested by period_id in _resolve_bonus_dashboard_period. |
| `frontend/app.js` (and styles if needed) | When period.status === 'closed', show payout as final/locked; when is_provisional false and expected_payout_status computed/final, show my_expected_payout and remove pending rules messaging. |

---

## 7. Task list update (after implementation)

- In **docs/tasks/section-59.md:** Mark **59.18.2** as done (`[x]`). Sub-tasks 59.18.2.1–59.18.2.5 remain unchecked until implemented.
- **TASK_LIST.md:** Uncompleted row for section 59: update “Next” to 59.18.2 when starting; after 59.18.2 done, set “Next” to 59.18.2.1 or next open task. Remove section-59 row only when the whole section is complete.

---

## 8. References

- Task: docs/tasks/section-59.md (59.18.2, 59.18.2.1–59.18.2.5)
- Calculation engine plan: docs/plans/2026-02-24-section-59-10-to-59-15-calculation-engine-plan.md (§9–10)
- QA audit: docs/audits/2026-02-24-section-59-10-to-59-15-qa-audit.md (§7.2)
- Code: backend/main.py (446–531, 1207, 1250), backend/app/bonus_dashboard.py (137–148, 158–162, 206–364), backend/app/bonus_calc.py (full pipeline)
