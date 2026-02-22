# Deploy safety: investigation of 9 changed files

**Date:** 2026-02-22  
**Scope:** Confirm Railway deploy safety for the current working tree (9 modified files: README, TASK_LIST, TROUBLESHOOTING, backend auth/main, docs/tasks sections-35-48, frontend app.js, index.html, styles.css). No assumptions; report blockers explicitly.  
**Constraint:** Single codebase for desktop + mobile; changes must not break desktop production or Railway build/deploy. Mobile-only work is scoped under `data-viewport-mode="mobile"` or `layoutState.viewportMode === 'mobile'`.

---

## 1. Summary

| File | Change type | Desktop impact | Mobile impact | Railway deploy |
|------|-------------|----------------|---------------|----------------|
| README.md | Docs only | None | None | Safe |
| TASK_LIST.md | Index only | None | None | Safe |
| TROUBLESHOOTING.md | Docs only | None | None | Safe |
| backend/app/auth.py | Auth: role + require_role | Same JWT validation; new helpers | Same | Safe |
| backend/main.py | Admin endpoints + role on 2 routes | New routes; pricing/import require admin | No UI for admin; API 403 if non-admin | Safe |
| docs/tasks/sections-35-48.md | Task checkboxes + status | None | None | Safe |
| frontend/app.js | Auth role, admin UI, pricing gate | Admin-only UI; pricing gated by role | No admin UI; read-only quote pricing | Safe |
| frontend/index.html | New view + menu item | User Permissions view (desktop-only entry) | Menu item hidden | Safe |
| frontend/styles.css | New styles | Permissions view styles only | No mobile rules added | Safe |

**Verdict:** No code or config change prevents a successful Railway deploy. Build (Nixpacks, Procfile, static frontend) is unchanged. Two operational prerequisites are documented in TROUBLESHOOTING.md and can cause 403/503 after deploy if not done.

---

## 2. File-by-file investigation

### 2.1 README.md (+4 lines)

- **Change:** API section lists four endpoints that were already implemented in backend: `POST /api/products/update-pricing`, `POST /api/products/import-csv`, `GET /api/admin/user-permissions`, `PATCH /api/admin/user-permissions/{user_id}`.
- **Desktop / mobile:** Documentation only; no behavior change.
- **Deploy:** No impact. No new env vars or build steps.

### 2.2 TASK_LIST.md (~3 lines)

- **Change:** Index/uncompleted table or branch note only (e.g. Section 36 row already reflects 36.11 only; 36.12–36.18 completed in section file).
- **Desktop / mobile:** None.
- **Deploy:** None.

### 2.3 TROUBLESHOOTING.md (+29 lines)

- **Change:** Three new entries: (1) Custom Access Token Hook not in Supabase dropdown → run `docs/supabase_custom_access_token_wrapper.sql` and select `custom_access_token` in Hooks; (2) 403 on Save to Database / Import CSV → hook or profile role; (3) Admin user-permissions 403/503 → role or `SUPABASE_SERVICE_ROLE_KEY`.
- **Desktop / mobile:** Docs only; no code.
- **Deploy:** Reduces support burden; no deploy risk.

### 2.4 backend/app/auth.py (+63, -0 net behavior change for existing callers)

- **Change:**  
  - `get_validated_payload()`: new dependency that decodes JWT once and returns payload; used by `get_current_user_id` and `get_current_user_id_and_role`.  
  - `get_current_user_id(payload)` now takes payload from `get_validated_payload`; same return type (UUID).  
  - New: `get_current_user_id_and_role()` (returns `(UUID, str)`), `require_role(allowed_roles)` (403 if role not in list).  
- **Existing routes:** All diagram and other routes that used `Depends(get_current_user_id)` still get the same UUID; they do not use role. Backward compatible.
- **Desktop / mobile:** Backend only; both use same API. 401/403 behavior is by token/role, not viewport.
- **Deploy:** No new env vars. ECC (JWKS) and legacy `SUPABASE_JWT_SECRET` unchanged. Safe.

### 2.5 backend/main.py (+323 lines)

- **Change:**  
  - `require_role(["admin"])` added to `POST /api/products/update-pricing` and `POST /api/products/import-csv`. Both now require Bearer + admin; otherwise 401 or 403.  
  - New: `GET /api/admin/user-permissions` (list users + roles), `PATCH /api/admin/user-permissions/{target_user_id}` (update role in `public.profiles`). Both require Bearer + admin and use `SUPABASE_SERVICE_ROLE_KEY` for Auth Admin API / profiles.  
  - Helpers: `_normalize_app_role`, `_require_service_role_for_admin_permissions`, `_list_auth_users_via_admin_api`, `_load_profile_roles`, `_ensure_not_demoting_last_admin`, etc.
- **Dependencies:** No new entries in `requirements.txt`; existing stack (FastAPI, PyJWT, Supabase client) suffices.
- **Env:** `SUPABASE_SERVICE_ROLE_KEY` already required per README and RAILWAY_DEPLOYMENT.md. If missing, admin list/patch return 503 with clear message.
- **Desktop / mobile:** Same API for both; frontend gates who sees/calls admin and pricing endpoints.
- **Deploy:** Procfile and Nixpacks unchanged. Safe. **Blocker (operational):** If Custom Access Token Hook is not enabled in Supabase, JWT has no `app_metadata.role` → backend treats everyone as `viewer` → admin and pricing-admin endpoints return 403. Documented in TROUBLESHOOTING.md and plan 2026-02-22-auth-role-permissions-database-changes.md.

### 2.6 docs/tasks/sections-35-48.md (+13, -1)

- **Change:** Section 36: added tasks 36.12–36.18 (all [x]), status line updated to "36.1–36.10 and 36.12–36.18 complete. 36.11 remains optional."
- **Desktop / mobile / deploy:** Task tracking only; no code or config.

### 2.7 frontend/app.js (+487 net)

- **Auth state and role:**  
  - `authState.role` (default `'viewer'`); `setAuthFromSession()` / `clearAuthState()`; `deriveAuthRole()` from session/user/token `app_metadata.role`; `normalizeAppRole()`; `decodeJwtPayload()` (client-side decode for role only).  
  - All sign-in paths (password, passkey, signUp, onAuthStateChange, getSession) now call `setAuthFromSession()` instead of manually setting token/email/user.
- **Admin / pricing gates:**  
  - `isDesktopViewport()`, `isAdminRole()`, `canAccessDesktopAdminUi()` (token + admin + desktop), `canUsePricingAdminControls()` (same as `canAccessDesktopAdminUi()`).  
  - Quote modal: Edit Pricing and Save Pricing buttons and inline markup inputs hidden/disabled when `!canUsePricingAdminControls()`. Save pricing request sends `getAuthHeaders()`.  
  - User Permissions menu item and view: shown only when `canAccessDesktopAdminUi()`; otherwise message "desktop only" or "admin only."  
  - `syncAdminDesktopAccess()`: on viewport apply and when entering permissions view; hides permissions menu, exits permissions view if no longer allowed, syncs quote edit/save and markup inputs.
- **User Permissions view:** Load/refresh users from `GET /api/admin/user-permissions`, search/filter, role select, save via `PATCH /api/admin/user-permissions/{user_id}`; state in `userPermissionsState`; back to canvas button.
- **Labour editor (material line):** GST display fix (purchase/unit inc or exc GST) and note text; no change to mobile-only behaviour.
- **Desktop vs mobile:**  
  - Admin UI (User Permissions, Edit/Save pricing, markup inputs) is desktop-only via `isDesktopViewport()`.  
  - Mobile: no User Permissions entry point (menu item hidden); quote pricing remains read-only; no new mobile-only logic in this change set.
- **Deploy:** Static JS; no new build step. Safe.

### 2.8 frontend/index.html (+52 lines)

- **Change:**  
  - Profile dropdown: new `#menuItemUserPermissions` (User Permissions), `hidden` by default; shown by JS only when `canAccessDesktopAdminUi()`.  
  - New view `#view-user-permissions`: header (Back to Canvas, title, Refresh), search, status, table (Email, User ID, Role, Action), empty state. No `data-viewport-mode`-specific markup; visibility and entry are JS-gated (desktop + admin).
- **Desktop / mobile:** Menu item hidden on mobile; view only reachable when desktop + admin. No mobile-specific HTML added.
- **Deploy:** Static HTML. Safe.

### 2.9 frontend/styles.css (+204 lines)

- **Change:** New classes for User Permissions view: `.permissions-view-container`, `.permissions-header`, `.permissions-main`, `.permissions-search-wrap`, `.permissions-table`, `.permissions-role-select`, `.permissions-save-btn`, etc. No rules under `body[data-viewport-mode="mobile"]` in this diff.
- **Desktop / mobile:** Styles apply to the permissions view only; view is desktop-only. No mobile layout or toolbar changes.
- **Deploy:** Static CSS. Safe.

---

## 3. Blockers (explicit)

1. **Custom Access Token Hook not enabled (Supabase)**  
   - **Symptom:** All users get 403 on Save to Database, Import CSV, and admin user-permissions (backend treats role as `viewer`).  
   - **Fix:** Run `docs/supabase_custom_access_token_wrapper.sql` if needed; in Supabase Dashboard → Authentication → Hooks → Customize access token, select `custom_access_token` (or the hook that injects `app_metadata.role` from `public.profiles`). Then assign at least one admin: `UPDATE public.profiles SET role = 'admin' WHERE user_id = '<auth.users.id>';` and have that user sign out and sign in again.  
   - **Deploy impact:** App and Railway deploy succeed; only runtime behavior (403 until hook + role are set).

2. **SUPABASE_SERVICE_ROLE_KEY missing or invalid (Railway)**  
   - **Symptom:** `GET /api/admin/user-permissions` returns 503; message indicates service-role key required.  
   - **Fix:** Set valid `SUPABASE_SERVICE_ROLE_KEY` in Railway Variables and redeploy.  
   - **Deploy impact:** Build and deploy succeed; admin list/patch return 503 until key is set.

No other blockers identified. No new build steps, no new required env vars beyond what is already documented (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY; optional SUPABASE_JWT_SECRET).

---

## 4. Desktop vs mobile (production)

- **Desktop:** New admin-only User Permissions view and menu item; quote Edit Pricing / Save Pricing and markup inputs visible and enabled only for admin; API calls for update-pricing and admin endpoints send Bearer token. Non-admin desktop users: read-only quote pricing; no User Permissions.
- **Mobile:** No new UI; User Permissions menu item hidden; quote pricing remains read-only (no pricing admin on mobile by design). No change to mobile toolbar, canvas, or quote modal layout from this change set.
- **Both:** Auth (token, role) is shared; diagram save/load and ServiceM8 unchanged. Labour editor GST display fix applies to both; no viewport-specific logic added for that.

---

## 5. Task list (TASK_LIST.md and section files)

- **Section 36:** Uncompleted table already lists only 36.11 (optional localProducts migration) and notes that desktop admin user-permissions (36.12–36.18) are complete. Section file `docs/tasks/sections-35-48.md` has 36.12–36.18 checked and status updated.
- **No update required** to the uncompleted tasks table for this change set; 36.12–36.18 are already reflected as complete in the section file and the index row for 36 is correct.

---

## 6. Checklist before deploy (recommended)

- [ ] Run `./scripts/run-server.sh` locally; open `/` and sign in; confirm diagram save/load still works.
- [ ] As admin (after hook + profile role): open User Permissions from profile menu; list users; change a role and save; confirm 200 and updated role.
- [ ] As non-admin (or with hook disabled): confirm quote Edit Pricing / Save hidden or disabled; confirm 403 on POST `/api/products/update-pricing` if called (e.g. via devtools).
- [ ] Push to connected branch; confirm Railway build and deploy succeed.
- [ ] Post-deploy: confirm Supabase Custom Access Token Hook is set and at least one user has `role = 'admin'` in `public.profiles`; sign out and sign in; confirm admin features and no 403 for admin.
