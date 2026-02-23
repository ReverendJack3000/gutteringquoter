# Plan: Add "technician" permission (role)

**Date:** 2026-02-23  
**Scope:** Backend, frontend, docs, Supabase (if constrained). No change to which endpoints require `admin`; technician is an assignable role with no new API gates unless added later.  
**Desktop vs mobile:** User Permissions UI is desktop-only; adding the role is data/API only—no mobile UI change. Railway deploy unchanged.

---

## 1. Goal

Add a new app role **`technician`** so it can be assigned in User Permissions (and invite flow) and stored in `public.profiles.role`. No new permission gates in this change: technician does not get admin-only APIs; behavior is equivalent to editor/viewer for existing endpoints unless we later add technician-specific checks.

---

## 2. Current state (verified in codebase)

- **Backend:** `backend/main.py` defines `ALLOWED_APP_ROLES = {"viewer", "editor", "admin"}`; `_normalize_app_role()` maps unknown roles to `"viewer"`; PATCH and invite validate role against this set; error message says "Allowed roles: viewer, editor, admin".
- **Frontend:** `frontend/app.js` has `APP_ALLOWED_ROLES = new Set(['viewer', 'editor', 'admin'])`; `normalizeAppRole()` returns `'viewer'` if not in set; User Permissions table builds role `<select>` from `['viewer', 'editor', 'admin']`; invite uses `inviteUserRole` value (default `'viewer'`). `canAccessDesktopAdminUi()` remains `role === 'admin'` only.
- **HTML:** `frontend/index.html` invite modal has `<select id="inviteUserRole">` with options viewer, editor, admin only.
- **Supabase:** `public.profiles` has a `role` column; value is read by backend and copied into JWT via Custom Access Token Hook. If there is a CHECK constraint on `role` (e.g. `role IN ('viewer','editor','admin')`), it must be updated to allow `'technician'` (inspect via Supabase MCP or Dashboard before implementing).
- **Docs:** README.md describes roles as "viewer|editor|admin" for PATCH and invite; TROUBLESHOOTING.md and BACKEND_DATABASE.md reference roles where applicable.

---

## 3. Implementation steps (no assumptions)

### 3.1 Supabase (done)

- **Inspection:** Used Supabase MCP (`user-supabase` server) `list_tables`: `public.profiles.role` had CHECK `role = ANY (ARRAY['viewer','editor','admin'])`.
- **Migration applied:** `allow_technician_role_in_profiles` — dropped `profiles_role_check` and re-added it to include `'technician'`: `role = ANY (ARRAY['viewer','editor','admin','technician'])`. Saving or inviting with role `technician` now succeeds at the DB level.

### 3.2 Backend

- **File:** `backend/main.py`
- Add `"technician"` to `ALLOWED_APP_ROLES`:  
  `ALLOWED_APP_ROLES = {"viewer", "editor", "admin", "technician"}`.
- In `api_update_admin_user_permission`: update the 400 error message from "Allowed roles: viewer, editor, admin" to "Allowed roles: viewer, editor, admin, technician".
- In `InviteUserBody` (or equivalent): update the `role` field description to include technician (e.g. "Default role: viewer | editor | admin | technician").
- No change to `require_role(["admin"])` on any route; technician is not granted admin access.

### 3.3 Frontend – app.js

- **File:** `frontend/app.js`
- Add `'technician'` to `APP_ALLOWED_ROLES`:  
  `const APP_ALLOWED_ROLES = new Set(['viewer', 'editor', 'admin', 'technician']);`
- In the User Permissions table row builder (where role `<select>` options are created), add `'technician'` to the array used in `.forEach()` (currently `['viewer', 'editor', 'admin']`) so the dropdown includes `technician`.
- No change to `canAccessDesktopAdminUi()` (still `normalizeAppRole(authState.role) === 'admin'`). No change to invite default role logic (still `'viewer'` when unspecified).

### 3.4 Frontend – index.html

- **File:** `frontend/index.html`
- In the invite user modal, add one option to the `#inviteUserRole` select:  
  `<option value="technician">technician</option>` (place after editor, before admin, or in alphabetical order: admin, editor, technician, viewer—decide per UX; alphabetical is consistent with backend set).

### 3.5 Documentation

- **README.md:** In the API section, update any sentence that says "viewer|editor|admin" or "viewer | editor | admin" to include "technician" (PATCH user-permissions, invite default role).
- **TROUBLESHOOTING.md:** If any entry lists allowed roles, add technician.
- **docs/BACKEND_DATABASE.md:** If `public.profiles` and `role` are documented, add technician to the allowed values.

### 3.6 Verification

- Run backend locally; PATCH a user to `role: "technician"` and GET user-permissions to confirm technician is returned.
- Invite a user with default role technician; confirm profile has `role = 'technician'`.
- Confirm admin-only UI (User Permissions, pricing save) remains restricted to admin (technician cannot access).
- Run `./scripts/run-server.sh` and smoke-test; run E2E if available (`npm test` / `./scripts/run-e2e.sh`). Ensure Railway deploy still succeeds (no new env vars; same build).

---

## 4. Edge cases and safeguards

- **Stale JWT:** After assigning technician, user must sign out and sign in so JWT `app_metadata.role` is refreshed (same as today for any role change). No code change needed.
- **Last-admin rules:** Backend logic that prevents demoting/removing the last admin only counts `role = 'admin'`; technician is irrelevant to that. No change.
- **Mobile:** User Permissions is desktop-only; technician appears in data only. No mobile UI or accessibility change.
- **Railway:** No new environment variables or build steps; deployment remains valid.

---

## 5. Task list reference

- Task added: **36.23** in `docs/tasks/sections-35-48.md` (Add technician role to allowed app roles).
- Index: `TASK_LIST.md` uncompleted table row for Section 36, task 36.23.

---

## 6. Out of scope (for later)

- Giving technician access to specific endpoints (e.g. `require_role(["admin", "technician"])` for a future route). This plan only adds technician as an assignable role.
- Changing what technician can do in the UI (e.g. mobile-only features); that would be a separate task.
