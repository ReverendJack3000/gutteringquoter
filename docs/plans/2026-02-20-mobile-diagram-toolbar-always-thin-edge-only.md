# Plan: Mobile diagram toolbar – always thin, edge-only placement

**Date:** 2026-02-20  
**Scope:** Mobile only (`body[data-viewport-mode="mobile"]`). Diagram floating toolbar (`#diagramFloatingToolbar`). Desktop unchanged.  
**Constraint:** Railway deployment unchanged; preserve all existing toolbar functionality (collapse, drag, all tools).

---

## 1. Goal

- **Always thin:** The diagram pill toolbar on mobile should always appear as a thin strip: vertical = single column (slim pill on left/right), horizontal = single row (thin pill on top/bottom) with reduced icon sizes so it fits.
- **Edge-only (compromise):** Toolbar may only sit on one of the four edges (top, bottom, left, right). Dragging it snaps to the nearest edge; no free-floating in the middle.
- **Orientation by position:** Top or bottom edge → horizontal pill; left or right edge → vertical pill. Existing behaviour; we keep it and add snap-to-edge.
- **Existing functionality:** All tools stay (technical drawing, zoom out/fit/in, inspector, colour, transparency). Collapse/expand and drag remain. No removal of features.

---

## 2. Current behaviour (brief)

- **Orientation:** `updateOrientationFromPosition()` already sets horizontal when toolbar center is in top 20% or bottom 20% of wrap height, and vertical when in left 20% or right 20% of width. In the middle strip it currently sets horizontal and does not snap position.
- **Mobile CSS:** Base mobile rule forces `flex-direction: column` and `flex-wrap: wrap` on the toolbar, so the pill can grow in both directions. When `data-orientation="horizontal"` we override to `flex-direction: row` and `flex-wrap: wrap`, so horizontal can wrap to multiple rows (hence the “fat” multi-row pill in your screenshots).
- **Placement:** Toolbar is freely draggable; clamp keeps it in the wrap; orientation and snap (top/bottom/left/right) only set position when the center falls in those zones. Middle zone leaves position as-is (free placement).
- **Touch targets:** Mobile uses 44×44 px for pill buttons and drag handle (Apple HIG).

---

## 3. Changes required

### 3.1 CSS – mobile “always thin”

**Vertical (left/right) – keep single column**

- In `body[data-viewport-mode="mobile"] .diagram-floating-toolbar[data-orientation="vertical"] .diagram-toolbar-tools-wrap`: set `flex-wrap: nowrap` (and ensure no max-height that would force scroll; current `max-height: 60vh` is desktop; mobile vertical already stacks in one column; confirm no wrap).
- Ensure mobile vertical toolbar does not get a wider multi-column layout: tools-wrap should be single column, no wrap.

**Horizontal (top/bottom) – single row, reduced size**

- In `body[data-viewport-mode="mobile"] .diagram-floating-toolbar[data-orientation="horizontal"]`: set `flex-wrap: nowrap` so the pill never wraps to a second row.
- In `body[data-viewport-mode="mobile"] .diagram-floating-toolbar[data-orientation="horizontal"] .diagram-toolbar-tools-wrap`: set `flex-wrap: nowrap`.
- Add a **compact horizontal** variant for mobile so the full set of tools fits in one row on narrow phones:
  - Option A: Reduce touch target and icon size only when horizontal on mobile, e.g. `min-width` / `min-height` from 44px to 40px (or 36px) for `.toolbar-pill-btn`, `.diagram-toolbar-drag-handle` inside the horizontal toolbar, and `.toolbar-icon` width/height to 18px or 16px. This slightly undercuts Apple HIG 44pt; document it or add an a11y override (e.g. `body.a11y-large-controls` keeps 44px and allows wrap to two rows).
  - Option B: Keep 44px and allow horizontal tools-wrap to wrap to two rows on very narrow viewports only (still “thinner” than current multi-row block). Less ideal for “always thin” but avoids reducing touch targets.
- Recommendation: Option A with a single-row rule; add `body.a11y-large-controls` (or similar) override so users who need larger controls get 44px and optional second row. New class or attribute for “compact horizontal” (e.g. `data-orientation="horizontal"` plus a scoped override) keeps rules clear.

**Padding / gap**

- Slightly reduce padding and gap for mobile horizontal so the thin pill is visually tight (e.g. `padding: 0.35rem 0.5rem`, `gap: 0.25rem` or 4px) without crowding.

**Files**

- `frontend/styles.css`: New/updated rules under `body[data-viewport-mode="mobile"]` for:
  - Vertical: tools-wrap `flex-wrap: nowrap` (if not already).
  - Horizontal: toolbar and tools-wrap `flex-wrap: nowrap`; compact button/icon sizes; optional a11y override.

---

### 3.2 JS – mobile edge-only placement

**Snap to one of four edges**

- **When:** On pointer up after drag, and when initializing or re-running placement (e.g. ResizeObserver) on mobile. Desktop unchanged.
- **Logic (mobile only):**
  1. Compute toolbar center in wrap coordinates (reuse pattern from `updateOrientationFromPosition`).
  2. Determine **nearest edge**: top (y ≤ threshold), bottom (y ≥ threshold), left (x ≤ threshold), right (x ≥ threshold). Use same 20% thresholds (DIAGRAM_TOOLBAR_EDGE_THRESHOLD, TOP, BOTTOM) so behaviour matches current orientation logic.
  3. **Snap position:**
     - **Top:** `top = pad` (e.g. 12px), `left = center of wrap` (or keep x and only set top). Center the toolbar horizontally: `left = (wrapWidth - toolbarWidth) / 2` (with pad).
     - **Bottom:** `top = wrapHeight - toolbarHeight - pad`, `left = (wrapWidth - toolbarWidth) / 2`.
     - **Left:** `left = pad`, `top = (wrapHeight - toolbarHeight) / 2` (centered vertically).
     - **Right:** `left = wrapWidth - toolbarWidth - pad`, `top = (wrapHeight - toolbarHeight) / 2`.
  4. Set `data-orientation`: horizontal for top/bottom, vertical for left/right.
  5. Apply position and persist to localStorage (same keys as today).

**Where to implement**

- **Option A:** Extend `updateOrientationFromPosition()`: when `layoutState.viewportMode === 'mobile'`, after determining zone, always snap to that edge with the exact positions above (and set orientation). Remove the “else” free-placement branch on mobile so the toolbar never stays in the middle.
- **Option B:** New helper e.g. `snapDiagramToolbarToEdgeForMobile(toolbar, wrap)` called from the same call sites (onPointerUp, ResizeObserver, and init when mobile). It computes nearest edge, applies position and orientation, and writes localStorage.

**Init and resize**

- On mobile init: if saved (x, y) would place the toolbar in the “middle” (current else branch), run the same snap-to-edge logic and overwrite position so the toolbar starts on an edge.
- ResizeObserver: when wrap resizes, re-run snap-to-edge for mobile so the toolbar stays on the same edge and re-centered (e.g. still “top” but re-center x; still “left” but re-center y).

**Clamp**

- `clampDiagramToolbarToWrap()`: On mobile, when we have a concept of “current edge” (e.g. from a data attribute like `data-edge="top"|"bottom"|"left"|"right"` set by the snap logic), clamp could restrict movement along that edge only (e.g. top edge: only x varies within wrap; y fixed at pad). Alternatively, clamp as today and rely on snap-on-pointer-up to correct; that’s simpler and avoids storing edge in DOM. Prefer: no change to clamp; snap on pointer up and on resize is enough.

**Files**

- `frontend/app.js`: In or beside `initDiagramToolbarDrag()`:
  - Mobile-only snap-to-edge function (or extended `updateOrientationFromPosition`).
  - Call it from: `onPointerUp` (after drag), ResizeObserver callback, and init (when viewport is mobile and we have a position to normalize).
  - Ensure localStorage keys (X, Y, orientation) are set from the snapped position so reload and resize stay consistent.

---

### 3.3 Optional: persist edge

- Today we persist x, y, orientation. We could persist edge (e.g. `quoteApp_diagramToolbarEdge = 'top'|'bottom'|'left'|'right'`) and on load place the toolbar on that edge directly. Not strictly required: we can derive “nearest edge” from persisted (x, y) and then snap, so existing localStorage remains valid. If we add edge persistence, init would read edge and set position; otherwise init reads x,y and runs snap-to-edge once.

---

## 4. Summary of file-level changes

| File | Change |
|------|--------|
| **frontend/styles.css** | Mobile vertical: ensure tools-wrap single column (nowrap). Mobile horizontal: toolbar and tools-wrap nowrap; compact min sizes (e.g. 40px) and smaller icons for horizontal; tighter padding/gap; optional a11y override for 44px + wrap. |
| **frontend/app.js** | Mobile-only: snap toolbar to one of four edges on pointer up, init, and ResizeObserver; set position (centered on that edge) and orientation (horizontal for top/bottom, vertical for left/right); no functional change for desktop. |

---

## 5. Edge cases and accessibility

- **Narrow phones (e.g. 320px):** Single row with 8+ tools and 40px buttons may still overflow; use `min-width: 0` and allow flex-shrink on buttons, or cap at 36px, or allow a11y-large-controls to force 44px and two rows. Document tradeoff.
- **Resize / rotation:** ResizeObserver already runs; snap-to-edge on resize keeps the toolbar on the same edge and re-centered.
- **Collapse:** Collapsed state (circular “+”) unchanged; when expanded again, toolbar remains on the same edge (position already set).
- **Desktop:** All new logic gated by `layoutState.viewportMode === 'mobile'`; desktop keeps free placement and current pill layout.
- **Railway:** No new dependencies or build steps.

---

## 6. Effort estimate

| Area | Effort | Notes |
|------|--------|--------|
| CSS thin vertical | Low | Confirm/add nowrap for vertical tools-wrap on mobile. |
| CSS thin horizontal | Medium | Nowrap + compact sizes + a11y override; test on 320px and 375px. |
| JS snap-to-edge | Medium | New or extended function; wire into pointer up, init, ResizeObserver; mobile-only. |
| QA (mobile only) | Medium | Test all four edges, collapse/expand, resize, rotation; confirm no desktop regression. |

**Overall:** Moderate. Most work is CSS for a single-row horizontal compact layout and JS for snap-to-edge; existing orientation and tools stay as-is.

---

## 7. Key points for implementation (do not remove current behaviour)

Use this checklist so the implementation is additive and does not remove or break existing toolbar behaviour.

### 7.1 Preserve at all times

- **Desktop:** Zero changes to desktop. All new logic must be gated by `layoutState.viewportMode === 'mobile'`. Desktop keeps free placement, current `updateOrientationFromPosition()` (including the “else” middle branch), and existing CSS for `.diagram-floating-toolbar` without any new desktop-only overrides.
- **All tools:** Do not remove or hide any toolbar item (technical drawing, zoom out/fit/in, inspector, colour, transparency). Same DOM and same buttons.
- **Collapse/expand:** Collapsed state (circular “+”) and expand/collapse click behaviour must work exactly as today. Do not change `onCollapseClick`, collapse button, or `.diagram-floating-toolbar--collapsed` behaviour.
- **Drag:** Dragging the toolbar must still work (pointer capture, move, up). Only the **result** of a drag on mobile changes (snap to edge instead of free position). Do not remove or replace `onPointerDown`, `onPointerMove`, `onPointerUp`, or `clampDiagramToolbarToWrap` for desktop.
- **Storage:** Keep using the same localStorage keys (`quoteApp_diagramToolbarX`, `quoteApp_diagramToolbarY`, `quoteApp_diagramToolbarOrientation`). New logic can write snapped values; do not introduce breaking key renames or remove persistence.
- **Orientation logic:** Top/bottom → horizontal and left/right → vertical is unchanged. We **add** snap-to-edge and “no middle” on mobile only; we do not change how orientation is derived from position (same 20% thresholds).

### 7.2 Implementation checklist

| Step | Action | Do not |
|------|--------|--------|
| 1 | Add **new** CSS rules under `body[data-viewport-mode="mobile"]` for vertical tools-wrap `flex-wrap: nowrap` and horizontal nowrap + compact sizes. | Remove or replace existing mobile diagram toolbar rules (e.g. 54.38, 54.45, 54.47). |
| 2 | Add **new** mobile-only branch or helper (e.g. `snapDiagramToolbarToEdgeForMobile`) in app.js; call from onPointerUp, init, ResizeObserver when `viewportMode === 'mobile'`. | Change desktop path in `updateOrientationFromPosition` or remove the else branch for desktop. |
| 3 | On mobile, after snap, set `toolbar.style.left` / `toolbar.style.top`, `data-orientation`, and localStorage. | Change clamp logic for desktop or remove clamp for mobile (clamp stays; snap runs after). |
| 4 | For mobile init: if saved position would be “middle”, run snap-to-edge once and apply. | Change how desktop reads or applies saved X/Y/orientation. |
| 5 | Add a11y override (e.g. `body.a11y-large-controls`) for horizontal compact so 44px can be restored. | Remove 44px rules for vertical or for desktop. |

### 7.3 File reference (where to add, not replace)

- **frontend/styles.css:** Add rules **after** existing `body[data-viewport-mode="mobile"] .diagram-floating-toolbar` and `[data-orientation="horizontal"]` blocks (~2149–2159). Use more specific selectors (e.g. same + `flex-wrap: nowrap`) or new blocks; do not delete existing mobile diagram toolbar rules.
- **frontend/app.js:** Add snap-to-edge helper or extend `updateOrientationFromPosition` with an **early return or branch**: `if (layoutState.viewportMode !== 'mobile') { ... existing logic ...; return; }` then new mobile snap logic. Or call a new function from the same three call sites (onPointerUp, init, ResizeObserver) when mobile. Do not remove existing `updateOrientationFromPosition` behaviour for desktop.
