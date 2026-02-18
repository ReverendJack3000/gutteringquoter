# How to implement Section 51: Quote modal measured materials & Confirm Job popup

**Goal:** Fix bugs and improve UX for (1) measured-materials header rows in the quote modal, and (2) the Confirm Job Details popup. All tasks are in **TASK_LIST.md** as **Section 51**, tasks **51.1–51.6**.

**Branch:** `feature/section-51-implementation`  
**Base:** `main`

---

**To pick up in a new chat:** Switch to this branch (`git checkout feature/section-51-implementation`), then ask the agent to implement Section 51 using this doc and **TASK_LIST.md** (Section 51). Example: *"Implement Section 51 using docs/IMPLEMENT_SECTION_51.md and TASK_LIST.md. Work on branch feature/section-51-implementation."*

---

## Task summary (from TASK_LIST.md)

| Task | One-line description |
|------|------------------------|
| **51.1** | Fix/clarify total $ in header rows (currently confusing; excludes screws). |
| **51.2** | Header Qty field: show "m" after the number in the inline editing field (e.g. "3.5 m"). |
| **51.3** | When header Qty is filled: style row so it looks like two cells (product+qty \| merged rest). UI only. |
| **51.4** | Remove "—" placeholders from header measured rows only. |
| **51.5** | Measured materials from canvas: any click outside should commit and exit edit (not only click inside element). |
| **51.6** | Confirm Job popup: show total_invoice_amount and ÷1.15, both with explicit "exc gst" (and inc gst where relevant). |

---

## Exact code and files to change

### 51.1 – Header row total $ (fix or clarify)

- **Where:** Header row total is the sum of **children line totals**; screws are excluded from the group used for the header.
- **Files:** `frontend/app.js`
- **Locations:**
  - **Gutter header total:** ~**line 2514** – `const headerTotal = effectiveGroup.children.reduce((sum, c) => sum + (c.line_total || 0), 0);`  
    Used when building the gutter section header row. `effectiveGroup.children` comes from `gutterGroups[profile]` and may exclude screws (screws can be in `standaloneScrews` for mixed repairs).
  - **Downpipe header total:** ~**line 2571** – same pattern for downpipe size groups.
  - **Header row innerHTML (gutter):** ~**line 2535** – `...${formatCurrency(headerTotal)}</td>` in the template.
  - **Header row innerHTML (downpipe):** ~**line 2590** – same.
- **Intent:** Either (a) make the label/UI clearly indicate “parts total (excl. screws)” or (b) include screws in the header total so the number matches user expectation. Decide with product; then adjust either the copy (e.g. label in the first `<td>`) or the calculation (include screws in the group / add a separate screw total for display).

---

### 51.2 – "m" after header Qty value in inline field

- **Where:** The header row’s Qty cell is an **input** (metres). We need the **display** to show "m" after the value (e.g. "3.5 m"); the actual input can stay numeric.
- **Files:** `frontend/app.js`, optionally `frontend/styles.css`
- **Locations:**
  - **Gutter header row:** ~**line 2535** – `<td>...<input type="number" class="quote-header-metres-input" value="..." ...></td>`. The label already appends `' m'` when not incomplete: `...${isIncomplete ? '' : ' m'})</td><td><input ...`. The **input** itself has no "m". Options: (1) wrap the input in a span that shows "m" after it (e.g. `<span class="quote-header-metres-wrap"><input ...><span class="quote-header-metres-suffix"> m</span></span>`), or (2) use a visible suffix next to the input so the cell reads like "3.5 m".
  - **Downpipe header row:** ~**line 2590** – same structure.
- **Intent:** User sees that the value is in **metres** (e.g. "3.5 m") in the inline editing area. Prefer not changing the `<input>` to text so validation/parsing stays simple.

---

### 51.3 – Header row “two-cell” appearance when Qty filled

- **Where:** When the header row has a filled Qty (metres), it should **look** like two cells: (Product + Qty) | (merged: markup%, Unit Price, Total). No DOM/table structure change.
- **Files:** `frontend/styles.css`, possibly `frontend/app.js` (e.g. class toggling)
- **Locations:**
  - **Header row class:** `frontend/app.js` ~**2530** (gutter) and ~**2585** (downpipe) – `headerRow.className = 'quote-section-header';`. You can add a class when the metres input has a value (e.g. `quote-section-header--has-metres`) and style that.
  - **CSS:** `frontend/styles.css` ~**2438–2467** – `.quote-section-header`, `.quote-section-header td`, `.quote-header-metres-input`. Add rules for the “has-metres” state: e.g. internal vertical borders (or left border on the “merged” block) matching row background so the first two columns read as one block and the rest as another.
- **Intent:** Purely visual: borders/background so the row appears as two logical cells. Do not add/remove `<td>`s.

---

### 51.4 – Remove "—" from header measured rows only

- **Where:** Header rows currently render "—" in the Cost, Markup, Unit Price cells.
- **Files:** `frontend/app.js`
- **Locations:**
  - **Gutter header template:** ~**line 2535** – `...<td>—</td><td>—</td><td>—</td><td>${formatCurrency(headerTotal)}</td>`.
  - **Downpipe header template:** ~**line 2590** – same.
- **Intent:** For **header** rows only, remove or replace the "—" cells. Options: (1) empty cells `<td></td>`, or (2) keep cells but use `&nbsp;` or no text. Do not remove "—" from other row types (e.g. labour or material rows that use "—").

---

### 51.5 – Measured materials: click outside to commit (canvas measurement)

- **Where:** User opens the **badge length** popover from the canvas (double‑click measurable element), types a number, then wants to **click anywhere outside** to commit and close. Currently they may have to click inside the element; blur alone might not fire when clicking the canvas.
- **Files:** `frontend/app.js`
- **Locations:**
  - **Badge length popover open:** ~**5543–5577**. `state.badgeLengthEditElementId = el.id`, `input.focus()`, `closeAndSave()` on blur, `input.addEventListener('blur', onBlur, { once: true })`.
  - **Blur** fires when focus leaves the input; clicking the **canvas** (not focusable) may not move focus, so blur doesn’t run.
- **Intent:** On **mousedown** (or click) **outside** the popover and input, call `closeAndSave()` so the value is committed and the popover closes. Implement by adding a `document` (or canvas container) mousedown listener when the popover is open; if `event.target` is not the popover and not the input, call `closeAndSave()` and remove the listener. Coordinate with existing `blur` and Escape so we don’t double-save. Consider using a single “click-outside” handler that runs once and removes itself after close.

---

### 51.6 – Confirm Job popup: show total_invoice_amount and exc gst

- **Where:** Confirm Job Details overlay shows “Current Job Total”, “+ This Quote”, “= New Total”. We need to show the job’s **total_invoice_amount** (inc GST) and that value **÷ 1.15** with an explicit **"exc gst"** label (and “inc gst” for the original if desired).
- **Files:** `frontend/app.js`, `frontend/index.html` (if new elements), `frontend/styles.css` (if needed)
- **Locations:**
  - **Populate overlay:** `frontend/app.js` ~**1633–1655**. `currentRaw = job.total_invoice_amount`, `currentAmount = parseFloat(...)`, then `currentEl.textContent = formatCurrency(currentAmount)`, etc.
  - **HTML:** `frontend/index.html` ~**500–522** – `jobConfirmOverlay`, `jobConfirmCurrent`, `jobConfirmQuote`, `jobConfirmNew`. You may add a line or a second value for “Current job total (exc gst)” = currentAmount / 1.15, and ensure labels say “inc gst” / “exc gst” as appropriate.
- **Intent:** Display:
  - Current job total (e.g. “$X inc gst” or “$X” with a line below “$Y exc gst” where Y = X/1.15).
  - Same for “New total” if desired: new total inc gst and new total exc gst.
  Ensure both the raw total and the ÷1.15 value are shown with explicit “exc gst” (and “inc gst” where useful).

---

## Reference checklist

- **TASK_LIST.md** – Section 51, tasks 51.1–51.6 (source of truth for done/not done).
- **Quote table header rows:** `frontend/app.js` ~2528–2542 (gutter), ~2582–2596 (downpipe); `frontend/styles.css` ~2438–2467.
- **Badge length popover (canvas measurement):** `frontend/app.js` ~5538–5578; `state.badgeLengthEditElementId`.
- **Confirm Job overlay:** `frontend/app.js` ~1633–1655; `frontend/index.html` ~500–522.

After implementing each task, mark the corresponding checkbox in **TASK_LIST.md** (e.g. `- [x] **51.1** ...`).
