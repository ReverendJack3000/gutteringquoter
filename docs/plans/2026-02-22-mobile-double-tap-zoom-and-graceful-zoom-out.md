# Plan: Prevent double-tap zoom on mobile and graceful zoom-out

**Date:** 2026-02-22  
**Scope:** Mobile UI/accessibility only. Desktop and Railway deployment unchanged.  
**Context:** Quote App – single codebase, adaptive layout via `data-viewport-mode`; canvas zoom (viewZoom, pinch, diagram toolbar −/Fit/+). Task 54.11 requires viewport to allow pinch-zoom (no `user-scalable=no`).

---

## 1. Goal

- **Prevent double-tap zoom** on the mobile view so the browser does not zoom the page when the user double-taps (e.g. on the canvas).
- **Ensure graceful zoom-out** when the user is zoomed in (canvas or accidental browser zoom) so they are never “stuck” and do not have to restart the app.

---

## 2. Current state (verified from codebase)

- **Viewport meta** (`frontend/index.html`): `width=device-width, initial-scale=1.0, viewport-fit=cover` — no `maximum-scale` or `user-scalable=no` (54.11: pinch allowed for accessibility). We must **not** add `maximum-scale=1` or `user-scalable=no` globally, as that would disable pinch-zoom and conflict with 54.11.
- **Canvas:** `#canvas` has `touch-action: none` (`styles.css` ~1752). `.blueprint-wrap` and `#view-canvas` do **not** have `touch-action` set; double-tap on those containers may still trigger **browser** zoom in some mobile browsers.
- **Zoom controls:** Zoom Out, Fit, Zoom In live only in the **diagram floating toolbar** (`#diagramFloatingToolbar` inside `.blueprint-wrap`). Toolbar is clamped on-screen (54.50) but can be collapsed to “+”; when canvas is zoomed in, users may not think to expand the toolbar to reach Fit.
- **“Stuck” scenarios:**
  - **Browser zoom:** User double-taps → browser zooms the **page** → whole UI scales; no in-app control to zoom the **browser** viewport back → user feels stuck.
  - **Canvas zoom:** User pinches in → canvas zooms; if they don’t find the diagram toolbar (e.g. collapsed “+”) or don’t associate it with “zoom out”, they have no obvious way to Fit. Adding an always-visible Fit control and/or a gesture (e.g. double-tap on empty canvas) gives a reliable way out.
- **Existing dblclick:** Canvas has `dblclick` → if target is a badge, opens length popover (`openBadgeLengthPopoverForElement`). We must preserve that on mobile; any new double-tap behavior applies only when the second tap is **not** on a badge/element.

---

## 3. Desktop vs mobile impact

| Change | Desktop | Mobile |
|--------|--------|--------|
| Viewport meta | No change | No change (keep pinch allowed) |
| touch-action on canvas view | No change | Apply only under `body[data-viewport-mode="mobile"]` |
| Fit in global toolbar | Not added (or hidden on desktop) | Shown only when mobile |
| Double-tap → Fit on empty canvas | No (or NOP) | Yes, when no badge under tap |
| dblclick on badge | Unchanged | Unchanged (length popover) |

All new logic and CSS must be gated by `layoutState.viewportMode === 'mobile'` or `body[data-viewport-mode="mobile"]` so desktop production UI is unaffected.

---

## 4. Proposed implementation

### 4.1 Prevent double-tap zoom (mobile only)

- **Do not** change the viewport meta (no `maximum-scale`, no `user-scalable=no`).
- **CSS:** Under `body[data-viewport-mode="mobile"]`, set `touch-action: none` on:
  - `#view-canvas` (canvas view container)
  - `.blueprint-wrap` (or `#blueprintWrap`)
  so the entire canvas view area suppresses the browser’s default double-tap zoom. The canvas (`#canvas`) already has `touch-action: none`; extending to the parent containers ensures taps on the wrapper (e.g. margins, hit areas) do not trigger browser zoom.
- **Rationale:** `touch-action: none` on the interactive region prevents the browser from applying its default touch behaviors (including double-tap zoom) there, without disabling pinch-zoom elsewhere (e.g. modals, panels) and without changing the viewport meta, so 54.11 remains satisfied.

### 4.2 Always-visible “Fit view” on mobile

- **HTML:** Add a mobile-only “Fit view” control that is always visible. Prefer **global toolbar** so it is reachable regardless of diagram toolbar state (collapsed/expanded, position).
  - Option A: Add a button (e.g. “Fit” or same icon as `#zoomFitBtn`) to the global toolbar, visible only when `data-viewport-mode="mobile"` (e.g. `aria-hidden="true"` + hidden via CSS on desktop, or conditional render in JS). Place it so it does not crowd the toolbar (e.g. near existing actions).
  - Option B: Reuse or duplicate the existing Fit behavior by showing a “Fit view” entry in an existing mobile menu if one exists and is always visible; only if no such menu, add a dedicated button.
- **JS:** On click, call the same logic as `#zoomFitBtn`: `state.viewZoom = 1`; `resetMobileFitPanState()`; `draw()`. Guard so the handler runs only when `layoutState.viewportMode === 'mobile'`.
- **Accessibility:** Button has `aria-label="Fit view"` (or same as existing Fit), 44px min touch target on mobile, and is keyboard/screen-reader reachable.

### 4.3 Double-tap on empty canvas → Fit (mobile only)

- **JS:** On mobile, use the existing canvas `pointerdown`/`pointerup` (or a dedicated gesture) to detect a **double-tap on empty canvas** (no element/badge under the tap). If detected:
  - Trigger Fit: `state.viewZoom = 1`; `resetMobileFitPanState()`; `draw()`.
  - Prevent default / stop propagation so the browser does not treat it as a double-tap for page zoom (in addition to 4.1).
- **Conflict with badge double-tap:** Existing `dblclick` on canvas opens the length popover when the target is a badge. Logic must be:
  - If the second tap of the double-tap hits a **badge** (or measurable element) → keep current behavior (open length popover).
  - If the second tap hits **empty** canvas (no badge) → Fit view.
- **Implementation approach:** e.g. on second pointerdown within a short time window (e.g. ~300–400 ms) and within a small distance of the first tap:
  - Run hit test (e.g. `hitTestBadge` or equivalent for “empty canvas”).
  - If hit is a badge → let existing dblclick handler run (or explicitly open popover).
  - If hit is empty → run Fit, `preventDefault()`, `stopPropagation()`.
- **Desktop:** Do not run this double-tap-to-fit logic when `layoutState.viewportMode !== 'mobile'` (or equivalent).

### 4.4 Edge cases and accessibility

- **Scroll/bleed:** Double-tap detection must use a small movement threshold so a slight finger drift does not count as two separate taps; re-use or align with existing mobile tap/move threshold (e.g. 54.62) where applicable.
- **ARIA/labels:** New “Fit view” button must have a clear label and not duplicate announcements when Fit is triggered from toolbar and from double-tap; use the app announcer once per Fit action if desired.
- **Zoom-out from browser zoom:** We do **not** add `maximum-scale=1` (to preserve 54.11). If the user has already zoomed the **browser** (e.g. via system settings or another gesture), we cannot programmatically reset that. The plan reduces the chance of accidental **double-tap** browser zoom; if we later need to detect and warn when `window.visualViewport.scale !== 1`, that can be a follow-up.
- **200% zoom / a11y:** Ensure the new Fit button remains usable at 200% zoom and in portrait/landscape; follow existing mobile patterns (44px target, safe area).

### 4.5 Railway and deployment

- No new dependencies, no new build step, no Procfile/nixpacks/Dockerfile changes. Frontend-only (HTML/CSS/JS). Safe for current Railway deployment.

---

## 5. Task list update (draft)

- Add a new subsection under **Section 54 (Mobile app)** for “Mobile: double-tap zoom and graceful zoom-out” with tasks:
  - **54.102.1** Prevent double-tap zoom: apply `touch-action: none` to `#view-canvas` and `.blueprint-wrap` (or `#blueprintWrap`) under `body[data-viewport-mode="mobile"]`; do not change viewport meta.
  - **54.102.2** Mobile-only “Fit view” in global toolbar: add button (visible when mobile), same behavior as diagram toolbar Fit; 44px target, aria-label; desktop hidden/unchanged.
  - **54.102.3** Mobile double-tap on empty canvas → Fit: detect double-tap on canvas when no badge under tap; trigger Fit and prevent default; preserve dblclick-on-badge → length popover; gate by viewportMode === 'mobile'.
  - **54.102.4** QA: manual mobile (iOS Safari, Android Chrome), portrait/landscape, 200% zoom; confirm no desktop regression and Railway deploy unchanged.

- Reference this plan in the section file and in `TASK_LIST.md` “Where to look” / uncompleted table as needed.

---

## 6. Files to touch

| File | Changes |
|------|--------|
| `frontend/index.html` | Optional: add mobile-only Fit button in global toolbar (or hook for JS-injected button). |
| `frontend/styles.css` | `body[data-viewport-mode="mobile"] #view-canvas`, `.blueprint-wrap` (or `#blueprintWrap`) `touch-action: none`; mobile-only Fit button visibility. |
| `frontend/app.js` | Double-tap detection on canvas (mobile-only), Fit when empty; wire global toolbar Fit button if added in HTML; all gated by `layoutState.viewportMode === 'mobile'`. |
| `docs/tasks/section-54.md` | New tasks 54.102.1–54.102.4. |
| `TASK_LIST.md` | Add row for 54.102.x in uncompleted table if section 54 remains in progress. |

No backend, no E2E required for first iteration (optional E2E in follow-up).

---

## 7. Summary

- **Double-tap zoom:** Suppress it on the canvas view with `touch-action: none` on the mobile canvas containers only; leave viewport meta unchanged so 54.11 (pinch allowed) is preserved.
- **Graceful zoom-out:** (1) Always-visible “Fit view” in the global toolbar on mobile; (2) double-tap on empty canvas → Fit on mobile, with badge double-tap still opening the length popover. Desktop unchanged; Railway-safe.
