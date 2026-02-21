# Labour editor button: Apply when dirty, untoggled by default

**Date:** 2026-02-21  
**Scope:** Mobile-only (labour editor is only opened when `isMobileQuoteViewport()`). Desktop and Railway unchanged.  
**Related:** Section 50 (quote labour), Section 54 (mobile quote); labour editor added in 54.87.2.

## Goal

1. **Default state:** The labour editor footer button (`#labourEditorAddRowBtn`) is **untoggled** by default: secondary/outline style (not the current blue filled primary look).
2. **When the labour line has unsaved changes:** The same button turns **green**, text changes to **"Apply"**, and clicking it applies the current draft to the table (same as Save/Done) instead of adding a new row.

## Current behaviour (verified in code)

- **DOM:** `frontend/index.html` ~723–733: `#labourEditorModal` → `.labour-editor-actions` → `#labourEditorAddRowBtn` ("Add Labour Line").
- **CSS:** `frontend/styles.css` 5404–5426: `.labour-editor-actions .btn` has blue fill (`#007aff`), white text, 44px min-height. Mobile override at 6010–6012 (min-height 44px). So the button always looks like a primary “toggled” button.
- **JS:** `frontend/app.js`:
  - `quoteLineEditorState` (545–553): `rowUid`, `rowType`, `draftQty`, `draftUnitPrice`, `qtyStep`, `title`, `isTaxApplicable`. No initial/dirty tracking.
  - `openLabourEditorModal` (1977–1995): Sets draft from row; does **not** store initial values for dirty comparison.
  - `renderLabourEditorRows` (1698–1842): Builds the editor list; shows/hides `#labourEditorAddRowBtn` for labour rows (1716, 1717); does **not** set button text or style from dirty state.
  - Add button click (2452–2469): Always adds a new labour row (then re-renders and focuses new row’s qty input). No branching on dirty.
  - Draft updates: `setQtyDraft`, `setRateDraft`, tax toggle (1882–1929) update `quoteLineEditorState` and rerender line total only; they do **not** update the footer button.

## Implementation plan (no assumptions; code-based)

### 1. Dirty tracking and initial snapshot

- **Extend `quoteLineEditorState`** (app.js ~545): Add `initialQty`, `initialUnitPrice`, `initialTaxApplicable` (same types as draft). Used only for labour editor dirty comparison.
- **Set initial snapshot when opening:** In `openLabourEditorModal` (1977–1995), after setting `draftQty`, `draftUnitPrice`, `isTaxApplicable` from the row, set:
  - `quoteLineEditorState.initialQty = quoteLineEditorState.draftQty`
  - `quoteLineEditorState.initialUnitPrice = quoteLineEditorState.draftUnitPrice`
  - `quoteLineEditorState.initialTaxApplicable = quoteLineEditorState.isTaxApplicable`
  (If tax is not stored per row and we always use `true`, then `initialTaxApplicable` can be set to `true` and omitted from dirty check; only qty and unit price would drive dirty.)
- **Set initial snapshot when adding a new labour row:** In the `#labourEditorAddRowBtn` click handler (2452–2469), after creating the new row and updating `quoteLineEditorState` (rowUid, draftQty, draftUnitPrice, etc.), set `initialQty`, `initialUnitPrice`, `initialTaxApplicable` to the **new** draft values so the new row is not considered dirty. Then call `renderLabourEditorRows()` and focus as today.

### 2. Helper: update labour editor footer button state

- **New function `updateLabourEditorAddButtonState()`** in app.js (e.g. near `renderLabourEditorRows`):
  - Get `#labourEditorAddRowBtn`; if missing or modal not open, return.
  - If not labour (`quoteLineEditorState.rowType !== 'labour'`), leave button hidden (current behaviour) and return.
  - **Dirty:**  
    `dirty = (quoteLineEditorState.draftQty !== quoteLineEditorState.initialQty || quoteLineEditorState.draftUnitPrice !== quoteLineEditorState.initialUnitPrice || quoteLineEditorState.isTaxApplicable !== quoteLineEditorState.initialTaxApplicable)`.  
    Use safe comparison (e.g. normalize numbers so 1.5 === 1.5).
  - Set button text: `dirty ? 'Apply' : 'Add Labour Line'`.
  - Set button class/list: add or remove a single modifier class (e.g. `labour-editor-add-btn--apply` or `labour-editor-actions .btn--apply`) when dirty so CSS can turn it green. Do not remove base `btn` class.
  - Optional: set `aria-label` / `title` for Apply vs Add Labour Line for accessibility.

### 3. When to call `updateLabourEditorAddButtonState()`

- In **`openLabourEditorModal`** after `renderLabourEditorRows()` (so on open the button is untoggled and "Add Labour Line").
- In **`renderLabourEditorRows`** at the end when it’s a labour row (so after initial render and after add-row re-render the button state is correct).
- Inside **`renderLabourEditorRows`**, in every path that updates the draft:
  - End of `setQtyDraft` (after `rerenderTotals()`).
  - End of `setRateDraft` (inside the `if (rateEditor)` block, after `rerenderTotals()`).
  - In the `taxToggleInput.addEventListener('change', ...)` after `rerenderTotals()`.
  So any change to qty, unit price, or tax updates the footer button.

### 4. Click handler for `#labourEditorAddRowBtn`

- In the existing click handler (2452–2469):
  - If **dirty** (use same logic as `updateLabourEditorAddButtonState`, or call that function and read a small state flag, or compare draft vs initial inline): call `applyQuoteLineEditorChanges()` (and do not add a row). Optionally keep modal open or close; to match “Save”, closing after apply is consistent.
  - Else: current behaviour (add new labour row, re-set state and initial snapshot, re-render, focus new qty input).

### 5. CSS: default untoggled + green Apply

- **Default (untoggled):** Change `.labour-editor-actions .btn` so it is **not** filled blue by default:
  - Option A: Outline style — e.g. `background: transparent` or `background: #f2f2f7`, `color: #007aff`, `border: 1px solid #007aff`. Keep min-height 44px and border-radius.
  - Option B: Neutral secondary — e.g. grey border, grey or dark text, no blue fill.
  Ensure contrast and 44px target are preserved (Apple HIG); mobile override at 6010–6012 remains (min-height 44px).
- **Apply state (green):** Add a modifier, e.g. `.labour-editor-actions .btn.labour-editor-add-btn--apply` or `.labour-editor-actions .btn--apply`:
  - `background: #34c759` (or project green, e.g. #71C43C if preferred), `color: #fff`, `border-color: #34c759`.
  - Hover: slightly darker green if needed.
  Apply state only when the button text is "Apply" (JS adds/removes the class when dirty).

### 6. Desktop / mobile / Railway

- Labour editor is only opened when `isMobileQuoteViewport()` is true, so this is de facto mobile-only. No need to scope CSS with `body[data-viewport-mode="mobile"]` for this button unless we want to restrict the new styling to mobile only; same DOM is used. No new env vars, no build steps, no backend or Procfile changes — Railway-safe.

### 7. Edge cases and accessibility

- **Numeric comparison:** Use consistent rounding when comparing `draftQty`/`initialQty` and `draftUnitPrice`/`initialUnitPrice` (e.g. same as used in `formatQuoteQtyDisplay` or round to 2 decimal places for price, step for qty) so 1.5 vs 1.50 does not falsely set dirty.
- **Tax:** If the quote table does not persist “GST on income” per labour row, treat `initialTaxApplicable` as `true` and ignore it in the dirty check to avoid false dirty.
- **Screen reader:** When the button switches to "Apply", ensure the accessible name (text or aria-label) updates so screen reader users hear "Apply" not "Add Labour Line". Button text change is sufficient if the button’s content is the only label.
- **Focus:** No focus change required when toggling between Add Labour Line and Apply; user remains in the form.

### 8. Files to touch

| File | Changes |
|------|--------|
| `frontend/app.js` | Extend `quoteLineEditorState` with initial*; set initial in `openLabourEditorModal` and in add-row click handler; add `updateLabourEditorAddButtonState()`; call it from open, end of `renderLabourEditorRows`, and in setQtyDraft/setRateDraft/tax change; branch add-button click on dirty (apply vs add row). |
| `frontend/styles.css` | `.labour-editor-actions .btn`: default to outline/secondary (untoggled); add `.labour-editor-actions .btn.labour-editor-add-btn--apply` (or equivalent) for green Apply state. |
| `frontend/index.html` | No change required (button remains "Add Labour Line" in markup; JS will set textContent). |

### 9. Verification

- Manual (mobile): Open labour editor → button is untoggled, "Add Labour Line". Change hours or unit price or tax → button becomes green "Apply". Click Apply → changes applied, modal closes. Open again, do not change → button stays "Add Labour Line"; click → adds new row. Multiple labour rows: edit one, Apply applies that row only.
- Desktop: Labour editor not opened on desktop; no regression.
- E2E: If labour editor is covered, add or extend assertions for button text Apply when dirty and Add Labour Line when not (optional).
- Railway: No config or build changes; deploy as usual.

---

**Task list update (draft):** Add to Section 54 (e.g. **54.97 Labour editor button: Apply when dirty, untoggled by default**) with sub-tasks for: (1) dirty tracking and initial snapshot in app.js, (2) `updateLabourEditorAddButtonState()` and wiring, (3) add-button click branch (Apply vs add row), (4) CSS default untoggled + green Apply, (5) verification and Railway-safe check. After implementation, mark checkboxes in `docs/tasks/section-54.md` and, if section 54 uncompleted table in TASK_LIST.md is updated, add a row for 54.97.
