# Plan: Login/Account Creation and Role-Based Permissions for Database Changes

**Date:** 2026-02-22  
**Scope:** Examine current auth; assess complexity of adding permissions so only certain account types can make database changes.  
**Constraint:** No code changes in this plan; desktop and mobile both use the same API (permission logic is backend-only; UI may hide actions by role on both).

---

## 1. Current Login / Account Creation

### Frontend
- **Location:** `#view-login` in `frontend/index.html`; `initAuth()` in `frontend/app.js` (approx. 9427–9780).
- **Auth provider:** Supabase Auth via anon key (from `GET /api/config`: `supabaseUrl`, `anonKey`).
- **Flows:**
  - **Sign in:** Email + password → `auth.signInWithPassword()`; optional Passkey/WebAuthn when available.
  - **Create account:** “Create account” button → `auth.signUp()`; then switch to canvas and show success message.
  - **Sign out:** Clears `authState.token`, `authState.email`, `authState.user`; calls `auth.signOut()`; switches to login view.
- **Session:** Access token stored in `authState.token`; sent as `Authorization: Bearer <token>` on API calls that require auth (diagrams, ServiceM8).
- **No role or permission UI:** All signed-in users see the same actions; no “admin” vs “viewer” distinction in the app today.

### Backend
- **Location:** `backend/app/auth.py`.
- **Behaviour:** `get_current_user_id(credentials)` validates the Supabase JWT (HS256 via `SUPABASE_JWT_SECRET` or ES256 via JWKS from `SUPABASE_URL`), returns `user_id` (UUID from `sub`). No role or permission check; only identity.
- **Used by:** All diagram endpoints, ServiceM8 OAuth and job endpoints (list diagrams, create/read/update/delete diagram, authorize, callback, status, disconnect, get job, add-to-job, create-new-job, upload attachment). All enforce “valid user” only; isolation is per-user (e.g. diagrams by `user_id`).

### Database (Supabase)
- **Auth:** `auth.users` (id, email, raw_app_meta_data, raw_user_meta_data, etc.). No app-specific role column; Supabase JWT `role` is always `authenticated` for signed-in users.
- **App tables:** `public.saved_diagrams` (user_id), `public.servicem8_oauth` (user_id), `public.products`, `public.labour_rates`, `public.quotes`. Products/labour_rates/quotes are global (no user_id); diagrams and ServiceM8 are per-user.

---

## 2. Database-Changing Operations (Current State)

| Operation | Endpoint | Auth required? | Who can do it today |
|-----------|----------|----------------|---------------------|
| List/create/read/update/delete diagrams | GET/POST/GET/PATCH/DELETE `/api/diagrams*` | Yes (Bearer) | Any signed-in user (own data only) |
| ServiceM8 OAuth, tokens, jobs, add-to-job, etc. | `/api/servicem8/*` | Yes (Bearer) | Any signed-in user |
| Update product pricing | POST `/api/products/update-pricing` | **No** | Anyone (unauthenticated) |
| Import products CSV | POST `/api/products/import-csv` | **No** | Anyone (unauthenticated) |

So today, **only diagrams and ServiceM8 are protected by auth**. Product pricing and CSV import are not; they are global, mutable, and open to unauthenticated callers. Task **22.20** (optional) defers “Pricing edit permissions by role”.

---

## 3. Goal: Only Certain Account Types Can Make Database Changes

**Interpretation:** Restrict “sensitive” database writes (e.g. product pricing, CSV import, and optionally diagram delete or ServiceM8 disconnect) to specific account types (e.g. “admin” or “editor”), while other users (e.g. “viewer”) can still sign in and use read-only or less sensitive actions.

**Scope of “database changes” for this plan:**
- **Must consider:** POST `/api/products/update-pricing`, POST `/api/products/import-csv` (both write to `public.products`).
- **Optional:** Diagram delete, ServiceM8 disconnect, or other write operations; can be restricted by the same mechanism once roles exist.

---

## 4. Complexity Assessment: Moderate

**Why not “trivial”:** You need a notion of account type/role, a way to get that into the backend (JWT or DB lookup), and enforcement on each protected route.  
**Why not “high”:** Auth and JWT validation are already in place; you only add a role/permission layer and protect 2 (or more) endpoints.

### What already exists
- Supabase Auth (sign up, sign in, JWT).
- Backend JWT verification → `user_id`.
- Frontend sends Bearer token for diagrams and ServiceM8 (and could do so for update-pricing and import-csv).

### What’s missing
1. **Role or “account type” for each user**  
   Options (pick one):
   - **A. Supabase `app_metadata`**  
     Set e.g. `app_metadata.role = "admin"` via Supabase Dashboard (Auth → Users → user → Edit) or Admin API. App metadata is included in the JWT. Then use a **Custom Access Token Hook** (Supabase Auth Hooks) to ensure the role is in the token, or read it from the JWT in the backend (backend already decodes the same JWT).
   - **B. `public.profiles` (or `user_roles`) table**  
     Store `user_id` + `role` (e.g. `admin`, `editor`, `viewer`). Use a **Custom Access Token Hook** that runs on token issue: look up the user’s role and add it to the token (e.g. `app_metadata.role`). Backend then reads role from JWT. Keeps role management in your DB and allows bulk updates without touching Supabase Auth metadata.
   - **C. Backend-only lookup**  
     No role in JWT; backend calls Supabase Admin API or queries `public.profiles` by `user_id` on each request. Simpler token story but extra DB/API call per request and no single place that “owns” the token contents.

2. **Backend permission check**  
   - After `get_current_user_id`, add a dependency (e.g. `require_role("admin")` or `require_permission("products:write")`) that reads role from the same JWT payload (or from a new helper that decodes and returns payload). If the user’s role is not allowed, return **403 Forbidden**.  
   - Apply this dependency to POST `/api/products/update-pricing` and POST `/api/products/import-csv` (and optionally to DELETE diagram, ServiceM8 disconnect, etc.).  
   - For update-pricing and import-csv, **require authentication first** (Bearer) and then require the appropriate role; today those routes do not use `Depends(get_current_user_id)`.

3. **Frontend (optional but recommended)**  
   - Send `Authorization: Bearer <token>` on update-pricing and import-csv requests (update-pricing currently does not send it).  
   - Optionally hide “Save to Database” (quote modal) and “Import CSV” (or equivalent) for users who are not admin/editor (e.g. by decoding JWT or calling a small “me” or “config” endpoint that returns role). **Backend must still enforce**; UI hiding is UX only.

4. **Desktop vs mobile**  
   Same API and same JWT; no separate desktop/mobile permission logic. Both can send the same Bearer token; both can hide actions by role if the frontend exposes role.

---

## 5. Recommended Approach (No Assumptions Beyond Current Stack)

1. **Define roles**  
   E.g. `viewer` (read-only), `editor` (can save diagrams, use ServiceM8; cannot change product pricing or import CSV), `admin` (can do everything including update-pricing and import-csv). Exact names and counts can change.

2. **Store role**  
   Use **Option B**: `public.profiles` with `user_id` (FK to `auth.users`) and `role` (e.g. text or enum). Create migration; backfill existing users (e.g. default `editor` or `admin` for first users). Optionally use Supabase **Custom Access Token Hook** (Postgres function) to read `profiles.role` and set `app_metadata.role` (or a custom claim) on token issue so the backend sees the same role in the JWT without extra DB calls on every request.

3. **Backend**  
   - Decode JWT in one place and expose both `user_id` and `role` (e.g. new dependency `get_current_user` returning `{ user_id, role }`, with role from JWT or from profiles table if not in JWT).  
   - Add `require_role(allowed_roles: list[str])` (or similar) that returns 403 if `role` not in list.  
   - Require auth + role on POST `/api/products/update-pricing` and POST `/api/products/import-csv` (e.g. `Depends(get_current_user_id)`, then `Depends(require_role(["admin"]))`).  
   - Keep diagram and ServiceM8 endpoints as today (auth only) unless you explicitly restrict some actions (e.g. delete diagram) to admin.

4. **Frontend**  
   - For update-pricing and import-csv: send `Authorization: Bearer ${authState.token}` (and require sign-in before showing or enabling those actions).  
   - Optionally: decode `session.access_token` (e.g. `jwt-decode`) to read `app_metadata.role` and hide “Save to Database” / “Import CSV” for non-admin (or non-editor) users.  
   - No change to login/account creation flow; only to which buttons/views are shown after login.

5. **Railway**  
   No new env vars required for basic role-in-JWT approach. If you use a Custom Access Token Hook that lives in Supabase, no backend deploy change; if you add a “me” endpoint that returns role, still no special Railway config.

6. **Edge cases**  
   - **New users:** On first sign-up, insert a row into `public.profiles` with default role (e.g. `editor`) via Supabase trigger on `auth.users` or via backend after first login.  
   - **Missing role in JWT:** If hook or metadata is not set, backend should treat as lowest privilege (e.g. `viewer`) or 403 for protected routes.  
   - **Existing 22.20:** Implementing this plan fulfils the intent of task 22.20 (pricing edit permissions by role) and extends it to import-csv.

---

## 6. Summary

- **Current login/account creation:** Supabase Auth (email/password, sign up, passkey, forgot password); backend validates JWT and returns `user_id` only; no roles or permissions.  
- **Database-changing operations:** Diagrams and ServiceM8 are auth-protected (per-user). **Update-pricing and import-csv are not** and are currently callable by anyone.  
- **Adding “only certain account types can make database changes”:** **Moderate** effort: introduce roles (e.g. via `public.profiles` + Custom Access Token Hook), add a backend permission check (e.g. `require_role`), protect update-pricing and import-csv (and optionally other write operations), and optionally hide sensitive actions in the UI by role.  
- **Desktop vs mobile:** Unaffected at the API level; same JWT and same rules; UI can hide actions by role on both.

No assumptions were made beyond the existing stack (FastAPI, Supabase Auth, JWT, single codebase for desktop and mobile, Railway deployment). Plan is accurate against the codebase and Supabase schema as of 2026-02-22.
