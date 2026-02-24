# Plan: Section 59 — Next logical task (59.17 or 59.16.4)

**Date:** 2026-02-24  
**Branch:** feature/section-59-cron-sync  
**Single source of truth:** TASK_LIST.md (uncompleted table ~line 99), docs/tasks/section-59.md (59.17 ~line 132, 59.16.4 ~line 128)  
**Purpose:** 100% code-correct plan for the next logical task. No assumptions or oversights. Desktop vs mobile explicit; unless specified, changes are mobile UI/accessibility; 59.17 is desktop-first Admin UI.  
**Status:** 59.16.3 (leaderboard) done. Next: 59.17 (Admin UI) or 59.16.4 (pot momentum).

---

## 1. Verified current state (post 59.16.2)

### 1.1 Backend (verified at given line refs)

- **Admin bonus API (main.py):**
  - `GET /api/bonus/admin/periods/{period_id}/jobs` ~1136: period + jobs (job_gp, personnel per job); admin only.
  - `GET /api/bonus/admin/periods/{period_id}/summary` ~1175: period, total_team_pot, eligible_job_count, callback_cost_total; admin only.
  - `GET /api/bonus/admin/periods/{period_id}/breakdown` ~1216: period, total_team_pot, breakdown[] (technician_id, gp_contributed, share_of_team_pot, expected_payout, display_name: None); admin only.
  - `GET /api/bonus/job-performance/{id}/personnel` ~1277: job_performance_id, personnel[]; admin only. (Stays before GET job-performance/{id} ~1302.)
  - `GET /api/bonus/job-performance/{id}` ~1302: single row + job_gp; admin only.
  - `PATCH /api/bonus/job-performance/{id}` ~1334: UpdateJobPerformanceRequest (status, bonus_period_id, is_callback, callback_reason, callback_cost, standard_parts_runs, seller_fault_parts_runs, missed_materials_cost); admin only.
- **Shared helpers:** `_resolve_bonus_dashboard_period` ~356, `_fetch_period_jobs_with_fallback` ~386, `_fetch_job_personnel_rows_for_jobs` ~430, `BONUS_JOB_PERFORMANCE_COLUMNS` ~297. `select_period_jobs`, `filter_eligible_period_jobs`, `group_personnel_by_job` from bonus_dashboard.
- **bonus_dashboard.py:** `build_canonical_ledger_rows` ~376, `compute_total_contributed_gp` ~539, `compute_technician_contribution_total` ~565; `filter_eligible_period_jobs` ~147.
- **bonus_calc.py:** `compute_period_pot` ~33, `compute_job_gp` used from main.
- **Technician dashboard payload:** `_build_provisional_technician_dashboard_payload` (main.py ~509–655) returns: is_provisional, selection_reason, expected_payout_status, period, technician_context, hero, ledger, **leaderboard[]** (59.16.3 done). It does **not** return streak, team_pot_delta / team_pot_delta_reason / as_of (59.16.4), badge_events (59.16.6), or snapshot_version (59.16.7).

### 1.2 Frontend (verified)

- **app.js ~13273:** `buildBonusLeaderboardRows(payload)` — if `Array.isArray(payload?.leaderboard) && payload.leaderboard.length > 0`, maps rows to technician_id, display_name, avatar_initials, gp_contributed, share_of_team_pot, rank; else returns placeholder (self + two "Challenger Slot" rows).
- **app.js ~13375:** `renderBonusRaceLeaderboard(payload)` calls `buildBonusLeaderboardRows(payload)` and renders list; uses `technicianBonusState.lastRanks` for overtake styling (client-side previous rank).
- **app.js ~13549:** `renderTechnicianBonusDashboard(payload)` uses payload.period, hero, ledger; mobile branch uses `layoutState.viewportMode === 'mobile'`.
- **Contract expected by frontend for leaderboard:** technician_id, display_name, avatar_initials, gp_contributed, share_of_team_pot, rank. Frontend does not currently read avatar_url or previous_rank from the row (optional in task).

### 1.3 Data / schema

- **profiles:** `user_id`, `role` only (BACKEND_DATABASE.md, docs). No display_name or avatar column today. Breakdown returns display_name: None; QA audit (2026-02-24) notes Admin UI can resolve from `/api/admin/user-permissions` or future profile endpoint.
- **Auth:** `_list_auth_users_via_admin_api(supabase)` (main.py ~177) lists auth users (paginated); `_serialize_auth_user_for_permissions` includes email; service role required. Used only for admin user-permissions list today.

### 1.4 Constraints

- One codebase; deploy via `./scripts/run-server.sh` / Railway; no new required env.
- Unless specified: changes are **mobile UI / accessibility**; desktop production UI must remain unaffected.
- **59.17** is explicitly **desktop-first** Admin UI; mobile later if needed.
- **59.16.3** is API + optional frontend polish; leaderboard is shown on **mobile** (GP Race / The Race card); desktop bonus view does not show the race board (hidden by CSS).

---

## 2. Option A — Task 59.16.4 (Pot momentum)

**Scope:** Backend: add to technician dashboard payload `{ total_team_pot, team_pot_delta, team_pot_delta_reason, as_of }` with reason enum `job_finalized | callback_deduction | admin_adjustment`. Frontend (mobile) may use these for label/tooltip on pot motion; currently uses client-side `previousPayload?.hero?.total_team_pot` for gain/leak (app.js ~13570–13572).

### 2.1 Contract (section-59.md 59.16.4)

- `total_team_pot` — already in `hero` (main.py ~637).
- `team_pot_delta` (number): change in pot since the “previous” reference (see 2.2).
- `team_pot_delta_reason` (string | null): one of `job_finalized` | `callback_deduction` | `admin_adjustment`, or null if delta is zero or unknown.
- `as_of` (ISO 8601 string): timestamp for which total_team_pot/delta are valid.

### 2.2 Source of delta (no current backend storage)

- **Current state:** No table or column stores “previous pot” or “last delta reason”. `compute_period_pot(eligible_jobs)` returns current pot only. Frontend keeps `technicianBonusState.previousPayload` for client-side diff.
- **Options for 59.16.4:** (1) **MVP:** Return `team_pot_delta: 0`, `team_pot_delta_reason: null`, `as_of: now()` so contract is fulfilled; frontend continues using client-side previousPayload for visual momentum. (2) **Stored snapshot:** Add period-level or app-level snapshot (e.g. `last_reported_pot`, `as_of`, optional `last_delta_reason`) updated when job is verified or callback/admin change; delta = current_pot − last_reported_pot. (3) **Period-open baseline:** Store “pot at period open” (or at first verified job) and compute delta vs that; reason would need to be derived from what changed (e.g. new verified job → job_finalized). Product decision required before implementation to avoid rework.

### 2.3 Backend implementation (when source is decided)

- **Where:** Extend `hero` in `_build_provisional_technician_dashboard_payload` (main.py ~636–644). Add keys: `team_pot_delta`, `team_pot_delta_reason`, `as_of`. If MVP (option 1): set delta=0, reason=null, as_of=datetime.utcnow().isoformat() + "Z".
- **Eligibility:** Only when period is not None and eligible_jobs exist; otherwise omit or set delta=0, reason=null.

### 2.4 Frontend

- Optional: if backend sends non-zero delta and reason, show tooltip/label on Team Pot card (e.g. “+$X from job finalized”). Existing pot motion (gain/leak) uses previousPayload; can remain as-is or be augmented by server delta for copy.

### 2.5 Desktop vs mobile

- **Mobile:** Pot hero card and motion already mobile-focused; any new label/tooltip is mobile UI.
- **Desktop:** Bonus view unchanged unless we surface the same hero; no regression.

### 2.6 Dependencies / env

- No new env. If stored snapshot (option 2) is chosen, may require migration for snapshot table or columns.

---

## 3. Option B — Task 59.17 (Admin UI)

**Scope:** Desktop-first UI to manage periods, finalise jobs, assign personnel, enter callback/parts-run/missed-materials, view period pot and per-tech GP.

### 3.1 Dependency

- **59.16.2 is done.** All required endpoints exist: period list/create/update, period summary, breakdown, period jobs (with personnel), job-performance get/personnel get, PATCH job-performance, PATCH job-personnel.

### 3.2 High-level implementation (no code yet; brainstorming rule applies before implementation)

- **Backend endpoints (all exist):** `GET /api/bonus/periods` (list, main.py ~1134); `POST /api/bonus/periods` (~1148); `PATCH /api/bonus/periods/{period_id}` (update); `GET /api/bonus/admin/periods/{period_id}/jobs` (~1239); `GET /api/bonus/admin/periods/{period_id}/summary` (~1280); `GET /api/bonus/admin/periods/{period_id}/breakdown` (~1321); `GET /api/bonus/job-performance/{id}` (single row + job_gp); `GET /api/bonus/job-performance/{id}/personnel` (personnel list); `PATCH /api/bonus/job-performance/{id}` (UpdateJobPerformanceRequest: status, bonus_period_id, is_callback, callback_reason, callback_cost, standard_parts_runs, seller_fault_parts_runs, missed_materials_cost); `PATCH /api/bonus/job-personnel/{personnel_id}` (UpdateJobPersonnelRequest: onsite_minutes, travel_shopping_minutes, is_seller, is_executor). Auth: admin only for all of the above.
- **HTML (index.html):** New admin-only section or view (e.g. bonus admin container), visible only to admin and only on desktop (or desktop-first: show on desktop, hide or simplify on mobile). Elements: period selector, period summary (pot, eligible count, callback total), per-tech breakdown table/list, “Jobs for period” list with job rows (status, job_gp, link to personnel), per-job personnel editor (onsite/travel, seller/executor), job_performance editor (status, callback, parts runs, missed materials). No removal of existing technician-facing bonus DOM.
- **CSS (styles.css):** Scope admin bonus UI so it does not affect mobile technician dashboard. Use `body[data-viewport-mode="desktop"]` (or a dedicated class) for admin bonus layout. Touch targets and layout suitable for desktop (no 44px requirement for desktop-first).
- **JS (app.js):** Admin-only entry (e.g. show bonus admin when role === 'admin' and viewport is desktop, or via nav). Fetch GET /api/bonus/periods (list), GET admin/periods/{id}/summary, GET admin/periods/{id}/breakdown, GET admin/periods/{id}/jobs; render period selector, summary, breakdown, job list. For each job use embedded personnel from period jobs response; for edits call GET job-performance/{id}/personnel if needed, PATCH job-personnel/{personnel_id} per row, PATCH job-performance/{id} for job fields. Wire create/update period to POST/PATCH periods. No change to renderTechnicianBonusDashboard or mobile bonus flow.
- **Desktop vs mobile:** 59.17 is desktop-first; mobile can show nothing or a “Use desktop to manage bonus” message. Existing mobile technician dashboard unchanged.

### 3.3 Before writing code

- Per project rules, use the **brainstorming rule** before any new UI/feature: produce Goal Assessment, Desktop vs Mobile Impact, Implementation Plan (HTML/CSS/JS), Edge Cases & Accessibility, and Task List Update draft. Get explicit approval before implementation.

### 3.4 Assumptions avoided

- Admin UI consumes only existing 59.16.2 endpoints; no new backend contract.
- No new env or Railway change.
- Period “finalise” may mean: set job status to verified/processed and/or period status to processing/closed via existing PATCH endpoints.

---

## 4. Recommendation and task list

- **Order:** Either 59.17 or 59.16.4 is valid next. 59.16.4 is smaller (backend hero extension; product decision needed on delta source). 59.17 unblocks full admin workflow and is desktop-only UI; use brainstorming rule before implementation.
- **TASK_LIST.md:** Uncompleted table (Section 59 row ~line 99) updated: 59.16.3 done; remaining 59.16.4–59.16.7, 59.17, 59.24; next recommended 59.17 or 59.16.4.
- **docs/tasks/section-59.md:** 59.16.3 already marked [x]. 59.16.4 and 59.17 remain unchecked until implementation.

---

## 5. Summary

| Task    | Scope | Desktop impact | Mobile impact | Notes |
|---------|--------|----------------|---------------|--------|
| **59.16.4** | Backend: hero + team_pot_delta, team_pot_delta_reason, as_of | None | Optional label/tooltip on pot card | Delta source not stored; product decision (MVP 0/null/now vs snapshot vs period-open) before impl |
| **59.17**   | Desktop-first Admin UI | New admin views (periods, jobs, personnel, PATCH) | None or “use desktop” | All endpoints exist (GET periods, admin/periods/{id}/jobs|summary|breakdown, job-performance get/personnel, PATCH both). Use brainstorming rule before implementation |

No assumptions or oversights: line refs and behaviour verified against backend/main.py (dashboard ~509–655, hero ~636–644, admin ~1134–1458, job-personnel PATCH ~1206), backend/app/bonus_dashboard.py, backend/app/bonus_calc.py, frontend/app.js (~13569–13638), docs/BACKEND_DATABASE.md, and section-59.md.
