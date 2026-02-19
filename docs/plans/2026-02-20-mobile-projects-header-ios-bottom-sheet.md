# Mobile Projects Header + iOS Bottom Sheet Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** On mobile only, unhide and position the "Projects / Untitled" header in the top-left, and replace the diagram menu with an iOS-style bottom sheet (slide-up, drag handle, Apple HIG list and delete UI). Desktop behaviour stays unchanged.

**Architecture:** All changes are scoped to mobile via `body[data-viewport-mode="mobile"]` (and/or `layoutState.viewportMode === 'mobile'` in JS). Breakpoint: `MOBILE_LAYOUT_BREAKPOINT_PX = 980` in `frontend/app.js`. No Tailwind; vanilla CSS. Reuse existing diagram list logic (`refreshDiagramsList`, `createDiagramItem`) and the shared modal/focus utilities where applicable.

**Tech Stack:** Vanilla HTML/CSS/JS; existing `openAccessibleModal` / focus trap; `showAppConfirm` for delete confirmation; `GET /api/diagrams`, `GET /api/diagrams/{id}`, `DELETE /api/diagrams/{id}`.

---

## Key codebase references (no assumptions)

- **Header / dropdown (HTML):** `frontend/index.html` lines 26–39: `.toolbar-left` → `.toolbar-breadcrumbs-wrap` → `#toolbarBreadcrumbsNav` (Projects / + `#toolbarProjectNameInput`), `#projectHistoryDropdownBackdrop`, `#projectHistoryDropdown` (class `project-history-dropdown diagrams-dropdown`) with header "Saved diagrams", `#projectHistoryDropdownList`, `#projectHistoryDropdownEmpty`. Clock icon: `#diagramsDropdownBtn` opens `#diagramsDropdown` (lines 57–66).
- **JS:** `frontend/app.js` `initDiagrams()` (from ~8180): breadcrumb click → `openProjectHistoryDropdown()`; clock click → shows `#diagramsDropdown`. Both use `refreshDiagramsList()` which fills both `#projectHistoryDropdownList` and `#diagramsDropdownList` via `createDiagramItem(item)`. Delete uses `showAppConfirm(..., { destructive: true })` then `DELETE /api/diagrams/{id}`. Viewport: `layoutState.viewportMode`, `detectViewportMode()`, `applyViewportMode()`; `MOBILE_LAYOUT_BREAKPOINT_PX = 980`.
- **CSS:** `frontend/styles.css`: `body[data-viewport-mode="mobile"] .toolbar-breadcrumbs` (1658), `.toolbar-breadcrumbs` (328), `.project-history-dropdown` (295–314: on mobile already full-screen fixed); `.diagrams-dropdown` (2941), `.diagram-item-wrap` / `.diagram-item` / `.diagram-item-delete` (2976–3055). Products panel bottom sheet: 1684–1732 (mobile panel fixed bottom, rounded top, etc.) – reuse patterns, not the same node.
- **Desktop must remain unchanged:** No changes to desktop layout or to behaviour when `layoutState.viewportMode !== 'mobile'` (dropdowns stay as today).

---

## Task 1: Ensure "Projects / Untitled" is visible and primary on mobile (top-left)

**Files:**
- Modify: `frontend/index.html` (breadcrumb area)
- Modify: `frontend/styles.css` (mobile toolbar and breadcrumb)

**Steps:**

1. **Add a mobile-only chevron to the header**  
   In `index.html`, inside `#toolbarBreadcrumbsNav`, after the project name input (or as part of a single tappable label on mobile), add a downward chevron so it’s clear the area opens a menu. Use an inline SVG (e.g. same pattern as panel chevron) with `aria-hidden="true"`, and ensure it’s only visible on mobile (e.g. add a class like `breadcrumb-chevron` and show it only under `body[data-viewport-mode="mobile"]`).

2. **Position and style the header for mobile**  
   In `styles.css`, under `body[data-viewport-mode="mobile"]`:
   - Ensure `.toolbar-left` (or the breadcrumb wrap) is visible and in the top-left of the toolbar (it is not currently hidden on mobile; verify no rule hides it).
   - Style the "Projects / [name]" block as a single tappable area: system font stack (already `-apple-system, BlinkMacSystemFont, ...`), semi-bold for the active project name (e.g. `.breadcrumb-project-input` or a wrapper), and the new chevron visible and aligned. Min touch target for the tappable area: 44px height (per 54.2 / Apple HIG).

3. **Optional: hide or repurpose clock icon on mobile**  
   If design calls for one entry point, hide `#diagramsDropdownBtn` on mobile (e.g. `body[data-viewport-mode="mobile"] .toolbar-diagrams-wrap { display: none }`) so "Projects / Untitled" is the only way to open the diagram list on mobile. If both should open the same bottom sheet, keep the clock visible and wire it in Task 2.

**Verification:** At `?viewport=mobile` or narrow width, the toolbar shows "Projects / Untitled" (or current name) with a downward chevron in the top-left; no desktop-only classes (there are no `hidden md:flex` in this repo – confirm nothing hides the breadcrumb on mobile).

---

## Task 2: Add a mobile-only bottom sheet container and backdrop

**Files:**
- Create or modify: `frontend/index.html` (new container for bottom sheet)
- Modify: `frontend/styles.css` (bottom sheet and backdrop, mobile only)

**Steps:**

1. **Add a dedicated mobile bottom sheet in the DOM**  
   Add a container that is used only when `viewportMode === 'mobile'` for the diagram list. Options:
   - **Option A:** Add a new element, e.g. `#diagramsBottomSheet`, that contains: a backdrop div, and a sheet div with drag handle, "Saved diagrams" title, and a scrollable list container (and empty state). On mobile, when opening the diagram menu, show this bottom sheet and populate the list (same items as current dropdown). On desktop, this element stays hidden and unused.
   - **Option B:** Reuse `#projectHistoryDropdown` and its backdrop on mobile but restyle them as a bottom sheet (position fixed bottom, slide-up, rounded top, drag handle). Risk: same DOM is used for desktop dropdown, so all bottom-sheet styling must be under `body[data-viewport-mode="mobile"]` and not affect desktop.

   Recommended: **Option A** – new `#diagramsBottomSheet` (and inner list container) for mobile only, to avoid any chance of affecting desktop dropdown styling. Desktop continues to use `#projectHistoryDropdown` and `#diagramsDropdown` as today.

2. **Markup for Option A**  
   In `index.html`, e.g. after the global toolbar (or before `#workspaceMain`), add:
   - `#diagramsBottomSheetBackdrop` (backdrop, `hidden` by default).
   - `#diagramsBottomSheet` (the sheet): drag-handle pill, title "Saved diagrams", `#diagramsBottomSheetList` (scrollable), `#diagramsBottomSheetEmpty` (empty state). Use `role="dialog"` and `aria-modal="true"` when open; `aria-label` or `aria-labelledby` for accessibility.

3. **CSS for bottom sheet (mobile only)**  
   Under `body[data-viewport-mode="mobile"]`:
   - Backdrop: fixed inset 0, `background: rgba(0,0,0,0.4)` (bg-black/40), `backdrop-filter: blur(4px)` (backdrop-blur-sm), z-index above canvas/toolbar (e.g. 600), pointer-events when visible.
   - Sheet: fixed left 0 right 0 bottom 0, `background: var(--sheet-bg, #fff)` or `#fff` / system background, `border-radius: 24px 24px 0 0`, box-shadow, z-index above backdrop. Top: small gray pill (e.g. 36px wide, 4px tall, rounded) as drag handle; then title; then scrollable list. Use `max-height` (e.g. 70vh) so sheet doesn’t cover full screen if desired, or match products panel height pattern.

4. **Hide the new bottom sheet on desktop**  
   Default or desktop: `#diagramsBottomSheet`, `#diagramsBottomSheetBackdrop` hidden. On desktop, never show them; only `#projectHistoryDropdown` / `#diagramsDropdown` are used.

**Verification:** At desktop width, new elements are hidden. At mobile, toggling them via JS shows a slide-up sheet with rounded top and pill handle (implementation of open/close animation in Task 3).

---

## Task 3: Wire mobile to open/close bottom sheet and keep desktop dropdown

**Files:**
- Modify: `frontend/app.js` (`initDiagrams()` and any new helpers)

**Steps:**

1. **Detect mobile in initDiagrams**  
   Where breadcrumb and clock are wired, branch on `layoutState.viewportMode === 'mobile'`:
   - **Mobile:** On breadcrumb click (and optionally clock click), do not call `openProjectHistoryDropdown()`. Instead: call `refreshDiagramsList()` and populate the mobile bottom sheet list (`#diagramsBottomSheetList`), show backdrop and sheet, set `aria-expanded` on the trigger, register with modal/focus trap (e.g. `registerAccessibleModal` for the bottom sheet so Escape and focus trap work). On close: hide sheet and backdrop, restore focus to trigger (breadcrumb or clock).
   - **Desktop:** Unchanged: breadcrumb click → `openProjectHistoryDropdown()`; clock click → show `#diagramsDropdown`. No use of `#diagramsBottomSheet` on desktop.

2. **Populate bottom sheet list**  
   Reuse the same data and item structure as current dropdown. Either:
   - Call `refreshDiagramsList()` and duplicate the list into `#diagramsBottomSheetList` (e.g. a second set of list targets in `refreshDiagramsList` when on mobile), or
   - After `refreshDiagramsList()`, clone or re-create items into `#diagramsBottomSheetList` using the same `createDiagramItem(item)` so each row has load and delete behaviour. Ensure `createDiagramItem` (or a mobile-specific variant) builds rows that match the Apple-style layout (Task 4) when rendered inside the bottom sheet.

3. **Close on backdrop tap and Escape**  
   Backdrop click and Escape key close the bottom sheet and restore focus. Use the same modal registry (`modalA11yState`) and `closeAccessibleModal` if the bottom sheet is registered as a modal; otherwise add a dedicated close handler that hides sheet/backdrop and restores focus.

4. **Optional: slide-up / slide-down animation**  
   When showing the sheet, add a CSS transition (e.g. transform translateY(100%) → 0) or a small class-based animation. Respect `prefers-reduced-motion` (existing body class or media query) by disabling the animation when reduced motion is preferred.

**Verification:** Desktop: breadcrumb and clock behave as today. Mobile: tapping "Projects / Untitled" (or clock if kept) opens the bottom sheet with the same diagram list; backdrop tap and Escape close it and focus returns to trigger.

---

## Task 4: Style bottom sheet list and delete like Apple HIG (mobile only)

**Files:**
- Modify: `frontend/styles.css` (mobile bottom sheet list and delete)
- Optionally modify: `frontend/app.js` (`createDiagramItem` or mobile list renderer)

**Steps:**

1. **Row layout and touch targets**  
   For rows inside the mobile bottom sheet (e.g. `.diagrams-bottom-sheet-list .diagram-item-wrap` or a new class):
   - Min height 44px per row (Apple HIG).
   - Flex layout: diagram name on the left (font-size 16px, standard weight, high-contrast text). Optional: keep a small thumbnail on the left; if so, ensure tap target for the row is still ≥ 44px.
   - Bottom border between rows: `1px solid rgba(0,0,0,0.05)`.

2. **Delete control**  
   - Place a trash icon on the far right (trailing edge) of each row. Use an SVG (e.g. trash/bin icon, SF Symbol style) instead of "−" if not already.
   - Color the trash icon Apple system red: `#FF3B30`. Ensure contrast and focus styles (e.g. focus-visible outline).
   - Keep existing delete behaviour: on tap, call `showAppConfirm('Permanently delete...', { destructive: true, ... })`; on confirm, `DELETE /api/diagrams/{id}`, then refresh list. Optionally add a short fade-out or remove the row from DOM before refresh for a smoother feel.

3. **Scoping**  
   All new/overridden styles must be under `body[data-viewport-mode="mobile"]` (and possibly under a class like `.diagrams-bottom-sheet`) so desktop `.diagram-item` and `.diagram-item-delete` styles are unchanged.

**Verification:** On mobile, bottom sheet rows are large, readable, and have 44px min height; delete icon is red (#FF3B30) and on the right; borders between rows are subtle; delete still uses confirmation; desktop list styling unchanged.

---

## Task 5: Accessibility and regression checks

**Files:**
- Modify: `frontend/app.js` (focus, aria, live region if needed)
- Modify: `frontend/styles.css` (focus-visible for new controls)
- Manual / E2E: viewport and desktop regression

**Steps:**

1. **Bottom sheet semantics**  
   When the bottom sheet is open: `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` or `aria-label` ("Saved diagrams" or "Project history"). Ensure the dialog is in the accessibility tree and focus is trapped inside until closed.

2. **Focus**  
   On open: move focus to the first focusable element in the sheet (e.g. first diagram row or a close button). On close: restore focus to the element that opened it (breadcrumb or clock button).

3. **Keyboard and screen reader**  
   Escape closes the sheet; Tab cycles within the sheet. Delete buttons have `aria-label="Delete [diagram name]"` or "Delete this saved project". If the list is long, ensure scrollable region has appropriate semantics.

4. **Desktop regression**  
   Test at desktop width (e.g. 1280px) and with `?viewport=desktop`: breadcrumb opens project history dropdown; clock opens diagrams dropdown; no bottom sheet appears; layout unchanged.

5. **Mobile regression**  
   Test at mobile width and `?viewport=mobile`: "Projects / Untitled" visible top-left with chevron; tap opens bottom sheet; list and delete work; 200% zoom (54.11) doesn’t break layout; orientation change doesn’t break sheet.

**Verification:** No desktop behaviour or styling changes; mobile sheet is accessible (focus trap, Escape, labels); existing E2E/mobile tests still pass; manual check at 200% zoom and portrait/landscape.

---

## Summary

| Task | What |
|------|------|
| 1 | Mobile: ensure "Projects / Untitled" visible top-left, add chevron, 44px touch target; optional hide clock on mobile |
| 2 | Add mobile-only bottom sheet DOM + CSS (backdrop, sheet, drag handle, list container); desktop never uses it |
| 3 | JS: on mobile, breadcrumb/clock open bottom sheet and populate list; close on backdrop/Escape; desktop unchanged |
| 4 | Mobile-only CSS: list rows 44px min height, 1px border, trash icon #FF3B30 trailing; keep showAppConfirm for delete |
| 5 | A11y: dialog role, focus trap, focus restore, Escape; desktop/mobile regression and zoom/orientation |

**Desktop:** No changes to layout or to dropdown behaviour. All new DOM and styles are either mobile-only or guarded by `layoutState.viewportMode === 'mobile'` / `body[data-viewport-mode="mobile"]`.
