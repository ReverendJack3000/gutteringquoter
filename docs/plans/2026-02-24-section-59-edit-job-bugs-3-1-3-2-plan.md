# Plan: Edit Job Form & Redirect Bugs (3.1, 3.2)

**Date:** 2026-02-24  
**Source:** QA audit (docs/audits/2026-02-24-section-59-17-2-to-59-17-5-qa-audit.md)  
**Scope:** Bonus Admin Edit job modal only. No backend changes. Railway-safe (frontend-only).

---

## 1. Goal

- **3.1** Prevent Enter in the Edit job form from causing a submit (and possible page reload / state loss).
- **3.2** When leaving Bonus Admin (redirect from `view-bonus-admin` to `view-canvas` or `view-login` in `syncAdminDesktopAccess`), close the Edit job modal and clear `bonusAdminEditJobId` so the modal does not stay open over the canvas.

---

## 2. Verified Code Facts (no assumptions)

### 3.1 — Edit job form

- **HTML:** `frontend/index.html` lines 819–864: `<form id="bonusAdminEditJobForm">` contains inputs (select, checkbox, text, number). Save and Cancel are **outside** the form in `<div class="auth-actions">` and are `type="button"`.
- **JS:** There is **no** `addEventListener('submit')` on `#bonusAdminEditJobForm` in `frontend/app.js`. Save is wired only via `bonusAdminEditJobSaveBtn` click (app.js ~12930); Cancel via `bonusAdminEditJobCancelBtn` (~12934).
- **Behaviour:** In many browsers, pressing Enter in a form control can trigger implicit form submit. This form has no `action` and no submit handler, so submit can cause a full page reload and state loss. Same pattern is already handled elsewhere in the app (e.g. `authForm`, `authSetPasswordForm`, `productForm`) with `form.addEventListener('submit', e => { e.preventDefault(); ... })`.

### 3.2 — Redirect from Bonus Admin

- **Location:** `syncAdminDesktopAccess()` in `frontend/app.js` (lines 12957–13015).
- **view-bonus-admin block:** Lines 12987–13000. When `getVisibleViewId() === 'view-bonus-admin' && !canAccessDesktopAdminUi()`:
  - If **no token:** `closeAllModals({ restoreFocus: false }); switchView('view-login');` — modals are closed, but `bonusAdminEditJobId` is **not** cleared.
  - If **token present:** `switchView('view-canvas', ...)` only — **no** `closeAccessibleModal('bonusAdminEditJobModal')` and **no** clearing of `bonusAdminEditJobId`. So the Edit job modal can remain open over the canvas.
- **Comparison:** For `view-user-permissions` and `view-technician-bonus`, the no-token branch uses `closeAllModals` before redirect; the with-token branch does not close any modal. The bug is specific to Bonus Admin because the Edit job modal is Bonus-Admin–scoped and should be closed whenever we leave that view.

---

## 3. Desktop vs Mobile Impact

- **3.1:** Affects any user who can open the Edit job form (in practice desktop-only, since Bonus Admin redirects on mobile). Fix is in shared form/modal code; desktop and mobile behaviour stay consistent.
- **3.2:** Affects the case where a user is on Bonus Admin (desktop) with the Edit job modal open and then viewport becomes mobile (or role changes), so `syncAdminDesktopAccess` redirects to canvas. Fix is inside `syncAdminDesktopAccess`; no separate mobile path. Desktop production UI unchanged except that redirects away from Bonus Admin will now always close the Edit job modal and clear state.

---

## 4. Implementation Plan (100% aligned to codebase)

### 4.1 — Fix 3.1 (Enter submit)

- **File:** `frontend/app.js`
- **Where:** In the same init block that binds Save/Cancel for the Edit job modal (around 12927–12938), get `#bonusAdminEditJobForm` and add a `submit` listener:
  - `e.preventDefault()`.
  - Call the same save path as the Save button (e.g. `void saveBonusAdminEditJob()`).
- **Alternative (not chosen):** Replace `<form>` with a `<div>` in `index.html`. Rejected because the project already uses form + submit + preventDefault elsewhere (auth, product form); keeping the form and adding the handler is consistent and preserves semantics.

### 4.2 — Fix 3.2 (Close modal and clear ID on redirect)

- **File:** `frontend/app.js`
- **Where:** Inside `syncAdminDesktopAccess`, in the `view-bonus-admin` block (12987–13000):
  - In the **no-token** branch (before or after `closeAllModals`): set `bonusAdminEditJobId = null` so state is cleared even though `closeAllModals` already closes the modal.
  - In the **with-token** branch (before `switchView('view-canvas', ...)`): call `closeAccessibleModal('bonusAdminEditJobModal')` and set `bonusAdminEditJobId = null`.
- **Result:** Whenever we leave Bonus Admin due to lost desktop admin access, the Edit job modal is closed (either via `closeAllModals` or explicitly) and `bonusAdminEditJobId` is always cleared.

---

## 5. Edge Cases & Accessibility

- **3.1:** Submitting via Enter will now trigger the same save flow as the Save button (validation, API call, success/error message, modal close on success). No new focus or keyboard traps; existing modal focus behaviour unchanged.
- **3.2:** If for any reason the Edit job modal is not in the modal stack when we redirect, `closeAccessibleModal('bonusAdminEditJobModal')` is idempotent (safe to call). Clearing `bonusAdminEditJobId` is always safe.

---

## 6. Railway & Deployment

- Frontend-only changes; no new env vars, no backend, no new dependencies. Existing `./scripts/run-server.sh` and Railway deployment (Procfile / nixpacks.toml) unchanged.

---

## 7. Task List Update (after implementation)

- In **docs/tasks/section-59.md**: mark **59.17.1.1** and **59.17.5.1** as complete (`[x]`).
- No change to **TASK_LIST.md** uncompleted table unless section 59 row is updated to explicitly list 59.17.1.1 / 59.17.5.1 (optional).
