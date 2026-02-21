# Plan: 54.79 – Mobile diagram toolbar: hide handle visually, central grip bar, hide Inspector

**Scope:** Mobile-only CSS (and minimal DOM if needed). No HTML/JS removal; no changes to `toolbar.js` drag logic or desktop UI.

**Context:** Keep `#diagramToolbarDragHandle` and all JS as-is. On mobile only: (1) hide the drag handle visually so it does not take layout space, (2) add a thin central grip pill to indicate the drag area, (3) hide the Open Inspector button inside the diagram toolbar. Container-drag in `toolbar.js` already starts drag when pointerdown is on the toolbar chrome (not on the handle or `.diagram-toolbar-tools-wrap`), so after hiding the handle, taps on the grip/chrome still start drag via `toolbarPointerDownHandler`.

---

## 1. Codebase facts (no assumptions)

- **Diagram toolbar DOM** (`frontend/index.html` ~141–182):
  - `.diagram-floating-toolbar#diagramFloatingToolbar` contains, in order: `#diagramToolbarDragHandle` (button.diagram-toolbar-drag-handle), `#diagramToolbarCollapseBtn`, `.diagram-toolbar-tools-wrap`.
  - `.diagram-toolbar-tools-wrap` contains: technical drawing toggle, zoom out/fit/in, **`#openInspectorBtn`**, header color wrap, blueprint transparency button.
  - So `#openInspectorBtn` is **inside** `.diagram-toolbar-tools-wrap` and is the only element with that ID.

- **Drag logic** (`frontend/toolbar.js`):
  - `toolbarPointerDownHandler` is attached to the **toolbar** (capture). It calls `onPointerDown(e)` when: (1) target is dragHandle or inside it, or (2) when collapsed and target is collapseBtn, or (3) when target is **not** inside `.diagram-toolbar-tools-wrap` and **not** a button/label/input/.toolbar-pill-btn. So pointerdown on the toolbar chrome (e.g. gap between collapse and tools-wrap, or where the handle used to be) already starts drag; no JS change needed after hiding the handle.

- **Existing CSS:**
  - `.diagram-toolbar-drag-handle` (styles.css ~2266–2308): 44×44, `::before` grip 40×4 (horizontal) / 4×40 (vertical by `[data-orientation="vertical"]`).
  - Collapsed state (lines 1264–1274): `.diagram-floating-toolbar.diagram-floating-toolbar--collapsed .diagram-toolbar-drag-handle` already zeros size (max-width/height 0, opacity 0, pointer-events: none).
  - Mobile 44px targets (2310–2317): `body[data-viewport-mode="mobile"] .diagram-floating-toolbar[data-orientation="horizontal"] .diagram-toolbar-drag-handle` gets min-width/height 44px. The new mobile hide rule must override this (same or higher specificity, later source order, or more specific selector) so the handle is truly zero-size on mobile.

- **Desktop vs mobile:** All new rules must be under `body[data-viewport-mode="mobile"]` so desktop is unchanged. Railway deployment: CSS-only (and optional single non-breaking DOM node); no build or Procfile changes.

---

## 2. Task 54.79.1 – Mobile: hide diagram toolbar drag handle visually

- **File:** `frontend/styles.css`
- **Where:** Under the existing mobile diagram toolbar block (e.g. after `body[data-viewport-mode="mobile"] .diagram-floating-toolbar.diagram-floating-toolbar--collapsed[data-orientation="horizontal"] .toggle-icon::after` ~2205, or in a dedicated 54.79 block).
- **Rule:**  
  `body[data-viewport-mode="mobile"] .diagram-floating-toolbar .diagram-toolbar-drag-handle`  
  with: `width: 0; height: 0; min-width: 0; min-height: 0; max-width: 0; max-height: 0; padding: 0; margin: 0; overflow: hidden; opacity: 0; pointer-events: none;`
- **Rationale:** Same approach as the existing collapsed-state handle rule; applied on mobile for both expanded and collapsed so the handle never takes space or shows. No HTML/JS change; `dragHandle` stays in DOM and JS still runs (listeners on toolbar still start drag when user taps chrome/grip).
- **Collapsed state:** Existing collapsed rule already zeros the handle; this mobile rule applies in all mobile states. No conflict; collapsed circle (48px) is from the container and collapse button, not the handle.

---

## 3. Task 54.79.2 – Mobile: central grip bar for drag area

- **File:** `frontend/styles.css` (preferred); optional one small DOM node only if pseudo-element is insufficient for layout.
- **Goal:** A thin, subtle grip pill in the “non-tool” area of the diagram toolbar (between collapse and tools-wrap, or where the handle was) so the drag zone is clearly indicated. Orientation-aware: short horizontal bar in vertical mode, short vertical bar in horizontal mode (matching current `.diagram-toolbar-drag-handle::before` proportions).
- **Recommended approach (CSS-only):** Use a pseudo-element on the **toolbar** so it participates in the flex layout and sits in the chrome area.
  - Selector: `body[data-viewport-mode="mobile"] .diagram-floating-toolbar::before`
  - Content: `content: "";` with a small fixed size (e.g. 32px × 4px for horizontal bar; 4px × 32px for vertical), `flex-shrink: 0`, `background: rgba(0,0,0,0.2); border-radius: 2px;` (or match existing handle `::before` ~0.25). Do **not** use `pointer-events` that would block the toolbar; default (auto) is fine so the toolbar’s pointerdown still fires when the user taps the grip.
  - Orientation:  
    - Default (horizontal toolbar = top/bottom): vertical pill → `width: 4px; height: 32px;`  
    - Vertical toolbar (left/right): horizontal pill → `width: 32px; height: 4px;`  
    Use `body[data-viewport-mode="mobile"] .diagram-floating-toolbar[data-orientation="vertical"]::before` for the horizontal pill (32×4), and the default `::before` for the vertical pill (4×32).
- **Placement:** The toolbar’s flex order is: drag handle (first), collapse btn, tools-wrap. With the handle zero-size, the first “slot” is empty; a `::before` becomes the first flex item, so it appears between (visually) “handle” and collapse. That is acceptable. Alternatively, if the design wants the grip strictly between collapse and tools-wrap, a second pseudo-element (e.g. `::after`) on the toolbar could be used with `order` to sit between collapse and tools-wrap; then the first flex item would be the zero-size handle, then collapse (order 99 when expanded), then `::after` (give it an order between 0 and 99), then tools-wrap. Simplest is `::before` as the first flex item (grip in the “handle” slot); document the choice in the plan.
- **DOM fallback:** If the team prefers an explicit element (e.g. for accessibility or layout quirks), add a single `<span class="diagram-toolbar-mobile-grip" aria-hidden="true"></span>` inside the toolbar (e.g. after the collapse button, before tools-wrap) and style it under `body[data-viewport-mode="mobile"]` with the same dimensions and orientation rules. Ensure it is not a button/label so `toolbarPointerDownHandler` still starts drag when it’s tapped.
- **Desktop:** No new rules without `body[data-viewport-mode="mobile"]`; desktop unchanged.

---

## 4. Task 54.79.3 – Mobile: hide Open Inspector in diagram toolbar

- **File:** `frontend/styles.css`
- **Selector:** `body[data-viewport-mode="mobile"] .diagram-floating-toolbar #openInspectorBtn`  
  (ID is unique; it lives inside `.diagram-toolbar-tools-wrap` which is inside `.diagram-floating-toolbar`.)
- **Rule:** `display: none;` (or `visibility: hidden` + `position: absolute; width: 0; height: 0` if we must keep layout flow unchanged; `display: none` is simpler and matches “hide” intent).
- **Result:** Inspector button is not shown in the mobile diagram toolbar; Inspector remains available elsewhere (e.g. accessibility settings, desktop) per product. Desktop toolbar unchanged.

---

## 5. Edge cases and accessibility

- **Collapsed state:** Handle is already hidden by the new mobile rule; collapsed circle is unchanged (48px container + collapse button). No extra rule needed for collapsed.
- **Horizontal vs vertical:** Grip (54.79.2) must match `data-orientation` (vertical toolbar → horizontal pill; horizontal toolbar → vertical pill). Use the same logic as `.diagram-toolbar-drag-handle::before` orientation rules.
- **E2E / pointer capture:** toolbar.js uses `toolbar.setPointerCapture(e.pointerId)` and `dragHandle.releasePointerCapture` in handlers. The handle remains in DOM; only its visibility/size is changed. No change to listener attachment; drag still starts from toolbar chrome. Run existing diagram toolbar E2E after implementation.
- **Screen readers:** Handle is still in DOM; consider `aria-hidden="true"` on the grip element if added (already recommended as `aria-hidden="true"` in the DOM fallback). Hiding the Inspector button is visual only; no need to remove from a11y tree if it’s not offered on mobile in this context (display:none removes from layout and typically from a11y tree, which is desired for “hide in diagram toolbar on mobile”).

---

## 6. Verification

- **Desktop:** No visual or behavioral change; drag handle and Inspector button unchanged.
- **Mobile:** Handle invisible and no layout space; grip visible in chrome; Inspector button not visible in diagram toolbar; drag still works by tapping grip/toolbar chrome; collapse/expand and orientation snap unchanged.
- **Railway:** No new env, build, or deploy config; CSS (and optional one span) only.
- **Tests:** Run `npm test` (or `./scripts/run-e2e.sh`); confirm mobile diagram toolbar tests pass.

---

## 7. Task list update (after implementation)

When 54.79.1–54.79.3 are done, mark in `TASK_LIST.md`:

- `- [x] **54.79.1**` …  
- `- [x] **54.79.2**` …  
- `- [x] **54.79.3**` …

Update the “Last updated” line to note 54.79 complete (mobile: hide drag handle visually, central grip bar, hide Inspector in diagram toolbar; plan: this doc).
