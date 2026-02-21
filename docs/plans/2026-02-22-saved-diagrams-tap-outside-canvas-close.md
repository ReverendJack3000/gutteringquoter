# Plan: Tap outside Saved diagrams bottom sheet (onto canvas) closes sheet

**Date:** 2026-02-22  
**Scope:** Mobile-only. Desktop unchanged; Railway-safe.  
**Context:** Single codebase, adaptive layout via `data-viewport-mode`; diagrams bottom sheet is mobile-only (desktop uses dropdown).

## 1. Goal

When the Saved diagrams bottom sheet (`#diagramsBottomSheet`) is open on mobile, a tap **outside** the sheet—including onto the **canvas** (blueprint workspace)—should collapse/close the sheet. Today, backdrop tap and Escape already close it; we are adding explicit “tap on canvas” (and any tap outside the sheet in the view) so that tapping the canvas area reliably closes the sheet.

## 2. Current behaviour

- **DOM (inside `#view-canvas`):** `#diagramsBottomSheetBackdrop`, `#diagramsBottomSheet`, then `main#workspaceMain` containing `#blueprintWrap` (canvas).
- **Stacking:** Backdrop `z-index: 600`, sheet `z-index: 601` (mobile). Workspace/blueprint lower. Backdrop is `position: fixed; inset: 0` when visible, so it covers the viewport.
- **Close paths today:** (1) Backdrop click (generic `registerAccessibleModal`); (2) Backdrop pointerdown (diagrams IIFE `onOpen`); (3) Swipe down on sheet header; (4) Escape.
- **Why “tap on canvas” matters:** On mobile, the dimmed area over the canvas is the backdrop. Taps there should already close; this plan makes “tap outside the sheet” explicit and ensures any tap in `#view-canvas` that does **not** hit the sheet (e.g. canvas, header, or backdrop) closes the sheet, with no dependency on which element is the event target.

## 3. Desktop vs mobile

- **Mobile:** Add one pointerdown listener (when sheet is open) so that any tap in `#view-canvas` outside `#diagramsBottomSheet` closes the sheet. Gate all new logic with `layoutState.viewportMode === 'mobile'`.
- **Desktop:** No change. The bottom sheet is hidden on desktop (`body:not([data-viewport-mode="mobile"]) .diagrams-bottom-sheet { display: none !important }`); it is only opened on mobile.

## 4. Proposed implementation

### 4.1 JS (`frontend/app.js`)

**Location:** Inside the existing `registerDiagramsBottomSheetModal` IIFE (around lines 11602–11672).

- **onOpen:**
  - Add a **pointerdown** listener on `#view-canvas` with **capture: true**.
  - Handler: if `layoutState.viewportMode !== 'mobile'` → return. If the sheet element is hidden → return. If `sheet.contains(e.target)` → return (tap inside sheet; do not close).
  - Otherwise: call `closeAccessibleModal('diagramsBottomSheet')`, then `e.preventDefault()` and `e.stopPropagation()` so the same tap does not also start canvas pan/select or double-close.
  - Store the handler (and optionally the bound element) so it can be removed in onClose.

- **onClose:**
  - Remove the pointerdown listener from `#view-canvas` (use the stored handler reference). Same pattern as existing `backdropPointerDownHandler` cleanup.

- **References:** Reuse `layoutState.viewportMode` (already used elsewhere in app.js). Use `document.getElementById('view-canvas')` and `document.getElementById('diagramsBottomSheet')`; sheet open = `!sheet.hidden`.

No new globals; no changes to `registerAccessibleModal` or other modals. Backdrop tap will still close (existing listeners); this adds a single, mobile-only “tap outside sheet” path so canvas (and any non-sheet area in the view) also closes the sheet.

### 4.2 HTML / CSS

- **HTML:** No change.
- **CSS:** No change. Backdrop and sheet styling and stacking stay as-is.

## 5. Edge cases and accessibility

- **Tap on sheet content (list, drag handle, title):** `sheet.contains(e.target)` is true → handler returns without closing. ✓  
- **Tap on backdrop:** Target is backdrop → not inside sheet → close; `preventDefault`/`stopPropagation` avoid duplicate handling. ✓  
- **Tap on canvas / workspace:** Target inside `#view-canvas` and not in sheet → close. ✓  
- **Tap on header/toolbar:** Not inside sheet → close (tap outside = close). ✓  
- **Desktop:** Listener only runs when sheet is open, which only happens on mobile; viewport check prevents desktop runs. ✓  
- **Screen reader / keyboard:** No change to focus trap or Escape; existing behaviour remains. ✓  
- **Double-close:** `closeAccessibleModal` is idempotent; safe to call from both this handler and backdrop. ✓  

## 6. Verification

- Manual (mobile): Open Saved diagrams from breadcrumb → tap on the dimmed canvas area → sheet closes. Tap on sheet list → sheet stays open. Escape and swipe-down still close.
- Desktop: Confirm diagrams dropdown and layout unchanged; bottom sheet never shown.
- Run `npm test`; no intentional change to E2E (add assertion only if desired).
- Deploy: no new dependencies or build steps; safe for Railway.

## 7. Task list update (after implementation)

- In **docs/tasks/section-54.md**: add (or mark done) task **54.31.1** “Mobile: tap outside Saved diagrams sheet (e.g. on canvas) closes sheet.”
- In **TASK_LIST.md**: if section 54 uncompleted table is updated, ensure this task is reflected there.
