# Plan: Diagram toolbar auto-collapse when element toolbar or dropdowns open

**Date:** 2026-02-21  
**Objective:** When the user opens the element (selection) toolbar or any of the canvas/header dropdowns or product menu, the diagram floating toolbar (#diagramFloatingToolbar) should auto-collapse so the expanded diagram toolbar does not compete for space or focus. Desktop and mobile; no change to desktop visual design—behaviour only.

**Constraint:** All logic must be correct and based solely on the current codebase. No assumptions.

---

## 1. Terminology and scope

| Term | Meaning in this codebase |
|------|--------------------------|
| **Diagram floating toolbar** | `#diagramFloatingToolbar` (zoom, technical drawing, fit, collapse, inspector, header colour, transparency). Drag/collapse implemented in `frontend/toolbar.js`. |
| **Element toolbar** | `#floatingToolbar` (selection actions: lock, duplicate, delete, flip, colour, more). Shown in `draw()` when there is a single selection or blueprint selected. |
| **Collapse** | Diagram toolbar shows only the collapse button (circle with +). Implemented by class `diagram-floating-toolbar--collapsed` on `#diagramFloatingToolbar`, plus `localStorage` key `quoteApp_diagramToolbarCollapsed` and ARIA/title on `#diagramToolbarCollapseBtn`. |

**In scope — auto-collapse:** Auto-collapse the diagram toolbar when any of the following opens:

1. Element toolbar (`#floatingToolbar`) — when it becomes visible.
2. Element toolbar “More” submenu (`#floatingToolbarSubmenu`) — when opened.
3. Profile dropdown (`#profileDropdown`) — when opened from header.
4. Saved diagrams dropdown (`#diagramsDropdown`) — when opened (desktop).
5. Project history dropdown (`#projectHistoryDropdown`) — when opened (e.g. breadcrumb).
6. Product modal — when `openAccessibleModal('productModal', ...)` is used (add/edit product).
7. Diagrams bottom sheet (mobile) — when `openAccessibleModal('diagramsBottomSheet', ...)` is used.
8. Save diagram modal — when `openAccessibleModal('saveDiagramModal', ...)` is used.

**Out of scope for auto-collapse — use positioning instead:** The following do **not** trigger auto-collapse. For these four, we add logic so they never overlap the expanded diagram toolbar: use the diagram toolbar (`#diagramFloatingToolbar`) as the anchor and position the UI away from it (e.g. if the toolbar is on the right, open the popover/dropdown to the left or above so no part of it overlaps the toolbar).

- Flip dropdown (`#flipDropdown`) — when user opens it from the element toolbar.
- Element colour palette popover (`#colorPalettePopover`) — when opened via element toolbar colour button.
- Header colour diagram popover (`#headerColorPalettePopover`) — when opened from diagram toolbar.
- Transparency popover (`#transparencyPopover`) — when opened from blueprint transparency button.

---

## 2. Current behaviour (no changes)

- **Diagram toolbar collapse** is toggled only by the collapse button (`#diagramToolbarCollapseBtn`) in `frontend/toolbar.js`. Handler: `onCollapseClick` (around lines 398–420). It:
  - Toggles class `diagram-floating-toolbar--collapsed` on `#diagramFloatingToolbar`.
  - Writes `localStorage.setItem(DIAGRAM_TOOLBAR_STORAGE_KEY_COLLAPSED, String(collapsed))`.
  - Updates `aria-expanded`, `aria-label`, `title` on the collapse button.
  - Schedules two `requestAnimationFrame` calls to run `clampDiagramToolbarToWrap`, optional mobile edge snap, and `updateDockedSide`.
- **No programmatic collapse** exists from outside `toolbar.js`; there is no exported “collapse if expanded” API.

---

## 3. Files and call sites (exact references)

### 3.1 Diagram toolbar (collapse logic)

| File | What |
|------|------|
| `frontend/toolbar.js` | `initDiagramToolbarDrag()`: holds `toolbar` (#diagramFloatingToolbar), `collapseBtn` (#diagramToolbarCollapseBtn), `onCollapseClick`, and helpers `clampDiagramToolbarToWrap`, `applyMobileToolbarEdgeSnap`, `computeMobileToolbarEdgeSnap`, `updateDockedSide`, `getDiagramToolbarWrap()`. Storage key: `DIAGRAM_TOOLBAR_STORAGE_KEY_COLLAPSED` = `'quoteApp_diagramToolbarCollapsed'`. |
| `frontend/app.js` | Imports `initDiagramToolbarDrag`; calls `initDiagramToolbarDragWithApp()` which calls `initDiagramToolbarDrag({ getViewportMode: () => layoutState.viewportMode })`. No return value used. Re-invoked after view switches (e.g. ~9120, ~10230). |

### 3.2 Triggers: where “open” happens (auto-collapse only)

| # | UI | File | Location / event | When it “opens” |
|---|----|------|------------------|------------------|
| 1 | Element toolbar | app.js | `draw()` ~5379–5384 | `toolbarEl.removeAttribute('hidden')` when `hasSingleSelection && rect`. Only when transitioning from hidden → visible. |
| 2 | More submenu | app.js | More button click ~3297–3302 | `submenu.hidden = !submenu.hidden`. Opens when after toggle `!submenu.hidden`. |
| 3 | Profile dropdown | app.js | userAvatar click ~7354–7359; also ~7678 | `profileDropdown.hidden = wasOpen` (toggle). Opens when `!profileDropdown.hidden` after set. Second site: `profileDropdown.hidden = false` at 7678. |
| 4 | Diagrams dropdown | app.js | diagramsDropdownBtn click ~8586–8614 | `diagramsDropdown.hidden = false` at 8613 (desktop path). |
| 5 | Project history dropdown | app.js | `openProjectHistoryDropdown()` ~8523–8527 | `projectHistoryDropdown.hidden = false` at 8526. |
| 6 | Product modal | app.js | `openProductModal` and edit-product flow ~8050, 8086 | `openAccessibleModal('productModal', ...)`. |
| 7 | Diagrams bottom sheet | app.js | ~8602, 8643 | `openAccessibleModal('diagramsBottomSheet', ...)`. |
| 8 | Save diagram modal | app.js | ~8549 | `openAccessibleModal('saveDiagramModal', ...)`. |

### 3.3 UIs that do NOT auto-collapse: positioning to avoid overlap

For these four, do **not** call `collapseDiagramToolbarIfExpanded()`. Instead, add positioning logic so that no part of the UI overlaps the expanded diagram toolbar. Use the diagram toolbar (`#diagramFloatingToolbar`) as the anchor: e.g. place the popover/dropdown on the side of the toolbar that has space (if toolbar is on the right, open left or above; if at top, open below), so the expanded toolbar and the UI never overlap. Keep the logic simple by always using the diagram toolbar rect as the reference.

| UI | File | Location | Notes |
|----|------|----------|--------|
| Flip dropdown | app.js | `#flipDropdown` show ~3254–3259 | Position relative to diagram toolbar so dropdown does not overlap it. |
| Element colour palette | app.js | `updateColorPalettePositionAndVisibility` ~3354–3386 | When positioning `#colorPalettePopover`, avoid overlap with `#diagramFloatingToolbar` (use toolbar as anchor). |
| Header colour popover | app.js | `initHeaderColorPalette` ~3058–3081 | When opening `#headerColorPalettePopover`, position away from diagram toolbar so no overlap. |
| Transparency popover | app.js | `updateTransparencyPopover` ~3445+; state in blueprintTransparencyBtn click ~3394–3400 | When showing `#transparencyPopover`, position using diagram toolbar as anchor so it opens away from the toolbar. |

---

## 4. Proposed implementation

### 4.1 API: “collapse if expanded” (toolbar.js)

- **Change:** Have `initDiagramToolbarDrag()` return an object that includes a function `collapseIfExpanded()`.
- **Behaviour of `collapseIfExpanded()`:**
  - If `#diagramFloatingToolbar` already has class `diagram-floating-toolbar--collapsed`, return without doing anything.
  - Otherwise:
    - Add class `diagram-floating-toolbar--collapsed` to the toolbar.
    - Set `localStorage.setItem(DIAGRAM_TOOLBAR_STORAGE_KEY_COLLAPSED, 'true')`.
    - Update `#diagramToolbarCollapseBtn`: `aria-expanded="false"`, `aria-label="Expand toolbar"`, `title="Expand toolbar"`.
    - Schedule the same two-rAF sequence as in `onCollapseClick`: `clampDiagramToolbarToWrap`, then (on mobile) `applyMobileToolbarEdgeSnap` + `updateDockedSide`.
- **Closure:** `collapseIfExpanded` is defined inside `initDiagramToolbarDrag` so it closes over `toolbar`, `collapseBtn`, `wrap`, `getViewportMode`, and the existing helpers. No new globals; no duplication of clamp/snap logic.
- **Export:** Continue to export only `initDiagramToolbarDrag`. The return value is used by the caller (app.js).

### 4.2 App.js: store API and helper

- **Change:** In `app.js`, keep a reference to the diagram toolbar API returned from init.
  - Example: module-level `let diagramToolbarApi = null;`.
  - In `initDiagramToolbarDragWithApp()`: `diagramToolbarApi = initDiagramToolbarDrag({ getViewportMode: () => layoutState.viewportMode });`
  - Define a helper, e.g. `function collapseDiagramToolbarIfExpanded() { diagramToolbarApi?.collapseIfExpanded?.(); }`, and call it from every “open” site below.
- **Re-init:** Existing re-inits (e.g. after view switch) already call `initDiagramToolbarDragWithApp()`; they will overwrite `diagramToolbarApi` with the new return value, which is correct.

### 4.3 Call sites: where to invoke collapse (8 triggers only)

Invoke `collapseDiagramToolbarIfExpanded()` at most once per “open” action, immediately when that action makes the UI open (not on every draw). **Do not** invoke collapse for Flip dropdown, element colour palette, header colour popover, or transparency popover — those use positioning instead (see §4.4).

| # | Where | Insert collapse call |
|----|--------|------------------------|
| 1 | Element toolbar first shown | In `draw()`, inside the block where `hasSingleSelection && rect` and we show the toolbar. Only when the toolbar was previously hidden: e.g. `const wasHidden = toolbarEl.hasAttribute('hidden');` before the block; after `removeAttribute('hidden')`, `if (wasHidden) collapseDiagramToolbarIfExpanded();`. |
| 2 | More submenu opened | In moreBtn click handler, after `submenu.hidden = !submenu.hidden` and `setAttribute`. If `!submenu.hidden` then `collapseDiagramToolbarIfExpanded();`. |
| 3 | Profile dropdown opened | (a) userAvatar click: after setting `profileDropdown.hidden = wasOpen`, if `!profileDropdown.hidden` then `collapseDiagramToolbarIfExpanded();`. (b) The other place that sets `profileDropdown.hidden = false` (~7678): call `collapseDiagramToolbarIfExpanded();` before or after. |
| 4 | Diagrams dropdown opened | In the desktop branch where `diagramsDropdown.hidden = false` (around 8613), before or after that line: `collapseDiagramToolbarIfExpanded();`. |
| 5 | Project history dropdown opened | Inside `openProjectHistoryDropdown()`, before or after `projectHistoryDropdown.hidden = false`: `collapseDiagramToolbarIfExpanded();`. |
| 6 | Product modal opened | In both call sites that call `openAccessibleModal('productModal', ...)` (~8050 and ~8086), call `collapseDiagramToolbarIfExpanded();` immediately before `openAccessibleModal(...)`. |
| 7 | Diagrams bottom sheet opened | At the two call sites of `openAccessibleModal('diagramsBottomSheet', ...)` (~8602, ~8643), call `collapseDiagramToolbarIfExpanded();` immediately before `openAccessibleModal(...)`. |
| 8 | Save diagram modal opened | At the call site `openAccessibleModal('saveDiagramModal', ...)` (~8549), call `collapseDiagramToolbarIfExpanded();` immediately before. |

### 4.4 Four UIs that do NOT auto-collapse: position so they do not overlap the expanded toolbar

For **Flip dropdown** (`#flipDropdown`), **element colour palette** (`#colorPalettePopover`), **header colour diagram popover** (`#headerColorPalettePopover`), and **transparency popover** (`#transparencyPopover`): we do **not** call `collapseDiagramToolbarIfExpanded()`. The diagram toolbar may stay expanded.

**Requirement:** Add logic so that no part of these four UIs overlaps the expanded diagram toolbar. Use the **diagram toolbar** (`#diagramFloatingToolbar`) as the single anchor for positioning: when opening any of these four, compute the toolbar’s rect and place the popover/dropdown so it sits away from the toolbar (e.g. if the toolbar is on the right edge, open the UI to the left or above; if at top, open below). This keeps behaviour simple and consistent — one anchor (the universal diagram toolbar) for “move around” so the opened UI never overlaps it.

---

## 5. Edge cases and safeguards

- **Double collapse:** `collapseIfExpanded()` is idempotent: if already collapsed, it returns without changing state or running rAF.
- **Suppress-after-drag:** The existing “suppress expand tap after drag” logic in toolbar.js applies only to the collapse button’s click. Programmatic collapse does not set `suppressNextExpandTap`; that’s correct so the user can expand again with one tap after we auto-collapse.
- **Draw() and element toolbar:** We only call collapse when the element toolbar transitions from hidden to visible (using a single “was hidden” check in that draw path), so we do not call collapse on every frame.
- **Viewport / re-init:** If `initDiagramToolbarDragWithApp()` runs again (e.g. after view switch), the new `collapseIfExpanded` closes over the current toolbar/wrap/getViewportMode; no stale references.
- **Desktop vs mobile:** Collapse and clamp/snap logic already respect viewport in toolbar.js; no extra scoping needed in app.js.

---

## 6. Testing (manual and E2E)

- **Manual — auto-collapse:** On desktop and mobile, for each of the 8 triggers (element toolbar, more submenu, profile dropdown, diagrams dropdown, project history, product modal, diagrams bottom sheet, save diagram modal), open that UI and confirm the diagram toolbar is collapsed (only the + circle visible). Confirm expanding again with the collapse button works and state persists as today.
- **Manual — no overlap:** For Flip dropdown, element colour palette, header colour popover, and transparency popover: open each with the diagram toolbar **expanded** and confirm no part of the opened UI overlaps the diagram toolbar (positioning uses the toolbar as anchor and opens away from it).
- **E2E:** Existing diagram toolbar collapse/expand tests (e.g. `e2e/run.js`, `e2e/toolbar-collapse-expand.js`) should still pass; add or extend a test that opens one of the collapse-trigger dropdowns and asserts the diagram toolbar is collapsed, if desired.

---

## 7. Task list update (draft)

Add under Section 54, **54.80 Diagram toolbar auto-collapse when element toolbar or dropdowns open**:

- **54.80.1** **toolbar.js: return collapseIfExpanded from init.** In `frontend/toolbar.js`, implement `collapseIfExpanded()` inside `initDiagramToolbarDrag` (same class/localStorage/aria/rAF logic as current collapse, but only when not already collapsed). Return `{ collapseIfExpanded }` from `initDiagramToolbarDrag`.
- **54.80.2** **app.js: store API and call from the 8 open triggers.** In `frontend/app.js`, store the return value of `initDiagramToolbarDrag` (e.g. `diagramToolbarApi`), define `collapseDiagramToolbarIfExpanded()`, and call it from: element toolbar first show in draw (when was hidden); more submenu open; profile dropdown open (both sites); diagrams dropdown open; openProjectHistoryDropdown; before openAccessibleModal('productModal') (both sites); before openAccessibleModal('diagramsBottomSheet') (both sites); before openAccessibleModal('saveDiagramModal'). Do **not** call it for Flip dropdown, element colour palette, header colour popover, or transparency popover.
- **54.80.3** **Verify.** Manual check desktop + mobile for all 8 auto-collapse triggers and for the 4 “no overlap” UIs; run existing E2E; confirm no regressions.
- **54.80.4.1–54.80.4.4** **Position four UIs so they do not overlap the expanded toolbar.** For Flip dropdown, element colour palette, header colour diagram popover, and transparency popover: add positioning logic using `#diagramFloatingToolbar` as the anchor so each opens away from the toolbar and no part of it overlaps the expanded diagram toolbar.

---

## 8. Summary

- **Auto-collapse (8 triggers):** When the user opens the element toolbar, More submenu, profile dropdown, diagrams dropdown, project history dropdown, product modal, diagrams bottom sheet, or save diagram modal, the diagram toolbar auto-collapses. `toolbar.js` exposes `collapseIfExpanded()`; `app.js` calls it at each of those 8 open points.
- **No auto-collapse, position to avoid overlap (4 UIs):** Flip dropdown, element colour palette, header colour diagram popover, and transparency popover do **not** trigger auto-collapse. For these four, add positioning logic using the diagram toolbar (`#diagramFloatingToolbar`) as the anchor so each opens away from the toolbar and no part of it overlaps the expanded diagram toolbar (keeps behaviour simple: one universal toolbar as anchor).
- **No UI/design changes:** Desktop and mobile visuals unchanged; only the collapse timing and the positioning of the four popovers/dropdowns are updated.
