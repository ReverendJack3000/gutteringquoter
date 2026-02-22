# Set-password screen debug plan (implementation-ready)

**Source:** [docs/plans/2026-02-set-password-screen-investigation.md](2026-02-set-password-screen-investigation.md)  
**Scope:** Debug why the set-password screen doesn’t work when an invitee or forgot-password user follows the magic link. No assumptions; line numbers and flow verified against the codebase.  
**Constraint:** Changes must not break desktop; focus is auth flow (shared by desktop and mobile). Railway deployment must remain successful.

---

## 1. Verified expected flow

1. User receives email (invite or forgot-password) with a magic link from Supabase.
2. User clicks link → browser opens the **app** (Supabase Site URL / Redirect URL) with a **hash** (e.g. `#access_token=...&type=recovery`).
3. App loads → `initAuth()` runs (app.js ~9606) → `fetch('/api/config')` → create Supabase client → `onAuthStateChange` registered (~9940) → `getSession()` (~9960).
4. Supabase client **consumes the hash**, establishes a session, and emits an auth event. For **invite** and **forgot-password** links Supabase fires **`PASSWORD_RECOVERY`** when the user lands from the link (confirmed from Supabase docs).
5. **Only when `event === 'PASSWORD_RECOVERY'`** the app hides the sign-in form and shows `#authSetPasswordForm` (app.js ~9949–9957).
6. User enters new password and submits → `updateUser({ password })` (~9906) → on success, `switchView('view-canvas')` (~9912).

If any of 2–5 fail or differ (wrong event, hash not processed, wrong view, or init order), the set-password screen never appears or doesn’t work.

---

## 2. Verified code locations (no changes yet – use for inspection)

| What | File | Lines / IDs |
|------|------|-------------|
| Set-password form (HTML) | `frontend/index.html` | `#authSetPasswordForm` (392–402), `#authNewPassword`, `#authNewPasswordConfirm`, `#authSetPasswordBtn`, `#authSetPasswordCancelBtn`, `#authSetPasswordError` |
| Login view container | `frontend/index.html` | `#view-login` (370) |
| Where set-password form is shown | `frontend/app.js` | `onAuthStateChange` callback: **only** when `event === 'PASSWORD_RECOVERY'` (9949–9957). Hides `#authForm`, `#authUserSection`, `#authFormHint`; shows `#authSetPasswordForm`, focuses `#authNewPassword`. |
| Set-password form submit | `frontend/app.js` | `authSetPasswordForm.addEventListener('submit', …)` 9889–9917; `authState.supabase.auth.updateUser({ password: newPass })` 9906; on success: `switchView('view-canvas')` 9912. |
| Auth init and session restore | `frontend/app.js` | `initAuth()` 9606+; `fetch('/api/config')` 9932; create client 9938; `onAuthStateChange` 9940; `getSession()` 9960–9965. |
| First view on load | `frontend/app.js` | `authReady.then(…)` in `init()` 13470–13482; `authState.token` → `view-canvas` else `view-login`. |
| Invite backend | `backend/main.py` | `POST /api/admin/user-permissions/invite` 475–531; `supabase.auth.admin.invite_user_by_email(email)` 500. |
| setAuthFromSession | `frontend/app.js` | 172–176; sets `authState.token`, `authState.email`, `authState.user`. |
| Auth error mapping | `frontend/app.js` | `getAuthErrorMessage` used for `#authSetPasswordError` (~9914); see comment ~107. |

**Critical callback order in `onAuthStateChange` (9940–9958):**  
`setAuthFromSession(session, …)` → `setAuthUI()` → **if `!authState.token`** → `switchView('view-login'); return;` → else loadPanelProducts, checkServiceM8Status → **if `event === 'PASSWORD_RECOVERY'`** → hide auth form / user section / hint, show set-password form and focus. So the set-password block runs only when we have a token and the event is PASSWORD_RECOVERY.

---

## 3. Hypotheses to test (in order)

### H1: Invitee never sees set-password form (lands on sign-in)

- **Possible causes:**
  - Event is not `PASSWORD_RECOVERY` when landing from invite (Supabase docs say it is; verify in app with logging).
  - Hash missing or not processed: wrong Site URL / Redirect URL, or link goes to Supabase host first.
  - `getSession()` runs before the client has processed the hash → we show login in `authReady.then()`; when the event fires later we do show the form, but only if we’re already on `view-login` and the callback runs (confirm we don’t early-return when session is present).
  - `#view-login` is shown but `#authSetPasswordForm` never made visible (logic/timing/CSS).
- **Verification:**
  - Reproduce: send invite, open link in incognito; before interacting capture: (1) full URL including hash, (2) DevTools Application → Local/Session Storage (Supabase keys), (3) Network: `/api/config` and any Supabase requests, (4) Console: temporary `log` in `onAuthStateChange` for `event` and `session`. Confirm whether `event === 'PASSWORD_RECOVERY'` ever fires and whether the set-password block runs.
  - Supabase Dashboard → Authentication → URL Configuration: **Site URL** and **Redirect URLs** must be the production app URL (e.g. `https://your-app.up.railway.app`, `https://your-app.up.railway.app/**`). If the link sends users to a different origin, the app never sees the hash.

### H2: Set-password form appears but submit does nothing or errors

- **Possible causes:**
  - `updateUser({ password })` fails (Supabase: weak password, rate limit, invalid session).
  - Form submit handler not bound or `authState.supabase` null when handler runs.
  - `#authSetPasswordError` hidden or not updated.
- **Verification:**
  - With set-password form visible: DevTools Console and Network. Submit with valid password (e.g. 8+ chars). Check: (1) JS errors, (2) Supabase/backend request and response, (3) `#authSetPasswordError` text.
  - In app.js confirm submit handler (9889) runs (e.g. temporary `console.log`) and `authState.supabase` is set.

### H3: Set-password succeeds but user stays on login or is sent back to sign-in

- **Possible causes:**
  - After `updateUser`, session not refreshed or `setAuthFromSession` not called → `authState.token` stale/null and first-view or `onAuthStateChange` sends user back to login.
  - `switchView('view-canvas')` not called or fails (error before it).
  - Another listener (e.g. `onAuthStateChange` with `!authState.token`) runs after success and redirects to login.
- **Verification:**
  - After submitting new password: console for errors; confirm `switchView('view-canvas')` is reached (temporary log). Check `authState.token` and current view immediately after `updateUser` success.

### H4: Hash / redirect: link doesn’t open the app or hash is stripped

- **Possible causes:**
  - Site URL or Redirect URL in Supabase points to another origin; app never receives the token.
  - Redirect to app uses query params instead of hash, or hash stripped by redirect/server.
  - Server must serve `index.html` for `/` so the client can read the hash (current setup does).
- **Verification:**
  - Click invite or forgot-password link; note **exact** URL in address bar (including `#...`). Confirm app origin and hash present. If no hash or different site, fix Supabase URL configuration (see TROUBLESHOOTING “Forgot password / invite: set-password form does not show” and “Invite / auth emails send users to localhost:3000”).

### H5: Init order / race: login view chosen before session from hash exists

- **Possible causes:**
  - `authReady` resolves after `getSession().then(...)`; at that moment the hash may not yet be processed, so `getSession()` returns null → `authReady.then()` chooses `view-login`. Later Supabase processes the hash and calls `onAuthStateChange(PASSWORD_RECOVERY, session)` → we should then show set-password form (we’re already on view-login). So form should still appear unless the callback doesn’t run or we early-return.
  - Early return: when `onAuthStateChange` runs with the recovery session, we call `setAuthFromSession(session, …)` first, so `authState.token` is set; we then do **not** hit `if (!authState.token) { switchView('view-login'); return; }`, so we do reach the `event === 'PASSWORD_RECOVERY'` block. So the only risk is if `onAuthStateChange` never fires with PASSWORD_RECOVERY (e.g. hash never processed, or event different).
- **Verification:**
  - Add temporary logging: in `initAuth`, after `getSession().then(...)` log `authState.token` and `window.location.hash`. In `onAuthStateChange` log `event` and `session`. Confirm whether the event fires **after** initial view is set and that when it does we show set-password (and that we’re on view-login).

---

## 4. Quick checks (no code changes until cause confirmed)

1. **Event for set-password:** In `frontend/app.js` search for `PASSWORD_RECOVERY`. Confirm we only show `#authSetPasswordForm` when `event === 'PASSWORD_RECOVERY'`. Supabase invite links use this event; no code change for event name unless we discover otherwise with logging.
2. **Init order:** In `init()`, `authReady` is the promise returned by `initAuth()` (13470–13471). That promise resolves when `getSession().then(...)` resolves (9960–9966). So when `authReady.then()` runs (13472), we have already run getSession and updated (or not) auth state. If the hash is processed **after** getSession(), we’d have shown view-login and then when onAuthStateChange fires we’d show the form — confirm with logs.
3. **Reproduce and capture:** Open invite link; before interacting capture: full URL (with hash), console logs for `onAuthStateChange` (event + session). Use to confirm or rule out H1 and H5.

---

## 5. Suggested implementation fixes (only after confirming cause)

- **If invite doesn’t emit `PASSWORD_RECOVERY` in practice:** Handle the event Supabase actually sends (e.g. check URL/session for recovery/invite type or another event name) and in that branch show the same set-password UI (hide sign-in form, show `#authSetPasswordForm`).
- **If hash is present but session/event comes later:** Ensure when `onAuthStateChange` fires with `PASSWORD_RECOVERY` we **always** switch to `view-login` if not already, then show the set-password form, so a late event still updates the UI.
- **If submit fails:** Surface the exact error from `updateUser` in `#authSetPasswordError` (and console) so the user and dev can see Supabase’s message.
- **If view doesn’t switch after success:** After `updateUser` success, explicitly call `setAuthFromSession(session, …)` with the latest session if the client returns it, then `switchView('view-canvas')`.

---

## 6. Related docs

- **docs/LOGIN_AND_ACCOUNT_CREATION_MAP.md** – Flows and file/line refs for login, invite, set-password.
- **TROUBLESHOOTING.md** – “Forgot password / invite: set-password form does not show after clicking link”; “Invite / auth emails send users to localhost:3000”.

---

## 7. Outcome to document after fix

Once the root cause is found and fixed: add a short note in this plan or in TROUBLESHOOTING.md with: (1) cause, (2) fix (file and change), (3) how to verify (e.g. “Send invite, open link in incognito, set password, then sign in again with that password”).

**Implemented 2026-02 (Task 35.17):**

- **Cause (defensive fixes; root cause to confirm with reproduction):** Possible late `PASSWORD_RECOVERY` event (view already set), set-password form shown but not on login view; after `updateUser` success session not refreshed so user could be sent back to login; updateUser errors not visible for debugging.
- **Fix (file: frontend/app.js):**
  1. **Diagnostic logging:** In `onAuthStateChange` log `event` and `hasSession`/`hasToken`; after `getSession().then(...)` log `hasSession`, `hasToken`, `hashLength`. Console prefix: `[Quote App set-password debug]`. Use when reproducing (invite or forgot-password link) to confirm H1/H5.
  2. **PASSWORD_RECOVERY:** When `event === 'PASSWORD_RECOVERY'` call `switchView('view-login')` before showing `#authSetPasswordForm` so a late event still shows the form on the correct view.
  3. **updateUser errors:** In set-password submit catch block, `console.error('[Quote App set-password] updateUser failed', err)`; `#authSetPasswordError` continues to use `getAuthErrorMessage()` for user-facing text.
  4. **After updateUser success:** Destructure `data` from `updateUser`; if `data?.session` use it, else call `getSession()` and use `res.data.session`; call `setAuthFromSession(session, session.user)` then `switchView('view-canvas')` so auth state is fresh and the user is not sent back to login.
- **Verify:** Send invite (or use Forgot password), open link in incognito, confirm set-password form appears, set password, then confirm redirect to canvas and ability to sign in again with the new password. Check console for `[Quote App set-password debug]` / `[Quote App set-password]` logs if the form does not appear or submit fails.

---

## 8. Desktop vs mobile

- Auth and set-password are shared: same `#view-login`, same `#authSetPasswordForm`, same `initAuth` / `onAuthStateChange`. Fixes apply to both.
- Mobile-specific styling for login (44px targets, safe area) is in `styles.css` (e.g. `body[data-viewport-mode="mobile"] #view-login`). No separate mobile auth logic; ensure any new UI or focus behavior works on both viewport modes and that Railway deploy still succeeds.
