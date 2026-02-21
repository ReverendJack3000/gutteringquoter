# Mobile Quote: Stepper for Section-Header Metres (Gutter / Downpipe Length)

**Date:** 2026-02-21  
**Scope:** Mobile-only Quote modal (`#quoteModal` when `body[data-viewport-mode="mobile"]`). Replace the number input in **section header** rows (Gutter Length: SC/CL, Downpipe 65mm/80mm Length) with the same stepper UI (− / value / +) used for labour and line-item metres, for consistent UX. Desktop and Railway unchanged.

**Goal:** On mobile, section header metres use `.quote-mobile-qty-stepper` (44px buttons, step 0.5) instead of `.quote-header-metres-input`; value stays in sync with existing logic and rebuild/override flows.

---

## 1. Context: two metres UIs

| Row type | Class / DOM | Current mobile UI | After this plan |
|----------|-------------|-------------------|------------------|
| **Section header** (Gutter / Downpipe length) | `tr.quote-section-header`, `td[1]` contains `.quote-header-metres-wrap` > `.quote-header-metres-input` | Number input | Stepper (− / value / +), step 0.5 |
| **Line-item metres** (single gutter/downpipe line) | Editable row with `.quote-qty-metres-input` or `data-length-mm` | Stepper (54.93.6) | No change |

Section header rows are **not** in `isEditableQuoteLineRow()` (they have `row.dataset.sectionHeader`), so `syncMobileQuoteLineSummaries` currently only processes editable rows and never touches section headers.

---

## 2. Exact file and line references (restore context in next chat)

### 2.1 app.js

| Purpose | File | Line(s) |
|---------|------|--------|
| `syncMobileQuoteLineSummaries` entry point; desktop cleanup; editable-rows loop | `frontend/app.js` | 1366–1375 (function start, isMobile, tableBody, totalLabourHours), 1376–1411 (desktop cleanup block), 1412 (rows filter), 1413+ (forEach over editable rows only) |
| Desktop cleanup: restore qty cell by row type (labour / metres / material); **add** branch for section header: remove stepper, restore `.quote-header-metres-wrap` with input | `frontend/app.js` | 1384–1409 (current `if (qtyCell?.querySelector('.quote-mobile-qty-stepper'))` block; section headers have no stepper today, so add **branch** inside same loop for `row.dataset.sectionHeader` and `qtyCell?.querySelector('.quote-mobile-qty-stepper')`) |
| Where to add **mobile** section-header stepper logic | `frontend/app.js` | After desktop cleanup block (after line 1411), **before** `const rows = Array.from(tableBody.rows).filter(isEditableQuoteLineRow)` (line 1412). New block: `if (isMobile) { Array.from(tableBody.rows).forEach((row) => { if (!row.dataset.sectionHeader) return; const qtyCell = row.cells[1]; ... replace wrap content with stepper, keep input in DOM (hidden), wire +/- to input.value and calculateAndDisplayQuote. }); }` |
| Section header row detection | `frontend/app.js` | 1267 (`isEditableQuoteLineRow`: returns false when `row.dataset.sectionHeader`), 3619–3630 (incomplete check reads `.quote-header-metres-input`), 3654–3670 (preserve `profileLengthOverride` / `downpipeLengthOverride` from `.quote-header-metres-input` value) |
| Rebuild: gutter header row creation (innerHTML with `.quote-header-metres-input`) | `frontend/app.js` | 3719–3735 (headerRow, className, dataset.sectionHeader, innerHTML, headerMetresInput change/blur → calculateAndDisplayQuote) |
| Rebuild: downpipe header row creation | `frontend/app.js` | 3776–3792 (same pattern for downpipe size) |
| Reading header metres for getElementsFromQuoteTable / totals | `frontend/app.js` | 3002–3022 (for (row of tableBody.rows), sectionHeader, metresInput = row.cells[1]?.querySelector('.quote-header-metres-input'), parse value into profileLengthMm / downpipeLengthMm) |
| Table body click: skip when target is header input or stepper | `frontend/app.js` | 2257 (`ev.target.closest('..., .quote-header-metres-input, ...')`) — add `.quote-mobile-qty-stepper` for section headers if stepper is in same cell so row tap doesn’t open editor |

### 2.2 styles.css

| Purpose | File | Line(s) |
|---------|------|--------|
| Existing stepper styles (reuse for section header) | `frontend/styles.css` | 5749–5784 (`.quote-mobile-qty-stepper`, `.quote-mobile-qty-stepper-btn`, `.quote-mobile-qty-stepper-value` under `body[data-viewport-mode="mobile"] #quoteModal`) |
| Hide section header input when stepper is shown (keep input in DOM) | New rule under same mobile block: e.g. `body[data-viewport-mode="mobile"] #quoteModal .quote-header-metres-input--hidden-mobile { display: none !important; }` | Add after ~5825 (near `.quote-labour-hours-input--hidden-mobile`) |

### 2.3 Index / task list

| Purpose | File | Line(s) |
|---------|------|--------|
| Uncompleted tasks index | `TASK_LIST.md` | 52–84 (Uncompleted tasks table; add row for 54.93.8) |
| Section 54 task text and checkboxes | `docs/tasks/section-54.md` | After 54.93.7 (~line 263); add 54.93.8 subsection with checkboxes |

---

## 3. Implementation plan

### 3.1 Mobile: replace section-header metres input with stepper

- In `syncMobileQuoteLineSummaries`, after the desktop cleanup block and **before** the `const rows = ... filter(isEditableQuoteLineRow)` loop:
  - If `!isMobile`, skip (no change to section headers on desktop in this block).
  - If `isMobile`, loop over `Array.from(tableBody.rows)`. For each row with `row.dataset.sectionHeader`:
    - `qtyCell = row.cells[1]`. If no `qtyCell`, continue.
    - `wrap = qtyCell.querySelector('.quote-header-metres-wrap')`, `input = wrap?.querySelector('.quote-header-metres-input')`. If no input, continue.
    - If `qtyCell.querySelector('.quote-mobile-qty-stepper')` already exists: only update the stepper value span from `input.value` (and optional " m" suffix). Continue.
    - Else build stepper DOM (same as line-item: `.quote-mobile-qty-stepper`, minus btn, value span, plus btn). Step = 0.5 (match existing header input step).
    - Keep the input in the cell: add class `quote-header-metres-input--hidden-mobile`, append after stepper (so existing code that reads `row.cells[1].querySelector('.quote-header-metres-input')` still sees it). Do **not** remove the wrap; replace wrap’s contents with stepper + hidden input, or clear wrap and append stepper + input into wrap/cell.
    - Wire minus/plus: read `current = parseFloat(input.value) || 0`, `next = Math.max(0, current ± 0.5)`, set `input.value = String(next)`, call `calculateAndDisplayQuote().then(() => syncMobileQuoteLineSummaries())`.
    - Value span display: show `input.value` + " m" (or use same formatting as line-item metres).
    - ARIA: "Decrease length" / "Increase length" (or "Decrease quantity" for consistency).

### 3.2 Desktop cleanup: restore section-header input when leaving mobile

- In the existing desktop cleanup block (`if (!isMobile)`, lines 1376–1411), the loop runs over **all** `tableBody.rows`. Currently it only restores when `qtyCell?.querySelector('.quote-mobile-qty-stepper')` (lines 1384–1409). Section header rows will have the stepper after this feature, so:
  - Add a branch inside that same loop: if `row.dataset.sectionHeader` and `qtyCell?.querySelector('.quote-mobile-qty-stepper')`:
    - Remove the stepper.
    - Restore visible `.quote-header-metres-wrap` with `.quote-header-metres-input` whose value is the current value (read from the hidden input if still in DOM, or from the stepper’s effective value). Remove class `quote-header-metres-input--hidden-mobile`.
  - Ensure the wrap/input structure matches what the rebuild and getElementsFromQuoteTable expect (same class names and DOM shape as created at 3728 and 3786).

### 3.3 Preserve existing behaviour

- **Rebuild** (e.g. `calculateAndDisplayQuote` table rebuild): Header rows are recreated with innerHTML containing `.quote-header-metres-input`. After rebuild, `syncMobileQuoteLineSummaries` runs again; on mobile it will replace that input with the stepper again. No change to rebuild logic.
- **profileLengthOverride / downpipeLengthOverride**: Read in the loop at 3654–3670 from `r.querySelector('.quote-header-metres-input')`. As long as the input remains in the DOM (hidden) and its value is updated by the stepper, this continues to work.
- **getElementsFromQuoteTable** (or the loop at 3002–3022): Reads `row.cells[1]?.querySelector('.quote-header-metres-input')` and `metresInput.value`. Same: keep input in DOM with updated value.

### 3.4 CSS

- Add `body[data-viewport-mode="mobile"] #quoteModal .quote-header-metres-input--hidden-mobile { display: none !important; }` so the input is hidden when the stepper is shown. No other CSS change if reusing existing `.quote-mobile-qty-stepper*` styles.

### 3.5 Edge cases

- **Incomplete** section header (Metres? placeholder, no value): Stepper can show "0 m"; minus/plus from 0.5. Or show "0" and allow 0; existing incomplete logic is unchanged.
- **Table body click**: If user taps the section header row (not the stepper), ensure we don’t open the labour/line editor. Current guard at 2257 includes `.quote-header-metres-input`; ensure taps on the section-header stepper are also excluded (e.g. `ev.target.closest('.quote-mobile-qty-stepper')` already in the list; verify section header rows don’t use the same click handler that opens the editor — they don’t pass `isEditableQuoteLineRow`, so we’re fine).

---

## 4. Task list (draft for section file and index)

- **54.93.8.1** Mobile: In `syncMobileQuoteLineSummaries` (app.js 1366+), after desktop cleanup block (after line 1411) and before the editable-rows loop (line 1412), add a mobile-only loop over section header rows (`row.dataset.sectionHeader`). For each, replace `.quote-header-metres-wrap` content with a stepper (minus / value / +) and keep `.quote-header-metres-input` in DOM with class `quote-header-metres-input--hidden-mobile`; wire +/- to input value (step 0.5) and `calculateAndDisplayQuote` + sync. Reuse `.quote-mobile-qty-stepper` DOM (1468–1486) and styles (5749–5784).
- **54.93.8.2** Desktop cleanup: In the same function’s `if (!isMobile)` block (app.js 1376–1411), inside the existing loop when `.quote-mobile-qty-stepper`, add a branch for `row.dataset.sectionHeader`: remove stepper, restore visible `.quote-header-metres-wrap` with input + suffix (value from hidden input or stepper), remove hidden class.
- **54.93.8.3** CSS: Add `body[data-viewport-mode="mobile"] #quoteModal .quote-header-metres-input--hidden-mobile { display: none !important; }` (styles.css, near ~5825).
- **54.93.8.4** Verify: Desktop section headers unchanged (input only); mobile section headers show stepper; rebuild and override flows still work; E2E/manual; Railway-safe.

---

## 5. Summary

- **Where:** `frontend/app.js` `syncMobileQuoteLineSummaries` (1366+): new block for section header rows when mobile; extend desktop cleanup for section headers. `frontend/styles.css`: one new rule for hidden header input.
- **What:** Section header metres (Gutter Length, Downpipe Length) use the same stepper UI as labour/line-item on mobile; input stays in DOM (hidden) so all existing reads of `.quote-header-metres-input` still work.
- **No change:** Rebuild innerHTML (3728, 3786), getElementsFromQuoteTable (3002–3022), profileLengthOverride/downpipeLengthOverride (3654–3670). Desktop and Railway unchanged.

## 6. Plan verification (2026-02-21)

- Line references in §2 were checked against the codebase: desktop cleanup is **1376–1411** (not 1377–1352); new mobile block goes **after 1411, before 1412**. Rebuild at 3719–3735 (gutter header) and 3776–3792 (downpipe header) creates `.quote-header-metres-wrap` > `.quote-header-metres-input` + suffix; profileLengthOverride (3654–3670) and getElementsFromQuoteTable (3002–3022) read that input — keeping it in DOM (hidden) preserves behaviour. Table body click (2257) already excludes `.quote-mobile-qty-stepper`, so section-header stepper taps do not open the editor. Section header rows are not in `isEditableQuoteLineRow`, so no extra guard needed. CSS `.quote-labour-hours-input--hidden-mobile` is at 5824–5826; new rule for `.quote-header-metres-input--hidden-mobile` goes after ~5825.
