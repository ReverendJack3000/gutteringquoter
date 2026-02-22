# Plan: Desktop user management – Invite and remove users

**Date:** 2026-02-22  
**Scope:** Desktop only. No mobile UI or behaviour changes.  
**Goal:** From the User Permissions page (#view-user-permissions), allow admins to **invite** new users by email and **remove** users, with no regressions to existing list/role-update flow.

---

## 1. Current state (no assumptions)

**Frontend**

- **View:** `frontend/index.html` L557–597: `#view-user-permissions`, `.permissions-view-container`, header (Back to Canvas, title, Refresh), search input `#userPermissionsSearch`, table `#userPermissionsTableBody`, empty state `#userPermissionsEmpty`.
- **State:** `frontend/app.js` L195–204: `userPermissionsState` (initialized, loading, users, filteredUsers, searchTerm, draftRoles, rowMessages, savingUserIds).
- **Fetch/list:** L12320–12380: `fetchUserPermissions()` – GET `/api/admin/user-permissions`, Bearer auth, merges auth users with `public.profiles` roles.
- **Update role:** L12383–12441: `saveUserPermissionRole(userId, role)` – PATCH `/api/admin/user-permissions/{userId}` with `{ role }`.
- **Render:** L12241–12317: `renderUserPermissionsList()` – builds table rows with Email, User ID, Role &lt;select&gt;, Save + row status.
- **Init:** L12443–12462: `initUserPermissionsView()` – back button, refresh, search input; no invite/remove yet.
- **Access:** `canAccessDesktopAdminUi()` (L1430–1431), desktop-only; `#menuItemUserPermissions` shown only when admin (e.g. L12200).

**Backend**

- **List:** `backend/main.py` L420–448: `GET /api/admin/user-permissions` – `require_role(["admin"])`, `_list_auth_users_via_admin_api(supabase)`, `_load_profile_roles(supabase)`, returns `{ users }`.
- **Update role:** L451–506 (approx.): `PATCH /api/admin/user-permissions/{target_user_id}` – validates role, gets user by id, upserts `public.profiles` (role). Uses `SUPABASE_SERVICE_ROLE_KEY` for admin API.
- **Helpers:** L148–184: `_list_auth_users_via_admin_api`, L186+: `_load_profile_roles`; L472–473: `_require_service_role_for_admin_permissions()`.

**Constraints**

- **Desktop only:** All new UI and handlers must be gated by existing desktop admin checks; no `body[data-viewport-mode="mobile"]` changes for this feature.
- **Railway:** No new env vars; continue using `SUPABASE_SERVICE_ROLE_KEY` for Supabase Auth Admin (invite/delete).
- **Regressions:** Existing behaviour must remain: list users, search, change role, Save, Back to Canvas, Refresh. Profile menu navigation to User Permissions (L9672, L13143–13145) unchanged.

---

## 2. Invite user

**UI (desktop only)**

- Add an **“Invite user”** button in the User Permissions header (e.g. `.permissions-header-right`, next to Refresh). Only visible when `canAccessDesktopAdminUi()`.
- On click, open a **modal** (or inline form) with: email (required), optional default role (viewer | editor | admin). Submit “Send invite”, Cancel.
- Use existing modal/accessibility patterns (focus trap, Escape, aria) consistent with Product modal / accessibility settings.

**Backend**

- New endpoint: `POST /api/admin/user-permissions/invite` (or `POST /api/admin/invite-user`). Body: `{ "email": string, "role"?: "viewer"|"editor"|"admin" }`. Requires `require_role(["admin"])` and `SUPABASE_SERVICE_ROLE_KEY`.
- Use Supabase Auth Admin: `supabase.auth.admin.invite_user_by_email(email, options)` (see Supabase Python docs). After invite, ensure `public.profiles` has a row for the invited user with the chosen role (e.g. upsert on `user_id` when user is created, or handle in callback; confirm Supabase invite flow and when the user record appears).
- Return clear errors (e.g. email already exists, invalid email, 503 if service role missing).

**Frontend**

- After successful invite: show success message (e.g. “Invite sent to …”), close modal, optionally call `fetchUserPermissions()` to refresh list if the new user appears in the list.
- Reuse `getAuthHeaders()`, same error-toast/status pattern as `saveUserPermissionRole`.

---

## 3. Remove user

**UI (desktop only)**

- In each table row, add a **“Remove”** (or “Delete”) control – e.g. button with aria-label “Remove user”. Only for users other than the current user (`authState.user?.id !== row.user_id`). Optionally hide or disable for the last admin (business rule: prevent removing last admin).
- On click: show **confirmation** (“Remove [email]? They will lose access.”). Confirm → call remove API; Cancel → close.
- Use existing confirmation pattern (e.g. `appAlertDialogState` or similar) for consistency.

**Backend**

- New endpoint: `DELETE /api/admin/user-permissions/{target_user_id}` (or `POST /api/admin/user-permissions/{target_user_id}/remove`). Requires `require_role(["admin"])` and service role.
- Guards: do not allow removing the **calling user** (admin cannot remove themselves from this endpoint); optionally do not allow removing the **last admin** (check `public.profiles` for at least one other admin).
- Use Supabase Auth Admin: `supabase.auth.admin.delete_user(target_uid)`. Optionally delete or retain `public.profiles` row (document choice: e.g. delete to keep profiles in sync with auth.users).
- Return 400 if self-remove, 403 if last admin, 404 if user not found, 503 if service role unavailable.

**Frontend**

- After successful remove: remove user from `userPermissionsState.users` (and filteredUsers), call `renderUserPermissionsList()`, show status “User removed.” If current user was removed by another admin, backend may have already invalidated session; handle 401 if needed.

---

## 4. Regression and safety checklist

- [ ] List users, search, role dropdown, Save role: unchanged behaviour.
- [ ] Back to Canvas, Refresh: unchanged.
- [ ] Profile menu → User Permissions (desktop, admin): still opens view; no new mobile UI.
- [ ] `canAccessDesktopAdminUi()` and backend `require_role(["admin"])`: unchanged.
- [ ] Railway: no new environment variables; deploy succeeds.
- [ ] E2E: existing profile menu navigation test (e2e/profile-menu-navigation.js) still passes; add or adjust E2E for invite/remove only if scope agreed.

---

## 5. Key file reference (quick lookup)

| Area              | File              | Lines / selector |
|-------------------|-------------------|-------------------|
| Permissions view  | index.html        | 557–597 `#view-user-permissions` |
| State + fetch/save| app.js            | 195–204 state; 12241–12462 render, fetch, saveRole, init |
| Backend list/patch| main.py           | 420–448 GET; 451+ PATCH; 148–184 list/helpers |
| Desktop admin gate| app.js            | 1430–1431 canAccessDesktopAdminUi |
| Switch view       | app.js            | 13143–13145 view-user-permissions |

---

## 6. Out of scope (this plan)

- Mobile user management UI.
- Changing how “User Permissions” menu item visibility is determined.
- Invite email template or redirect URL (use Supabase defaults unless specified).
- Bulk invite or CSV import of users.
