# 2026-03 Auth Role Fail-Closed Fix (`/api/me`)

## Summary

This change hardens role verification so desktop admin UI access is never granted from stale JWT role claims when role verification fails.

- Backend `/api/me` is now profile-authoritative and fail-closed.
- Frontend auth hydration now treats `/api/me` as required verification.
- On `/api/me` verification failure, frontend clears auth and redirects to login.

## Root Cause

`authState.role` was initially derived from JWT (`app_metadata.role`) in `setAuthFromSession`.
If `/api/me` failed (non-200, invalid JSON, network error) the frontend kept JWT-derived role, which could leave stale admin access visible.

Backend `/api/me` also previously fell back to JWT role when profile lookup failed.

## Code Changes

## Backend

- File: `backend/main.py`
- Route: `GET /api/me`
- Behavior now:
  - Reads role from `public.profiles` by `user_id`.
  - Uses normalized profile role when present.
  - Defaults to `viewer` when profile row/role missing or invalid.
  - Returns `503` on profile read failure (instead of silently falling back to JWT role).
  - Preserves super-admin override (`SUPER_ADMIN_EMAIL` match => role `admin`).

## Frontend

- File: `frontend/app.js`
- Function: `fetchMeAndUpdateAuth()`
- Behavior now:
  - Treats `/api/me` as mandatory verification.
  - If `/api/me` is non-OK, JSON invalid, or role missing/invalid type:
    - clear auth
    - close modals
    - redirect to `view-login`
    - refresh auth UI/menu visibility
  - Adds duplicate guard to prevent repeated fail-closed toasts/redirect loops from concurrent failures.
- Added E2E test hook:
  - `window.__quoteAppFetchMeAndUpdateAuthForTests()`

## Tests Added

- Backend unit tests:
  - `backend/tests/test_me_endpoint_auth.py`
  - Cases:
    - profile role overrides JWT admin claim
    - missing profile row => viewer
    - invalid profile role => viewer
    - profile read failure => 503
    - super admin still forces admin

- E2E regression:
  - File: `e2e/run.js`
  - Scenario:
    - force stale admin auth state
    - force `/api/me` to return 500
    - assert fail-closed result:
      - token cleared
      - `canAccessDesktopAdminUi === false`
      - admin desktop menu items hidden
      - visible view is `view-login`

## Production Logs to Check

If profile lookup fails in backend:

- `api_me: could not read role from profiles for user_id=<uuid>: <error>`

On successful `/api/me` reads:

- `api_me email=<email> role=<role> is_super_admin=<bool>`

## Verification Checklist

1. Run backend tests:
   - `./scripts/run-backend-tests.sh`
   - or `cd backend && python3 -m unittest tests.test_me_endpoint_auth -v`
2. Run E2E:
   - `npm test`
3. Manual smoke:
   - Sign in as technician with stale admin JWT claim.
   - Confirm `/api/me` success forces role to technician and admin menus stay hidden.
   - Simulate `/api/me` failure and confirm redirect to login.
