# Mobile Quote Modal: Hide Total, Qty Stepper, Red Minus / Green Plus (Reference UI)

**Date:** 2026-02-21  
**Scope:** Mobile-only Quote modal table (`#quoteModal` when `body[data-viewport-mode="mobile"]`). Desktop quote modal and all calculation/API unchanged. Railway-safe (no new env or build).

**Reference:** User-provided image: item rows with red circular minus (left), product name + "qty × unit price" subtitle; Qty as stepper; no per-line total column; "Add Item/Service" row with green plus. Row template: HStack, space-between, 16px padding, 1px bottom divider between rows.

---

## Current state (code-backed)

- **Table columns (index.html):** Product (0), Qty (1), Cost (2), Markup (3), Unit Price (4), Total (5). On mobile, CSS already hides cols 3–5 (`th/td:nth-child(3,4,5)`); visible are Product (56%), Qty (18%), Total (26%).
- **Remove control:** Lives in **cell 5** (`.quote-cell-total`): `<span class="quote-cell-total-value">$X</span><span class="quote-row-remove-x" role="button" tabindex="0" aria-label="Remove line">×</span>`. Desktop: shown on row hover. Mobile (styles.css ~5770–5779): always visible in that cell. **But** in app.js ~1994–1995, when `isMobileQuoteViewport() && isEditableQuoteLineRow(row)`, the click handler **returns without removing** — so on mobile the × does not delete the row today.
- **Qty on mobile:** For editable lines, `.quote-line-qty-input` and `.quote-row-remove-x` are hidden; `.quote-mobile-line-summary` and `.quote-mobile-line-qty-summary` are shown; tap opens labour/line editor popup. So qty is summary-only, not a stepper.
- **Empty row:** One row with `dataset.emptyRow === 'true'`, cell 0 = product combobox ("Type or select product…"), cell 1 = `.quote-empty-qty-input`. No plus icon in cell 0.
- **Row build:** Material rows from `addMaterialLineFromQuote` (innerHTML with cells 0–5, then cell 5 gets total + remove). Labour from `createLabourRow` (same 6 cells, remove in cell 5). `syncMobileQuoteLineSummaries()` runs after quote calc and adds summary spans to product/qty cells for editable rows.

---

## 1. Hide the Total column (mobile only)

- **CSS:** Under `body[data-viewport-mode="mobile"] #quoteModal .quote-parts-table`, add:
  - `th:nth-child(6), td:nth-child(6) { display: none !important; }` so the Total header and all total cells are hidden.
- **Column widths:** Remove or override the current mobile rules that set `th:nth-child(6), td:nth-child(6) { width: 26%; }` (they will be hidden). Set only visible columns: e.g. `th:nth-child(1), td:nth-child(1)` and `th:nth-child(2), td:nth-child(2)` with appropriate widths (e.g. ~70% product, ~30% qty/stepper) so layout is correct with 2 visible columns.
- **Logic:** No JS change for calculation; `row.cells[5]` still exists and is still updated (total value + remove). Only display is hidden. All code that reads/writes `row.cells[5]` (e.g. `getQuoteLineTotal`, `calculateAndDisplayQuote` total cell update) remains unchanged.

**Files:** `frontend/styles.css` (mobile quote block).

---

## 2. Red minus (delete) and green plus (Add row) to match reference

- **Problem:** If we hide cell 5, the existing remove control (×) is no longer visible or clickable. We need a delete control on the **left** of each item row (red circular minus) and a green plus on the left of the "Add Item/Service" row.
- **Approach:** Keep the DOM as 6 columns; on mobile, hide cell 5 (total) and **add** a control in **cell 0** (product cell) so the row reads [control][product content].
  - **Editable rows (material + labour):** In `syncMobileQuoteLineSummaries()` (when `isMobileQuoteViewport()`), for each row in `isEditableQuoteLineRow(row)`, ensure cell 0 starts with a remove button: create if missing a single `<span class="quote-row-remove-x" role="button" tabindex="0" aria-label="Remove line">−</span>` (or keep × and style as circle), **prepend** to `productCell`. Use the same class so the existing `tableBody` click delegate still handles remove. Style this control on mobile as a red circular button (e.g. ~44×44px, border-radius 50%, background #FF3B30 or similar, color white, minus symbol). Do **not** duplicate the remove in cell 5 for mobile — cell 5 is hidden; the only visible remove is in cell 0.
  - **Empty row:** In the same sync (or once when building empty row for mobile), ensure the empty row’s cell 0 starts with a green circular plus (visual only, or same "add" affordance as the row). Add a `<span class="quote-row-add-plus" aria-hidden="true">+</span>` (or equivalent) prepended to the product cell of the empty row when on mobile; style as green circle (~44×44, background green). The row already has the combobox; the plus is decorative/alignment with reference.
- **Click behaviour:** Today, on mobile, the tableBody click handler **returns early** when `isMobileQuoteViewport() && isEditableQuoteLineRow(row)` and does not remove the row (so tap opens the editor). We need the **remove** to still remove: when the click target is `.quote-row-remove-x`, do **not** return early on mobile; perform `row.remove()`, `ensureLabourRowsExist()`, `removeEmptySectionHeaders()`, `recalcQuoteTotalsFromTableBody()`. So in `initQuoteModal`, in the tableBody click handler that handles `.quote-row-remove-x`, remove the `if (isMobileQuoteViewport() && isEditableQuoteLineRow(row)) return;` so that clicking the red minus removes the line on mobile.
- **Desktop:** No structural change. Remove control stays only in cell 5; cell 0 on desktop has no extra prepended control (sync only runs the "prepend remove to cell 0" when `isMobileQuoteViewport()`). When switching back to desktop, we must not leave a duplicate remove in cell 0: either (a) only create the cell-0 remove when `isMobile` and remove it when switching to desktop (in `applyViewportMode`), or (b) create it only when mobile and ensure it’s not in the DOM on desktop. Clean approach: in `syncMobileQuoteLineSummaries`, when **mobile**, ensure cell 0 has the remove as first child; when **not mobile**, remove any `.quote-row-remove-x` that is inside cell 0 (so it only lives in cell 5 on desktop). That way viewport switch + next sync cleans up.

**Files:** `frontend/app.js` (syncMobileQuoteLineSummaries, initQuoteModal click handler), `frontend/styles.css` (mobile: .quote-row-remove-x in first cell — red circle; .quote-row-add-plus — green circle; 44px min size).

---

## 3. Qty column → stepper (mobile only)

- **Current:** Qty cell (cell 1) for material rows has either `.quote-line-qty-input` or, on mobile, summary spans (and input hidden). Labour rows use tap-to-edit popup.
- **Required:** On mobile, for **material rows** (and optionally metres rows), replace the qty cell content with a **stepper**: minus button, value display, plus button. Value source: `getQuoteRowStoredQty(row)`. Step: 1 for integer qty; for metres rows use an appropriate step (e.g. 0.001 or keep input — can be a follow-up). Labour rows can keep current behaviour (summary + tap to open popup); no stepper in qty cell for labour.
- **Implementation:** In `syncMobileQuoteLineSummaries()`, when `isMobileQuoteViewport()`:
  - For each editable row that is **not** labour and **not** empty:
    - If the row has `.quote-qty-metres-input`, either keep current behaviour or add a stepper with decimal step (plan: use stepper with step 0.1 or 0.01 for metres for simplicity).
    - Otherwise (integer qty material row): clear the qty cell and inject a stepper: a wrapper (e.g. `.quote-mobile-qty-stepper`) containing minus button, a `<span>` or input (read-only display) showing current qty, and plus button. Reuse pattern from labour editor (e.g. `.labour-editor-stepper-btn` styles) or add `.quote-mobile-qty-stepper` and `.quote-mobile-qty-stepper-btn` for mobile. On minus/plus click: get current qty from `getQuoteRowStoredQty(row)`, apply step (1 or 0.5 for labour if we add stepper for labour later), clamp min 0 (or 1 for integer), call `setQuoteRowStoredQty(row, newVal)`, then `calculateAndDisplayQuote()` so totals and backend sync. Ensure the hidden `.quote-line-qty-input` if present is updated so that when we read from table we don’t lose value (or rely only on dataset.quoteQtyValue and ensure calculateAndDisplayQuote reads from that).
  - For labour rows, leave qty cell as is (summary + tap to edit).
- **Empty row:** Keep `.quote-empty-qty-input` in cell 1 on mobile (or optionally replace with a small stepper for the default 1; reference image suggests "Add Item/Service" so keeping the input is acceptable).
- **Desktop:** No change; qty cell stays as current (input or plain text). Stepper is only created when `isMobileQuoteViewport()` in sync.

**Files:** `frontend/app.js` (syncMobileQuoteLineSummaries: build stepper DOM, wire minus/plus to setQuoteRowStoredQty + calculateAndDisplayQuote; ensure getQuoteLineQuantityMeta / getQuoteRowStoredQty remain source of truth), `frontend/styles.css` (mobile: .quote-mobile-qty-stepper, 44px touch targets, alignment).

---

## 4. Row template and dividers (already largely done in 54.92)

- Row template (HStack, space-between, 16px padding, 1px bottom divider) is already applied in 54.92 (horizontal dividers, padding). Ensure product cell (cell 0) with the new [remove|plus][product content] uses flex so the control is left and content flows correctly; 1px bottom border between rows already in place. No extra change if current 54.92 styles are kept; only verify that after adding the control in cell 0, the row still aligns (e.g. cell 0 is `display: flex; align-items: center; gap: 8px` so minus/plus and product name sit in one row).

**Files:** `frontend/styles.css` (mobile quote table cells).

---

## 5. Edge cases and accessibility

- **Viewport switch:** When switching from mobile to desktop, `syncMobileQuoteLineSummaries()` runs (from applyViewportMode or when quote is recalculated). Ensure when `!isMobileQuoteViewport()` we remove the cell-0 remove button and any mobile-only stepper from cell 1 so desktop shows normal input/total column again.
- **Remove in cell 0 and focus:** The new remove in cell 0 must be keyboard-activatable (Enter/Space). It already has `role="button"` and `tabindex="0"`; the existing keydown handler on tableBody for `.quote-row-remove-x` will work for it. Ensure no duplicate handlers.
- **ARIA:** Red minus: `aria-label="Remove line"`. Stepper minus/plus: `aria-label="Decrease quantity"` / `aria-label="Increase quantity"`. Green plus on empty row: `aria-hidden="true"` if decorative.
- **Print/copy:** These use the table DOM; hiding the total column is display-only, so printed/copied content can still include total from row.cells[5] when generating the print/copy markup (or we explicitly include total in the printed row when on mobile in the print template — check printQuote/copy path and keep totals in output if needed).

---

## 6. Task list mapping (draft)

- **54.93.1** Mobile quote: hide Total column (header + cells); adjust column widths for Product and Qty.
- **54.93.2** Mobile quote: red circular minus (delete) in first column for item rows; green circular plus for Add row; ensure remove click removes row on mobile.
- **54.93.3** Mobile quote: replace Qty column with stepper (minus / value / plus) for material rows; keep labour tap-to-edit; 44px targets and sync with setQuoteRowStoredQty + calculateAndDisplayQuote.
- **54.93.4** Verify desktop unchanged, viewport switch cleans up cell-0 remove and stepper; E2E/manual; Railway-safe.

---

## 7. Files to touch

| File            | Changes |
|-----------------|--------|
| `frontend/styles.css` | Hide th/td:nth-child(6) on mobile; width for 1–2 only; red circle .quote-row-remove-x in first cell; green circle .quote-row-add-plus; .quote-mobile-qty-stepper and buttons (44px). |
| `frontend/app.js`      | syncMobileQuoteLineSummaries: prepend remove to cell 0 when mobile, remove when desktop; add green plus to empty row cell 0 when mobile; replace qty cell with stepper for material rows on mobile; initQuoteModal: allow remove to delete row on mobile (remove early return for .quote-row-remove-x). |

No change to `frontend/index.html` unless we add a shared class for the empty row plus (optional).

---

## Context prompt for next chat (quote modal UI refinement)

**Copy the block below into your next chat to restore context quickly when refining the quote modal UI. Do not change calculation, API, or popup behaviour.**

---

**Quote modal refinement context (do not harm functionality).**  
We are refining the **mobile** Quote modal UI only (`#quoteModal` when `body[data-viewport-mode="mobile"]`). Desktop quote modal and all underlying logic must stay unchanged. Single codebase; deploy to Railway (no new build/env).

**Current implementation (54.92 + 54.93):** Table `#quotePartsTable` has 6 columns (Product, Qty, Cost, Markup, Unit Price, Total). On mobile we hide columns 3–6 (Cost, Markup, Unit Price, Total). Product column (cell 0) shows: red circular minus (delete) or green plus (empty row), then product name and `.quote-mobile-line-summary` ("qty × unit price · Tap to edit"). Qty column (cell 1): for **material rows** we show a stepper (`.quote-mobile-qty-stepper`: minus, value, plus) wired to `setQuoteRowStoredQty(row, val)` and `calculateAndDisplayQuote()`; for **labour** and **metres** rows we show `.quote-mobile-line-qty-summary` and tap opens the editor popup. All new UI is driven by `syncMobileQuoteLineSummaries()` in `frontend/app.js`; desktop cleanup removes cell-0 remove/plus and restores a qty input when switching viewport. Source of truth for qty: `row.dataset.quoteQtyValue` and `getQuoteRowStoredQty` / `setQuoteRowStoredQty`. Do not change: `calculateAndDisplayQuote`, `getElementsFromQuoteTable`, labour editor modal (`#labourEditorModal`), tap-to-edit flow, or any code that reads/writes `row.cells[5]` (total). Task list: `TASK_LIST.md`; mobile tasks in `docs/tasks/section-54.md`. Run `npm test` after changes.
