# Mobile: Canvas Page Size and Toolbars (No-Scroll) — Execution Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** On mobile only, make the canvas feel bounded with a defined “page” so content fits by default with less zoom/scroll, while keeping zoom-in/zoom-out. Ensure both the global toolbar and the diagram floating toolbar show all tools without requiring horizontal or vertical scroll.

**Architecture:** (1) Introduce an optional mobile-only “page size” (logical canvas bounds) so initial fit and zoom-out have a natural limit; viewport/canvas resize and draw() fit logic remain shared but branch on `layoutState.viewportMode === 'mobile'` where needed. (2) On mobile, diagram toolbar always uses a layout that shows all controls without overflow (e.g. vertical stack or wrapped row); global toolbar already wraps via `flex-wrap: wrap` — verify no scroll and all items visible. No changes to desktop behaviour.

**Tech Stack:** Vanilla JS (app.js), CSS (styles.css), HTML (index.html). Single codebase; mobile gated by `data-viewport-mode="mobile"` and `layoutState.viewportMode`.

---

## Current-State Summary (Accuracy Check)

- **Canvas size:** `resizeCanvas()` in `app.js` (lines ~5518–5536) sets `state.canvasWidth/Height` from `blueprintWrap.clientWidth/Height` (display size × devicePixelRatio). The canvas element fills `.blueprint-wrap`, which on mobile is `flex: 1`, `min-width: 0` inside `.workspace`; the panel is `position: fixed; bottom: 0` so blueprint-wrap gets the remaining height.
- **Fit/zoom:** In `draw()`, when there is content (blueprint or elements), `baseScale` is computed to fit the content bbox (with 20px padding) into `state.canvasWidth/Height`. There is no fixed “page” — the logical coordinate space is content-defined. Zoom (viewZoom) and pan (viewPanX/Y) apply on top. Pinch zoom and pan are implemented for mobile (54.16, 54.17).
- **Diagram floating toolbar:** Lives in `#diagramFloatingToolbar` inside `.blueprint-wrap`. Desktop: draggable, edge-snaps to vertical at left/right 20% (`updateOrientationFromPosition`, `data-orientation="horizontal"|"vertical"`). Mobile CSS (`body[data-viewport-mode="mobile"] .diagram-floating-toolbar`): `overflow-x: auto`, `overflow-y: hidden`, so tools can scroll horizontally; `max-width: calc(100% - 32px)`.
- **Global toolbar:** `#globalToolbar` in `#globalToolbarWrap`; mobile has `flex-wrap: wrap`. No horizontal scroll on the toolbar itself; long content could wrap. Collapsible (54.19/54.26); no drag on header.

---

## Part A: Mobile Canvas Background / Defined Page Size

**Objective:** Reduce perceived “endless” zoom/scroll on mobile by giving the canvas a defined logical size (page) when in mobile viewport mode. Content should fit within this page by default; user can still zoom in to work on details and zoom out to the page.

**Options considered:**

1. **Fixed logical page size (e.g. reference pixels)**  
   Define constants e.g. `MOBILE_PAGE_WIDTH_PX`, `MOBILE_PAGE_HEIGHT_PX` (logical). On mobile, when computing initial fit (and optionally when zooming out), treat the “view” as this rectangle: scale content so the content bbox fits inside this logical page, and optionally draw a subtle page boundary (e.g. background or border). Canvas draw surface remains the same (viewport-sized); only the fit/scale math and optional visual differ.  
   **Pro:** Simple, predictable. **Con:** Page aspect may not match every device.

2. **Page size = viewport aspect, fixed area**  
   Set logical page size so that aspect ratio matches the current blueprint-wrap aspect ratio and area is a fixed value (e.g. 1M px²). Fit content into this.  
   **Pro:** No letterboxing. **Con:** Page size changes on rotation/resize.

3. **No page size; only improve initial fit and zoom limits**  
   Keep content-defined space but (a) ensure first paint after upload/load fits content with comfortable padding on mobile, (b) set min/max viewZoom so zoom-out doesn’t go to tiny and zoom-in is capped.  
   **Pro:** Minimal code. **Con:** No “page” metaphor.

**Recommendation:** Option 1 (fixed logical page size) for a clear “page” and consistent behaviour. Use a single reference size (e.g. 800×600 or 1024×768 logical px) so that “Fit” on mobile fits content into this page; zoom-out is clamped so scale doesn’t go below the fit scale (or a minimum). Optionally draw a light page boundary (e.g. background colour or border) only on mobile so the page is visible.

**Files to touch:**

- `frontend/app.js`: Add mobile-only constants (e.g. `MOBILE_PAGE_WIDTH_PX`, `MOBILE_PAGE_HEIGHT_PX`). In `draw()`, when `layoutState.viewportMode === 'mobile'` and computing baseScale/baseOffset, fit content into this logical page size (scale = min((pageW - pad*2)/bboxW, (pageH - pad*2)/bboxH)) and center; optionally enforce a minimum scale on zoom-out so the view never goes “smaller than page”. Ensure desktop path is unchanged (no use of page size when viewportMode !== 'mobile').
- `frontend/app.js`: If we draw a page boundary: in the same branch (mobile only), before or after drawing content, draw a rectangle or background for the page bounds (in canvas coordinates). Ensure it doesn’t affect export (export uses same draw logic; page can be part of background or excluded by design).
- `frontend/styles.css`: No strict requirement unless we add a visible “page” container in DOM; current plan keeps page as a logical/canvas concept.

**Desktop safety:** All new logic is guarded by `layoutState.viewportMode === 'mobile'`. Desktop fit and zoom behaviour remain as today.

---

## Part B: Diagram Floating Toolbar — All Tools Visible on Mobile (No Scroll)

**Objective:** On mobile, the diagram floating toolbar must show all tools without horizontal (or vertical) scrolling. All tools should be visible at once, either in a single row, a single column, or a wrapped layout.

**Current behaviour:** `body[data-viewport-mode="mobile"] .diagram-floating-toolbar` has `overflow-x: auto`, `overflow-y: hidden`, so when the pill is wider than the wrap, users scroll. Tools: drag handle, technical drawing toggle, zoom out, fit, zoom in, inspector, colour diagram, transparency (when applicable). That’s many controls; on narrow phones a single row will not fit.

**Options:**

1. **Force vertical layout on mobile**  
   On mobile, always use `flex-direction: column` for the diagram toolbar (equivalent to `data-orientation="vertical"`). All items stack vertically; no horizontal scroll. Height may exceed viewport, but we can (a) allow the toolbar to scroll vertically if needed, or (b) keep toolbar compact (smaller touch targets not recommended) or (c) allow toolbar to extend and ensure it’s still clamped within blueprint-wrap.  
   **Pro:** All tools visible in one column; no horizontal scroll. **Con:** Tall toolbar on small screens; may need vertical scroll for the toolbar itself unless we reduce items or size.

2. **Multi-row wrap on mobile**  
   Use `flex-wrap: wrap` and `flex-direction: row` so the toolbar wraps to multiple rows. No overflow-x. All tools visible without horizontal scroll; may take 2–3 rows.  
   **Pro:** No scroll, familiar. **Con:** Uses more vertical space.

3. **Keep horizontal but remove overflow; shrink or hide secondary actions**  
   Reduce button size or hide some actions behind “More” on mobile so one row fits.  
   **Pro:** Single row. **Con:** Fewer visible tools or smaller touch targets (conflicts with 44px HIG).

**Recommendation:** Option 1 (vertical stack on mobile) so all tools are visible and 44px touch targets are preserved. If the stacked toolbar is taller than the wrap, either (a) allow vertical scroll only for the toolbar (so no horizontal scroll), or (b) position the toolbar at top and allow it to extend downward with wrap scroll, or (c) keep toolbar height within wrap and ensure no scroll (e.g. two columns of icons if needed). Prefer (a) or (b) so we don’t shrink controls. Implementation: mobile-only CSS to force `flex-direction: column`, `overflow-x: hidden`, `overflow-y: auto` (if we allow toolbar to scroll when tall), and remove `overflow-x: auto`. JS: on mobile, `updateOrientationFromPosition` could force vertical and persist that for mobile only, or we simply don’t switch to horizontal on mobile so the toolbar stays vertical and all items visible.

**Files to touch:**

- `frontend/styles.css`: Under `body[data-viewport-mode="mobile"] .diagram-floating-toolbar`, set `flex-direction: column`, remove or override `overflow-x: auto` to `overflow-x: hidden`. If toolbar can be taller than wrap, set `max-height: calc(100% - 24px)` and `overflow-y: auto` so only the toolbar scrolls vertically if needed; ensure no horizontal scroll.
- `frontend/app.js`: In `initDiagramToolbarDrag` (or when applying position/orientation), when `layoutState.viewportMode === 'mobile'`, force `data-orientation="vertical"` and optionally skip horizontal positioning logic so the toolbar defaults to a consistent position (e.g. top-left or top-center) and stays vertical. Ensure `clampDiagramToolbarToWrap` still keeps the toolbar inside the wrap when in vertical mode on mobile. Desktop behaviour unchanged.

**Desktop safety:** Diagram toolbar on desktop keeps current draggable + edge-snap horizontal/vertical behaviour. Mobile-only CSS and any mobile-only branches in JS leave desktop untouched.

---

## Part C: Global Toolbar — All Items Visible Without Scroll

**Objective:** Ensure the global (top) toolbar never requires scrolling through tools; all actions should be visible (wrapped or in one row).

**Current behaviour:** `.toolbar` on mobile has `flex-wrap: wrap`. So items can wrap to a second row. There is no `overflow-x: auto` on the global toolbar. So theoretically all items are already visible by wrapping. The only risk is if something (e.g. a long project name or many buttons) forces horizontal overflow; we should ensure the toolbar does not show a horizontal scrollbar and that all primary actions remain visible (e.g. Projects, Undo, Redo, Upload, Export, Save, Diagrams, Accessibility, Generate Quote, user avatar).

**Tasks:**

- Audit `frontend/index.html` and `frontend/styles.css` for the global toolbar: confirm no `overflow-x: auto` on `.toolbar` or `.global-toolbar-wrap` on mobile. If any, remove so that wrapping is the only behaviour.
- Ensure `body[data-viewport-mode="mobile"] .toolbar` keeps `flex-wrap: wrap` and that `.toolbar-right` / `.toolbar-left` can shrink so the row wraps instead of overflowing. Add `min-width: 0` on flex children if needed so text/inputs don’t prevent wrapping.
- Optional: If the toolbar grows to more than two rows, consider moving “Generate Quote” or secondary actions to a “More” menu on very narrow widths — only if testing shows overlap or scroll. Otherwise leave as wrap.

**Files to touch:**

- `frontend/styles.css`: Any overrides needed so global toolbar never scrolls horizontally; ensure wrap and visibility.
- `frontend/app.js`: Unlikely; only if we add dynamic “More” for very narrow widths.

**Desktop safety:** No change to desktop toolbar layout.

---

## Part D: Integration and Regression

- **Viewport switch:** When user resizes from desktop to mobile (or uses `?viewport=mobile`), ensure (1) diagram toolbar re-inits with mobile-friendly default (vertical, no scroll), (2) next draw() uses mobile page size for fit if implemented. `applyViewportMode` already calls `resizeCanvas()` and re-inits diagram toolbar drag (see `handleViewportResize` / `applyViewportMode`); ensure new mobile logic is applied on switch.
- **Export PNG:** Export uses the same canvas and draw path; if we draw a page boundary on mobile, decide whether it’s included in export or not and implement accordingly (e.g. draw page only in a “preview” pass, or include as background).
- **E2E:** Existing mobile viewport tests (e.g. forced mobile mode, orientation) should still pass. Add or extend one E2E check: on mobile, diagram toolbar has no horizontal scroll (e.g. element has `overflow-x: hidden` or computed overflow not auto) and global toolbar does not show horizontal scroll.
- **Railway:** No backend or build changes; deployment remains as today.

---

## Task List (Bite-Sized)

### Task 1: Add mobile page size constants and fit logic (app.js)

**Files:** Modify `frontend/app.js`

- Add constants e.g. `MOBILE_PAGE_WIDTH_PX = 800`, `MOBILE_PAGE_HEIGHT_PX = 600` (or 1024×768) near other layout constants (e.g. near `MOBILE_LAYOUT_BREAKPOINT_PX`).
- In `draw()`, in the block where `baseScale` and `baseOffsetX/Y` are computed from content bbox: when `layoutState.viewportMode === 'mobile'` and `hasContent`, use `pageW = MOBILE_PAGE_WIDTH_PX`, `pageH = MOBILE_PAGE_HEIGHT_PX` instead of `w`/`h` for the fit scale calculation (scale = min((pageW - pad*2)/bboxW, (pageH - pad*2)/bboxH)), then map that scale to the actual canvas size so the content is centered and fits the visible viewport. (Implementation detail: we can keep drawing in viewport-sized canvas but derive baseScale so that one “logical page” unit matches the chosen page size; then offset so content is centered in the viewport.)
- Ensure when `viewportMode !== 'mobile'` the existing logic is unchanged (use `w`, `h` from canvas dimensions).

**Step 2:** Manual test: desktop fit unchanged; mobile (narrow or ?viewport=mobile) fits content to the new page box.

### Task 2: (Optional) Draw mobile page boundary

**Files:** Modify `frontend/app.js`

- In `draw()`, in the mobile-only branch, before drawing layers: draw a rectangle or fill for the logical page bounds (using current scale/offset) so the user sees a subtle page boundary. Use a light background or border so it doesn’t obscure content.
- Decide export behaviour: same as screen (page visible) or exclude (don’t draw page when exporting). If export uses a separate code path, skip drawing the page in that path.

### Task 3: Enforce minimum zoom-out on mobile (optional)

**Files:** Modify `frontend/app.js`

- When applying viewZoom (e.g. in `draw()` or in pinch/wheel handlers), on mobile clamp `state.viewZoom` so it never goes below the scale that would show the full “page” (e.g. 1.0 when fit is already to page). Prevents zooming out to a tiny infinite-looking canvas.

### Task 4: Diagram toolbar — vertical layout and no horizontal scroll (mobile CSS)

**Files:** Modify `frontend/styles.css`

- Under `body[data-viewport-mode="mobile"] .diagram-floating-toolbar`: set `flex-direction: column`, `overflow-x: hidden`. Set `overflow-y: auto` and `max-height: calc(100vh - 120px)` or similar so if the stacked toolbar is taller than the wrap, only the toolbar scrolls vertically. Remove `overflow-x: auto` and `scroll-snap-type` so there is no horizontal scroll.
- Ensure 44px min height/width on buttons is preserved.

### Task 5: Diagram toolbar — mobile default vertical in JS

**Files:** Modify `frontend/app.js`

- In `initDiagramToolbarDrag` (or in the code that applies saved position): when `layoutState.viewportMode === 'mobile'`, set toolbar to `data-orientation="vertical"` and apply a default position (e.g. top-left 12px, 12px) so the toolbar doesn’t rely on desktop horizontal layout. Optionally skip restoring desktop localStorage position for diagram toolbar when on mobile so mobile always gets vertical.
- Ensure `clampDiagramToolbarToWrap` and `updateOrientationFromPosition` don’t switch mobile toolbar back to horizontal; e.g. in `updateOrientationFromPosition` skip orientation change when viewportMode === 'mobile', or always set vertical on mobile.

### Task 6: Global toolbar — no horizontal scroll (audit + CSS)

**Files:** Modify `frontend/styles.css` (and optionally `frontend/index.html` if structure helps)

- Confirm `.toolbar` and `#globalToolbarWrap` do not have `overflow-x: auto` on mobile. If they do, remove.
- Ensure `body[data-viewport-mode="mobile"] .toolbar` has `flex-wrap: wrap` and add `min-width: 0` on `.toolbar-left`, `.toolbar-right` if needed so flex items can shrink and wrap. Ensure no horizontal scrollbar appears.

### Task 7: Viewport switch and re-init

**Files:** Modify `frontend/app.js`

- In `applyViewportMode`, after `resizeCanvas()` and any diagram toolbar re-init, ensure mobile gets (1) vertical diagram toolbar and (2) next draw() uses mobile page fit. Already called from `handleViewportResize` and when opening panel; verify no duplicate inits and that new behaviour is applied.

### Task 8: E2E or manual regression

**Files:** `tests/` or manual checklist

- Run existing E2E with mobile viewport; fix any failures.
- Add assertion or manual check: mobile diagram toolbar has no horizontal overflow (overflow-x !== 'auto' or scrollWidth <= clientWidth).
- Desktop: verify fit, zoom, diagram toolbar drag and edge-snap, global toolbar — all unchanged.

### Task 9: Documentation and TASK_LIST

**Files:** `TASK_LIST.md`, `README.md` or `TROUBLESHOOTING.md` if needed

- Update `TASK_LIST.md` with new Section 54 tasks (54.36, 54.37, …) and mark complete as implemented.
- If any quirk (e.g. export including/excluding page) is non-obvious, add a line to README or TROUBLESHOOTING.

---

## Confirmation: Existing Functionality Preserved

| Area | Risk | Mitigation |
|------|------|------------|
| Desktop layout | New logic could affect desktop fit/zoom | All new fit/page logic guarded by `layoutState.viewportMode === 'mobile'`. |
| Desktop diagram toolbar | Drag and edge-snap could change | Mobile-only CSS and mobile-only branches in JS; desktop keeps current behaviour. |
| Export PNG | Page boundary might appear in export | Explicit decision in Task 2: include or exclude; implement in same draw path or export path. |
| Pinch/pan on mobile | Change to fit math could break pan/zoom | Fit only affects baseScale/baseOffset; viewZoom and viewPanX/Y unchanged; pinch handlers unchanged. |
| Railway deploy | Build/deploy config | No backend or build changes; static frontend only. |

---

## Execution Order

1. Task 1 (mobile page size + fit).
2. Task 2 (optional page boundary) and Task 3 (optional min zoom-out).
3. Task 4 + 5 (diagram toolbar mobile vertical, no scroll).
4. Task 6 (global toolbar audit).
5. Task 7 (viewport switch).
6. Task 8 (E2E/regression).
7. Task 9 (TASK_LIST and docs).

After implementation, mark the corresponding Section 54 tasks in `TASK_LIST.md` complete and request user approval before considering the feature done.
