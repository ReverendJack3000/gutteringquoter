# Plan: Section 59 — Next tasks (report only, no code changes)

**Date:** 2026-02-24  
**Branch:** feature/section-59-cron-sync  
**Single source of truth:** TASK_LIST.md, docs/tasks/section-59.md  
**Purpose:** Accurate plan for next logical tasks (59.18.2.1, 59.16.2, 59.17, 59.24) based on verified codebase state. Desktop vs mobile explicitly considered; changes are mobile UI/accessibility unless specified.

---

## 1. Verified codebase state (as of this plan)

### 1.1 Backend

- **main.py**
  - Dashboard payload (lines ~456–560): uses `filter_eligible_period_jobs(period_jobs)` → `eligible_jobs`; `compute_period_pot(eligible_jobs)`; `build_canonical_ledger_rows(eligible_jobs, personnel_by_job, technician_id)`; `compute_total_contributed_gp(eligible_jobs, personnel_by_job)`; `my_expected_payout = team_pot * (technician_gp / total_contributed_gp)` when total_contributed_gp > 0.
  - Closed period: `_resolve_bonus_dashboard_period` allows status in `("open", "processing", "closed")` when period is requested by id (~378–382). Current-period list remains open/processing only.
  - `BONUS_JOB_PERFORMANCE_COLUMNS` and `BONUS_JOB_PERSONNEL_COLUMNS` (~297–306) define selected fields for jobs and personnel.
  - Dashboard does **not** return: `leaderboard[]` (59.16.3), `team_pot_delta` / `team_pot_delta_reason` (59.16.4), `streak` (59.16.5), `badge_events[]` (59.16.6), or `snapshot_version` (59.16.7).

- **bonus_dashboard.py**
  - `filter_eligible_period_jobs`: status in `ELIGIBLE_JOB_STATUSES` ('verified', 'processed') (~137–148).
  - `build_canonical_ledger_rows` (~376–538): pipeline base_splits → callback_voids → estimation_accuracy → seller_penalties; row shape includes `job_gp`, `my_job_gp_contribution`, `is_provisional: False`, role_badges, estimation, penalty_tags, pending_reasons, explanations.
  - `compute_total_contributed_gp` (~539–567): sums contributed GP across all techs for eligible jobs using same pipeline.
  - `build_provisional_ledger_rows` still present but unused in dashboard path.

- **bonus_calc.py**
  - `compute_period_pot(eligible_jobs)`: Sum(Job GP × 0.10) − sum(callback_cost).
  - Pipeline order: compute_job_base_splits → apply_callback_voids → apply_estimation_accuracy → apply_seller_penalties.

### 1.2 Frontend

- **Viewport handling**
  - `layoutState.viewportMode` and `body[data-viewport-mode]` / `document.documentElement[data-viewport-mode]` drive desktop vs mobile. Bonus dashboard uses `layoutState.viewportMode === 'mobile'` for mobile-only behaviour (e.g. `isMobileBonusView` at ~13565, role/penalty chip styling in ledger at ~13641–13667).

- **Bonus dashboard structure (index.html)**
  - `#bonusRaceBoardMobile` (GP Race scoreboard): contains Team Pot card (gauge, value, delta, Tally), The Race card (leaderboard list), Status Effects card (My GP value, effect chips, Tally). **Shown only on mobile:** CSS `.bonus-race-board-mobile { display: none }` and `body[data-viewport-mode="mobile"] .bonus-race-board-mobile { display: grid }` (styles.css ~4187, 4422).
  - On mobile, `.bonus-hero-grid` is hidden (`body[data-viewport-mode="mobile"] .bonus-hero-grid { display: none }` ~4432).
  - On desktop, hero grid is shown (Team Pot, Expected Payout, My GP); race board is hidden.

- **Race / leaderboard / effects (app.js)**
  - `renderBonusRaceBoard(payload)`: uses `hero.total_team_pot`, `hero.my_total_gp_contributed`; client-side delta from `technicianBonusState.lastTeamPot`; updates gauge, delta text, last updated, Team Pot value, My GP value; announces gain/leak to `#bonusRaceAnnouncer`.
  - `renderBonusRaceLeaderboard(payload)`: uses `buildBonusLeaderboardRows(payload)`. If `payload.leaderboard` is non-empty, uses it; else returns **placeholder** rows (self at rank 1 + two "Challenger Slot" placeholders). Backend does not send `leaderboard[]` yet.
  - `renderBonusEffectsSummary(payload, jobs)`: derives Do It All, Sniper, Flat Tire, Red Flag counts from ledger `jobs`; Hot Streak from `payload?.streak` (not in API yet). Renders effect chips with tooltips.

- **Ledger job cards**
  - "Job GP" vs "Job GP (provisional)" from `job?.is_provisional === false` (~13692). Canonical path sets `is_provisional: False`, so label is "Job GP".

- **Static hero notes (index.html)**
  - First hero card: `<p class="bonus-hero-note">Provisional (10% of provisional team GP).</p>` — not updated by JS.
  - Third hero card: `<p class="bonus-hero-note">Provisional contribution for this period.</p>` — not updated by JS. So on **desktop**, after 59.18.2, those two notes still say "Provisional" although data is canonical. Optional follow-up: set text or visibility from `payload.is_provisional` (or remove static provisional wording).

### 1.3 Constraints

- One codebase; deploy via `./scripts/run-server.sh` / Railway; no new required env.
- Unless specified, changes are **mobile UI / accessibility**; desktop production UI must remain unaffected (e.g. scope with `body[data-viewport-mode="mobile"]` or `layoutState.viewportMode === 'mobile'`).

---

## 2. Next logical tasks — plan (100% code-aligned)

### 2.1 59.18.2.1 (optional) Mobile GP Race layout pass

- **Scope:** Mobile only; desktop unchanged.
- **Current behaviour:** On mobile, the GP Race block (`#bonusRaceBoardMobile`) shows: (1) **Tracker:** Team Pot card (gauge, value, delta, Tally), (2) **Podium:** The Race card with leaderboard list (currently self + placeholders unless backend sends `leaderboard[]`), (3) **Status effects:** Status Effects card (My GP, Do It All / Sniper / Hot Streak / Flat Tire / Red Flag chips, Tally).
- **Layout pass (59.18.2.1):** Improve layout and UX of tracker + podium + status effects on mobile only. No backend contract change required. May include:
  - Touch targets ≥44px (Apple HIG), safe-area insets, spacing, visual hierarchy.
  - Accessibility: ARIA, focus order, reduce-motion (`.bonus-racer`, `.bonus-racer-bar` already have `body.a11y-reduce-motion` rules in styles.css ~7202–7203).
  - Optional: reorder or group sections for better mobile flow.
- **Dependency:** None. Optional.
- **Desktop:** No changes; race board remains hidden on desktop.

---

### 2.2 59.16.2 Finalise full bonus API for Admin UI

- **Scope:** Backend API: period summary, per-tech breakdown, list/read job_personnel (by period or job), and any write endpoints beyond existing admin PATCH for job_personnel.
- **Current state:** 59.16.1 ships prototype read API (period-current, dashboard, jobs). Admin PATCH for job_personnel exists. No dedicated list/read job_personnel by period/job for Admin UI, nor period summary / per-tech breakdown endpoints for payroll flow.
- **Deliverables:** Endpoints and payload shape so Admin UI (59.17) can manage periods, finalise jobs, assign personnel, and view period pot and per-tech GP. Auth: admin for write; read as per existing role gates.
- **Desktop vs mobile:** API is viewport-agnostic. Consumer is Admin UI (desktop-first, 59.17).

---

### 2.3 59.16.3–59.16.7 (API extensions)

- **59.16.3** Leaderboard: dashboard response to include `leaderboard[]` with `{ technician_id, display_name, avatar_url?, avatar_initials, gp_contributed, share_of_team_pot, rank, previous_rank? }`. Frontend `buildBonusLeaderboardRows` already consumes this when present.
- **59.16.4** Pot momentum: `team_pot_delta`, `team_pot_delta_reason`, `as_of` (reason enum: job_finalized | callback_deduction | admin_adjustment). Frontend currently computes delta client-side from previous payload.
- **59.16.5** Streak: `hot_streak_count`, `hot_streak_active` (consecutive jobs with zero callbacks and zero parts runs). Frontend `renderBonusEffectsSummary` already uses `payload?.streak`.
- **59.16.6** Badge evidence: `badge_events[]` with `{ code, earned, evidence_text }` for tooltips.
- **59.16.7** Snapshot/version: `snapshot_version` or `updated_at` for deterministic frontend diff/animations.

These can be implemented with or after 59.16.2; 59.18.2.2–59.18.2.4 benefit from 59.16.3–59.16.7.

---

### 2.4 59.17 Admin UI

- **Scope:** Desktop-first UI to manage periods, finalise jobs, assign personnel, enter callback/parts-run/missed-materials, view period pot and per-tech GP.
- **Dependency:** 59.16.2 (list/read job_personnel and period summary/per-tech breakdown).
- **Desktop vs mobile:** Desktop-first; mobile later if needed. No change to existing mobile technician dashboard unless explicitly scoped.

---

### 2.5 59.24 Remove dummy bonus data

- **Scope:** Data cleanup in Supabase. Delete test rows added for 59.18.2 manual testing.
- **Order:** Delete **job_personnel** for dummy job_performance rows → **job_performance** (JOB-DUM-001–004) → **bonus_periods** (dummy periods, e.g. "Feb 2026 Fortnight 1 (dummy)", "Jan 2026 Fortnight 2 (dummy closed)").
- **When:** After manual checks are done; before production use of real bonus data.
- **Tool:** Supabase MCP or SQL; no app code change required for the delete itself.

---

## 3. Desktop vs mobile summary

| Task           | Desktop impact                    | Mobile impact                                      |
|----------------|-----------------------------------|----------------------------------------------------|
| 59.18.2.1      | None                              | Layout/UX pass for Race (tracker, podium, effects) |
| 59.16.2–59.16.7| N/A (API)                         | Technician dashboard can consume new fields        |
| 59.17          | Admin UI (desktop-first)          | Later if needed                                    |
| 59.24          | N/A (data only)                   | N/A                                                |

---

## 4. Assumptions and oversights avoided

- **Leaderboard:** Backend does not yet return `leaderboard[]`; 59.18.2.1 is a layout pass and can be done with placeholder leaderboard; real podium data requires 59.16.3.
- **Hero notes:** Desktop static HTML still says "Provisional (10%...)" and "Provisional contribution"; JS does not update those. Not part of 59.18.2 scope in this plan; can be a small follow-up.
- **Closed period:** Already viewable when requested by `period_id`; payload has `period.status` and frontend uses it for payout lock and `data-locked`.
- **Single codebase:** All bonus UI lives in the same index.html / app.js / styles.css; mobile-only behaviour is gated by `data-viewport-mode="mobile"` and `layoutState.viewportMode === 'mobile'`.

---

## 5. Task list update (recommended)

- **TASK_LIST.md** uncompleted row for section 59: already states "Next: 59.18.2.1 (optional) or 59.16.2 / 59.17; 59.24 remove dummy bonus data when done." Recommended: make the row explicitly list remaining 59.16 and 59.18 sub-tasks so the index matches docs/tasks/section-59.md (59.16.2–59.16.7, 59.18.2.1–59.18.2.5). See change in §6 below.
- **docs/tasks/section-59.md:** No change; checkboxes already match current state (59.18.2 done; 59.18.2.1–59.18.2.5, 59.16.2–59.16.7, 59.17, 59.24 unchecked).

---

## 6. TASK_LIST.md uncompleted row update (applied)

Update the Section 59 row in the uncompleted table to include all remaining section-59 tasks so the index is the single source of truth:

- **Before:** "59.9–59.24 | ... 59.18.2 done. **Next:** 59.18.2.1 (optional) or 59.16.2 / 59.17; 59.24 remove dummy bonus data when done."
- **After:** "59.9–59.24 | ... 59.18.2 done. **Remaining:** 59.18.2.1–59.18.2.5 (optional mobile), 59.16.2–59.16.7 (full API), 59.17 (Admin UI), 59.24 (remove dummy data). See section-59.md."

This keeps the table accurate without changing section file checkboxes.
