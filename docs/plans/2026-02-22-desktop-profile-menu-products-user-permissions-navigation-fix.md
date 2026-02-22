# Plan: Fix desktop navigation to Products and User Permissions from profile menu

**Date:** 2026-02-22  
**Scope:** Root cause investigation only; no code changes in this document. Fix will be implemented in a follow-up chat.  
**Symptom:** On desktop, clicking "Product Management" or "User Permissions" in the profile dropdown does not navigate to the corresponding view (view-products, view-user-permissions).

---

## 1. Intended flow

- User (signed in, desktop) clicks the user avatar in the global toolbar → profile dropdown opens (`#profileDropdown`, `role="menu"`).
- User clicks "Product Management" (`#menuItemProducts`) → `switchView('view-products', { triggerEl: userAvatar || menuItemProducts })` should run; all `.app-view` get `.hidden`, `#view-products` has `.hidden` removed; `renderProductLibrary()` runs.
- User clicks "User Permissions" (`#menuItemUserPermissions`) → after `canAccessDesktopAdminUi()` check, `switchView('view-user-permissions', …)` should run; `#view-user-permissions` is shown; `initUserPermissionsView()` and `fetchUserPermissions()` run.

---

## 2. Key file and line references

| Location | Purpose |
|----------|--------|
| **frontend/index.html** | |
| L89–126 | `#userProfileWrap`, `#userAvatar`, `#profileDropdown`; `#menuItemProducts` (no `hidden`), `#menuItemUserPermissions` (has `hidden`, shown by JS when admin + desktop). |
| L410, L557 | `#view-products`, `#view-user-permissions` (`.app-view.hidden`). |
| **frontend/app.js** | |
| L9564 | `initAuth()`: early return `if (!authForm) return Promise.resolve();` — **if this runs, menu listeners below are never attached.** |
| L9653–9658 | `menuItemProducts` click: close dropdown, `switchView('view-products', { triggerEl: … })`. |
| L9660–9672 | `menuItemUserPermissions` click: close dropdown, `canAccessDesktopAdminUi()` guard, then `switchView('view-user-permissions', …)`. |
| L4770–4805 | **Document-level click** in `initGlobalToolbar()`: closes dropdown when `profileDropdown && !profileDropdown.hidden && userProfileWrap && !userProfileWrap.contains(e.target)`. Runs in **bubble** phase. |
| L13106–13158 | `switchView(viewId)`: hides all `.app-view`, shows `getElementById(viewId)`, calls `renderProductLibrary()` for view-products, `initUserPermissionsView()` + `fetchUserPermissions()` for view-user-permissions. |
| **frontend/styles.css** | |
| L695–733 | `.user-profile-wrap` (position: relative), `.profile-dropdown` (position: absolute, z-index: 100), `.profile-dropdown[hidden]` (display: none). |

---

## 3. Root cause (most likely)

**Primary hypothesis: event ordering / dropdown closed before menu handler runs**

- In principle, the menu item’s click handler runs in the bubble phase when the event is at the target, so it should run **before** the document-level click handler. If that holds, the dropdown is closed inside the menu handler and `switchView` is called, so the view should change.
- If in some environments (e.g. touch, or a listener that runs in capture phase and closes the dropdown on `pointerdown`/`mousedown`), the dropdown is closed **before** the `click` event is dispatched, the element under the pointer may change and the `click` could be delivered to a different element (e.g. canvas or workspace), so the menu handler never runs.
- **Mitigation:** Have the profile menu item handlers call `e.stopPropagation()` so the document “close on outside click” handler never sees the click. Ensure no other listener closes the dropdown on `pointerdown`/`mousedown` for clicks that originate inside the dropdown.

**Secondary hypothesis: z-index / stacking**

- `.profile-dropdown` has `z-index: 100`; `.global-toolbar-wrap` and `.toolbar-floating` also use `z-index: 100`. If another sibling or descendant of `#view-canvas` (e.g. workspace/main) creates a stacking context with a higher or overlapping z-index, the dropdown could be painted behind it and the click could hit the wrong element.
- **Mitigation:** Give the profile dropdown a z-index high enough to sit above all canvas/workspace UI (e.g. 1000 or a shared overlay scale) when open.

**Tertiary: initAuth early return**

- If `document.getElementById('authForm')` is null when `initAuth()` runs (e.g. DOM not ready, or different build), the function returns at L9564 and the code that attaches the profile menu listeners (L9643–9672) is never executed, so clicks on the menu items do nothing.
- **Mitigation:** Ensure profile/menu setup runs even when `authForm` is missing (e.g. move the early return to after the profile dropdown and menu item listener setup, or gate only the auth-form-specific logic).

---

## 4. Recommended fix (for implementation in next chat)

1. **Menu item handlers:** In both `menuItemProducts` and `menuItemUserPermissions` click handlers, call `e.stopPropagation()` after closing the dropdown and before `switchView(...)`, so the document-level click handler does not run for these in-dropdown clicks.
2. **Document handler:** In the document click handler (L4799), add an explicit check: if `profileDropdown.contains(e.target)` then do not set `profileDropdown.hidden = true` (defensive, in addition to `userProfileWrap.contains(e.target)`).
3. **Z-index:** Increase `.profile-dropdown` z-index (e.g. to 1000 or a variable like `--z-dropdown`) so the dropdown is clearly above the canvas/workspace when open.
4. **initAuth:** Verify that the early return at L9564 does not skip the profile menu listener attachment; if it can run before the listeners are attached, move the return or the listener block so that the profile dropdown and menu item listeners are always attached when the profile DOM exists.
5. **Manual test:** On desktop, sign in, open profile dropdown, click “Product Management” then “Back to Canvas,” then open dropdown and click “User Permissions” (as admin), and confirm both views appear and return focus/back works.

---

## 5. Implementation checklist (100% code-accurate, no assumptions)

**Scope:** Desktop only. Mobile profile UI is separate; no changes to mobile. Railway deploy must remain successful (no new dependencies or build steps).

### 5.1 app.js – Menu item click handlers (add `e.stopPropagation()`)

- **menuItemProducts** (current handler at app.js ~9651–9657): Handler signature is `() => { ... }`. Change to `(e) => { ... }`. After closing the dropdown and setting `userAvatar.setAttribute('aria-expanded', 'false')`, call `e.stopPropagation()` before `switchView('view-products', ...)`.
- **menuItemUserPermissions** (current handler at app.js ~9658–9672): Same: change to `(e) => { ... }`, and after closing dropdown and (if applicable) the `canAccessDesktopAdminUi()` guard block, call `e.stopPropagation()` before `switchView('view-user-permissions', ...)`.

### 5.2 app.js – Document click handler in `initGlobalToolbar()` (defensive check)

- **Location:** app.js ~4797–4802. Current condition:  
  `if (profileDropdown && !profileDropdown.hidden && userProfileWrap && !userProfileWrap.contains(e.target))`.
- **Change:** Add `&& !profileDropdown.contains(e.target)` so the dropdown is not closed when the click target is inside the dropdown (defensive; `profileDropdown` is inside `userProfileWrap`, so this reinforces the same case).

### 5.3 styles.css – Profile dropdown z-index

- **Location:** frontend/styles.css line ~726, rule `.profile-dropdown`.
- **Current:** `z-index: 100;`
- **Change:** Set to `z-index: 1000;` so the dropdown stacks above toolbar/canvas/workspace (project uses raw z-index values; 1000 is used elsewhere and is safe).

### 5.4 app.js – initAuth() early return vs profile menu listeners

- **Current:** At app.js ~9564, `if (!authForm) return Promise.resolve();` runs before the block that attaches profile dropdown and menu item listeners (~9643–9672). If `authForm` is null, those listeners are never attached.
- **Verification:** `#authForm` exists in index.html at line 376; init() calls initAuth() at app.js 13257 after DOM inits, so in normal load authForm is present. For robustness:
  - **Option A (recommended):** Move the early return to after the profile/menu listener block: run the listener attachment (userAvatar, menuItemProducts, menuItemUserPermissions, menuItemSignOut) whenever `userProfileWrap` and related elements exist; then `if (!authForm) return Promise.resolve();` before any auth-form-specific code (e.g. setAuthUI, setPasswordAutocompleteMode, authForm.addEventListener('submit', ...)).
  - **Option B:** Gate only the auth-form-specific logic with `if (authForm) { ... }` and keep the early return but move the profile/menu block above it so it always runs when the profile DOM exists.
- **Implement:** Ensure the block at ~9643–9672 (and the preceding bindButtonLikeKeyActivation / userAvatar click) runs regardless of `authForm`; only auth-form-specific code (form submit, setAuthUI usage of authForm, etc.) is skipped when `authForm` is null.

### 5.5 Manual test (desktop, no code)

1. Desktop viewport (or `?viewport=desktop`).
2. Sign in.
3. Open profile dropdown (click user avatar).
4. Click “Product Management” → must show Product Library view (#view-products); “Back to Canvas” returns to canvas.
5. Open profile dropdown again; click “User Permissions” (as admin) → must show User Permissions view (#view-user-permissions); back works.
6. Confirm no regression: Sign out, Accessibility menu item, other profile items still work.

### 5.6 Assumptions verified against codebase

- `switchView('view-products')` and `switchView('view-user-permissions')` exist and behave as in plan (app.js 13106–13158); no change needed.
- `#view-products` and `#view-user-permissions` exist in index.html (lines 410, 557).
- Document listener is in `initGlobalToolbar()`, bubble phase; no capture-phase listener closes the dropdown.
- No new env vars or build steps; Railway deployment unchanged.

---

## 6. Out of scope

- Mobile behaviour (profile dropdown is different on mobile; this plan is desktop-only).
- Changing when User Permissions menu item is shown (it remains gated by `canAccessDesktopAdminUi()`).
