# QA Audit Report: Mobile Freeform UI Refinements

**Role:** Strict Senior QA Engineer  
**Scope:** Recent changes and current codebase state against core constraints (Desktop vs Mobile production, Railway deployment safety, Apple HIG).  
**Date:** Feb 2026  
**Status:** Pass/Fail by category; no fixes applied pending approval.

---

## 1. Regression & Conflict Check

### 1.1 Mobile-only CSS bleeding to desktop

| Check | Result | Evidence |
|-------|--------|----------|
| `.mobile-undo-redo-wrap` visible on desktop | **PASS** | `.mobile-undo-redo-wrap { display: none; }` (styles.css ~2175–2176). Only `body[data-viewport-mode="mobile"] .mobile-undo-redo-wrap { display: inline-flex; }` shows it. Undo/Redo buttons do not appear on desktop. |
| `justify-content: flex-start` / header alignment on desktop | **PASS** | `justify-content: flex-start` applied only under `body[data-viewport-mode="mobile"]` for `.toolbar-left`, `.toolbar-breadcrumbs-wrap`, `.toolbar-breadcrumbs` (styles.css ~1665–1670). `.toolbar-center { display: none }` is also only under `body[data-viewport-mode="mobile"]` (~1672). Desktop header layout unchanged. |
| Bottom sheet / backdrop on desktop | **PASS** | `body:not([data-viewport-mode="mobile"]) .diagrams-bottom-sheet-backdrop` and `.diagrams-bottom-sheet` have `display: none !important` (~2025–2026). Desktop never shows the sheet. |

**Category 1.1 verdict: PASS** — No mobile layout or visibility rules bleed into desktop.

---

### 1.2 Z-index conflicts

| Layer | z-index | Selector / context |
|-------|---------|--------------------|
| Diagram floating toolbar | 20 | `.diagram-floating-toolbar` (styles.css ~1228) |
| Selection floating toolbar | 55 | `.floating-toolbar` (styles.css ~987) |
| Global toolbar wrap | 100 | `.global-toolbar-wrap` (styles.css ~171) |
| Bottom sheet backdrop | 600 | `body[data-viewport-mode="mobile"] .diagrams-bottom-sheet-backdrop:not([hidden])` (~2041) |
| Bottom sheet panel | 601 | `body[data-viewport-mode="mobile"] .diagrams-bottom-sheet:not([hidden])` (~2058) |

Diagram toolbar sits inside `#blueprintWrap` (no z-index on `.blueprint-wrap`). Order is consistent: diagram (20) < selection (55) < global (100) < backdrop (600) < sheet (601). No overlap or inversion.

| Check | Result |
|-------|--------|
| Diagram toolbar vs canvas | **PASS** — Toolbar (20) above canvas; no new blocking of canvas interaction. |
| Diagram toolbar vs selection toolbar | **PASS** — Selection (55) correctly above diagram (20) when both present. |
| Bottom sheet above all app UI | **PASS** — Backdrop 600, sheet 601 above global toolbar (100). |

**Category 1.2 verdict: PASS** — No z-index conflicts identified.

---

## 2. Memory & Performance Leaks

### 2.1 Saved diagrams bottom sheet – backdrop `pointerdown`

| Item | Location | Behaviour |
|------|----------|-----------|
| Listener added | `app.js` ~9840 | `onOpen`: `backdrop.addEventListener('pointerdown', backdropPointerDownHandler)` |
| Listener removed | `app.js` ~9853–9855 | `onClose`: `backdrop.removeEventListener('pointerdown', backdropPointerDownHandler)`; `backdropPointerDownHandler = null` |

**Verdict: PASS** — Backdrop listener is removed in `onClose`. No duplicate listeners on repeated open/close (same handler ref removed).

---

### 2.2 Diagram toolbar – ResizeObserver and document pointer listeners

| Item | Location | Behaviour |
|------|----------|-----------|
| ResizeObserver | `app.js` ~5710–5714 | `ro.observe(wrap)` in `initDiagramToolbarDrag()`. |
| Disconnect | `app.js` ~5717–5724 | `diagramToolbarDragCleanup` calls `ro.disconnect()` and removes all document/drag-handle/toolbar listeners. |
| When cleanup runs | `app.js` ~5582–5586 | At **start** of `initDiagramToolbarDrag()`: if `diagramToolbarDragCleanup` exists, it is invoked before re-adding listeners. |

**Verdict: PASS** — ResizeObserver and document `pointermove`/`pointerup`/`pointercancel` (and toolbar/dragHandle `pointerdown`) are disconnected when `initDiagramToolbarDrag()` is run again (e.g. viewport switch to mobile). No duplicate observers/listeners on re-init.

**Note:** Cleanup is **not** tied to DOM unmount. The app does not remove `#blueprintWrap` or the canvas view from the DOM (only `.hidden`). If a future change unmounts the canvas view, a teardown path that calls `diagramToolbarDragCleanup()` would be required to avoid a theoretical leak. For current behaviour (no unmount), this is acceptable.

---

### 2.3 Global toolbar – Undo/Redo `aria-hidden` MutationObserver

| Item | Location | Behaviour |
|------|----------|-----------|
| Observer | `app.js` ~8665–8672 | `globalToolbarUndoRedoAriaObserver` observes `document.body` for `data-viewport-mode`. |
| Disconnect | `app.js` ~8671–8675 | On **re-entry** to `initGlobalToolbar()`: if `globalToolbarUndoRedoAriaObserver` exists, `disconnect()` is called before creating a new one. |

**Verdict: PASS** — Idempotent init; no duplicate observer if `initGlobalToolbar()` is ever called again. Observer is not disconnected on “unmount” because the global toolbar is never torn down in the current app.

---

**Category 2 verdict: PASS** — Backdrop, diagram toolbar, and global toolbar observers/listeners are correctly cleaned up on re-init; no leaks in current usage. Unmount-time teardown is out of scope for current architecture.

---

## 3. Edge Case Validation

### 3.1 Undo/Redo with empty stacks (aggressive spamming)

| Check | Result | Evidence |
|-------|--------|----------|
| Guard in `undo()` | **PASS** | `if (undoHistory.length === 0) return;` (app.js ~4282). No throw; early return. |
| Guard in `redo()` | **PASS** | `if (redoHistory.length === 0) return;` (app.js ~4297). No throw; early return. |
| Button state | **PASS** | `updateUndoRedoButtons()` sets `mobileUndoBtn.disabled = undoHistory.length === 0` and `mobileRedoBtn.disabled = redoHistory.length === 0` (~8691–8692). |
| Disabled button clicks | **PASS** | Disabled buttons do not dispatch `click` from user interaction (HTML5). Spamming the buttons when empty does not invoke `undo()`/`redo()`. If a click were programmatically dispatched, both functions return immediately without throwing. |

**Category 3.1 verdict: PASS** — No errors or bad state when stacks are empty; no need for extra guards.

---

### 3.2 Edge snapping + device rotation (toolbar snapped vertically)

| Check | Result | Evidence |
|-------|--------|----------|
| ResizeObserver callback | **PASS** | Diagram toolbar ResizeObserver (app.js ~5710–5714) runs when `wrap` (blueprint-wrap) resizes. On rotation, viewport and wrap size change, so the callback runs. |
| Clamp + orientation update | **PASS** | Callback does: `clampDiagramToolbarToWrap(toolbar, getDiagramToolbarWrap()); updateOrientationFromPosition();` (when not dragging). So after rotation, position is clamped and orientation is recalculated from the new center position (left/right 20% → vertical; else horizontal). |
| Toolbar in center after rotation | **PASS** | If the toolbar was vertical (e.g. snapped right) and rotation makes the layout wider so the toolbar’s center is now in the middle 60%, `updateOrientationFromPosition()` sets it back to horizontal. |

**Category 3.2 verdict: PASS** — Orientation is recalculated on viewport/wrap resize (including rotation); no stuck vertical state.

---

### 3.3 Double-close on backdrop (pointerdown + click)

| Check | Result | Evidence |
|-------|--------|----------|
| Idempotency of close | **PASS** | `closeAccessibleModal(SHEET_ID)` uses modal registry and early returns when already closed. Both pointerdown and click can fire; second close does not throw or corrupt state. |

**Category 3.3 verdict: PASS**

---

**Category 3 verdict: PASS** — Undo/Redo empty-stack, orientation-on-rotation, and double-close cases behave correctly.

---

## 4. Apple HIG & Accessibility

### 4.1 Touch targets (minimum 44×44 px)

| Element | Selector / rule | Result | Evidence |
|---------|-----------------|--------|----------|
| Mobile Undo button | `body[data-viewport-mode="mobile"] .mobile-undo-btn` | **PASS** | `min-width: 44px; min-height: 44px; padding: 10px` (styles.css ~2183–2187). |
| Mobile Redo button | `body[data-viewport-mode="mobile"] .mobile-redo-btn` | **PASS** | Same rule as Undo. |
| Pencil (technical drawing) | `body[data-viewport-mode="mobile"] .diagram-floating-toolbar .toolbar-pill-btn` | **PASS** | `min-height: 44px; min-width: 44px` (~1997–2001). The technical drawing toggle is a `.toolbar-pill-btn` inside the diagram toolbar. |
| Diagram toolbar drag handle | `.diagram-toolbar-drag-handle` | **PASS** | `min-width: 44px; min-height: 44px; width: 44px; height: 44px` (~1947–1950). Hit area is 44×44; visible pill is 40×4 / 4×40 via `::before`. |

**Category 4.1 verdict: PASS** — All listed interactive elements meet the 44×44 px minimum touch target.

---

### 4.2 Accessible names and labels

| Element | Result | Evidence |
|---------|--------|----------|
| Mobile Undo | **PASS** | `aria-label="Undo"` and `title="Undo"` (index.html ~49). |
| Mobile Redo | **PASS** | `aria-label="Redo"` and `title="Redo"` (index.html ~52). |
| Diagram toolbar drag handle | **PASS** | `aria-label="Drag to move toolbar"` and `title="Drag to move toolbar"` in index.html (~142); no stale “Drag to hide” copy. |
| Pencil (technical drawing) | **PASS (with note)** | `<label … title="Technical drawing (blueprint view)">` (index.html ~145). No explicit `aria-label` on the label; accessible name comes from `title`. Consider adding `aria-label="Technical drawing (blueprint view)"` on the label for more consistent AT behaviour. |

**Category 4.2 verdict: PASS** — Undo, Redo, and drag handle have correct labels; Pencil has a title and could be strengthened with an explicit `aria-label`.

---

**Category 4 verdict: PASS** — Touch targets and aria-labels meet requirements; one optional improvement (Pencil `aria-label`) noted.

---

## 5. Summary Table

| Category | Verdict | Notes |
|----------|---------|--------|
| 1. Regression & conflict | **PASS** | No mobile CSS bleed to desktop; no z-index conflicts. |
| 2. Memory & performance | **PASS** | Backdrop, diagram toolbar, and global toolbar cleanup verified; no leaks in current usage. |
| 3. Edge cases | **PASS** | Empty Undo/Redo, orientation on rotation, double-close all handled. |
| 4. Apple HIG & accessibility | **PASS** | 44×44 targets and labels in place; optional Pencil `aria-label` improvement. |

---

## 6. Findings requiring no fix (informational)

- **Diagram toolbar / global toolbar teardown:** Cleanup runs on **re-init** (e.g. viewport switch), not on DOM unmount. Current app never unmounts the canvas or global toolbar; if it did, calling the same cleanup from an unmount path would be required.
- **Pencil accessible name:** `title` is present; adding `aria-label` on the technical drawing label would align with best practice for icon-only controls.

---

**No bugs, missing cleanup steps, or logic gaps were found that require a fix before approval.** Optional improvement: add `aria-label` to the technical drawing (Pencil) label. Awaiting your approval on this audit report before any code changes.
