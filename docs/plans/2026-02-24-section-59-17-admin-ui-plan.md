# Plan: Section 59.17 — Bonus Admin UI (desktop-first)

**Date:** 2026-02-24  
**Branch:** feature/section-59-cron-sync  
**Single source of truth:** TASK_LIST.md (uncompleted table), docs/tasks/section-59.md (59.17 and 59.17.1–59.17.7)  
**Purpose:** Break 59.17 into manageable subtasks; no backend changes; desktop-only entry and layout; mobile unchanged.

---

## 1. Goal

Deliver a **desktop-first Admin Bonus UI** so admins can:

- Manage bonus periods (list, create, update, set status).
- View period summary (pot, eligible job count, callback total) and per-tech breakdown.
- List jobs for a period with job GP and personnel.
- Edit job_performance (status, callback, parts runs, missed materials) and job_personnel (onsite/travel minutes, seller/executor).

All data from existing 59.16.2 APIs. No new env or Railway build changes.

---

## 2. Constraints

- **Desktop-only entry:** New view and nav item visible only when `role === 'admin'` and (optionally) desktop viewport; guard in `switchView` so non-admin or mobile cannot open the view.
- **No impact on mobile or technician bonus:** Existing `#view-technician-bonus` and mobile GP Race flow unchanged. All new DOM and CSS scoped under `#view-bonus-admin` (or equivalent).
- **Deploy:** Same stack; `./scripts/run-server.sh` / Railway.

---

## 3. Backend reference (no changes)

| Action | Endpoint | Notes |
|--------|----------|--------|
| List periods | `GET /api/bonus/periods` | Admin only |
| Create period | `POST /api/bonus/periods` | body: period_name, start_date, end_date, status |
| Update period | `PATCH /api/bonus/periods/{period_id}` | body: period_name, start_date, end_date, status |
| Period summary | `GET /api/bonus/admin/periods/{period_id}/summary` | total_team_pot, eligible_job_count, callback_cost_total |
| Period breakdown | `GET /api/bonus/admin/periods/{period_id}/breakdown` | breakdown[]: technician_id, gp_contributed, share_of_team_pot, expected_payout, display_name |
| Period jobs | `GET /api/bonus/admin/periods/{period_id}/jobs` | jobs[] with job_gp, personnel[] per job |
| Get job | `GET /api/bonus/job-performance/{id}` | row + job_gp |
| List personnel | `GET /api/bonus/job-performance/{id}/personnel` | personnel[] |
| Update job | `PATCH /api/bonus/job-performance/{id}` | status, bonus_period_id, is_callback, callback_reason, callback_cost, standard_parts_runs, seller_fault_parts_runs, missed_materials_cost |
| Update personnel row | `PATCH /api/bonus/job-personnel/{personnel_id}` | onsite_minutes, travel_shopping_minutes, is_seller, is_executor |

---

## 4. Subtasks (implementation order)

| ID | Subtask | Scope |
|----|--------|--------|
| **59.17.1** | View shell and entry: add `#view-bonus-admin` app view (header with Back to Canvas, title “Bonus Admin”), add profile menu item “Bonus Admin” (admin-only, desktop), wire `switchView('view-bonus-admin')` and guard so only admin can open; redirect non-admin/mobile. | HTML, JS (no CSS beyond existing .app-view .hidden) |
| **59.17.2** | Period list and selector: on show view, fetch `GET /api/bonus/periods`, populate a period dropdown; on change, store selected period id; empty state “No periods” when list empty. | JS, optional minimal HTML for dropdown |
| **59.17.3** | Period summary and breakdown: for selected period, fetch summary and breakdown; render summary (total team pot, eligible job count, callback total) and per-tech breakdown table (technician, gp_contributed, share_of_team_pot, expected_payout); scope styles under `#view-bonus-admin`. | HTML, CSS, JS |
| **59.17.4** | Jobs list for period: fetch `GET .../jobs` for selected period; render list of jobs (identifier, status, job_gp, personnel count or names); link/button “Edit job” per row (no modal yet). | HTML, CSS, JS |
| **59.17.5** | Edit job (job_performance): “Edit job” opens form/modal with status, is_callback, callback_reason, callback_cost, standard_parts_runs, seller_fault_parts_runs, missed_materials_cost; save via `PATCH /api/bonus/job-performance/{id}`; refresh jobs/summary/breakdown on success. | HTML, CSS, JS |
| **59.17.6** | Edit personnel (job_personnel): per job, “Edit personnel” or per-row edit with onsite_minutes, travel_shopping_minutes, is_seller, is_executor; save via `PATCH /api/bonus/job-personnel/{personnel_id}`; refresh jobs/breakdown on success. | HTML, CSS, JS |
| **59.17.7** | Create/update period: “Create period” (and optionally “Edit period”) with period_name, start_date, end_date, status; POST periods or PATCH period; refresh period list and selection. | HTML, CSS, JS |

---

## 5. File touch map

| File | 59.17.1 | 59.17.2 | 59.17.3 | 59.17.4 | 59.17.5 | 59.17.6 | 59.17.7 |
|------|---------|---------|---------|---------|---------|---------|---------|
| index.html | view + menu item | (optional selector) | summary/breakdown DOM | jobs list DOM | edit-job form/modal | personnel edit UI | create/edit period form |
| styles.css | — | — | #view-bonus-admin scoped | same | same | same | same |
| app.js | switchView, guard, menu | fetch periods, selector | fetch summary/breakdown, render | fetch jobs, render | PATCH job, form | PATCH personnel | POST/PATCH period |

---

## 6. Edge cases and accessibility (from brainstorming)

- **Non-admin or mobile opens Bonus Admin:** Guard in `switchView`; redirect to canvas and optionally show message “Bonus Admin is available on desktop for admins.”
- **Empty period list / 404:** Show “No periods. Create one.”; do not overwrite previous content on fetch error; keep period selector and Back usable.
- **Accessibility:** Back to Canvas focusable; move focus into view on open; aria-label on region and period selector; breakdown table with proper th scope; “Edit job” / “Edit personnel” with clear labels; modals/forms with focus trap and Cancel/Save.

---

## 7. Task list update after completion

- In **docs/tasks/section-59.md:** Mark 59.17.1–59.17.7 and then 59.17 as [x].
- In **TASK_LIST.md:** Update Section 59 row to state 59.17 done; remaining 59.24 (and 59.21–59.23 as applicable).
