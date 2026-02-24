# Plan: Section 59 — 59.16.2 and next tasks (report only, no code changes)

**Date:** 2026-02-24  
**Branch:** feature/section-59-cron-sync  
**Single source of truth:** TASK_LIST.md, docs/tasks/section-59.md  
**Purpose:** 100% code-aligned plan for next logical tasks (59.16.2, 59.17, 59.24). No assumptions; desktop vs mobile explicit. Changes are mobile UI/accessibility unless specified.

---

## 1. Current state (verified from codebase)

### 1.1 Completed

- **59.9–59.15:** Calculation engine (base Job GP, period pot, 60/40 splits, callback rules, estimation accuracy, seller penalties, Schedule Saver).
- **59.18.2, 59.18.2.1–59.18.2.5:** Canonical dashboard; mobile GP Race layout; reduce-motion; slice-bar animation; badge/tooltip UX; QA audit; safe-area top on bonus container. Desktop unchanged.

### 1.2 Backend bonus API (existing)

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /api/bonus/periods` | admin | List all bonus_periods (start_date desc). |
| `POST /api/bonus/periods` | admin | Create period (period_name, start_date, end_date, status default open). |
| `PATCH /api/bonus/periods/{period_id}` | admin | Update period (period_name, start_date, end_date, status). |
| `GET /api/bonus/technician/period-current` | admin/editor/technician | Current period (open first, else processing); optional period_id (open/processing/closed). |
| `GET /api/bonus/technician/dashboard` | admin/editor/technician | Full dashboard payload for one technician (period, hero, ledger); optional period_id, technician_id (admin override). |
| `GET /api/bonus/technician/jobs` | admin/editor/technician | Same as dashboard but returns only jobs + job_count + empty_state. |
| `GET /api/bonus/job-performance/{job_performance_id}` | admin | One job_performance row + computed job_gp (BONUS_JOB_PERFORMANCE_COLUMNS). |
| `PATCH /api/bonus/job-personnel/{personnel_id}` | admin | Update job_personnel (onsite_minutes, travel_shopping_minutes, is_seller, is_executor). |

**What does not exist today:**

- **Period summary (admin):** No endpoint that returns for a given period_id: period meta + total_team_pot + job_count (eligible) + callback_cost_total (and optionally list of job IDs). Technician dashboard computes these internally for one technician’s view only.
- **Per-tech breakdown (admin):** No endpoint that returns for a period: all technicians with contributed GP, share of pot, expected payout. Would require iterating techs and reusing existing calc (e.g. `compute_total_contributed_gp`, `build_canonical_ledger_rows` per tech) or a dedicated admin summary builder.
- **List job_performance by period (admin):** No dedicated endpoint. Technician path uses `_fetch_period_jobs_with_fallback` + `select_period_jobs` + `filter_eligible_period_jobs` internally; there is no admin GET that returns raw job_performance rows (with job_gp) for a period for assign/finalise UI.
- **List/read job_personnel by period or by job (admin):** Personnel is fetched only inside dashboard via `_fetch_job_personnel_rows_for_jobs(job_performance_ids)`. No GET that returns job_personnel for a period (all jobs) or GET job-performance/{id}/personnel for one job. Admin needs this to display and edit personnel (PATCH already exists per row).
- **PATCH job_performance (admin):** No write endpoint for job_performance. Admin UI needs to update: status (draft → verified → processed), bonus_period_id, is_callback, callback_reason, callback_cost, seller_fault_parts_runs, standard_parts_runs, missed_materials_cost (and optionally quote_id if ever needed). Sync and GET read these; only job_personnel is PATCHable today.

### 1.3 Dashboard payload shape (technician)

Returned by `_build_provisional_technician_dashboard_payload` (main.py ~447–549):

- `is_provisional`, `selection_reason`, `expected_payout_status`, `period`, `technician_context`
- `hero`: total_team_pot, my_total_gp_contributed, my_expected_payout, period_job_count, technician_job_count, callback_cost_total_raw, pending_reasons
- `ledger`: jobs (canonical ledger rows from build_canonical_ledger_rows), job_count, empty_state

**Not in payload today (per section-59 and plan doc):** `leaderboard[]` (59.16.3), `team_pot_delta` / `team_pot_delta_reason` / `as_of` (59.16.4), `streak` (59.16.5), `badge_events[]` (59.16.6), `snapshot_version` (59.16.7). Frontend already consumes `payload.leaderboard` and `payload?.streak` when present (app.js ~13274, effects summary).

### 1.4 Constraints

- One codebase; deploy via `./scripts/run-server.sh` / Railway; no new required env.
- Unless specified, changes are **mobile UI / accessibility**; desktop production UI must remain unaffected.
- 59.16.2 and 59.17 are **backend API and desktop-first Admin UI**; 59.24 is data cleanup only.

---

## 2. Task 59.16.2 — Finalise full bonus API for Admin UI (100% code-aligned plan)

**Scope:** Backend only. Deliver the API surface so Admin UI (59.17) can manage periods, finalise jobs, assign personnel, enter callbacks/parts-run/missed-materials, and view period pot and per-tech GP.

### 2.1 Period summary (admin)

- **Need:** Admin view needs for a given period: period metadata (id, period_name, start_date, end_date, status), total_team_pot (same formula as technician dashboard: 10% of eligible job GP − callback costs), eligible job count, total callback cost, and optionally list of job_performance ids (or minimal job list for linking to job list).
- **Implementation:** New endpoint, e.g. `GET /api/bonus/admin/periods/{period_id}/summary`, admin-only. Reuse existing helpers: `_resolve_bonus_dashboard_period` (allows closed when by id), `_fetch_period_jobs_with_fallback`, `select_period_jobs`, `filter_eligible_period_jobs`, `compute_period_pot`. Return: period, total_team_pot, eligible_job_count, callback_cost_total, and optionally job_ids or job_count. No new env; same Supabase and bonus_calc/bonus_dashboard imports.

### 2.2 Per-tech breakdown (admin)

- **Need:** For the same period, list every technician who has contributed GP (from job_personnel for eligible jobs) with: technician_id, display_name (from profiles or auth), gp_contributed, share_of_team_pot (or expected_payout). Used for payroll view and “view per-tech GP” in 59.17.
- **Implementation:** Either extend the summary endpoint with a `breakdown[]` array or add `GET /api/bonus/admin/periods/{period_id}/breakdown`. Build by: same eligible_jobs + personnel_by_job; collect unique technician_ids from personnel; for each tech run same pipeline (e.g. build_canonical_ledger_rows for that tech, compute_technician_contribution_total) and compute share from total_contributed_gp. Resolve display_name from profiles (or auth) by technician_id. Auth: admin only.

### 2.3 List job_performance by period (admin)

- **Need:** Admin needs to list all jobs in a period (for assign period, finalise, link jobs to period). Return list of job_performance rows with computed job_gp (and period_link_method if useful).
- **Implementation:** New endpoint, e.g. `GET /api/bonus/admin/periods/{period_id}/jobs`, admin-only. Use _resolve_bonus_dashboard_period(supabase, period_rows, period_id), _fetch_period_jobs_with_fallback, select_period_jobs. Return all period jobs (do not filter by eligible status so admin can see draft/unverified and assign/verify). For each row add job_gp via compute_job_gp(row). Order by created_at desc. Columns: same as BONUS_JOB_PERFORMANCE_COLUMNS plus job_gp.

### 2.4 List/read job_personnel by period or by job (admin)

- **Need:** Admin assigns/verifies personnel; needs to see personnel for a period (all jobs) or for a single job. PATCH job-personnel/{id} already exists; missing is list/read.
- **Implementation:**
  - **By job:** `GET /api/bonus/job-performance/{job_performance_id}/personnel` (admin). Fetch job_personnel where job_performance_id = id; return list (BONUS_JOB_PERSONNEL_COLUMNS). Optionally join display_name from profiles.
  - **By period:** Either include personnel in the period jobs response (each job with a `personnel[]` array) or add `GET /api/bonus/admin/periods/{period_id}/personnel` returning flat list of job_personnel for all jobs in period. Including in period jobs response is often enough so Admin UI can show job → personnel in one call.

### 2.5 Write endpoint: PATCH job_performance (admin)

- **Need:** Admin must update job_performance for: status (draft/verified/processed), bonus_period_id, is_callback, callback_reason, callback_cost, standard_parts_runs, seller_fault_parts_runs, missed_materials_cost. Optional: quote_id if ever needed.
- **Implementation:** `PATCH /api/bonus/job-performance/{job_performance_id}`, admin-only. Body: optional fields (status, bonus_period_id, is_callback, callback_reason, callback_cost, standard_parts_runs, seller_fault_parts_runs, missed_materials_cost). Validate status in ('draft','verified','processed'); validate bonus_period_id is valid UUID if provided. Update only provided fields; return updated row + job_gp. Use same BONUS_JOB_PERFORMANCE_COLUMNS for select after update; do not allow updating id, servicem8_job_id, servicem8_job_uuid, created_at, or sync-populated fields (invoiced_revenue_exc_gst, materials_cost, quoted_labor_minutes) unless product decision says otherwise (currently sync and quote flow set those).

### 2.6 Summary of 59.16.2 deliverables

| Item | Endpoint / change | Auth |
|------|-------------------|------|
| Period summary | GET /api/bonus/admin/periods/{period_id}/summary (period, total_team_pot, eligible_job_count, callback_cost_total) | admin |
| Per-tech breakdown | GET /api/bonus/admin/periods/{period_id}/breakdown (or part of summary) | admin |
| List jobs for period | GET /api/bonus/admin/periods/{period_id}/jobs (job_performance rows + job_gp) | admin |
| Read personnel by job | GET /api/bonus/job-performance/{id}/personnel (or embed in period jobs) | admin |
| Read personnel by period | Embed in period jobs response or GET .../periods/{id}/personnel | admin |
| Update job_performance | PATCH /api/bonus/job-performance/{job_performance_id} (status, bonus_period_id, callbacks, parts runs, missed_materials_cost) | admin |

No new env; no desktop/mobile UI change (API only). Consumer is Admin UI (59.17), desktop-first.

---

## 3. Task 59.17 — Admin UI (depends on 59.16.2)

- **Scope:** Desktop-first UI: manage periods, finalise jobs, assign personnel, enter callback/parts-run/missed-materials, view period pot and per-tech GP.
- **Dependency:** 59.16.2 (list/read job_personnel and period summary/per-tech breakdown and PATCH job_performance).
- **Desktop vs mobile:** Desktop-first; mobile later if needed. No change to existing mobile technician dashboard unless explicitly scoped.

---

## 4. Task 59.24 — Remove dummy bonus data

- **Scope:** Data cleanup in Supabase. Delete test rows added for 59.18.2 manual testing.
- **Order:** Delete **job_personnel** for dummy job_performance rows → **job_performance** (JOB-DUM-001–004) → **bonus_periods** (e.g. "Feb 2026 Fortnight 1 (dummy)", "Jan 2026 Fortnight 2 (dummy closed)").
- **When:** After manual checks are done; before production use of real bonus data.
- **Tool:** Supabase MCP or SQL; no app code change for the delete itself.

---

## 5. Order recommendation

- **59.16.2 first:** Unblocks 59.17 (Admin UI). No dependency on 59.24.
- **59.24:** Can be done in parallel or after 59.16.2; do when manual checks are done. Doing 59.24 first only removes dummy data; it does not unblock or block 59.16.2.

---

## 6. 59.16.3–59.16.7 (optional API extensions for technician dashboard)

These are not required for Admin UI but improve technician dashboard (mobile/desktop):

- **59.16.3** Leaderboard: dashboard response includes `leaderboard[]` (technician_id, display_name, avatar_url?, avatar_initials, gp_contributed, share_of_team_pot, rank, previous_rank?). Frontend already consumes when present.
- **59.16.4** Pot momentum: team_pot_delta, team_pot_delta_reason, as_of (reason enum).
- **59.16.5** Streak: hot_streak_count, hot_streak_active. Frontend uses payload?.streak.
- **59.16.6** Badge evidence: badge_events[] for tooltips.
- **59.16.7** Snapshot/version for deterministic frontend diff/animations.

Can be implemented with or after 59.16.2.

---

## 7. Assumptions and oversights avoided

- **Exact endpoints:** Derived from existing main.py routes and section-59.md 59.16.2 text; no guesswork on URLs or auth.
- **PATCH job_performance:** Confirmed missing in codebase (only GET exists); list of updatable fields matches BONUS_JOB_PERFORMANCE_COLUMNS and BACKEND_DATABASE.md (status, callback fields, parts runs, missed_materials_cost, bonus_period_id).
- **Personnel read:** Confirmed _fetch_job_personnel_rows_for_jobs is internal only; no standalone admin list/read by period/job until 59.16.2.
- **Period summary:** Technician dashboard builds team_pot and counts internally but never exposes an admin “summary” payload; 59.16.2 adds it.
- **Desktop/mobile:** 59.16.2 is API-only; 59.17 is desktop-first; 59.24 is data-only. No mobile UI change in this plan unless specified later.
- **Env/Railway:** No new required env; same run-server.sh and deploy path.

---

## 8. Task list update (applied below)

- **TASK_LIST.md:** Uncompleted row for Section 59 already lists remaining 59.16.2–59.16.7, 59.17, 59.24. Add explicit “Next recommended: 59.16.2” in the description so the index matches the recommended order.
- **docs/tasks/section-59.md:** No checkbox changes; 59.16.2–59.16.7, 59.17, 59.24 remain unchecked.
