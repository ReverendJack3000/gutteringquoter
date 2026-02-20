# Mobile Diagram Toolbar Disappearing at Top — Execution Plan

**Date:** 2026-02-20  
**Scope:** Fix mobile diagram toolbar disappearing when at the top: remove dead “swipe away” UX, harden clamp/layout (54.50), and inspect scroll so the toolbar stays in view.  
**Constraint:** No code until this plan is approved. Desktop behavior must not change. Deployment remains Railway-compatible.

---

## 1. Goal Assessment

The diagram floating toolbar (`#diagramFloatingToolbar`) can disappear on mobile when positioned at the top. Investigation showed: (1) deprecated “swipe away” behavior implemented via class `diagram-toolbar-hidden` and mobile-only CSS—no code in the repo adds this class, only removes it in `initDiagramToolbarDrag()`; (2) `clampDiagramToolbarToWrap()` can skip clamping when the wrap is too small (`ww < 20 || wh < 20`), e.g. before mobile layout is ready; (3) scroll/layout could make a toolbar “at top” sit above the visible viewport. This plan removes the dead hide path, ensures clamp runs after layout (e.g. after collapse/resize) and has a safe fallback when wrap dimensions are invalid, and confirms/inspects scroll so the toolbar never sits above the visible area on mobile.

---

## 2. Desktop vs. Mobile Impact Analysis

- **Mobile impact:** Toolbar will no longer be hideable via the deprecated `diagram-toolbar-hidden` class (that path is already dead). Clamp will run reliably after collapsed layout (double rAF) and when wrap is small we will use a fallback position or minimum visible region so the toolbar stays on-screen. Scroll/layout inspection is mobile-focused; any layout or clamp tweaks will be scoped to `layoutState.viewportMode === 'mobile'` or `body[data-viewport-mode="mobile"]` where applicable.
- **Desktop impact:** None. Removal of `diagram-toolbar-hidden` CSS is inside `body[data-viewport-mode="mobile"]`; the only shared change is removal of one line in `app.js` (`toolbar.classList.remove('diagram-toolbar-hidden')`) which is a no-op if the class is never added. Clamp hardening (double rAF after collapse, dimension guard) benefits both; behavior only improves (toolbar stays in wrap). No desktop-only logic is removed.

---

## 3. Proposed Implementation Plan

### 3.1 Remove dead “swipe away” UX

**CSS (`frontend/styles.css`)**

- **Location:** Lines ~2126–2130 (mobile-only block).
- **Change:** Delete the entire rule:
  ```css
  body[data-viewport-mode="mobile"] .diagram-floating-toolbar.diagram-toolbar-hidden {
    transform: translateX(-50%) translateY(calc(-100% - 1rem));
    opacity: 0;
    pointer-events: none;
  }
  ```
- **Reason:** No code adds `diagram-toolbar-hidden`; keeping the rule allows any future or leftover state to hide the toolbar with no way to show it except re-init. Removing it prevents that.

**JS (`frontend/app.js`)**

- **Location:** Inside `initDiagramToolbarDrag()`, line ~5626.
- **Change:** Remove the single line: `toolbar.classList.remove('diagram-toolbar-hidden');`
- **Reason:** Class is never added; removal is redundant and keeps dead UX surface.

**HTML (`frontend/index.html`)**

- **Change:** None. The diagram toolbar element does not have `diagram-toolbar-hidden` in initial markup; no change needed.

### 3.2 Harden clamp / layout (54.50)

**JS (`frontend/app.js`)**

- **clampDiagramToolbarToWrap(toolbar, wrap)** (lines ~5580–5597):
  - **Current:** If `ww < 20 || wh < 20`, return without updating position (toolbar can stay off-screen).
  - **Change:** When wrap is too small, do not leave position unchanged. Either:
    - **Option A:** Run clamp when dimensions are valid; when `ww < 20 || wh < 20`, set a safe fallback position (e.g. `left = pad`, `top = pad`) so the toolbar is at least in the top-left corner of the wrap when layout later expands, or
    - **Option B:** Schedule a single re-run of clamp after a short delay (e.g. double rAF or setTimeout(0)) so we run again once layout has settled.
  - **Recommendation:** Option A (fallback position when dimensions invalid) plus ensure callers run clamp after layout is ready (see below). Fallback: `toolbar.style.left = pad + 'px'; toolbar.style.top = pad + 'px';` when `ww < 20 || wh < 20` (use same `pad` constant, 8).
- **Callers of clampDiagramToolbarToWrap:**
  - **onCollapseClick** (lines ~5775–5780): Already uses double rAF before `clampDiagramToolbarToWrap`. Verify that the collapsed layout (44×44) is applied before the second rAF so clamp uses correct dimensions. No change required if current order is correct; otherwise ensure collapse class is applied before the double rAF.
  - **ResizeObserver** (lines ~5805–5810): Already calls `clampDiagramToolbarToWrap(toolbar, getDiagramToolbarWrap())` and `updateOrientationFromPosition()`. When wrap resizes (e.g. rotation), wrap may briefly have tiny dimensions; with Option A above, toolbar will get fallback position and next layout will clamp properly.
- **initDiagramToolbarDrag:** After applying initial position from localStorage and removing the hidden class (once removed per 3.1), ensure clamp is run so that any stale saved position is brought back into bounds. Currently `applyDiagramToolbarPosition` is called; then clamp is not run until pointer up or ResizeObserver. Consider running `clampDiagramToolbarToWrap(toolbar, wrap)` once at end of init (after applying position and orientation) so initial load never shows toolbar off-screen. If wrap is too small at init, fallback position (Option A) will apply.

**Summary for 54.50:** (1) In `clampDiagramToolbarToWrap`, when `ww < 20 || wh < 20`, set fallback position to `pad`/`pad` instead of returning. (2) In `initDiagramToolbarDrag`, call `clampDiagramToolbarToWrap(toolbar, wrap)` once after applying initial position/collapsed state so toolbar is always clamped on load. (3) Keep double rAF in `onCollapseClick` before clamp.

### 3.3 Inspect scroll on mobile

**Goal:** Confirm whether the workspace or `#view-canvas` scrolls on mobile and whether the diagram toolbar (positioned at top of `.blueprint-wrap`) can sit above the visible viewport.

**Current architecture (from codebase):**

- `.blueprint-wrap` has `overflow: hidden` and contains the diagram toolbar (`position: absolute`). The toolbar is positioned within the wrap; the wrap does not scroll.
- `#view-canvas` contains the global toolbar, bottom sheet, and `main.workspace`; `main.workspace` contains `#blueprintWrap` (`.blueprint-wrap`). Mobile `.workspace` has `position: relative`; mobile `.blueprint-wrap` has `min-width: 0` and no overflow change.
- No `overflow: auto/scroll` was found on `#view-canvas` or `.app` for mobile. The only scroll in the canvas area is not on the wrap itself.

**Implementation steps:**

1. **Verify in browser (manual or E2E):** On mobile viewport, open the app, place the diagram toolbar at the top (e.g. drag to top zone so `updateOrientationFromPosition` sets `toolbar.style.top = pad + 'px'`). Check if any parent of `.blueprint-wrap` scrolls (e.g. body, .app, #view-canvas) and whether the toolbar can be scrolled out of view.
2. **If toolbar can sit above visible area:** Add mitigation: e.g. ensure a minimum top (or scroll compensation) so the toolbar stays in the visible region, or ensure the canvas view does not scroll (overflow: hidden on the scrolling ancestor for mobile). Document finding in TROUBLESHOOTING.md.
3. **If no scroll issue:** Document in TROUBLESHOOTING.md or this plan that scroll was inspected and toolbar-at-top visibility is not affected by scroll; the “disappear at top” is addressed by 3.1 and 3.2.

---

## 4. Edge Cases & Accessibility

- **Stale localStorage position:** After 3.2, init will run clamp once; oversized or negative saved positions will be clamped into wrap. Fallback when wrap is too small avoids leaving toolbar at an invalid position.
- **Resize during drag:** ResizeObserver runs when not dragging; clamp + orientation update keep toolbar on-screen. No change to drag logic.
- **Desktop:** No mobile-only CSS for `diagram-toolbar-hidden` affects desktop; removal of `classList.remove` in JS is harmless on desktop (class never added). Clamp fallback and init clamp only improve behavior.
- **Screen reader:** No change to ARIA or live regions; toolbar visibility is purely layout/CSS/position.

---

## 5. Task List Update (Draft)

- **54.50** (existing): Mark complete after clamp hardening and double rAF verification: “Toolbar never disappears after collapse” — clamp runs after collapsed layout (double rAF), wrap dimension guard (fallback position when ww/wh < 20), and optional init clamp so toolbar remains on-screen after collapse and on resize.
- **New 54.56:** “Remove deprecated diagram-toolbar-hidden (swipe-away) UX.” Remove mobile-only `.diagram-floating-toolbar.diagram-toolbar-hidden` rule from `styles.css` and `toolbar.classList.remove('diagram-toolbar-hidden')` from `app.js`. Mark complete when done.
- **New 54.57:** “Mobile: Inspect scroll so diagram toolbar at top stays visible.” Confirm workspace/view-canvas scroll behavior on mobile; if toolbar can sit above visible area, add layout/clamp mitigation and document in TROUBLESHOOTING.md. Mark complete after verification and any fix.

---

## 6. Files to Touch (Summary)

| File            | Changes |
|-----------------|---------|
| `frontend/styles.css` | Remove `body[data-viewport-mode="mobile"] .diagram-floating-toolbar.diagram-toolbar-hidden` rule (~2126–2130). |
| `frontend/app.js`     | (1) Remove `toolbar.classList.remove('diagram-toolbar-hidden');` in `initDiagramToolbarDrag`. (2) In `clampDiagramToolbarToWrap`, when `ww < 20 \|\| wh < 20`, set fallback position `left = pad`, `top = pad`. (3) In `initDiagramToolbarDrag`, call `clampDiagramToolbarToWrap(toolbar, wrap)` once after applying initial position and collapsed state. |
| `TROUBLESHOOTING.md`  | Add entry if scroll inspection finds an issue and mitigation is applied; or note that scroll was inspected and no change needed. |
| `TASK_LIST.md`        | Add 54.56 and 54.57; update 54.50 description if needed; mark complete when implementation and QA are done. |

---

## 7. Confirmation

- **Existing functionality:** Desktop behavior unchanged. Mobile toolbar can no longer be hidden by the deprecated class; clamp and init changes only keep the toolbar on-screen. No removal of desktop code paths.
- **Railway:** No new dependencies or build steps; vanilla JS/CSS only.

This is the proposed plan. Do you approve this approach, or would you like to make adjustments before implementation?
