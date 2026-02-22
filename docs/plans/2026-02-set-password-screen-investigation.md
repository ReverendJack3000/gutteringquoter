# Investigation plan: Set your password screen not working

**Use this plan in the next chat to debug why the set-password screen doesn’t work when an invitee (or forgot-password user) follows the magic link.**

---

## 1. Expected flow (reference)

1. User receives email (invite or forgot-password) with a magic link from Supabase.
2. User clicks link → browser opens the **app** (Site URL / Redirect URL) with a **hash** in the URL (e.g. `#access_token=...&type=recovery` or similar).
3. App loads → `initAuth()` runs → fetches `/api/config` → creates Supabase client → registers `onAuthStateChange` → calls `getSession()`.
4. Supabase client **consumes the hash**, establishes a session, and may emit an auth event (e.g. `PASSWORD_RECOVERY`).
5. **Only when `event === 'PASSWORD_RECOVERY'`** does the app hide the sign-in form and show `#authSetPasswordForm` (app.js ~9949–9957).
6. User enters new password and submits → `updateUser({ password })` → on success, `switchView('view-canvas')`.

If any of 2–5 fail or differ (e.g. wrong event, hash not processed, wrong view shown first), the set-password screen never appears or doesn’t work.

---

## 2. Key code locations (no changes yet – use for inspection)

| What | File | Lines / IDs |
|------|------|-------------|
| Set-password form (HTML) | `frontend/index.html` | `#authSetPasswordForm` (~390–401), `#authNewPassword`, `#authNewPasswordConfirm`, `#authSetPasswordBtn`, `#authSetPasswordCancelBtn`, `#authSetPasswordError` |
| Login view container | `frontend/index.html` | `#view-login` (~370) |
| Where set-password form is shown | `frontend/app.js` | `onAuthStateChange` callback: **only** when `event === 'PASSWORD_RECOVERY'` (~9949–9957). Hides `#authForm`, `#authUserSection`, `#authFormHint`; shows `#authSetPasswordForm` and focuses `#authNewPassword`. |
| Set-password form submit | `frontend/app.js` | `authSetPasswordForm.addEventListener('submit', …)` ~9889–9916; `authState.supabase.auth.updateUser({ password: newPass })` ~9906; on success: `switchView('view-canvas')`. |
| Auth init and session restore | `frontend/app.js` | `initAuth()` ~9932+; `fetch('/api/config')` then create client, `onAuthStateChange`, `getSession()` ~9959–9965. |
| First view on load | `frontend/app.js` | `authReady.then(…)` in `init()` ~13426–13438 (or search for `authState.token` → `view-canvas` else `view-login`). |
| Invite backend | `backend/main.py` | `POST /api/admin/user-permissions/invite` ~475–531; `supabase.auth.admin.invite_user_by_email(email)`. |

**Important:** The app currently shows the set-password form **only** when `event === 'PASSWORD_RECOVERY'`. Supabase docs do not document a separate “invite” event; invite links may use the same recovery-type flow or a different event. If Supabase emits something other than `PASSWORD_RECOVERY` for invite (e.g. `SIGNED_IN` or nothing), the set-password form will never be shown.

---

## 3. Hypotheses to test (in order)

### H1: Invitee never sees set-password form (lands on sign-in)

- **Possible causes:**  
  - Event is not `PASSWORD_RECOVERY` when landing from invite link (e.g. Supabase uses another event or none).  
  - Hash is missing or not processed (wrong Site URL / Redirect URL, or link goes to Supabase host first).  
  - `getSession()` runs before the client has processed the hash, so we show login view; when the event fires later, we might already have decided the view.  
  - `#view-login` is shown but `#authSetPasswordForm` is never made visible (logic or timing).
- **How to verify:**  
  - Reproduce: send invite, open link in incognito (or another browser), **before clicking anything** capture: (1) full URL (including hash). (2) In DevTools → Application → Local Storage / Session Storage, any Supabase keys. (3) In DevTools → Network, whether `/api/config` and any Supabase requests run. (4) In DevTools → Console, add a temporary `log` inside `onAuthStateChange` to print `event` and `session` (or use debugger). Confirm whether `event === 'PASSWORD_RECOVERY'` ever fires and whether the set-password block runs.  
  - Check Supabase Dashboard → Authentication → URL Configuration: **Site URL** and **Redirect URLs** must be the production app URL (e.g. `https://your-app.up.railway.app` and `https://your-app.up.railway.app/**`). If the link sends users to a different origin, the app never sees the hash.

### H2: Set-password form appears but submit does nothing or errors

- **Possible causes:**  
  - `updateUser({ password })` fails (e.g. Supabase error: weak password, rate limit, or session invalid).  
  - Form submit handler not bound (e.g. `authSetPasswordForm` or `authState.supabase` null).  
  - Error message not visible (e.g. `#authSetPasswordError` hidden or not updated).
- **How to verify:**  
  - When set-password form is visible, open DevTools → Console and Network. Submit the form with a valid password (e.g. 8+ chars). Check for (1) any JS error in console, (2) any request to Supabase or your backend and its response, (3) whether `#authSetPasswordError` gets text.  
  - In app.js, confirm that the submit handler (~9889) runs (e.g. temporary `console.log` at start of handler) and that `authState.supabase` is set when the handler runs.

### H3: Set-password succeeds but user stays on login view or is redirected to sign-in

- **Possible causes:**  
  - After `updateUser`, session is not refreshed or `setAuthFromSession` not called, so `authState.token` is stale or null and first-view logic or `onAuthStateChange` sends user back to login.  
  - `switchView('view-canvas')` is not called or fails (e.g. error before it).  
  - Another listener (e.g. `onAuthStateChange` with `!authState.token`) runs after success and redirects to login.
- **How to verify:**  
  - After submitting a new password, check console for errors and confirm `switchView('view-canvas')` is reached (temporary log). Check `authState.token` and current view immediately after `updateUser` success in the submit handler.

### H4: Hash / redirect: link doesn’t open the app or hash is stripped

- **Possible causes:**  
  - Site URL or Redirect URL in Supabase points to a different origin; link opens there and the app never receives the token.  
  - Redirect goes to app but with query params instead of hash, or hash is stripped by a redirect or server.  
  - SPA / server: for routes like `/` or `/login`, the server must serve `index.html` so the client can read the hash; otherwise the hash may be lost.
- **How to verify:**  
  - Click the invite (or forgot-password) link and note the **exact** URL in the address bar (including `#...`). Confirm it is your app’s origin and that the hash is present. If the URL has no hash or is a different site, fix Supabase URL configuration (see TROUBLESHOOTING “Forgot password / invite: set-password form does not show”).

### H5: Init order / race: login view chosen before session from hash exists

- **Possible causes:**  
  - `authReady.then(…)` or equivalent runs and chooses `view-login` because `authState.token` is null; only **after** that does Supabase process the hash and call `onAuthStateChange`. So we show login and never re-run “show set-password” when the event fires.  
  - `getSession()` is called but the client hasn’t parsed the hash yet, so getSession returns null; we never show set-password.
- **How to verify:**  
  - Add temporary logging: in `initAuth`, after `getSession().then(...)`, log `authState.token` and the current URL hash. In `onAuthStateChange`, log `event` and `session`. See if the event fires **after** the initial view is set and whether we need to show set-password when we already chose `view-login` (e.g. in the same callback when `event === 'PASSWORD_RECOVERY'` we already switch to `view-login` at the top of the callback when `!authState.token` – so we might be switching to login **and then** showing the form; confirm in the code that both happen and that the form is visible).

---

## 4. Quick checks in the next chat (no code changes)

1. **Confirm event used for set-password:** In `frontend/app.js`, search for `PASSWORD_RECOVERY`. Verify we only show `#authSetPasswordForm` when `event === 'PASSWORD_RECOVERY'`. Check Supabase docs or code for whether invite links emit `PASSWORD_RECOVERY` or another event (e.g. `SIGNED_IN`); if they use a different event, we may need to show the set-password form for that event too (and possibly detect “needs password” from session or URL).  
2. **Confirm init order:** In `init()`, find where `authReady` / `initAuth()` is used and where the first view is set (e.g. `authState.token ? 'view-canvas' : 'view-login'`). Trace whether `onAuthStateChange` can run **after** that and still update the UI (show set-password) when the URL has a recovery hash.  
3. **Reproduce and capture:** Have the user (or tester) open the invite link, and before interacting, capture: full URL (with hash), and console logs for `onAuthStateChange` (event + session). Use that to confirm or rule out H1 and H5.

---

## 5. Suggested implementation fixes (only after confirming cause)

- **If invite doesn’t emit `PASSWORD_RECOVERY`:** Handle the event that Supabase actually sends for invite (e.g. check for a “recovery” or “invite” type in the URL/session, or another event name), and in that branch show the same set-password UI (hide sign-in form, show `#authSetPasswordForm`).  
- **If hash is present but session/event comes later:** Ensure that when `onAuthStateChange` fires with `PASSWORD_RECOVERY` (or the correct invite event), we **always** switch to `view-login` (if not already) and then show the set-password form, so that a late event still updates the UI.  
- **If submit fails:** Surface the exact error from `updateUser` in `#authSetPasswordError` (and in console for debugging) so the user and you can see Supabase’s message.  
- **If view doesn’t switch after success:** After `updateUser` success, explicitly call `setAuthFromSession(session, ...)` with the latest session if the client returns it, then `switchView('view-canvas')`.

---

## 6. Related docs

- **docs/LOGIN_AND_ACCOUNT_CREATION_MAP.md** – High-level flows and file/line refs for login, invite, set-password.  
- **TROUBLESHOOTING.md** – “Forgot password / invite: set-password form does not show after clicking link” (Site URL, redirect, hash handling).  
- **TROUBLESHOOTING.md** – “Invite / auth emails send users to localhost:3000” (Site URL / Redirect URL).

---

## 7. Outcome to document after fix

Once the root cause is found and fixed, add a short note here or in TROUBLESHOOTING.md with: (1) cause, (2) fix (file and change), (3) how to verify (e.g. “Send invite, open link in incognito, set password, then sign in again with that password”).
