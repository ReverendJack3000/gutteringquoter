# Diagram Floating Toolbar: Freeform-Style Behavior — Design & Execution Plan

**Date:** 2026-02-20  
**Scope:** Diagram floating toolbar on the canvas (the pill with zoom, technical drawing, inspector, color, etc.). In the codebase this is `#diagramFloatingToolbar` (`.diagram-floating-toolbar`). The task title refers to it as "global toolbar"; the top header is a separate component (`#globalToolbar` / `#globalToolbarWrap`).  
**Constraint:** No code until this plan is approved. Deployment must remain Railway-compatible; desktop behavior must not regress.

---

## 1. Goal Assessment

Refactor the **diagram floating toolbar** (canvas pill) so it behaves like the floating toolbar in Apple Freeform: fully free-floating, adaptive orientation (vertical when docked left/right, horizontal when docked top/bottom), collapsible to save space, and smooth transitions between vertical, horizontal, and collapsed states. The toolbar is currently draggable within the blueprint area and snaps to vertical layout only when near the left or right edges; it does not switch to horizontal when dragged to the top or bottom. On mobile it is forced to vertical layout only (54.38, 54.39). The goal is to make orientation depend on both X and Y position (top/bottom → horizontal; left/right → vertical), allow drag to any position within the canvas area without artificial limits beyond keeping the toolbar on-screen, add a collapsible (minimized) state, and animate state changes.

---

## 2. Desktop vs. Mobile Impact Analysis

- **Mobile impact:** The diagram toolbar on mobile is currently forced to vertical layout and a default position (54.38, 54.39). The plan will extend orientation logic so that on mobile, when the user drags the toolbar into the top or bottom zones, it can switch to horizontal layout (aligning with Freeform). Collapsed state and smooth transitions will apply on both desktop and mobile. Touch targets (44px minimum) and no horizontal scroll (54.40) will be preserved. All new/updated behavior will remain behind the same `layoutState.viewportMode` / `data-viewport-mode` checks where mobile-specific rules exist.
- **Desktop impact:** Desktop will gain the new orientation rule (top/bottom → horizontal; left/right → vertical), full free-floating drag within `.blueprint-wrap` (no additional constraints), and the new collapsed state with transitions. Existing desktop behavior (persisted position/orientation in localStorage, ResizeObserver, idempotent init/teardown 54.33) will be preserved. The only behavioral change is adding Y-based orientation zones and collapsed state; left/right vertical snap remains. No changes to the top header (`#globalToolbar`) or to the main canvas/panel layout.

---

## 3. Proposed Implementation Plan

### 3.1 HTML (`index.html`)

- **Diagram toolbar:** Add a single control for collapsing: a **minimize/expand** button (e.g. a small dash or chevron) that is always visible (e.g. next to or part of the drag handle area). Recommendation: add a dedicated `button` (e.g. `id="diagramToolbarCollapseBtn"`) with `aria-label="Collapse toolbar"` / `"Expand toolbar"` and `aria-expanded="true"` / `"false"`. Do not rely on double-tap on the drag handle for collapse (accessibility and discoverability favor an explicit control). Place it so it is visible in both vertical and horizontal orientations (e.g. at the end of the pill or adjacent to the drag handle).
- **DOM structure:** No removal of existing diagram toolbar content; only add the collapse button. Ensure `#diagramFloatingToolbar` remains the single wrapper; collapse will hide the tool buttons (and optionally show only the drag handle + collapse button, or a minimal strip) via CSS/class and JS state.

### 3.2 CSS (`styles.css`)

- **Orientation:** Existing rules for `.diagram-floating-toolbar[data-orientation="vertical"]` (flex-direction: column) and default horizontal remain. Add no new orientation values; only the logic that *sets* `data-orientation` changes (JS).
- **Collapsed state:** Add a class (e.g. `.diagram-floating-toolbar--collapsed`) that, when set, hides all children except the drag handle and the new collapse/expand button (and optionally a minimal strip). **Animation jank:** Animate the collapsible state using `max-width`, `max-height`, `opacity`, or CSS Grid (`grid-template-columns`). Do *not* animate standard `width` and `height` properties—they can cause browser repaints and frame drops. Use one of the recommended properties so expanding and collapsing stay smooth (e.g. 0.2–0.25s ease). Ensure 44px touch targets for the visible controls in collapsed state on mobile (body[data-viewport-mode="mobile"]).
- **Transitions:** Add or extend transitions for:
  - `data-orientation` change: already `transition: left 0.2s ease, top 0.2s ease, transform 0.2s ease` on `.diagram-floating-toolbar`; add transition for layout (flex-direction) if needed so orientation switch is smooth (e.g. transition on the container for opacity of children or use a short duration for transform so the pill doesn’t “jump”).
  - Collapsed ↔ expanded: use the animation approach above (max-width/max-height/opacity/grid) so the toolbar doesn’t resize abruptly and avoids jank.
- **Desktop vs mobile:** Keep `body[data-viewport-mode="mobile"] .diagram-floating-toolbar` overrides (vertical stack, no horizontal scroll, 44px targets). When we add horizontal orientation on mobile (top/bottom), ensure the horizontal layout also uses wrap or row with no overflow (same as current 54.40 intent). **Mobile horizontal overflow:** When the toolbar snaps to the top or bottom on mobile (horizontal layout), verify that the screen width can accommodate all tools in a single row. If it cannot, use `flex-wrap: wrap` or allow smooth horizontal scrolling *within* the pill so the toolbar never overflows the viewport.
- **Z-index:** Ensure `.diagram-floating-toolbar` has a sufficiently high `z-index` so that when it is dragged freely around the canvas, it never slips behind other interactive elements or panels (e.g. canvas controls, selection toolbar, popovers). Audit and set a value that sits above canvas and panels but below modals/overlays if applicable.

### 3.3 JS (`app.js`)

- **Orientation logic (updateOrientationFromPosition):**
  - **Current:** Orientation is derived only from X: center in left 20% or right 80% of wrap → vertical; else horizontal.
  - **New:** Introduce Y-based zones. Define thresholds (e.g. top 20% and bottom 20% of wrap height). If the toolbar’s center Y is in the **top** or **bottom** zone → set `data-orientation="horizontal"` and optionally snap Y to a consistent top or bottom padding (e.g. 12px from top or bottom). If the toolbar’s center is in the **left** or **right** zone (existing X logic) → set `data-orientation="vertical"` and snap X to left or right as today. For the **center** (middle of the canvas in both X and Y), keep a single rule: e.g. prefer horizontal (current center behavior) or derive from which edge is closer; recommendation: prefer horizontal when in the center rectangle so top/bottom and left/right zones are clearly defined.
  - **Persistence:** Continue to persist orientation and position in localStorage (existing keys). After updating orientation, apply the same snap/position logic so the toolbar doesn’t drift on next load.
- **Drag (onPointerMove / onPointerUp):**
  - **Free-floating:** Keep drag constrained only so the toolbar stays fully inside `.blueprint-wrap` (existing clamp). No extra “magnetic” behavior during drag; orientation and optional snap apply on **pointer up** (or at end of drag) so the user can drag freely and see the toolbar follow the pointer, then on release it snaps to the nearest edge/zone and orientation updates. Optionally, during drag, preview the target orientation (e.g. update `data-orientation` live) so the pill shape changes smoothly; that requires recalculating orientation in onPointerMove (with the same zone math) and may cause layout thrashing — recommendation: update orientation only on pointer up for simplicity, and rely on CSS transition to smooth the orientation change after release.
- **Collapsed state:**
  - Add a state variable or data attribute (e.g. `data-collapsed="true"|"false"` or a variable in a closure) and persist in localStorage (e.g. `quoteApp_diagramToolbarCollapsed`).
  - On load, read persisted collapsed state and apply it (add/remove class, set aria-expanded on collapse button).
  - Collapse button click: toggle collapsed state, update DOM/localStorage, run `applyGlobalToolbarPadding` if that is affected (it is not; that’s for the top header). No change to view canvas padding.
  - Ensure when toolbar is collapsed, drag still works (drag handle remains visible and interactive).
- **Mobile:** In `updateOrientationFromPosition`, when `layoutState.viewportMode === 'mobile'`, allow both vertical and horizontal orientation based on the same zone logic (remove the current early return that forces vertical only). Ensure default position on mobile still places the toolbar in a safe place (e.g. top-left or as now); if first load has no saved position, keep a sensible default (e.g. vertical at left, 12,12).
- **ResizeObserver:** In the existing ResizeObserver callback, after `clampDiagramToolbarToWrap`, call `updateOrientationFromPosition()` so that on window resize or rotation the orientation is recalculated (already done; keep it).
- **Teardown:** No change to 54.33 cleanup; `diagramToolbarDragCleanup` remains idempotent and removes all listeners and ResizeObserver.

### 3.4 Files and Constants

- **New/updated constants:** e.g. `DIAGRAM_TOOLBAR_EDGE_THRESHOLD_TOP` / `_BOTTOM` (e.g. 0.2) for Y zones; optionally a single object for all four edges. New localStorage key: `quoteApp_diagramToolbarCollapsed`.
- **Files to touch:** `frontend/index.html` (collapse button), `frontend/styles.css` (collapsed class, transitions), `frontend/app.js` (orientation zones, collapse state, persistence).

---

## 4. Edge Cases & Accessibility

1. **Overlap of zones:** If the toolbar center falls in both a horizontal zone (top/bottom) and a vertical zone (left/right), define a priority. Recommendation: check horizontal zones (top/bottom) first; if center Y is in top or bottom 20%, set horizontal and snap Y; else use left/right X logic for vertical. This avoids ambiguity.
2. **Collapsed + orientation:** When the user expands the toolbar after it was collapsed, the toolbar should appear in the same orientation and position as before. No extra logic needed if we only toggle a class and persist collapsed state; position and orientation are already persisted separately.
3. **Screen reader:** Collapse button must have correct `aria-label` and `aria-expanded`. When collapsed, the toolbar’s `role="toolbar"` and `aria-label="Diagram tools"` remain; ensure the visible controls (drag handle, collapse button) are focusable and labeled so VoiceOver/Voice Control users can expand and move the toolbar.
4. **Reduced motion:** Respect `prefers-reduced-motion: reduce` for orientation and collapse transitions (e.g. shorten or disable transitions) per existing project patterns (e.g. `body.a11y-force-motion` or a media query).
5. **Very small viewports:** On very narrow/short blueprint-wrap, ensure the toolbar never overlaps the canvas placeholder or critical UI; `clampDiagramToolbarToWrap` already keeps it inside the wrap. Collapsed state helps by minimizing footprint.

---

## 4.1 Implementation notes (UI bug prevention)

- **Mobile horizontal overflow:** When the toolbar snaps to the top or bottom on mobile (switching to horizontal), verify that the screen width can actually accommodate all the tools in a single row. If it cannot, use `flex-wrap: wrap` or allow smooth horizontal scrolling within the pill itself so tools remain accessible without overflowing the viewport.
- **Animation jank:** Animate the collapsible state using `max-width`, `max-height`, `opacity`, or CSS Grid (`grid-template-columns`). Do not animate standard `width` and `height` properties—they can cause browser repaints and frame drops.
- **Z-index management:** Ensure `.diagram-floating-toolbar` has a sufficiently high `z-index` so that when it is dragged freely around the canvas, it never slips behind other interactive elements or panels.

---

## 5. Task List Update (Draft for TASK_LIST.md)

Add to **Section 54** as new tasks (after 54.40):

- **54.41** **Diagram toolbar: Freeform-style orientation (top/bottom → horizontal).** When the diagram floating toolbar is dragged to the top or bottom edge zone of the canvas area, set orientation to horizontal and optionally snap Y; when dragged to left/right zones, keep vertical. Persist orientation and position; update only on pointer up. Desktop and mobile (remove mobile-only forced vertical so mobile can use horizontal at top/bottom). **Note:** On mobile when horizontal, ensure screen width can accommodate all tools in one row; if not, use flex-wrap: wrap or smooth horizontal scroll within the pill.
- **54.42** **Diagram toolbar: Fully free-floating drag.** Ensure the toolbar can be dragged to any position within the blueprint-wrap with no extra constraints beyond keeping it on-screen (current clamp). Orientation and snap apply on pointer up.
- **54.43** **Diagram toolbar: Collapsible state.** Add a collapse/expand control (button with aria-label and aria-expanded); when collapsed, show only drag handle and expand button with smooth transition. Persist collapsed state in localStorage. Drag remains possible when collapsed.
- **54.44** **Diagram toolbar: Smooth transitions.** Ensure orientation change (vertical ↔ horizontal) and collapse ↔ expand use CSS transitions (0.2–0.25s); respect reduced-motion preference. **Note:** Animate collapsed state with max-width, max-height, opacity, or CSS Grid—not standard width/height—to avoid repaints and frame drops.
- **54.45** **Diagram toolbar: Regression and a11y.** Verify no desktop or mobile regression; 44px targets and no horizontal scroll on mobile; focus order and screen reader labels for new collapse button; ResizeObserver and teardown (54.33) unchanged. **Note:** Ensure .diagram-floating-toolbar z-index is high enough so it never slips behind other interactive elements or panels when dragged.

---

## 6. Confirmation: Existing Functionality Preserved

- **Top header (global toolbar):** No change to `#globalToolbar` / `#globalToolbarWrap`, `initGlobalToolbar`, or collapse/padding logic.
- **Element floating toolbar (#floatingToolbar):** No change to selection toolbar drag or positioning.
- **Canvas and panel:** No change to blueprint-wrap layout, panel, or view canvas padding.
- **Diagram toolbar existing behavior:** Persistence (X, Y, orientation), ResizeObserver, idempotent init/teardown, and mobile vertical default remain; only orientation rules and collapsed state are added or extended.
- **Railway:** No new dependencies or build steps; vanilla JS/CSS/HTML only.

---

## 7. Approval Gate

This is the proposed plan. Do you approve this approach, or would you like to make adjustments before implementation?
