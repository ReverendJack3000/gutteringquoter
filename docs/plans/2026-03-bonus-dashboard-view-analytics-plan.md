# Plan: Bonus dashboard view analytics (track views + duration; super-admin-only report)

**Date:** 2026-03-03  
**Scope:** Backend + frontend. No assumptions; based on current codebase.  
**Constraint:** Must deploy successfully to Railway (no new build steps or env vars required beyond optional doc).

---

## 1. Goal

Track **how many times** and **how long** each person spends looking at the bonus dashboard(s). Only **super admin** can view this analytics report.

**Clarification:** The app has two bonus-related views:

- **Bonus Admin** (`view-bonus-admin`) — desktop-only, admin-only; period/job/personnel management. Entry: profile menu “Bonus Admin”; guarded by `canAccessDesktopAdminUi()`.
- **Technician bonus / My Bonus** (`view-technician-bonus`) — technician-facing dashboard (race board, pot, ledger). Entry: profile “My Bonus” or mobile bonus button; guarded by `canAccessTechnicianBonusView()`.

**Plan covers both.** Store a `dashboard_type` so the report can show per-dashboard and per-user (view count + total duration). If product later wants only one dashboard tracked, the schema and API already support filtering by type.

---

## 2. Backend

### 2.1 Auth: super-admin-only dependency

- **Current state:** `require_role(["admin"])` allows any admin. There is no route that restricts to **only** the user whose email matches `SUPER_ADMIN_EMAIL`.
- **Add:** In `backend/app/auth.py`, add a dependency `require_super_admin` that:
  - Depends on `get_validated_payload`.
  - If `is_super_admin_from_payload(payload)` is false → raise `HTTPException(403, "Super admin only.")`.
  - Return the current user_id (from payload `sub`) so route handlers can use it if needed.
- **Usage:** Use `require_super_admin` on the **GET analytics summary** route only. The **POST view** route stays “any authenticated user” (they are recording their own view).

### 2.2 Database

- **New table:** `public.bonus_dashboard_view_events` (or `bonus_dashboard_views`).
  - `id` — uuid PK, default `gen_random_uuid()`.
  - `user_id` — uuid NOT NULL, references `auth.users.id` (who viewed).
  - `dashboard_type` — text NOT NULL, check `dashboard_type IN ('bonus-admin', 'technician-bonus')`.
  - `started_at` — timestamptz NOT NULL (when the view started; client-sent or server now() at insert).
  - `duration_seconds` — numeric NOT NULL (e.g. integer or numeric(10,2)); 0 if they left immediately.
  - `created_at` — timestamptz default `now()` (optional; for ordering/audit).
- **RLS:** Off (backend uses service role for insert/select). No RLS policies required.
- **Migration:** Apply via Supabase MCP (`mcp_supabase_apply_migration`) with project_id `rlptjmkejfykisaefkeh`. Name e.g. `add_bonus_dashboard_view_events`.
- **Document:** Add a short subsection in `docs/BACKEND_DATABASE.md` under the bonus section describing this table and its purpose.

### 2.3 API

- **POST** record a view (when user leaves the dashboard):
  - Path: e.g. `POST /api/bonus/analytics/view` (or `/api/analytics/bonus-dashboard/view`).
  - Body: `{ "dashboard_type": "bonus-admin" | "technician-bonus", "started_at": "<ISO8601>", "duration_seconds": <number> }`.
  - Auth: any authenticated user (Bearer). Backend sets `user_id` from JWT `sub`; ignore any user_id in body.
  - Validation: `dashboard_type` must be one of the two; `started_at` parseable; `duration_seconds` >= 0 (cap at e.g. 86400 if desired to avoid abuse).
  - Action: insert one row into `bonus_dashboard_view_events`. Return 204 or `{ "ok": true }`.
  - **Railway:** No new env vars.

- **GET** analytics summary (super-admin only):
  - Path: e.g. `GET /api/bonus/analytics/summary` (or `/api/analytics/bonus-dashboard/summary`).
  - Query params (optional): `dashboard_type` to filter by one type; optional `from_date` / `to_date` (ISO date) to limit range.
  - Auth: `Depends(require_super_admin)`.
  - Action: query `bonus_dashboard_view_events` (join `auth.users` or `public.profiles` if we need email/display name), aggregate per user (and per dashboard_type if not filtered): **view_count**, **total_duration_seconds**. Return JSON e.g. `{ "rows": [ { "user_id", "email" (if available), "dashboard_type", "view_count", "total_duration_seconds" }, ... ] }`. Order by total_duration_seconds desc or view_count desc.
  - **Railway:** No new env vars.

---

## 3. Frontend

### 3.1 Recording a view (both dashboards)

- **State:** When entering `view-bonus-admin` or `view-technician-bonus`, store in memory the **view start time** (e.g. `Date.now()` or `new Date().toISOString()`) keyed by view id. Use a single object, e.g. `bonusDashboardViewStart = { 'view-bonus-admin': null, 'view-technician-bonus': null }`, set on enter and read on leave.
- **Where to hook “enter”:** Already in place — `switchView` calls `initBonusAdminView()` / `initTechnicianBonusView()` when switching to those views. Set the start time **there** (in `app.js` in the `switchView` branch for each view, or inside `initBonusAdminView` / `initTechnicianBonusView` in `admin-products-bonus.js`). Prefer setting in the same place that inits the view so it’s consistent.
- **Where to hook “leave”:**
  - **Navigate away:** In `switchView`, when `fromViewId` is `view-bonus-admin` or `view-technician-bonus` and we’re switching to another view, before clearing the view: compute duration (now - start), POST to `POST /api/bonus/analytics/view` with `dashboard_type: 'bonus-admin'` or `'technician-bonus'`, then clear the stored start time. This requires access to the shared state (e.g. a function in app.js that both switchView and the bonus module can use, or the state lives in app.js and we call a “reportBonusDashboardViewEnd(viewId, startedAt)” from switchView).
  - **Tab close / tab hidden:** Use `visibilitychange` and `pagehide`. When document becomes hidden or page is unloading, if the current view is one of the two bonus views, send the same POST with duration (time since start). For `pagehide`, use `navigator.sendBeacon` so the request is not cancelled on unload. Optional: also send on `visibilitychange` when state becomes `hidden` (with duration so far) so we don’t rely only on page unload.
- **Idempotency:** One view session = one POST. If we send on both visibilitychange (hidden) and later pagehide, we might double-send; to avoid that, after sending once for a given view session, clear the start time so we don’t send again. So: send at most one event per “view session” (enter → leave or enter → visibility hidden/pagehide).
- **Failure handling:** Best-effort. If POST fails (network, 401), log to console; do not block the user. No retry required for MVP.

### 3.2 Super-admin-only analytics UI

- **Visibility:** Only show the analytics report to users for whom `authState.isSuperAdmin === true`. The backend already returns `is_super_admin` from `GET /api/me` and the frontend sets `authState.isSuperAdmin` in `setAuthFromSession`/after me.
- **Placement:** Either:
  - **Option A:** New menu item in the profile dropdown (e.g. “Bonus dashboard analytics”) that only appears when `authState.isSuperAdmin`, and opens a new view (e.g. `view-bonus-analytics`) that shows the table.
  - **Option B:** A subsection or tab inside Bonus Admin view: when the user is super admin, show an “Analytics” section or link that fetches and displays the summary.
- **Recommendation:** Option A keeps “Bonus Admin” for period/job management and gives a dedicated place for the report; super admin already has Bonus Admin access, so one more menu item is acceptable. If the product prefers Option B, it’s a small change.
- **Content:** Table (or list) with columns: User (email or user_id), Dashboard type, View count, Total duration (formatted e.g. “12m 30s” or “1h 5m”). Optional: date range filter (from_date, to_date) and dashboard_type filter, matching the GET API query params.
- **API:** Call `GET /api/bonus/analytics/summary` with optional query params when the view is opened; no polling. Show loading and error state.

### 3.3 Files to touch

- **app.js:**  
  - Add state for bonus dashboard view start (keyed by view id).  
  - In `switchView`: when entering `view-bonus-admin` or `view-technician-bonus`, set start time; when leaving either view, compute duration, call a small helper that POSTs to the backend (and clears start).  
  - Add `pagehide` and optionally `visibilitychange` listener: if current view is one of the two and we have a start time, send event (and clear start). Use `sendBeacon` for pagehide.  
  - If Option A: add profile menu item “Bonus dashboard analytics” (visible only when `authState.isSuperAdmin`), and a new view `view-bonus-analytics` that fetches and renders the summary table.
- **index.html:** If Option A: add `#view-bonus-analytics` container (region, title, back button, table wrapper). Keep under desktop-only if desired (analytics is admin/super-admin only).
- **styles.css:** Scoped styles for the analytics view (table, optional filters).
- **admin-products-bonus.js:** Only if we put “set start time” inside initBonusAdminView/initTechnicianBonusView; then we need a way to “report view end” that app.js can call or that the module exposes. Cleaner: keep all timing and POST logic in app.js so switchView has a single place to hook leave; init in bonus module can stay as-is.

---

## 4. Edge cases and mitigations

| Edge case | Mitigation |
|-----------|------------|
| Multiple tabs | Each tab records its own view; two tabs = two entries. Acceptable. |
| Tab close without navigating away | `pagehide` + `sendBeacon` to POST the view with duration so far. |
| Clock skew | Use client `started_at` for display; server stores as given. Optional: server could overwrite with `now()` at insert; plan uses client time for simplicity. |
| Very short views (< 1s) | Allow; optionally cap or ignore duration_seconds > 24h to avoid abuse. |
| Super admin not set | If `SUPER_ADMIN_EMAIL` is unset, no one is super admin; GET summary returns 403 for everyone. Menu item hidden. |
| 401 on POST (e.g. token expired) | Best-effort; log and clear start. No retry. |

---

## 5. Railway and deployment

- No new environment variables (other than existing `SUPER_ADMIN_EMAIL` for who can see the report).
- No change to Procfile, nixpacks.toml, or run-server.sh.
- New Supabase migration must be applied to the project DB (via MCP or dashboard) before or after deploy; backend will create rows only when the new table exists.
- README: add one line under API section for `POST /api/bonus/analytics/view` and `GET /api/bonus/analytics/summary` (super-admin only).

---

## 6. Task list update (draft)

- **Section file:** `docs/tasks/section-59.md` — add new task **59.30** (and sub-tasks if needed) with checkboxes.
- **TASK_LIST.md:** Add a row to the uncompleted table for Section 59, task 59.30 (and 59.30.x if broken out).

Example task text:

- **59.30** Bonus dashboard view analytics: track how many times and how long each person spends on the bonus dashboard(s); only super admin can view the report.
  - 59.30.1 Backend: add `require_super_admin` in auth.py; new table `bonus_dashboard_view_events` (user_id, dashboard_type, started_at, duration_seconds); migration + BACKEND_DATABASE.md.
  - 59.30.2 Backend: POST /api/bonus/analytics/view (authenticated), GET /api/bonus/analytics/summary (super-admin only); implement and document in README.
  - 59.30.3 Frontend: record view start on enter to view-bonus-admin / view-technician-bonus; on leave (switchView + visibilitychange/pagehide) POST one event per session; use sendBeacon on pagehide.
  - 59.30.4 Frontend: super-admin-only “Bonus dashboard analytics” entry and view; fetch summary and display table (user, dashboard type, view count, total duration); hide when not isSuperAdmin.

---

## 7. Summary

- **Backend:** New table, migration, `require_super_admin`, POST (any auth) + GET (super-admin only). No new env; Railway-safe.
- **Frontend:** Start time on enter; POST on leave (switchView + pagehide/visibilitychange); sendBeacon for unload; new super-admin-only analytics view and menu item.
- **No assumptions:** Uses existing `view-bonus-admin`, `view-technician-bonus`, `switchView`, `authState.isSuperAdmin`, and `SUPER_ADMIN_EMAIL` behaviour.
