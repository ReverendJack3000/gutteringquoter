# Plan: Mobile Diagram Toolbar – Collapsed/Expanded Behavior and Horizontal Scroll Fix

**Date:** 2026-02-21  
**Goal:** Produce a correct, assumption-free plan to fix mobile diagram toolbar so (1) collapsed and expanded views behave correctly, and (2) horizontal scrolling on the horizontal toolbar works on mobile. No code changes in this step; add/update uncompleted tasks in `TASK_LIST.md` as needed.  
**Scope:** Mobile UI/accessibility only; desktop production UI must remain unchanged. Railway deployment must continue to succeed (no new dependencies or build steps).

---

## 1. Context (cursor rules, TASK_LIST, README)

- **Task source:** `TASK_LIST.md` is the single source of truth; completion = `[x]` on the task line.
- **Architecture:** Single codebase; viewport mode via `body[data-viewport-mode]` (CSS) and `layoutState.viewportMode` (JS). Diagram toolbar logic lives in **`frontend/toolbar.js`** (extracted from app.js); app.js imports `initDiagramToolbarDrag` and calls it with `getViewportMode: () => layoutState.viewportMode`.
- **Deployment:** Railway uses Procfile + nixpacks.toml; backend serves static frontend. No new build or config changes.
- **Desktop vs mobile:** All fixes must be scoped to mobile (e.g. `body[data-viewport-mode="mobile"]` in CSS, `getViewportMode() === 'mobile'` in JS) so desktop production is unaffected.

---

## 2. Current Behavior (Verified Against Codebase)

### 2.1 toolbar.js (collapsed vs expanded, orientation)

- **Collapsed state:** Toggled by `#diagramToolbarCollapseBtn` click; class `diagram-floating-toolbar--collapsed` is toggled; state persisted to `quoteApp_diagramToolbarCollapsed`. On **mobile init**, `collapsed` is forced to `false` (line 210) so the app opens with the toolbar expanded.
- **Expand/collapse flow:** `onCollapseClick` toggles the class, updates aria and title, then double rAF → `clampDiagramToolbarToWrap` and (on mobile) `applyMobileToolbarEdgeSnap`. No logic errors identified; tap-to-expand and drag suppression (`shouldSuppressExpandAfterDrag`) are in place.
- **Orientation:** Set by `updateOrientationFromPosition()`: on **desktop** uses zone logic (top/bottom 20% → horizontal, left/right 20% → vertical); on **mobile** delegates to `applyMobileToolbarEdgeSnap(toolbar, wrap, computeMobileToolbarEdgeSnap(...))`, which sets `data-orientation` from edge (top/bottom → horizontal, left/right → vertical) and snaps position. Orientation is set on init, pointer up, collapse/expand reflow (double rAF), and ResizeObserver. No outdated or missing orientation logic found in toolbar.js after the refactor.
- **Scroll:** toolbar.js does **not** control overflow or scroll; it only sets position and `data-orientation`. Scrolling is entirely CSS-driven.

### 2.2 CSS (mobile diagram toolbar)

- **Base mobile toolbar** (lines ~2130–2155): `body[data-viewport-mode="mobile"] .diagram-floating-toolbar` — column flex, overflow hidden, max-width/max-height, etc.
- **Base mobile tools-wrap** (lines 2156–2159): `body[data-viewport-mode="mobile"] .diagram-floating-toolbar .diagram-toolbar-tools-wrap` — `flex-wrap: nowrap; overflow: hidden`. This applies to **all** orientations until overridden.
- **Horizontal mobile tools-wrap** (lines 2200–2213): `body[data-viewport-mode="mobile"] .diagram-floating-toolbar[data-orientation="horizontal"] .diagram-toolbar-tools-wrap` — `flex-direction: row`, `flex-wrap: nowrap`, `overflow-x: auto`, `overflow-y: hidden`, scrollbar hidden, `-webkit-overflow-scrolling: touch`. This is **more specific** than the base 2156 rule, so horizontal **should** get scroll when expanded.
- **Collapsed** (lines 2162–2185, and base 1253–1326): When `diagram-floating-toolbar--collapsed`, the tools-wrap is given `width: 0`, `max-width: 0`, `overflow: hidden`, etc., so the inner tools are hidden. No scroll in collapsed state; design is correct.
- **@media (max-width: 430px)** (lines 2231–2241): **Conflict.** For viewports **≤ 430px**, the same horizontal tools-wrap gets:
  - `flex-wrap: wrap`
  - `justify-content: center`
  - `max-width: 100%`
  So on typical phone widths (e.g. 375px, 390px, 414px), the horizontal toolbar **wraps** to multiple rows instead of staying a single row with horizontal scroll. This matches the user’s screenshot (icons in a 2-row layout) and explains “horizontal scrolling … is not working properly.”

### 2.3 E2E (e2e/run.js)

- Mobile viewport is **375×667** (line 1396), so E2E runs **inside** the 430px breakpoint. After drag-to-top (horizontal orientation), the tools-wrap has `flex-wrap: wrap` from the media query; content may not overflow, so `toolsScroll` can be false. The test only asserts that the **container** does not scroll (`!toolbarScrollState.toolbarScroll`) for horizontal; it does **not** require `toolsScroll === true`. So the test can pass even when horizontal scroll is effectively disabled by the 430px wrap.

---

## 3. Root Cause Summary

| Issue | Cause |
|-------|--------|
| Horizontal scroll “not working properly” on mobile | The `@media (max-width: 430px)` block overrides the horizontal tools-wrap with `flex-wrap: wrap`, so on most phones the toolbar becomes multi-row and does not scroll horizontally. |
| Expanded/collapsed “not behaving as they should” | JS (toolbar.js) behavior is consistent. Any misbehavior is likely (a) CSS specificity/order, or (b) the 430px wrap making the expanded horizontal toolbar look like a fat multi-row pill instead of a thin scrollable row. Fixing the 430px override should improve expanded horizontal behavior. |

No assumptions: the above is derived from the current `frontend/toolbar.js`, `frontend/styles.css`, and `e2e/run.js` only.

---

## 4. Proposed Implementation Plan (No Code Yet)

### 4.1 CSS (frontend/styles.css) – mobile only

1. **Horizontal scroll on all mobile widths (recommended):**  
   Remove or relax the `@media (max-width: 430px)` block (lines 2230–2241) so that:
   - `body[data-viewport-mode="mobile"] .diagram-floating-toolbar[data-orientation="horizontal"] .diagram-toolbar-tools-wrap` keeps `flex-wrap: nowrap` and `overflow-x: auto` at all mobile widths.
   - Result: single row + horizontal scroll on phones (375px, 390px, 414px, etc.), with 44px targets and `flex-shrink: 0` already in place (lines 2219–2227).

2. **Optional narrow fallback:**  
   If product wants a wrap fallback only on very narrow widths (e.g. ≤360px), add a **new** media query (e.g. `@media (max-width: 360px)`) that applies wrap only in that range; do **not** reapply the 430px override. That way 361–430px and above get scroll.

3. **No other CSS changes** for this fix: base mobile rules and collapsed rules are correct. All changes remain under `body[data-viewport-mode="mobile"]` so desktop is unaffected.

### 4.2 JS (frontend/toolbar.js and app.js)

- **No changes required** for scroll or orientation. toolbar.js already sets `data-orientation` correctly; collapse/expand and edge snap are in place. If after the CSS change any edge case appears (e.g. scroll position on orientation change), it can be handled in a follow-up.

### 4.3 E2E (e2e/run.js)

- After the CSS change, at 375px the horizontal tools-wrap will have `overflow-x: auto` and `flex-wrap: nowrap`. If content overflows, `toolsScroll` may become true. The current Option B logic already allows horizontal mode to have tools-wrap scroll; no change strictly required. Optionally: assert that when orientation is horizontal and toolbar is expanded, either `toolsScroll === true` (when content overflows) or do not assert “no scroll” on the tools-wrap.

### 4.4 Desktop and Railway

- No desktop CSS or JS changes. No new dependencies or build steps. Railway deployment remains valid.

---

## 5. Edge Cases and Accessibility

1. **Touch scroll vs drag:** The toolbar drag handle (and on collapsed, the collapse button) captures pointer for drag. The **tools-wrap** is a separate scroll container; touch on the wrap should scroll, not drag the toolbar. Confirm that touch on the wrap does not trigger toolbar drag (pointer capture is on the toolbar/drag-handle/collapse button). If scroll is still stolen, consider `touch-action: pan-x` on the tools-wrap in horizontal mode (mobile only) so the browser treats it as a scroll target.
2. **Very narrow viewports (e.g. 320px):** With a single row and 44px buttons, the toolbar can become wide. Options: keep scroll (user swipes), or use the optional 360px wrap fallback so only very narrow widths wrap.
3. **Orientation change (portrait ↔ landscape):** ResizeObserver and clamp/snap already run; no extra logic needed for scroll. After CSS fix, horizontal scroll will apply whenever `data-orientation="horizontal"` regardless of width band.
4. **Collapsed state:** No scroll in collapsed state; tools-wrap is hidden. No change.

---

## 6. Task List Update (Draft)

After implementation and verification:

- **If a new task is used:** Add a task under Section 54, e.g. **54.77** “Mobile: horizontal diagram toolbar scroll – remove 430px wrap override so single row + overflow-x scroll on all mobile widths; optional 360px wrap fallback; E2E remains orientation-aware.”
- **If 54.75 is revisited:** Add a sub-task or note that 54.75 horizontal scroll was fixed for viewports ≤430px by removing/relaxing the `@media (max-width: 430px)` wrap override (plan: this document).
- **Uncompleted table (top of TASK_LIST):** Ensure the new or updated task is reflected in the “Uncompleted tasks (by section)” table if it remains uncompleted.

---

## 7. Verification (Post-Implementation)

- Run `npm test` (E2E); mobile diagram toolbar tests should pass.
- Manual: load app with `?viewport=mobile` on a phone or narrow viewport (e.g. 375px); drag toolbar to top (horizontal); confirm single row and horizontal swipe scroll; no visible scrollbar (scrollbar hidden). Collapse and expand; confirm circle and pill morph. Drag to left/right; confirm vertical slim pill. Desktop: no layout or behavior change.
- Confirm no horizontal overflow on the page (existing E2E overflow check).

---

## 8. What Is NOT Changing

- **Desktop:** No CSS or JS changes outside mobile scoping.
- **toolbar.js** collapse/expand, orientation, or edge-snap logic (no change unless a follow-up finds a bug).
- **44px touch targets:** Preserved; `flex-shrink: 0` and min-width/min-height remain.
- **Railway:** No Procfile, nixpacks, or dependency changes.

This plan is based only on the current codebase; no assumptions or oversights are intended. Once approved, implementation can follow this plan and tasks can be updated in `TASK_LIST.md` accordingly.
