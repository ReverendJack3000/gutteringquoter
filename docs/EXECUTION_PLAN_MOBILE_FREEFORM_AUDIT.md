# Execution Plan: Mobile Freeform UI Audit Remediation

**Scope:** Address findings from the "Mobile Freeform UI Refinements" audit (memory/performance, edge cases, Apple HIG/accessibility). No new features; fixes only. Desktop must remain unchanged; Railway deployment must remain valid.

**Reference:** Audit report (Category 2 FAIL: 3 items; Category 3 FAIL: 1 item; Category 4 FAIL: 2 items).

---

## 1. Architecture and constraint summary

- **Codebase:** Single codebase; `body[data-viewport-mode="mobile"]` vs default for desktop. `layoutState.viewportMode` in JS; `MOBILE_LAYOUT_BREAKPOINT_PX = 980` in `app.js`.
- **Diagram toolbar:** Lives in `#blueprintWrap`; `initDiagramToolbarDrag()` in `app.js` (lines ~5575–5705) registers: dragHandle/toolbar `pointerdown`, document `pointermove`/`pointerup`/`pointercancel`, and a `ResizeObserver` on `wrap`. **Critical:** `initDiagramToolbarDrag()` is called from `initCanvas()` (line 5720) and again from `applyViewportMode('mobile')` (line 8893–8894). There is no teardown, so switching to mobile adds **duplicate** document listeners and a second ResizeObserver.
- **Global toolbar / Undo–Redo:** `initGlobalToolbar()` (around 8653–8660) creates a `MutationObserver` on `document.body` for `data-viewport-mode` to set `aria-hidden` on `.mobile-undo-redo-wrap`. It is never disconnected.
- **Desktop safety:** All changes must be either mobile-only (CSS under `body[data-viewport-mode="mobile"]`, or JS guarded by viewport mode where appropriate) or internal cleanup (teardown/init) that does not change desktop behaviour. No changes to desktop layout or z-index.

---

## 2. Execution plan (ordered)

### 2.1 ResizeObserver and document pointer listeners (diagram toolbar) — teardown and idempotent init

**File:** `frontend/app.js`

**Current behaviour:**  
`initDiagramToolbarDrag()` adds:

- `dragHandle.addEventListener('pointerdown', onPointerDown, { capture: true })`
- `toolbar.addEventListener('pointerdown', …)` (capture)
- `document.addEventListener('pointermove', onPointerMove, { capture: true })`
- `document.addEventListener('pointerup', onPointerUp, { capture: true })`
- `document.addEventListener('pointercancel', onPointerCancel, { capture: true })`
- `ro = new ResizeObserver(…)`; `ro.observe(wrap)`

None of these are ever removed. When `applyViewportMode('mobile')` runs, `initDiagramToolbarDrag()` runs again and duplicates all of the above.

**Required changes:**

1. **Introduce a single cleanup function** for the diagram toolbar drag feature (e.g. store in a module-level variable or on a small “controller” object keyed by feature name). The cleanup must:
   - Remove the three document listeners (`pointermove`, `pointerup`, `pointercancel`) with the same `{ capture: true }`.
   - Call `ro.disconnect()` and stop holding the ResizeObserver reference for reuse.
   - Remove the two `pointerdown` listeners from `dragHandle` and `toolbar` (same handlers, same capture).

2. **At the start of `initDiagramToolbarDrag()`:**  
   If cleanup exists, call it first (so re-entry from `applyViewportMode('mobile')` does not leak).

3. **After registering listeners and ResizeObserver:**  
   Store the cleanup function so the next call to `initDiagramToolbarDrag()` can run it.

4. **Do not** remove the existing `initDiagramToolbarDrag()` call from `applyViewportMode('mobile')` until cleanup is in place; after that, re-calling init is safe and remains acceptable.

**Verification:** Resize from desktop width to mobile (or use `?viewport=mobile`) twice; confirm only one ResizeObserver and one set of document listeners (e.g. via breakpoint or temporary log). Desktop: diagram toolbar still draggable and clamped; no console errors.

---

### 2.2 MutationObserver (global toolbar / Undo–Redo aria-hidden) — teardown

**File:** `frontend/app.js`

**Current behaviour:**  
In `initGlobalToolbar()`, a `MutationObserver` is created and observes `document.body` with `attributeFilter: ['data-viewport-mode']`. It is never disconnected. The app does not currently tear down the canvas view (only hides it), so this is a future-proofing / correctness fix.

**Required changes:**

1. Store the `MutationObserver` reference and the `setAriaHidden` callback in a scope that a cleanup function can access (e.g. module-level or closure used by both init and cleanup).
2. Provide a way to disconnect the observer. Options:
   - **Option A:** Add a small “app teardown” or “view teardown” API that the project can call in the future; from it, call diagram toolbar cleanup (2.1) and global toolbar observer disconnect. For this audit, implementing the disconnect path is enough; the actual call site can be a no-op or a single “teardown” function that is not yet invoked from any view switch.
   - **Option B:** In `initGlobalToolbar()`, if a previous observer exists, disconnect it before creating a new one (idempotent init). Then store the new observer for the next run.

Use **Option B** if `initGlobalToolbar()` can ever run more than once; otherwise **Option A** is acceptable. Current codebase: search for `initGlobalToolbar` call sites; if it’s once at startup, Option A (disconnect only when/if we add teardown) is fine. If it’s called multiple times, Option B is required.

3. **Minimal change:** At minimum, store the observer reference so that a future teardown can call `observer.disconnect()`. If the project prefers not to add a “teardown” function yet, document in a short comment that the observer should be disconnected when the global toolbar or app is torn down.

**Verification:** Load app, switch viewport mode; Undo/Redo wrap `aria-hidden` still toggles correctly. No duplicate observers if init is ever called again.

---

### 2.3 Diagram toolbar: recalculate orientation on wrap resize (e.g. rotation)

**File:** `frontend/app.js`

**Current behaviour:**  
The ResizeObserver in `initDiagramToolbarDrag()` only calls `clampDiagramToolbarToWrap(toolbar, getDiagramToolbarWrap())`. It does not call `updateOrientationFromPosition()`. So after a device rotation or window resize, a toolbar that was vertical (e.g. snapped to the right) can remain vertical and sit in the center of the new layout instead of switching back to horizontal.

**Required change:**

- In the ResizeObserver callback (after clamping), call `updateOrientationFromPosition()` when not dragging (same condition as today: `if (dragPointerId != null) return;`). So:  
  `clampDiagramToolbarToWrap(...); updateOrientationFromPosition();`  
  Ensure `updateOrientationFromPosition` is in scope (it’s already defined inside `initDiagramToolbarDrag()` and closes over `toolbar` and `wrap`).

**Verification:** On mobile (or narrow window), drag diagram toolbar to right edge until it goes vertical. Resize window or rotate device so the canvas becomes wider; toolbar should re-evaluate and switch to horizontal if it’s no longer in the edge zones. Desktop: same behaviour when resizing.

---

### 2.4 Diagram toolbar drag handle: 44×44 pt touch target (Apple HIG / WCAG 2.5.5)

**File:** `frontend/styles.css`

**Current behaviour:**  
`.diagram-toolbar-drag-handle` is 40×4 px (horizontal) and 4×40 px (vertical). Neither meets the 44×44 px minimum touch target.

**Required change:**

- Increase the **hit area** to at least 44×44 px for both orientations, without necessarily making the visible strip larger. Options:
  - **Option A (recommended):** Keep the visible pill as-is (40×4 / 4×40) and add transparent padding so the interactive area is at least 44×44. For example: `min-width: 44px; min-height: 44px;` and use padding to center the visible strip (e.g. horizontal: `padding: 20px 2px` so total height ≥ 44; vertical: `padding: 2px 20px` so total width ≥ 44). Adjust `left`/`bottom`/`top` if needed so the handle stays visually in the same place.
  - **Option B:** Make the visible strip at least 44 in the short dimension (e.g. 40×44 and 44×40). This may look bulkier.

Use Option A so the UI looks unchanged but meets the guideline. Ensure the handle remains correctly positioned for horizontal and vertical toolbar orientations (`.diagram-floating-toolbar[data-orientation="vertical"] .diagram-toolbar-drag-handle`).

**Verification:** On mobile, confirm the drag handle has a touch area of at least 44×44 (inspect or use “largest contentful paint” / tap target tools). Desktop appearance unchanged.

---

### 2.5 Diagram toolbar drag handle: stale accessible name in HTML

**File:** `frontend/index.html`

**Current behaviour:**  
The diagram toolbar drag handle is:

```html
<button type="button" class="diagram-toolbar-drag-handle" id="diagramToolbarDragHandle" aria-label="Drag to hide toolbar" title="Drag up to hide toolbar">
```

JS in `initDiagramToolbarDrag()` overwrites these to “Drag to move toolbar” at runtime. Before that runs, assistive tech and tooltips show the wrong copy.

**Required change:**

- In `index.html`, set the button to the same copy as JS:  
  `aria-label="Drag to move toolbar"` and `title="Drag to move toolbar"`.

**Verification:** Load app; before and after JS runs, the handle should show “Drag to move toolbar”. No functional change to JS.

---

## 3. Regression and safety checklist

Before merging:

- [x] **Desktop:** Diagram toolbar still draggable, clamps to wrap, snaps to vertical at edges; orientation and position persist in localStorage. No duplicate listeners after resize.
- [x] **Mobile:** Same behaviour; Undo/Redo wrap still gets correct `aria-hidden`; bottom sheet and Products panel unchanged.
- [x] **Z-index:** No new stacking contexts or z-index changes; diagram toolbar (20), selection toolbar (55), bottom sheet (600/601), global toolbar (100) unchanged.
- [x] **Railway:** No new env vars or build steps; vanilla HTML/CSS/JS; deployment and `./scripts/run-server.sh` unchanged.
- [ ] **E2E:** Existing suite currently fails with "Toolbar elements missing" (test expects `#uploadZone` which is not present in `index.html`). This is pre-existing; not caused by this audit remediation. See §6 for E2E suggestions.

---

## 4. Files to touch (summary)

| File | Changes |
|------|--------|
| `frontend/app.js` | 2.1 Teardown + idempotent `initDiagramToolbarDrag()`; 2.2 MutationObserver disconnect path; 2.3 ResizeObserver callback calls `updateOrientationFromPosition()` |
| `frontend/styles.css` | 2.4 Diagram toolbar drag handle min 44×44 touch target (mobile + desktop) |
| `frontend/index.html` | 2.5 Drag handle `aria-label` and `title` to “Drag to move toolbar” |

---

## 5. Optional follow-up (out of scope for this plan)

- **Pencil (technical drawing) accessible name:** Audit noted adding an explicit `aria-label` on the label that wraps the checkbox for a more robust accessible name; can be done in a later task.
- **Explicit “app teardown”:** If the app later supports full view unmount (e.g. SPA view switch), call the diagram toolbar cleanup and global toolbar observer disconnect from that path.

---

*Plan generated from audit report and codebase read of README.md, TASK_LIST.md, frontend/app.js, frontend/styles.css, frontend/index.html, and .cursor rules.*

---

## 6. E2E suggestions (post-implementation)

**Current E2E run:** Suite fails at "Toolbar elements missing" because the test expects `#uploadZone` and `#exportBtn`; `#uploadZone` does not exist in `frontend/index.html` (pre-existing gap).

**Suggested E2E coverage for this remediation (add when fixing/adding tests):**

1. **Diagram toolbar teardown / no duplicate listeners:** Hard to assert directly. Optional: in a test that toggles viewport (e.g. resize or `?viewport=mobile`), assert that the diagram toolbar still drags and that no duplicate ResizeObserver/listeners cause visible misbehaviour (e.g. clamp still works after resize).
2. **Orientation on resize:** In mobile (or narrow) viewport, drag the diagram toolbar to the right edge until it becomes vertical; then resize the window to be wider (or trigger a ResizeObserver by resizing the blueprint area). Assert that the toolbar re-evaluates orientation (e.g. becomes horizontal when center is no longer in the edge zone). Can be manual or automated with viewport resize.
3. **Drag handle 44×44:** Assert that the diagram toolbar drag handle has computed min-width and min-height ≥ 44 (e.g. `getBoundingClientRect()` or getComputedStyle). Target: `#diagramToolbarDragHandle`.
4. **Stale label:** Not needed if HTML is fixed; optional: assert `#diagramToolbarDragHandle` has `aria-label="Drag to move toolbar"` and `title="Drag to move toolbar"` in the DOM.

**Fix existing E2E:** Update the "Toolbar elements missing" step to use an element that exists (e.g. `#cameraUploadBtn` or `#exportBtn` only), or add `id="uploadZone"` to the appropriate upload trigger in `index.html` and ensure the test still passes.
