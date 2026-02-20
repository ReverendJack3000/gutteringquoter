# Diagram Toolbar: Freeform Alignment, Collapsed Circular "+", No Scroll — Execution Plan

**Date:** 2026-02-20  
**Scope:** Diagram floating toolbar (`#diagramFloatingToolbar` / `.diagram-floating-toolbar`) only. No changes to global header (`#globalToolbar`) or element selection toolbar.  
**Constraints:** No code until plan is approved. Railway deployment must remain successful. Desktop behavior must not regress. Single codebase; mobile gated by `data-viewport-mode` and `layoutState.viewportMode`.

---

## 1. Goal Assessment

1. **Mobile UI toolbar = desktop behavior (horizontal/vertical by position)**  
   The diagram floating toolbar on mobile should use the same orientation logic as desktop: when dragged to the **top or bottom** of the canvas area → horizontal layout; when dragged to the **left or right** → vertical layout. Orientation is already driven by `updateOrientationFromPosition()` in `app.js` with no mobile-only early exit; mobile CSS already has `[data-orientation="horizontal"]` overrides. **Verification** only (confirm no remaining mobile-only forced vertical in CSS/JS that would override position-based orientation).

2. **Minimized state = circular "+" button only (no extra padding)**  
   When the diagram toolbar is collapsed, it must visually **be** a single circular "+" button (expand control), with **no** extra white pill/padding around it. Currently `.diagram-floating-toolbar.diagram-floating-toolbar--collapsed` uses `padding: 8px` and `border-radius: 50%`, so the pill is a circle larger than the 44×44 button (reference image shows this extra ring). **Change:** Collapsed state must have **zero padding** and size the container to exactly the 44×44 expand button so the minimized toolbar is a single circular "+" with no surrounding margin.

3. **Never scroll within the toolbar (mobile and desktop)**  
   Users must never have to scroll inside the diagram toolbar or the global toolbar. All tools must be visible by **wrapping** (flex-wrap) where needed, not by overflow scroll.  
   - **Diagram toolbar – desktop:** Already `overflow: hidden` on `.diagram-toolbar-tools-wrap`. Add `flex-wrap: wrap` where appropriate so that on narrow desktop or with many tools, items wrap instead of clipping; no scroll.  
   - **Diagram toolbar – mobile vertical:** Currently `overflow-y: auto` on the toolbar (54.38). Remove scroll: use `overflow: hidden` and `flex-wrap: wrap` on the tools wrap so tools wrap (e.g. multiple columns in vertical stack) and no scrollbar.  
   - **Diagram toolbar – mobile horizontal:** Currently `overflow-x: auto` on `.diagram-toolbar-tools-wrap` when horizontal. Remove scroll: use `flex-wrap: wrap` and `overflow: hidden` so tools wrap to the next row; no horizontal scroll.  
   - **Global toolbar:** Already `overflow-x: hidden` and `flex-wrap: wrap` (54.40). No scroll within the bar; confirm no overflow-y that would introduce scroll (toolbar grows when wrapped).

---

## 2. Desktop vs. Mobile Impact

- **Desktop:** Collapsed state becomes a true 44px circle (no padding). Diagram toolbar tools wrap when needed (no scroll). No other desktop-only changes.
- **Mobile:** Same orientation-by-position as desktop (already implemented; verify only). Collapsed state same 44px circle. Diagram toolbar never scrolls: vertical and horizontal layouts use wrap + overflow hidden instead of overflow auto.

All changes are CSS (and optional JS verification). No new dependencies; Railway-safe.

---

## 3. Proposed Implementation Plan

### 3.1 HTML (`frontend/index.html`)

- **No structural changes.** The collapse button (`#diagramToolbarCollapseBtn`) and "+" / "−" content already exist. No new elements.

### 3.2 CSS (`frontend/styles.css`)

**A. Collapsed state = circular "+" only (no extra padding)**

- **Base collapsed (desktop and mobile):**  
  In `.diagram-floating-toolbar.diagram-floating-toolbar--collapsed`:
  - Set `padding: 0` (replace current `padding: 8px`).
  - Set `width: 44px; height: 44px; min-width: 44px; min-height: 44px` so the pill is exactly the size of the 44×44 collapse button (no extra ring).
  - Keep `border-radius: 50%`, `gap: 0`, and existing hide of drag handle and tools-wrap.
- **Mobile collapsed override:**  
  Add `body[data-viewport-mode="mobile"] .diagram-floating-toolbar.diagram-floating-toolbar--collapsed` with the same `padding: 0` and 44×44 size so mobile base padding (e.g. `0.5rem 0.75rem`) is overridden when collapsed.

**B. No scroll within diagram toolbar**

- **Desktop – tools wrap:**  
  For horizontal orientation, allow wrap so no scroll:  
  `.diagram-floating-toolbar[data-orientation="horizontal"] .diagram-toolbar-tools-wrap` (or base tools-wrap when horizontal): add `flex-wrap: wrap` and keep `overflow: hidden`.  
  For vertical, `.diagram-floating-toolbar[data-orientation="vertical"] .diagram-toolbar-tools-wrap` currently has `max-height: 60vh` and `flex-wrap: nowrap`. To avoid scroll, either keep overflow hidden and allow wrap so multiple columns in vertical mode (e.g. `flex-wrap: wrap` with `flex-direction: column` so items flow into next column), or leave vertical as single column and rely on 60vh being sufficient (no scroll if we don’t add overflow auto). Current desktop vertical has `overflow: hidden` (inherited); no scroll. So desktop change is only: horizontal tools-wrap use `flex-wrap: wrap` if not already.
- **Mobile – vertical:**  
  In `body[data-viewport-mode="mobile"] .diagram-floating-toolbar`:  
  - Change `overflow-y: auto` to `overflow: hidden` (no vertical scroll in toolbar).  
  - In `body[data-viewport-mode="mobile"] .diagram-floating-toolbar .diagram-toolbar-tools-wrap` (or the mobile vertical tools-wrap): set `flex-wrap: wrap` and `overflow: hidden` so tools wrap (e.g. two columns) instead of scrolling. Remove any `overflow-y: auto` from the toolbar or tools-wrap on mobile.
- **Mobile – horizontal:**  
  In `body[data-viewport-mode="mobile"] .diagram-floating-toolbar[data-orientation="horizontal"] .diagram-toolbar-tools-wrap`:  
  - Remove `overflow-x: auto` and `-webkit-overflow-scrolling`, `scroll-behavior`.  
  - Set `flex-wrap: wrap` and `overflow: hidden` so tools wrap to next row; no horizontal scroll.

**C. Global toolbar**

- Audit only: confirm `body[data-viewport-mode="mobile"] .global-toolbar-wrap` and `.toolbar` use `overflow-x: hidden` and `flex-wrap: wrap` and have no `overflow-y: auto` that would create scroll inside the bar. No change if already correct.

### 3.3 JS (`frontend/app.js`)

- **Verification only:** Confirm that on mobile, `updateOrientationFromPosition()` is called on pointer up and that there is no code path that forces `data-orientation="vertical"` for mobile after drag (so mobile can be horizontal when in top/bottom zones). Current code (lines ~5648–5687) has no mobile check inside the zone logic; orientation is set from position for all viewports. Default initial orientation for mobile is vertical (line 5611); after first drag to top/bottom, orientation will switch to horizontal. No JS change required unless audit finds a bug.
- **Collapsed state:** No JS change; collapsed is already toggled and persisted; only CSS changes for size/padding.

### 3.4 Files and Constants

- **Files to touch:** `frontend/styles.css` (collapsed padding/size; diagram toolbar overflow and wrap rules). Optionally `frontend/app.js` if a verification comment or one-line guard is added.
- **No new constants or localStorage keys.**

---

## 4. Edge Cases & Accessibility

1. **Collapsed drag:** When collapsed, the only visible control is the expand button (drag handle hidden). It already receives drag (pointer) events and has `cursor: grab/grabbing`. Ensure the 44×44 collapsed circle remains the only hit target and is still draggable; no change to event handling.
2. **Wrap vs. space:** With `flex-wrap: wrap` and no scroll, the diagram toolbar pill can grow in height (vertical mode) or width (horizontal). It remains clamped inside `.blueprint-wrap` via `clampDiagramToolbarToWrap`. Ensure max dimensions (e.g. `max-height: calc(100% - 24px)` on mobile) still apply so the toolbar doesn’t overflow the canvas area.
3. **Reduced motion:** Existing `prefers-reduced-motion` and `body.a11y-force-motion` rules for `.diagram-floating-toolbar` and `.diagram-toolbar-tools-wrap` remain; no new animations.
4. **44px touch targets:** Collapsed 44×44 circle meets Apple HIG. Wrapped tools keep existing 44px min size on mobile.

---

## 5. Confirmation: Existing Functionality Preserved

- **Top header / global toolbar:** No structural or behavioral change; audit only for no-scroll.
- **Element floating toolbar (#floatingToolbar):** Not modified.
- **Diagram toolbar:** Position/orientation persistence, ResizeObserver, init/teardown (54.33), and drag logic unchanged. Only CSS: collapsed appearance (padding/size) and no-scroll (overflow + wrap).
- **Railway:** Vanilla HTML/CSS/JS; no new build steps or env vars.

---

## 6. Task List Update (Draft for TASK_LIST.md)

Add to **Section 54** as new tasks:

- **54.46** **Diagram toolbar: Minimized = circular "+" only.** When collapsed, diagram toolbar is exactly a 44×44 circular expand button with no extra padding/ring (CSS: padding 0, size 44×44; mobile override for collapsed).
- **54.47** **Diagram toolbar + global toolbar: No scroll.** Diagram toolbar (desktop and mobile, vertical and horizontal) and global toolbar never show scrollbars; use flex-wrap so all tools visible without scrolling (overflow hidden + wrap).
- **54.48** **Diagram toolbar: Mobile orientation = desktop.** Confirm mobile uses same horizontal/vertical-by-position logic as desktop (verification only; no forced vertical on mobile).

---

## 7. Approval Gate

This is the proposed plan. Do you approve this approach, or would you like to make adjustments before implementation?
