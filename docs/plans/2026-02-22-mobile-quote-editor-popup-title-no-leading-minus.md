# Plan: Remove leading minus from item name in mobile quote editor popup title

**Date:** 2026-02-22  
**Scope:** Mobile product edit view (quote modal → labour editor popup). UI only; desktop unchanged; Railway-safe.

## Goal

Remove the "−" character (Unicode minus U+2212) from the item name shown in the popup within the quote modal.

**Target element:**  
`div#quoteModal > div.quote-modal-content > div#labourEditorModal > div#labourEditorContent > div#labourEditorList > div.labour-editor-row > div.labour-editor-row-header > h4.labour-editor-row-title`

**Current behaviour:** Title shows e.g. `−Screws (brackets & clips)`.  
**Desired behaviour:** Title shows `Screws (brackets & clips)` (no leading minus).

## Root cause

- On mobile, `syncMobileQuoteLineSummaries` (app.js ~1610–1620) prepends a remove control to the **product cell** (cell 0): a `.quote-row-remove-x` element with `textContent = '−'`.
- The labour editor popup title is set in `renderLabourEditorRows()` (app.js ~1902–1903) from:
  - `quoteLineEditorState.title || getQuoteLineProductName(row)`
- `getQuoteLineProductName(row)` (app.js 1402–1415) derives the name by:
  1. Cloning `row.cells[0]` (product cell)
  2. Removing a fixed list of UI elements from the clone (summaries, dup btn, etc.)
  3. Reading `clone.textContent`, then trimming/normalising whitespace
- **`.quote-row-remove-x` is not in the remove list**, so the clone still contains the "−" node and the derived name is `"−Screws (brackets & clips)"`.

## Proposed fix (single change)

**File:** `frontend/app.js`  
**Function:** `getQuoteLineProductName`  
**Change:** Add `.quote-row-remove-x` to the `querySelectorAll` selector so the clone is stripped of the remove control before reading `textContent`.

**Current line (~1408–1410):**
```js
clone.querySelectorAll(
  '.quote-mobile-line-summary, .quote-labour-mobile-summary, .quote-labour-mobile-qty-summary, .quote-labour-mobile-rate-summary, .quote-mobile-line-qty-summary, .quote-labour-dup-btn'
).forEach((el) => el.remove());
```

**Updated:**
```js
clone.querySelectorAll(
  '.quote-mobile-line-summary, .quote-labour-mobile-summary, .quote-labour-mobile-qty-summary, .quote-labour-mobile-rate-summary, .quote-mobile-line-qty-summary, .quote-labour-dup-btn, .quote-row-remove-x'
).forEach((el) => el.remove());
```

## Impact

- **Mobile:** Labour editor and material-line editor popup titles will show the product name without the leading "−". No other mobile behaviour changed.
- **Desktop:** No change. On desktop the remove control for quote rows lives in the Total column (e.g. `cells[5]`), not in the product cell; the product cell is not prepended with the minus. Including `.quote-row-remove-x` in the clone strip is a no-op on current desktop DOM and makes the helper robust if structure ever changes.
- **Railway:** Frontend-only; no backend, env, or build changes. Deploy remains valid.

## Verification

1. **Manual (mobile):** Open quote modal on mobile, tap a material line (e.g. "Screws (brackets & clips)"); confirm popup title is `Screws (brackets & clips)` with no leading "−". Repeat for labour row (title "Labour" unchanged).
2. **Regression:** Run `npm test`; no new failures.
3. **Desktop:** Open quote on desktop, edit a line; confirm title and behaviour unchanged.

## Task reference

Section 54, task **54.98.7** (mobile quote editor popup: remove leading minus from item name in popup title).
