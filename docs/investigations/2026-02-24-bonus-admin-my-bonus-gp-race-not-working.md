# Investigation: Bonus Admin, My Bonus, and GP Race not working (desktop or mobile)

**Date:** 2026-02-24  
**Scope:** No fixes applied; investigation only.

---

## 1. Summary

Bonus Admin, My Bonus, and the GP Race entry points depend on **role** and **viewport**. Role comes from the JWT `app_metadata.role`, which is set by a **Supabase Custom Access Token Hook** from `public.profiles.role`. If that hook is not enabled or the user’s profile role is `viewer` (or missing), the app treats the user as `viewer` and **all three bonus features are effectively unavailable**. On mobile, the profile menu is hidden, so the only bonus entry is the GP Race button, which is also gated by role.

---

## 2. Entry points and guards

### 2.1 Bonus Admin (desktop only)

| Item | Location | Guard |
|------|----------|--------|
| Menu item | Profile dropdown → “Bonus Admin” | `canAccessDesktopAdminUi()` → **admin** and **desktop** |
| Backend | `GET /api/bonus/periods`, admin period/jobs/summary/breakdown, PATCH job-performance, PATCH job-personnel | `require_role(["admin"])` |

- **Frontend:** `canAccessDesktopAdminUi()` = `authState.token` **and** `normalizeAppRole(authState.role) === 'admin'` **and** `isDesktopViewport()` (see `app.js` ~1508–1510).
- So: **admin only**, and **desktop only**. On mobile, even admins get “Bonus Admin is available on desktop only.” and cannot open the view.
- If the user is not admin (e.g. role is `viewer`), the menu item “Bonus Admin” is **hidden** (`updateBonusAdminMenuVisibility()` → `menuItem.hidden = !canAccessDesktopAdminUi()`).

### 2.2 My Bonus (technician dashboard)

| Item | Location | Guard |
|------|----------|--------|
| Desktop | Profile dropdown → “My Bonus” | `canAccessTechnicianBonusView()` |
| Mobile | Toolbar button “GP Race” (`#mobileBonusDashboardBtn`) | `isMobile && canAccessTechnicianBonusView()` |
| Backend | `GET /api/bonus/technician/period-current`, `dashboard`, `jobs` | `_require_bonus_dashboard_reader` → role in `{admin, editor, technician}` |

- **Frontend:** `canAccessTechnicianBonusView()` = `authState.token` **and** role in `['admin','editor','technician']` (app.js ~1512–1515). No viewport check.
- So: **admin, editor, or technician** can open My Bonus / GP Race. **viewer** cannot.
- If role is `viewer`: “My Bonus” menu item is **hidden**; on mobile, the GP Race button is **hidden** (`updateMobileBonusButtonVisibility()` → `btn.hidden = !(isMobile && canAccessTechnicianBonusView())`).

### 2.3 Mobile: profile menu hidden

- In `frontend/styles.css` (~2059–2061):  
  `body[data-viewport-mode="mobile"] #userProfileWrap { display: none !important; }`
- So on mobile, the **profile dropdown is not visible**. The only way to open the technician bonus view on mobile is the **GP Race** toolbar button, which is only shown when `canAccessTechnicianBonusView()` is true (i.e. role admin/editor/technician). If the user is `viewer`, there is **no visible bonus entry point on mobile**.

---

## 3. Where role comes from

### 3.1 Frontend

- **Source:** `deriveAuthRole(session, explicitUser, token)` (app.js ~157–171).
- **Candidates (in order):**  
  `explicitUser?.app_metadata?.role`, `session?.user?.app_metadata?.role`, `tokenPayload?.app_metadata?.role`, `tokenPayload?.role`.
- **Default:** If none are a non-empty string, role is **`'viewer'`**.
- Session/token are from Supabase Auth (`getSession()`, sign-in flows). So the frontend only sees a non-viewer role if the **JWT or session user** has `app_metadata.role` (or top-level `role`) set.

### 3.2 Backend

- **Source:** `get_current_user_id_and_role()` in `backend/app/auth.py` (~120–132).
- Role is read from the **JWT payload**: `(payload.get("app_metadata") or {}).get("role")`.
- If missing or not a string, role defaults to **`"viewer"`**.
- Docs and code state that **Supabase Custom Access Token Hook** is responsible for copying `public.profiles.role` into the token’s `app_metadata.role` when the token is issued/refreshed.

### 3.3 Supabase

- **`public.profiles`:** Table with `user_id` (→ `auth.users.id`) and `role` (e.g. `viewer`, `editor`, `admin`, `technician`).
- **Custom Access Token Hook:** A Postgres function (e.g. `custom_access_token` or `custom_access_token_hook`) must be configured in Supabase Dashboard → **Authentication → Hooks → Customize access token**. That function should read `profiles.role` for the user and add it to the token’s `app_metadata`.
- If the hook is **not selected** in the dashboard, tokens are issued **without** `app_metadata.role` → both frontend and backend treat the user as **viewer**.
- If the hook is selected but the user has **no row** in `public.profiles`, or `role` is NULL, the hook may not set role → again **viewer**.
- After changing `profiles.role`, the user must **sign out and sign in again** (or refresh the token) so the new role appears in the JWT.

---

## 4. Likely causes of “don’t work”

1. **Custom Access Token Hook not enabled**  
   JWT never gets `app_metadata.role` → everyone is `viewer` → Bonus Admin and My Bonus menu items are hidden; GP Race button is hidden on mobile; technician dashboard API returns 403 if the view were reached by other means.

2. **User’s profile role is `viewer` or missing**  
   Even with the hook enabled, if `public.profiles.role` is `viewer` or NULL for that user, they are treated as viewer → same behaviour as (1). Bonus Admin additionally requires role **admin** (and desktop).

3. **Stale JWT after role change**  
   If an admin changed the user’s role in User Permissions but the user did not sign out and sign in again, the JWT still has the old role → menu visibility and API access stay wrong until re-login.

4. **Bonus Admin on mobile**  
   By design, Bonus Admin is desktop-only. On mobile, the message “Bonus Admin is available on desktop only.” is expected for everyone, including admins.

5. **403 on first API call**  
   If a user with role viewer somehow reached the Bonus Admin or My Bonus view (e.g. via a direct view switch or future deep link), the first request (e.g. `GET /api/bonus/periods` or `GET /api/bonus/technician/dashboard`) would return **403**. The frontend calls `handleAuthFailure(resp)` on 401/403, which **clears auth and redirects to the login view**. So the user would be kicked back to sign-in.

---

## 5. How to verify (no code changes)

1. **Check hook:**  
   Supabase Dashboard → Authentication → Hooks → Customize access token. Confirm a function (e.g. `custom_access_token`) that injects `app_metadata.role` from `public.profiles` is selected and saved.

2. **Check profile:**  
   In Supabase (SQL or Table Editor), for the test user’s `auth.users.id`, run:  
   `SELECT user_id, role FROM public.profiles WHERE user_id = '<uuid>';`  
   Ensure `role` is one of `admin`, `editor`, `technician` for bonus access (and `admin` for Bonus Admin).

3. **Check JWT after sign-in:**  
   After signing in, decode the access token (e.g. jwt.io or frontend `decodeJwtPayload`) and confirm `app_metadata.role` (or equivalent) is set and matches the profile.

4. **Desktop:**  
   Sign in as admin → open profile menu → “Bonus Admin” and “My Bonus” should be visible. Sign in as viewer → both should be hidden.

5. **Mobile:**  
   With viewport in mobile mode, profile menu is hidden. As admin/editor/technician, the GP Race button should be visible and open My Bonus. As viewer, GP Race button should be hidden.

6. **Backend:**  
   Call `GET /api/bonus/technician/dashboard` with Bearer token as admin/editor/technician → 200. As viewer (or token without role) → 403 “Insufficient permissions (required role: one of admin, editor, technician)”.

---

## 6. References in repo

- **Role derivation:** `frontend/app.js` – `deriveAuthRole`, `setAuthFromSession`, `canAccessDesktopAdminUi`, `canAccessTechnicianBonusView`, `updateBonusAdminMenuVisibility`, `updateTechnicianBonusMenuVisibility`, `updateMobileBonusButtonVisibility`.
- **Backend auth:** `backend/app/auth.py` – `get_validated_payload`, `get_current_user_id_and_role`, `require_role`; `backend/main.py` – `_require_bonus_dashboard_reader`, `BONUS_DASHBOARD_ALLOWED_ROLES`, `require_role(["admin"])` on all bonus admin endpoints.
- **Mobile profile hidden:** `frontend/styles.css` – `body[data-viewport-mode="mobile"] #userProfileWrap { display: none !important; }`.
- **Troubleshooting:** `TROUBLESHOOTING.md` – “Custom Access Token Hook not in Supabase dropdown”, “403 … Save to Database / Import CSV”, “Admin user-permissions API returns 403 or 503”, “Technician role: 400 …”.

---

## 7. Conclusion

The most likely reason Bonus Admin, My Bonus, and the GP Race “don’t work” on desktop or mobile is that **the effective role is `viewer`**: either the Custom Access Token Hook is not enabled, or the user’s `public.profiles.role` is `viewer`/missing, or the JWT is stale after a role change. That hides all bonus UI entry points (and would return 403 if those endpoints were called). A secondary cause on mobile is that the profile menu is hidden by design, so only the GP Race button is available, and it is also hidden when role is not admin/editor/technician. No code fixes were made in this investigation; verifying the hook, profile role, and token contents as above should confirm the cause.
