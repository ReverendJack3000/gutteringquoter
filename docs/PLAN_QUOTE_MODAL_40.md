# Plan: Section 40 – Quote modal width, markup column, row remove (X)

**Date:** Feb 2026  
**Purpose:** File and line references so the next session can implement 40.1–40.4 without re-discovering the quote modal structure. **No implementation in this doc.**

---

## 1. Quote modal structure (for 40.1 – width)

| File | Area | Lines (approx) | Notes |
|------|------|----------------|-------|
| `frontend/index.html` | Quote modal container and table | 384–440 | `#quoteModal`, `.quote-modal-content`, `#quotePartsTable`, `#quoteTableBody`. Table headers: Product, Qty, Cost Price, Markup %, Unit Price, Total. |
| `frontend/styles.css` | Quote modal and content width | 1663–1695 | `.quote-modal` (fixed, flex center). `.quote-modal-content`: **min-width: 600px; max-width: 800px** (1687–1688) – change these to ~900px / 1200px for 50% wider. |
| `frontend/styles.css` | Table column widths | 1759–1776 | `.quote-parts-table th:nth-child(1)` … `td:nth-child(6)` set column widths; Cost (3) and Markup (4) are hidden by default (1773–1776). |

**40.1 implementation note:** In `frontend/styles.css` around 1687–1688, set e.g. `min-width: 900px; max-width: 1200px` (or `calc(100% * 1.5)` if you prefer viewport-relative). No HTML change required unless you also want a wider min on the wrapper.

---

## 2. Markup column and in-line editing (40.2)

| File | Area | Lines (approx) | Notes |
|------|------|----------------|-------|
| `frontend/index.html` | Table header Markup % | 399–402 | `<th class="quote-col-markup">Markup %</th>` already exists; column is hidden unless table has `.quote-parts-table--editing`. |
| `frontend/styles.css` | Show/hide cost and markup columns | 1773–1781 | Default: `.quote-col-cost`, `.quote-col-markup` and their `td` siblings are `display: none`. With `.quote-parts-table--editing` they become `display: table-cell`. For 40.2, either show markup column always (new rule) or keep editing class and ensure part rows have markup input. |
| `frontend/app.js` | Build material row (Product, Qty, …, Total) | 1772–1814 | `renderMaterialRow(line, insertBefore, options)` builds a `<tr>` with 6 cells: name, qty input, cost (cells[2]), markup (cells[3]), unit price (cells[4]), total (cells[5]). Row has `dataset.assetId`, `dataset.costPrice`, `dataset.markupPct`. **cells[3]** is markup; currently `row.cells[3].textContent = String(line.markup_percentage)` (1801). To make inline editable: render an `<input>` or contenteditable in cells[3], and on change recalc unit price + line total (and optionally call API or local recalc). |
| `frontend/app.js` | Edit Pricing mode and saving markup | 1049–1052, 1202–1220 | Quote modal, table, edit state. Saving pricing reads inputs from rows (cost, markup), builds `updates` and PATCHes products. Ensure inline markup edits either (a) update the same inputs Edit Pricing uses, or (b) are persisted when “Save to Database” is used. |
| `frontend/app.js` | Format currency / line total | 1798–1803 | After building row, `row.cells[2].textContent = formatCurrency(line.cost_price)`; cells[3] markup; cells[4] unit price; cells[5] `formatCurrency(line.line_total)`. Recalc on markup change: unit = cost × (1 + markup/100), total = unit × qty. |

**40.2 implementation note:** Decide whether Markup column is visible for all part rows (not only in Edit Pricing). If yes, add a CSS rule to show `.quote-col-markup` and the 4th `td` without requiring `--editing`. In `renderMaterialRow`, for part rows (not section headers) put an `<input type="number">` in the markup cell with value `line.markup_percentage`; on `change`, recompute unit price and total and update cells[4] and cells[5], and set `row.dataset.markupPct` so downstream logic (e.g. getElementsFromQuoteTable / recalc) stays consistent.

---

## 3. Light red X on hover in Total cell (40.3)

| File | Area | Lines (approx) | Notes |
|------|------|----------------|-------|
| `frontend/app.js` | Where Total cell is set | 1798–1805, 1920, 1961 | Material rows: `row.cells[5].textContent = formatCurrency(line.line_total)`. Section header rows: `headerRow.innerHTML = …<td>…${formatCurrency(headerTotal)}</td>`. Only part rows (rows with `dataset.assetId` and not section headers) should get the X. |
| `frontend/app.js` | Section header vs data row | 1914–1930 (gutter), 1945–1978 (downpipe) | Header rows have `dataset.sectionHeader` (e.g. `SC`, `CL`, `downpipe-65`). Data rows have `dataset.assetId`. Empty row has `data-empty-row="true"`. So “Total cell” for 40.3 = last cell of rows that have `dataset.assetId` and no `dataset.sectionHeader`. |
| `frontend/app.js` | `renderMaterialRow` – row structure | 1772–1814 | Creates `<tr>` with 6 `<td>`s. Last cell is index 5 (Total). To add X: wrap total value in a container (e.g. `<span>`) and add a second element (e.g. `<button type="button" class="quote-row-remove-x" aria-label="Remove line">×</button>`) that is visible only when the row is hovered (CSS). |

**40.3 implementation note:** In `renderMaterialRow`, for the 6th cell (Total) use something like:  
`<td class="quote-cell-total">${formatCurrency(...)}<button type="button" class="quote-row-remove-x" aria-label="Remove line">×</button></td>`  
Then in CSS: `.quote-row-remove-x { color: ...; visibility: hidden; }` (or opacity 0), and `.quote-parts-table tbody tr:hover .quote-row-remove-x { visibility: visible; }`. Use a light red color. Do **not** add the X in header row innerHTML (Gutter Length, Downpipe 65mm Length, etc.) or to the empty “Add item” row.

---

## 4. Wire red X to remove row (40.4)

| File | Area | Lines (approx) | Notes |
|------|------|----------------|-------|
| `frontend/app.js` | Table body and row removal | 711, 768, 1049, 1279, 1599 | `quoteTableBody = document.getElementById('quoteTableBody')`. Rows are appended/inserted there. To remove: `row.remove()`. |
| `frontend/app.js` | Recalc after table change | 1599–1600, 1612–1617 | `calculateAndDisplayQuote()` is called after fetch; it reads `quote.materials` and rebuilds the table. If we remove a row without calling the API again, we need to either (a) recalc totals from remaining rows only (client-side sum over visible part rows), or (b) call `calculateAndDisplayQuote()` again with a modified payload. Option (a): after remove, iterate `tableBody.rows`, sum `line_total` from each data row (or from cells[5] parsed), set `materialsTotalDisplay`, and update quote total. Option (b): build elements from table (e.g. getElementsFromQuoteTable), omit the removed assetId, call API, then re-render – but that would rebuild the whole table. Simpler: remove the row from DOM and recompute materials subtotal + total from remaining rows (and labour) without re-fetching. |
| `frontend/app.js` | Totals and display elements | 2021–2024 | `materialsTotalDisplay`, `quoteTotalDisplay` are updated after render in `calculateAndDisplayQuote()`: `materialsTotalDisplay.textContent = formatCurrency(quote.materials_subtotal)` etc. The remove handler (40.4) should set a client-side subtotal from remaining rows and update these same elements. |
| `frontend/app.js` | Copy / Print / getElementsFromQuoteTable | 1353–1487, 1535 | Removing a row means that row no longer appears in the table, so `getElementsFromQuoteTable()` will not include it on next Calculate. So “remove from quote” = remove from DOM + update displayed totals. Canvas is unchanged; no change to `state.elements`. |

**40.4 implementation note:** On X click: (1) prevent default; (2) get the row (`tr`), ensure it is not a section header (`!row.dataset.sectionHeader`) and not the empty row; (3) `row.remove()`; (4) recompute materials subtotal by summing the 6th cell (Total) of each remaining data row (parse currency string or use `dataset` if you store numeric value), then set `materialsTotalDisplay` and the final Total (materials + labour). Optionally persist “removed” asset IDs so that on next “Calculate” they are excluded from the request – that would require getElementsFromQuoteTable (or equivalent) to skip removed IDs; otherwise the next Calculate will re-add the line from the API. So either: (A) “Remove” only affects current view and next Calculate repopulates from API, or (B) track removed IDs and exclude them when building the request. Plan recommends (A) unless product wants (B).

---

## 5. Summary table

| Task | Primary file(s) | Key lines / selectors |
|------|-----------------|------------------------|
| 40.1 Modal 50% wider | `frontend/styles.css` | `.quote-modal-content` min-width/max-width ~1687–1688 |
| 40.2 Markup column inline edit | `frontend/app.js`, `frontend/styles.css` | `renderMaterialRow` 1772–1814; cells[3]; styles 1772–1781 |
| 40.3 Red X on hover (Total cell) | `frontend/app.js`, `frontend/styles.css` | Last cell in `renderMaterialRow`; new class `.quote-row-remove-x`; :hover |
| 40.4 X removes row | `frontend/app.js` | Click on `.quote-row-remove-x`; `row.remove()`; recompute totals from remaining rows |

---

## 6. Edge cases

- **Section header rows:** Must not show the X or be removable (they have no `dataset.assetId` or have `dataset.sectionHeader`).
- **Empty row:** The “Add item” row (`data-empty-row="true"`) must not get an X.
- **Edit Pricing:** If markup is edited inline (40.2), ensure it doesn’t conflict with Edit Pricing inputs if both are visible, or that only one mode is active at a time.
- **Recalc after remove:** If the user removes a row and then clicks Calculate again, the backend will return materials from the current canvas/table; if you don’t send the removed line, it won’t be in the response, so the table will stay without that line until the next full recalc from canvas.

No implementation was done; this is a plan and reference only.

**Line numbers verified:** Feb 2026 (styles.css 1687–1688, 1772–1781; index.html 384–406, 401; app.js 1599–1604, 1772–1814, 1920, 1975, 2021–2024, getElementsFromQuoteTable 1363+).
