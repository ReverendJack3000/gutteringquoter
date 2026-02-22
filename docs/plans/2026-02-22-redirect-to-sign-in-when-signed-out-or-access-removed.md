# Plan: Redirect to sign-in when signed out or access removed

**Date:** 2026-02-22  
**Scope:** Desktop and mobile (same codebase); no mobile-only UI changes.  
**Goal:** When the user is signed out or has access removed (session expired, token invalid, or removed by an admin), route them to the sign-in page immediately instead of leaving them on a protected view or showing a stale UI.

**Constraints:** Single codebase for desktop and mobile; deployment must remain Railway-safe. Invite/remove user management is done; this work is only “redirect to sign-in when signed out or access removed.”

---

## 1. Current behaviour (gaps)

- **Initial load:** After `initAuth()`, if `!authState.token` then `switchView('view-login')` — correct.
- **Explicit sign-out:** Profile “Sign out” and products view “Sign out” call `clearAuthState()`, `signOut()`, `setAuthUI()`, `switchView('view-login')` — correct.
- **Supabase `onAuthStateChange`:** When session becomes `null` (e.g. `SIGNED_OUT`, token revoked, user deleted by admin), `setAuthFromSession(session, …)` clears `authState` but **no `switchView('view-login')`** — user can stay on canvas/products/user-permissions with stale UI.
- **Admin API 401:** `removeUserPermission` on 401 shows “Session expired. Please sign in again.” but **does not redirect**. `fetchUserPermissions`, `saveUserPermissionRole`, and invite submit do not check 401/403 and do not redirect.
- **Diagrams API:** List, load, save, delete (and autosave) use `getAuthHeaders()` but do not treat 401/403 as “redirect to sign-in”.
- **Other authed APIs:** Update-pricing, ServiceM8 (status, authorize, disconnect) use Bearer token; none redirect to sign-in on 401/403.
- **syncAdminDesktopAccess:** When on `view-user-permissions` and `!canAccessDesktopAdminUi()`, redirects to **view-canvas** with a message. When the reason is “no token” (signed out / removed), user should go to **view-login**, not canvas.

---

## 2. Key file and line references

| Area | File | Notes |
|------|------|--------|
| Auth state | `frontend/app.js` | `authState` (~97), `setAuthFromSession` (142), `clearAuthState` (149), `getAuthHeaders` (102) |
| View switch | `frontend/app.js` | `switchView('view-login')` at 9682, 9691, 9792, 9979, 10432, 10549, 10562, 10835; `switchView` def ~13224 |
| First view after auth | `frontend/app.js` | init() after initAuth(): 13372–13384 — if `authState.token` then view-canvas else view-login |
| Auth state listener | `frontend/app.js` | `onAuthStateChange` in initAuth(): 9873–9885 — no redirect when session null |
| setAuthUI | `frontend/app.js` | 9609–9628; calls `syncAdminDesktopAccess` |
| syncAdminDesktopAccess | `frontend/app.js` | 12203–12223 — redirects to view-canvas when on user-permissions and !canAccessDesktopAdminUi() |
| Admin API | `frontend/app.js` | fetchUserPermissions 12340/12360; saveUserPermissionRole 12402; removeUserPermission 12462/12475; invite 12551 |
| Diagrams | `frontend/app.js` | refreshDiagramsList 11036/11048; load 11021; delete 11002; save 10866; autosave fetch 9053, delete 9062, get 9280 |
| Update-pricing | `frontend/app.js` | 2966 |
| ServiceM8 | `frontend/app.js` | status 9995, authorize 10031, disconnect 10078 |
| Backend auth | `backend/app/auth.py` | get_validated_payload raises 401; require_role raises 403 |

---

## 3. Proposed implementation

### 3.1 Central “redirect to sign-in on auth failure”

- Add a small helper, e.g. `redirectToLoginOnAuthFailure(resp)`, that:
  - If `resp.status === 401 || resp.status === 403`: call `clearAuthState()`, `setAuthUI()`, `switchView('view-login')`, optionally `showMessage('Session expired. Please sign in again.', 'info')`, and return `true`.
  - Otherwise return `false`.
- Place it near other auth helpers (e.g. after `getAuthHeaders` / `clearAuthState`) so it can call `setAuthUI` (must be in scope; `setAuthUI` is inside `initAuth` so the helper may need to live inside `initAuth` or we need to expose a “on auth failed” path that clears state, updates UI, and switches view). **Preferred:** implement a helper that clears auth and switches view, and call `setAuthUI()` from the same place as other sign-out flows (or ensure the helper is defined where it can access `setAuthUI`). If `setAuthUI` is only in `initAuth` scope, the helper could be a function that calls `clearAuthState()` and `switchView('view-login')` and the existing `setAuthUI` is invoked by the next `syncAdminDesktopAccess` (which is called from `setAuthUI` when token was set; when token is cleared we need to update login form visibility — so we do need to call something that shows the login form). So either: (a) extract `setAuthUI` to a global or (b) have the redirect helper call `clearAuthState()` and `switchView('view-login')`, and ensure when we switch to view-login the login form is shown (it might be shown by virtue of `!authState.token` when that view renders, but the profile/auth UI is updated by `setAuthUI`). So we need `setAuthUI` to run when we clear auth. So the helper must either be in scope of `setAuthUI` or we need a single “handle auth failure” that’s called from initAuth and does clearAuthState + setAuthUI + switchView. **Conclusion:** Add `handleAuthFailure()` in the same scope as `setAuthUI` (inside initAuth) that: clears auth, calls setAuthUI(), switchView('view-login'), optional message. Then for API calls outside initAuth we need a way to trigger “redirect to login”. So we need a global or app-scoped function. Check: is there already something like `window.handleAuthFailure`? No. So we need a top-level function that clears auth and switches view. After clearAuthState(), the login form visibility: setAuthUI is inside initAuth and is not exposed. So we have two options: (1) Expose setAuthUI on window or a global app object so handleAuthFailure can call it; (2) Have handleAuthFailure only clearAuthState and switchView('view-login'), and in switchView when switching to view-login, if !authState.token, ensure login form is visible (e.g. call a function that updates auth UI). Looking at the code, when we switch to view-login, the view is just the #view-login div; the auth form visibility is controlled by setAuthUI (authForm.hidden = !authState.token). So if we only clearAuthState and switchView('view-login'), the auth form might still be hidden if setAuthUI was never called. So we must call setAuthUI. So we need to expose setAuthUI (e.g. assign to a namespaced global like window.__quoteAppSetAuthUI = setAuthUI after initAuth, or store in a module-level variable). Simplest: define at top level something like `let setAuthUIRef = null` and in initAuth set `setAuthUIRef = setAuthUI`. Then `function handleAuthFailure(resp) { if (resp && (resp.status === 401 || resp.status === 403)) { clearAuthState(); if (setAuthUIRef) setAuthUIRef(); switchView('view-login'); showMessage('Session expired. Please sign in again.', 'info'); return true; } return false; }`. So the plan: add setAuthUIRef, set it in initAuth, add top-level handleAuthFailure that uses it.
- Use this helper in every authed API response path that can receive 401/403 (see list below).

### 3.2 Auth state listener

- In `onAuthStateChange`, after `setAuthFromSession(session, session?.user ?? null)` and `setAuthUI()`, if `!authState.token` then call `switchView('view-login')`. That way, when Supabase emits session null (sign-out, token revoked, user removed), the user is immediately sent to the login view.

### 3.3 syncAdminDesktopAccess

- When `getVisibleViewId() === 'view-user-permissions' && !canAccessDesktopAdminUi()`:
  - If `!authState.token`: call `switchView('view-login')` (and optionally a short message). Do not redirect to view-canvas.
  - Else: keep current behaviour — `switchView('view-canvas', …)` with “Only admin…” message.

### 3.4 API call sites to add 401/403 redirect

- **User permissions (admin):** fetchUserPermissions, saveUserPermissionRole, removeUserPermission, invite submit handler. After `fetch`, if `handleAuthFailure(resp)` return before parsing body / throwing.
- **Diagrams:** refreshDiagramsList; createDiagramItem load (GET diagram by id); createDiagramItem delete; save diagram (POST); fetchAutosaveDraftList; deleteAutosaveDraftById; any code path that GETs/POSTs/DELETEs /api/diagrams or /api/diagrams/:id with getAuthHeaders() and checks res.ok — add 401/403 redirect before or after the ok check.
- **Update-pricing:** After fetch, if handleAuthFailure(res) return.
- **ServiceM8:** checkServiceM8Status, startServiceM8Connect, disconnect handler. After fetch, if handleAuthFailure(resp) return.
- **Other:** Any other fetch that sends getAuthHeaders() or Bearer token (e.g. servicem8 add-to-job, upload attachment, create-new-job) — add the same 401/403 redirect.

Ensure no double-redirect: once we call switchView('view-login') we can return and not throw, so the caller should check handleAuthFailure first and return.

### 3.5 Optional hardening

- When navigating to a protected view (e.g. view-canvas, view-products, view-user-permissions), if `!authState.token` then redirect to view-login instead. This can be done inside `switchView` or at the call sites. Low priority if 3.1–3.4 are done.

---

## 4. Edge cases and accessibility

- **Double redirect:** Only call switchView('view-login') once per auth failure; helper returns true so callers return and do not throw or show a second message.
- **Already on view-login:** If we’re already on view-login and an API returns 401, redirect is a no-op; safe.
- **setAuthUI availability:** handleAuthFailure must run only after initAuth() has set setAuthUIRef; guard with `if (setAuthUIRef) setAuthUIRef();`.
- **Race (multiple 401s):** Multiple in-flight requests could all get 401; each will call switchView('view-login'). Idempotent and acceptable.
- **Screen readers:** No new UI; redirect to existing sign-in view. Ensure any “Session expired” message is announced (existing showMessage / live region if present).

---

## 5. Desktop vs mobile

- Same behaviour on both: redirect to sign-in when session is invalid or access removed. No viewport-specific logic for this feature.
- syncAdminDesktopAccess already runs on both; the change is only “when no token, redirect to login instead of canvas”.

---

## 6. Railway and deployment

- No new env vars, no backend changes (backend already returns 401/403). Frontend-only; no new dependencies. Safe for existing Railway deploy.

---

## 7. Task list update (draft)

- **Section:** 35 (Auth view switching).  
- **New task:** e.g. **35.11** — When the user is signed out or has access removed (session expired, token invalid, or removed by an admin), redirect to the sign-in page immediately: (1) in onAuthStateChange when session becomes null; (2) central 401/403 handler and use in all authed API calls; (3) in syncAdminDesktopAccess when on user-permissions with no token redirect to view-login. Desktop and mobile; Railway-safe.
- After implementation: mark 35.11 as [x] in docs/tasks/sections-35-48.md; add row to TASK_LIST.md uncompleted table if not already there.
