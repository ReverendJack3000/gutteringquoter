# QA Audit Report: Section 59.17.1 — Bonus Admin view shell and entry

**Date:** 2026-02-24  
**Branch:** feature/section-59-cron-sync  
**Scope:** Implementation of 59.17.1 (view shell, profile menu item, switchView guard, redirect)  
**Auditor role:** Strict Senior QA Engineer (UI/UX and production constraints)

---

## 1. Executive summary

| Outcome | Status |
|--------|--------|
| **Desktop vs. mobile** | **PASS** — Bonus Admin is desktop-only; mobile and technician bonus flows unchanged. |
| **Railway / deploy** | **PASS** — No new env, no backend changes, same run-server.sh. |
| **UI/UX standards** | **PASS with 1 fix** — One user-facing string contains a task reference; should be removed before production. |
| **Task completion** | **PASS** — 59.17.1 scope fully implemented and correctly marked in section file. |

**Recommendation:** Fix the placeholder copy (remove task reference). No blocking issues for merge; one non-blocking UX fix and one pre-existing a11y note.

---

## 2. Desktop vs. mobile production environments

### 2.1 Constraint

Bonus Admin must be **desktop-only**. Mobile production UI and technician bonus view must be **unchanged**.

### 2.2 Verification

| Check | Result | Evidence |
|-------|--------|----------|
| Menu item visibility | **PASS** | `updateBonusAdminMenuVisibility()` sets `menuItemBonusAdmin.hidden = !canAccessDesktopAdminUi()`. `canAccessDesktopAdminUi()` requires `isDesktopViewport()` (i.e. `layoutState.viewportMode !== 'mobile'`). On mobile the item is hidden. |
| Profile entry point on mobile | **PASS** | `body[data-viewport-mode="mobile"] #userProfileWrap { display: none !important }` (styles.css ~2059). Avatar and dropdown are not shown on mobile; Bonus Admin is not reachable. |
| switchView guard | **PASS** | If `viewId === 'view-bonus-admin' && !canAccessDesktopAdminUi()`, a message is shown and the function returns without showing the view (app.js ~14559–14565). |
| Redirect when access is lost | **PASS** | `syncAdminDesktopAccess()` includes a block for `getVisibleViewId() === 'view-bonus-admin' && !canAccessDesktopAdminUi()`: redirects to canvas (or login if no token) and shows an explanatory message (app.js ~12640–12654). |
| When redirect runs | **PASS** | `syncAdminDesktopAccess()` is invoked from `applyViewportMode()` when viewport mode **changes** (app.js ~11877, ~11890). So if a user is on Bonus Admin and resizes to mobile (or mode flips), they are redirected. It is also called on auth state change (setAuthUI). |
| Technician bonus view | **PASS** | No code changes in `#view-technician-bonus`, technician bonus handlers, or `canAccessTechnicianBonusView()`. |
| CSS scope | **PASS** | All new styles are under `#view-bonus-admin` (e.g. `#view-bonus-admin .bonus-admin-view-container`). No global or mobile-specific overrides; technician-bonus and permissions styles untouched. |

**Conclusion:** Desktop-only behaviour is correctly enforced. Mobile production is unaffected.

---

## 3. Railway deployment safety

### 3.1 Constraint

No new required env vars; deployment via `./scripts/run-server.sh` / Railway unchanged.

### 3.2 Verification

| Check | Result | Evidence |
|-------|--------|----------|
| Backend changes | **PASS** | No new routes, no changes to main.py for 59.17.1. |
| New environment variables | **PASS** | None introduced. |
| Build / static pipeline | **PASS** | Frontend remains vanilla HTML/CSS/JS; no new build step or dependency. |
| Run script | **PASS** | README and run-server.sh unchanged; no references to Bonus Admin in startup. |

**Conclusion:** Safe for existing Railway and run-server.sh deployment.

---

## 4. UI/UX practice standards

### 4.1 Accessibility

| Check | Result | Evidence / note |
|-------|--------|-----------------|
| Landmark / region | **PASS** | `#view-bonus-admin` has `role="region"` and `aria-label="Bonus admin"`. Main has `aria-label="Bonus admin content"`. |
| Back button | **PASS** | `id="btnBonusAdminBackToCanvas"`, `aria-label="Back to Canvas"`, `<button type="button">`. |
| Focus on view enter | **PASS** | `getPrimaryViewFocusTarget('view-bonus-admin')` returns the Back button (app.js ~14521–14522). Focus is applied after view switch (switchView focus path). |
| Menu item semantics | **PASS** | New item has `role="menuitem"` and is inside `role="menu"`; label "Bonus Admin" is clear. |

**Pre-existing (not introduced by 59.17.1):** Profile dropdown menu items are `<div>` with `role="menuitem"` and no `tabindex`; they are not in the tab order. Keyboard users can open the menu via the avatar (which has `tabindex="0"` and key activation) but cannot move focus between menu items via Tab or arrow keys. This matches User Permissions and My Bonus. **Recommendation:** Future a11y improvement: add roving tabindex or arrow-key handling for the profile menu (out of scope for 59.17.1).

### 4.2 User-facing copy — **FIX REQUIRED**

| Check | Result | Evidence |
|-------|--------|----------|
| Placeholder text | **FAIL** | In index.html: `<p class="bonus-admin-placeholder">Select a period to manage (59.17.2).</p>`. The segment **(59.17.2)** is a task identifier and must not appear in production UI. |

**Required fix:** Replace with user-facing copy only, e.g. **"Select a period to manage."** or **"No period selected. Choose a period from the dropdown above."** (the second can be used once 59.17.2 adds the dropdown).

### 4.3 Consistency with existing admin views

| Check | Result | Evidence |
|-------|--------|----------|
| Layout pattern | **PASS** | Same structure as User Permissions: container → header (left: Back, centre: title, right: actions). Bonus Admin right is empty for 59.17.1, which is acceptable. |
| Message tone | **PASS** | "Bonus Admin is available on desktop only." / "Only admin users can access Bonus Admin." matches the pattern used for User Permissions. |
| Back behaviour | **PASS** | Back goes to canvas with `triggerEl` for focus/history, consistent with permissions view. |

### 4.4 Plan deviation (minor)

Plan file touch map for 59.17.1 listed styles.css as "—" (no CSS). Implementation added scoped rules under `#view-bonus-admin` for layout (container, header, main, placeholder). **Assessment:** Acceptable. Rules are scoped and avoid broken layout; they do not affect other views or mobile. No change required.

---

## 5. Implementation vs. task definition

### 5.1 Task 59.17.1 (section-59.md)

- Add `#view-bonus-admin` — **Done.**  
- Profile menu item “Bonus Admin” (admin-only) — **Done.** (`menuItemBonusAdmin`, `hidden`, visibility via `canAccessDesktopAdminUi()`).  
- Wire `switchView('view-bonus-admin')` — **Done.** (menu click handler).  
- Guard so only admin can open — **Done.** (guard in switchView + menu click check).  
- Redirect non-admin/mobile — **Done.** (redirect block in `syncAdminDesktopAccess()`).

### 5.2 Section file

59.17.1 is marked `[x]` in docs/tasks/section-59.md. 59.17 remains unchecked (59.17.2–59.17.7 open). Correct per task-list-completion rules.

### 5.3 TASK_LIST.md

Section 59 row still shows remaining 59.17 (59.17.1–59.17.7) and 59.24. No change needed until the whole of 59.17 is complete.

---

## 6. Edge cases and regressions

| Scenario | Result | Notes |
|----------|--------|------|
| Non-admin opens Bonus Admin (desktop) | Handled | switchView guard shows "Only admin users can access Bonus Admin." and returns. |
| Mobile user somehow triggers view-bonus-admin | Handled | Guard blocks; menu item hidden; avatar hidden on mobile. |
| Admin on Bonus Admin, viewport switches to mobile | Handled | `applyViewportMode` → `syncAdminDesktopAccess` → redirect to canvas + message. |
| Session lost while on Bonus Admin | Handled | Same redirect block: no token → switch to login. |
| Missing DOM elements | Safe | `getElementById` checks and optional chaining used; init uses `dataset.bonusAdminBound` to avoid duplicate listeners. |
| User Permissions / My Bonus | No regression | No changes to their handlers, visibility, or view logic. |

---

## 7. Findings summary

| ID | Severity | Finding | Action |
|----|----------|---------|--------|
| 1 | **Medium (UX)** | Placeholder text includes "(59.17.2)" in production UI. | Replace with "Select a period to manage." (or equivalent user-only copy). |
| 2 | **Info** | Profile menu items (including Bonus Admin) lack keyboard focus/arrow navigation; same as existing items. | Log for future a11y; no change required for 59.17.1. |

---

## 8. Sign-off

- **Desktop vs. mobile:** Implementation respects desktop-only and leaves mobile and technician bonus unchanged.  
- **Railway / deploy:** No new env or backend; deployment path unchanged.  
- **UI/UX:** One required copy fix (remove task reference); otherwise consistent and accessible within existing patterns.  
- **Task completion:** 59.17.1 is fully implemented and correctly reflected in the section file.

**Recommendation:** Apply the placeholder copy fix, then treat 59.17.1 as complete for production from a QA perspective.
