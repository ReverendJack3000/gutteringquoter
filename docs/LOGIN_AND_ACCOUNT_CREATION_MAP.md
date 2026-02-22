# Login and account creation – flow and file map

Map for improving the login/account-creation experience for non-technical staff. Key files and line references so the next chat can make the flow as seamless as possible.

---

## 1. High-level flows

| Flow | Trigger | Outcome |
|------|--------|--------|
| **Sign in (password)** | User submits email + password on login view | Supabase `signInWithPassword` → session → `switchView('view-canvas')` |
| **Sign in (passkey)** | User clicks “Sign in with Passkey” | Supabase passkey/WebAuthn → session → `switchView('view-canvas')` |
| **Create account (self-sign-up)** | User clicks “Create account” on login view | Supabase `signUp` with same email/password → session → `switchView('view-canvas')` + success message |
| **Invite (admin)** | Admin sends invite from User Permissions | Backend `invite_user_by_email` → Supabase sends invite email → invitee sets password via link |
| **Forgot password** | User clicks “Forgot password?” | Supabase `resetPasswordForEmail` → user gets email → link back to app |
| **Set password (recovery / invite)** | User lands from magic link (e.g. PASSWORD_RECOVERY or invite) | `#authSetPasswordForm` shown → `updateUser({ password })` → then `switchView('view-canvas')` |
| **Sign out** | User clicks “Sign out” (login view or profile) | `clearAuthState()` + Supabase `signOut()` + `switchView('view-login')` |
| **First view on load** | After `initAuth()` resolves | If `authState.token` → `view-canvas`, else → `view-login` |

---

## 2. Frontend – HTML (login view and invite)

| Purpose | File | Lines / IDs |
|--------|------|-------------|
| Login view container | `frontend/index.html` | `#view-login` (line ~370), `.view-login-inner` |
| Login form | `frontend/index.html` | `#authForm` (~376), `#authEmail`, `#authPassword` (~377–380) |
| Sign in / Create account / Passkey | `frontend/index.html` | `#authSubmitBtn` (submit), `#authSignUpBtn`, `#authPasskeyBtn` (~382–384) |
| Error and hints | `frontend/index.html` | `#authError` (~374), `#authPasskeyHint` (~385) |
| Forgot password | `frontend/index.html` | `#authForgotPasswordBtn` (~386–387) |
| Set-password form (recovery/invite) | `frontend/index.html` | `#authSetPasswordForm` (~390–401), `#authNewPassword`, `#authNewPasswordConfirm`, `#authSetPasswordBtn`, `#authSetPasswordCancelBtn` |
| Signed-in block on login view | `frontend/index.html` | `#authUserSection` (~403–406), `#authUserEmail`, `#authSignOutBtn` |
| Invite user modal (admin) | `frontend/index.html` | `#inviteUserModal` (~606–623), `#inviteUserEmail`, `#inviteUserRole`, `#inviteUserError`, `#inviteUserSubmitBtn`, `#inviteUserCancelBtn` |
| Legacy auth modal | `frontend/index.html` | `#authModal` (~654–657) – not primary; login is in `#view-login` |

---

## 3. Frontend – CSS (login view and mobile)

| Purpose | File | Lines |
|--------|------|--------|
| Login view layout | `frontend/styles.css` | `#view-login`, `.view-login-inner`, `.view-login-logo` (~3203–3225) |
| Mobile login (safe area, 44px targets) | `frontend/styles.css` | `body[data-viewport-mode="mobile"] #view-login` and related (~3228–3263) |
| Mobile typography / spacing | `frontend/styles.css` | `body[data-viewport-mode="mobile"] #view-login .auth-modal-title` etc. (~3266–3284) |

---

## 4. Frontend – JS (auth init and login flows)

| Purpose | File | Lines / function |
|--------|------|-------------------|
| Auth state and helpers | `frontend/app.js` | `authState` (~97), `getAuthHeaders` (~102), `setAuthFromSession` (~142), `clearAuthState` (~149) |
| Init auth (config, Supabase client, UI, listeners) | `frontend/app.js` | `initAuth()` ~9543–9924 |
| Login form elements (in initAuth) | `frontend/app.js` | `authForm`, `authEmail`, `authPassword`, `authSubmitBtn`, `authSignUpBtn`, `authError`, `authUserSection`, `authSignOutBtn` ~9576–9586 |
| setAuthUI (show/hide form vs signed-in block) | `frontend/app.js` | `setAuthUI()` ~9609–9628 |
| setAuthUIRef (for handleAuthFailure) | `frontend/app.js` | `setAuthUIRef = setAuthUI` ~9661 |
| **Form submit → sign in (password)** | `frontend/app.js` | `authForm.addEventListener('submit', …)` ~9731–9751; `signInWithPassword` ~9738 |
| **Passkey sign-in** | `frontend/app.js` | `authPasskeyBtn.addEventListener('click', …)` ~9753–9798; `getPasskeySignInFn` ~9577–9583, `signInWithPasskey` / `signInWithWebAuthn` |
| **Create account (sign-up)** | `frontend/app.js` | `authSignUpBtn.addEventListener('click', …)` ~9802–9818; `signUp` ~9808 |
| **Sign out (from login view)** | `frontend/app.js` | `authSignOutBtn.addEventListener('click', …)` ~9821–9826 |
| **Forgot password** | `frontend/app.js` | `authForgotPasswordBtn.addEventListener('click', …)` ~9835–9854; `resetPasswordForEmail` ~9847, `redirectTo` = `${origin}/` |
| **Set password form (recovery/invite)** | `frontend/app.js` | `authSetPasswordForm.addEventListener('submit', …)` ~9855–9884; `updateUser({ password })` ~9872; cancel ~9886–9892 |
| **Auth state listener** (session change, PASSWORD_RECOVERY) | `frontend/app.js` | `onAuthStateChange` ~9910–9922; PASSWORD_RECOVERY shows `#authSetPasswordForm` ~9915–9921 |
| **Restore session on load** | `frontend/app.js` | `getSession()` in initAuth ~9923–9930 |
| **Fetch config (Supabase URL + anon key)** | `frontend/app.js` | `fetch('/api/config')` ~9898 |
| **First view after auth ready** | `frontend/app.js` | `authReady.then(…)` in `init()` ~13426–13438; `authState.token` → `view-canvas` else `view-login` |
| **Focus targets for view-login** | `frontend/app.js` | `getPrimaryViewFocusTarget('view-login')` ~13252–13261 (email, submit, or sign-out) |
| **Redirect to login** (e.g. 401, session null) | `frontend/app.js` | `handleAuthFailure` ~164–172; `switchView('view-login')` in onAuthStateChange ~9910; syncAdminDesktopAccess ~12260–12263 |

---

## 5. Frontend – invite flow (admin)

| Purpose | File | Lines |
|--------|------|--------|
| Invite modal open | `frontend/app.js` | `openAccessibleModal('inviteUserModal', …)` ~12579 |
| Invite submit (POST invite) | `frontend/app.js` | `inviteSubmitBtn` click ~12586–12618; `fetch('/api/admin/user-permissions/invite', …)` ~12600 |
| Invite modal registration (a11y) | `frontend/app.js` | `inviteUserModal` in modal registry ~13048–13052 |

---

## 6. Backend – config and auth

| Purpose | File | Lines |
|--------|------|--------|
| Public config (Supabase URL, anon key, PWA) | `backend/main.py` | `GET /api/config` ~366–372 |
| JWT validation and role | `backend/app/auth.py` | `get_validated_payload`, `get_current_user_id`, `require_role`; 401/403 on invalid or forbidden |

---

## 7. Backend – invite

| Purpose | File | Lines |
|--------|------|--------|
| Invite by email (admin only) | `backend/main.py` | `POST /api/admin/user-permissions/invite` ~475–531 |
| Behaviour | `backend/main.py` | `supabase.auth.admin.invite_user_by_email(email)` ~500; then upsert `public.profiles` with `user_id` + `role` ~507–511 |
| Invite email | Supabase | Supabase sends the invite email (magic link / set-password); redirect URL is controlled by Supabase project settings (e.g. Site URL). App uses `redirectTo` in frontend only for password reset (~9846). |

---

## 8. Cross-cutting behaviour

- **Role after sign-in:** Role comes from JWT / `app_metadata` (e.g. set by Supabase hook from `public.profiles`). See `frontend/app.js` `deriveAuthRole` ~125–139 and backend `require_role` in `app/auth.py`.
- **Where login view is shown:** When not logged in (initial load, after sign-out, on 401/403 redirect, or when on User Permissions with no token). No separate “account creation” view – same `#view-login` with “Create account” button.
- **Invitee journey:** Admin invites by email → invitee receives Supabase email → clicks link → lands on app (e.g. PASSWORD_RECOVERY or invite confirmation) → sets password in `#authSetPasswordForm` → then can use app.

---

## 9. Suggested improvement areas (for next chat)

- **Clarity for staff:** Copy and layout on `#view-login` (sign in vs create account vs “invited? set password”) so non-technical staff know what to do.
- **Invite flow:** Messaging after “Send invite” (e.g. “They’ll get an email to set their password”), and optional customisation of invite email/redirect in Supabase if needed.
- **Forgot password:** Ensure `redirectTo` and Supabase Site URL align so “set password” lands on the app and shows `#authSetPasswordForm` where appropriate.
- **Errors:** Centralise or soften error copy for `#authError` / `#authSetPasswordError` so failed sign-in/sign-up/set-password are clear and non-technical.
- **Mobile:** Login already has 44px targets and safe areas (~3228–3284 in styles.css); any new buttons or links should match that.

Use this map to locate every touchpoint for login and account creation when making the flow more seamless for staff.
