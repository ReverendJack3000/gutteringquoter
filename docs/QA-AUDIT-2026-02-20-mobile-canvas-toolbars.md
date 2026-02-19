# QA Audit Report: Mobile Canvas Page Size & Toolbars (54.36–54.40)

**Role:** Strict Senior QA Engineer  
**Scope:** Recent changes (mobile page size, zoom clamp, diagram/global toolbars) and related code paths.  
**Constraints:** Desktop vs mobile production, Railway deployment safety, Apple HIG.  
**Date:** 2026-02-20

---

## 1. Regression & Conflict Check

### 1.1 Desktop viewport CSS bleed

| Check | Result | Details |
|-------|--------|---------|
| New/edited rules scoped to mobile | **PASS** | All changes in the 54.36–54.40 work use `body[data-viewport-mode="mobile"]` (or equivalent). No new desktop-only or unscoped rules that could affect desktop. |
| `justify-content: flex-start` on desktop | **PASS** | `justify-content: flex-start` appears only under mobile selectors: `.toolbar-breadcrumbs` (line 1679) and `.diagram-floating-toolbar` (line 1929). Desktop diagram toolbar keeps `justify-content: center` (line 1230). |
| Undo/Redo visibility on desktop | **PASS** | `.mobile-undo-redo-wrap` has `display: none` by default and `body[data-viewport-mode="mobile"] .mobile-undo-redo-wrap { display: inline-flex }`. Undo/Redo buttons are hidden on desktop. |
| Global toolbar overflow/min-width on desktop | **PASS** | `overflow-x: hidden` and `min-width: 0` on `.toolbar-left`/`.toolbar-right` apply only under `body[data-viewport-mode="mobile"]`. Desktop layout unchanged. |

### 1.2 Z-index conflicts

| Layer | z-index | Notes |
|-------|---------|--------|
| Diagram floating toolbar | 20 | `.diagram-floating-toolbar` (styles.css ~1228) |
| Floating toolbar (selection) | 55 | `.floating-toolbar` (~987) |
| Global toolbar / dropdowns | 100 | `.toolbar-floating` (~264), dropdowns higher (e.g. 499, 500) |
| Bottom sheet backdrop | 600 | `.diagrams-bottom-sheet-backdrop` (~2052) |
| Bottom sheet | 601 | `.diagrams-bottom-sheet:not([hidden])` (~2069) |

| Check | Result | Details |
|-------|--------|---------|
| Diagram toolbar vs canvas | **PASS** | Canvas has no z-index; toolbar is 20 and sits above blueprint-wrap content. No conflict. |
| Diagram toolbar vs bottom sheet | **PASS** | When the bottom sheet is open (backdrop 600, sheet 601), it correctly layers above the diagram toolbar (20). Diagram toolbar does not need to be above the sheet. |
| Bottom sheet vs global toolbar | **PASS** | Global toolbar 100; sheet 600/601. Sheet and backdrop correctly overlay everything. |

**Verdict 1:** **PASS** — No desktop bleed from new mobile CSS. Z-index order is consistent; no conflicts identified.

---

## 2. Memory & Performance Leaks

### 2.1 Diagram toolbar (ResizeObserver + pointer listeners)

| Item | Where added | Where removed |
|------|-------------|----------------|
| ResizeObserver (wrap) | `initDiagramToolbarDrag()` (~5737) | `diagramToolbarDragCleanup()` → `ro.disconnect()` (~5748) |
| document pointermove/pointerup/pointercancel | same | same cleanup → `document.removeEventListener(..., capture: true)` |
| dragHandle pointerdown | same | same → `dragHandle.removeEventListener('pointerdown', ...)` |
| toolbar pointerdown (toolbarPointerDownHandler) | same | same → `toolbar.removeEventListener('pointerdown', ...)` |

**When is cleanup run?**  
Only when `initDiagramToolbarDrag()` runs again. At the start of `initDiagramToolbarDrag()` the code calls `diagramToolbarDragCleanup()` if it exists, then re-attaches listeners and a new ResizeObserver.

**When is `initDiagramToolbarDrag()` called?**  
- Once from `initCanvas()` at app startup.  
- Again from `applyViewportMode()` inside `requestAnimationFrame` when viewport mode changes (e.g. desktop ↔ mobile).

**When is cleanup not run?**  
When the user navigates away from the canvas view (e.g. to login or products). `switchView()` does not call `initCanvas()` or any teardown; it only hides the canvas view and shows another. So when leaving canvas view, the diagram toolbar’s ResizeObserver and document listeners are **not** disconnected.

| Check | Result | Details |
|-------|--------|---------|
| Cleanup on re-init (viewport change) | **PASS** | Viewport resize → `applyViewportMode` → `initDiagramToolbarDrag` → cleanup then re-attach. No double-binding. |
| Cleanup when leaving canvas view | **FAIL** | No teardown when switching to login/products. ResizeObserver and document listeners remain attached to the (hidden) wrap for the rest of the session. Observer can still fire on wrap resize. |
| Duplicate listeners on return to canvas | **PASS** | `switchView('view-canvas')` only calls `resizeCanvas()` and `draw()`, not `initCanvas()`. So we do not re-run `initDiagramToolbarDrag` on return; no duplicate listeners. |

### 2.2 Bottom sheet backdrop (pointerdown)

| Item | Where added | Where removed |
|------|-------------|----------------|
| backdrop pointerdown | `onOpen` of diagrams bottom sheet (~9870) | `onClose` (~9883) → `backdrop.removeEventListener('pointerdown', backdropPointerDownHandler)` |

**Verdict:** **PASS** — Listener is removed in `onClose`; handler reference is kept for removal. No leak if the sheet is closed normally.

### 2.3 Global toolbar (MutationObserver for Undo/Redo aria-hidden)

| Item | Where added | Where removed |
|------|-------------|----------------|
| MutationObserver on `document.body` | `initGlobalToolbar()` (~8716) | Only disconnected when `initGlobalToolbar()` runs again (before creating a new observer). |

**When is `initGlobalToolbar()` called?**  
Once at startup. There is no view switch or lifecycle that calls it again.

**Verdict:** **PASS** — Single observer for the session; no re-init, so no leak in the sense of “unbounded growth.” No explicit teardown on “app destroy” (SPA has no destroy). Acceptable for current architecture.

**Verdict 2:** **FAIL** (one finding) — Diagram toolbar ResizeObserver and document listeners are never disconnected when the user leaves the canvas view. All other reviewed listeners/observers are either cleaned up or single-instance.

---

## 3. Edge Case Validation

### 3.1 Undo/Redo when stack is empty

| Check | Result | Details |
|-------|--------|---------|
| `undo()` when `undoHistory.length === 0` | **PASS** | `undo()` starts with `if (undoHistory.length === 0) return;` (~4287). No pop, no restore; no error. |
| `redo()` when `redoHistory.length === 0` | **PASS** | `redo()` starts with `if (redoHistory.length === 0) return;` (~4302). Same. |
| Mobile button state when empty | **PASS** | `updateUndoRedoButtons()` sets `mobileUndoBtn.disabled = undoHistory.length === 0` and same for redo (~8721–8722). Buttons are disabled when empty. |
| When is `updateUndoRedoButtons` called? | **PASS** | After `pushUndoState`, after `undo()`, after `redo()`, and once at init. State and UI stay in sync. |
| Spam click when disabled | **PASS** | Disabled buttons do not fire click events in HTML. Even if `undo()`/`redo()` were called programmatically when empty, they return immediately. |

**Verdict 3.1:** **PASS** — No errors or bad state when Undo/Redo are used (or spammed) with empty stacks.

### 3.2 Device rotation with diagram toolbar vertical (mobile)

| Check | Result | Details |
|-------|--------|---------|
| ResizeObserver on wrap | **PASS** | When the wrap resizes (e.g. rotation), the observer runs `clampDiagramToolbarToWrap(toolbar, getDiagramToolbarWrap())` and `updateOrientationFromPosition()`. |
| `updateOrientationFromPosition` on mobile | **PASS** | With 54.39, on mobile we `return` immediately in `updateOrientationFromPosition()`. So we do not switch to horizontal when the toolbar is near the center after rotation; toolbar stays vertical. |
| `clampDiagramToolbarToWrap` on mobile | **PASS** | Clamp still runs. It uses `data-orientation === 'vertical'` and keeps left/top within wrap bounds. After rotation, wrap dimensions change; clamp keeps the toolbar inside the new bounds (e.g. repositions if needed). No evidence of off-screen or incorrect placement. |
| Toolbar position (12, 12) after rotation | **PASS** | (12, 12) remains valid in the new wrap; clamp may adjust if the new wrap is smaller. Logic is consistent. |

**Verdict 3.2:** **PASS** — Rotation with vertical toolbar is handled; no orientation flip on mobile and no identified logic gaps.

**Verdict 3:** **PASS** — Edge cases for Undo/Redo and rotation behave correctly.

---

## 4. Apple HIG & Accessibility

### 4.1 Touch targets (minimum 44×44 pt/px)

| Element | Selector / location | Min size | Result |
|---------|---------------------|----------|--------|
| Mobile Undo button | `.mobile-undo-btn` | 44×44 | **PASS** — `body[data-viewport-mode="mobile"] .mobile-undo-btn, .mobile-redo-btn { min-width: 44px; min-height: 44px }` (~2194–2196). |
| Mobile Redo button | `.mobile-redo-btn` | 44×44 | **PASS** — Same rule. |
| Diagram toolbar drag handle | `.diagram-toolbar-drag-handle` | 44×44 | **PASS** — min-width/height and width/height 44px (~1958–1960); 54.35. |
| Diagram toolbar pill buttons (mobile) | `.diagram-floating-toolbar .toolbar-pill-btn` etc. | 44×44 | **PASS** — Mobile override: `min-height: 44px; min-width: 44px` (~2011–2012). |
| Technical drawing toggle (diagram toolbar) | Label with `.toolbar-pill-btn.toggle-label-compact` | 44 on mobile, 36 desktop | **PASS (mobile)** — Same mobile override. **Note:** Desktop diagram toolbar pill buttons (including this toggle) are 36px (~1249–1250). Below 44pt for touch; pre-existing, not introduced by 54.36–54.40. |
| Other diagram toolbar controls (zoom, inspector, colour, transparency) | Same pill/button classes | 44 on mobile | **PASS** — Same mobile rule. |

### 4.2 ARIA and accessible names

| Element | Current | Result |
|---------|---------|--------|
| Mobile Undo | `aria-label="Undo"` | **PASS** |
| Mobile Redo | `aria-label="Redo"` | **PASS** |
| Diagram toolbar drag handle | `aria-label="Drag to move toolbar"` | **PASS** |
| Technical drawing toggle | `<label>` with `title="Technical drawing (blueprint view)"`; no `aria-label` on label or input | **WARN** | Accessible name relies on `title`. Screen readers may use it; a dedicated `aria-label` on the input or label would be more robust. Pre-existing (54.28). |
| Diagram toolbar (container) | `role="toolbar"` `aria-label="Diagram tools"` | **PASS** |

**Verdict 4:** **PASS** — All new or in-scope interactive elements meet 44×44 on mobile and have appropriate ARIA/names. One pre-existing minor gap: technical drawing toggle could have an explicit `aria-label` for consistency.

---

## 5. Railway Deployment Safety

| Check | Result | Details |
|-------|--------|---------|
| Backend / build changes | **PASS** | No backend or build config changes; frontend-only. |
| Static assets | **PASS** | No new assets; existing JS/CSS only. |
| Env / feature flags | **PASS** | No new env or flags; behaviour gated by `layoutState.viewportMode` and `data-viewport-mode`. |
| Procfile / nixpacks | **PASS** | Not modified. |

**Verdict 5:** **PASS** — Deploy remains safe for Railway.

---

## 6. Summary: Pass/Fail by Category

| Category | Result | Critical finding |
|----------|--------|------------------|
| 1. Regression & conflict | **PASS** | None. |
| 2. Memory & performance leaks | **FAIL** | Diagram toolbar ResizeObserver and document pointer listeners are not disconnected when leaving the canvas view. |
| 3. Edge cases | **PASS** | Undo/Redo empty stack and rotation with vertical toolbar are handled. |
| 4. Apple HIG & accessibility | **PASS** | 44×44 and ARIA in scope satisfied; one pre-existing suggestion (technical drawing `aria-label`). |
| 5. Railway deployment | **PASS** | No risk identified. |

---

## 7. Recommended Fix (for approval)

**Finding:** Diagram toolbar teardown when leaving canvas view.

**Recommendation:** In `switchView()`, when switching **away** from `view-canvas` (e.g. to `view-login` or `view-products`), call a small teardown that runs `diagramToolbarDragCleanup()` if it is a function, then set `diagramToolbarDragCleanup = null`. When the user returns to canvas, `initCanvas()` is not re-run, so the diagram toolbar would stay without listeners until the next viewport-mode change. So either:

- **Option A:** On switch away from canvas, run `diagramToolbarDragCleanup()` so the observer and listeners are removed. On next switch to canvas, call `initDiagramToolbarDrag()` from `switchView` when `viewId === 'view-canvas'` (e.g. after `resizeCanvas()`) so the toolbar is re-inited, or  
- **Option B:** Document current behaviour as acceptable (no re-init on return, observer remains on hidden node) and add a backlog item to optionally teardown on view switch if needed.

**Update (Option A implemented):** In `switchView()`: when switching away from `view-canvas`, `diagramToolbarDragCleanup()` is invoked and `diagramToolbarDragCleanup` is set to `null`. When switching to `view-canvas`, `initDiagramToolbarDrag()` is called after `resizeCanvas()` and `draw()` so the toolbar is re-initialized. This removes the leak and keeps the diagram toolbar correct on return to canvas (mobile and desktop).
