# Quote modal: total vs line summary mismatch (ATY 13 × 4.5 vs total $600+)

**Date:** 2026-03-02  
**Scope:** Quote modal wiring (shared desktop + mobile). Focus: mobile UI/accessibility; ensure desktop production UI unaffected.  
**Status:** Implemented (50.19). Option B applied in `frontend/app.js` renderMaterialRow: for inferred lines, override is ignored when it differs from backend qty so displayed qty matches line_total.

---

## 1. Symptom

- User taps **Generate Quote**; quote modal shows a line like **"ATY 13 x price 4.5"** (brackets line: qty 13, unit price 4.5 → expected line total 13 × 4.5 = **$58.50**).
- The **Total** (and/or materials subtotal) is **over $600**, i.e. inconsistent with the visible line summary.

---

## 2. Root cause (investigation)

### 2.1 Data flow (confirmed)

1. **Open modal:** `openQuoteModalForElements(elementsForQuote)` with payload from `getElementsForQuote()` (canvas elements).
2. **Initial rows:** One row per canvas element (e.g. one row for bracket ATY with qty 13, optionally gutter/downpipe with or without length).
3. **First calculate:** `getElementsFromQuoteTable()` builds `elements` (includes bracket 13; gutter/downpipe from header or row with length_mm/metres).
4. **Backend:** `POST /api/calculate-quote` with `{ elements, labour_elements }`. Backend uses `expand_elements_with_gutter_accessories()` so:
   - Gutter elements get **inferred** brackets/screws (quantity from `1 + total_mm // bracket_spacing_mm`).
   - Standalone bracket on canvas (e.g. 13) is **merged** with gutter-inferred brackets in `by_id[assetId]` (same product ID).
5. **Response:** One materials line for brackets with **merged qty** (e.g. 13 + 9 = 22, or 13 + 101 = 114 if gutter length/default is large and spacing small) and `line_total = merged_qty × unit_price`.
6. **Frontend rebuild:** `calculateAndDisplayQuote()` clears material rows, then re-renders from `quote.materials`. Before clearing, it **preserves `manualOverrides`** from existing rows: for each row with `dataset.assetId`, it stores `manualOverrides[assetId] = qty` (from qty input or stored qty).
7. **Render:** For the bracket line, `renderMaterialRow(line, …)` uses `overrideQty = manualOverrides[line.id]`. So if the previous table had bracket qty **13** (from canvas), we display **qty 13** in the input/stepper, but we set **`row.cells[5]`** to **`line.line_total`** from the backend (e.g. 22 × 4.5 = **$99** or 114 × 4.5 = **$513**).
8. **Totals:** `recalcQuoteTotalsFromTableBody()` sums **cell 5** of each row. So the **total is correct** (sum of backend line_totals), but the **line summary** shows "13 x $4.50" while the **line total cell** shows $99 or $513.

### 2.2 Why total can exceed $600

- **Backend merge:** Canvas bracket (13) + gutter-inferred brackets (e.g. 9 or 101) → one line with high qty and high `line_total`.
- **Display:** Preserved **manualOverride** keeps **displayed qty at 13** (from canvas), so mobile summary shows "13 x 4.5".
- **Total:** Sum of all row totals includes this (and possibly gutter, screws, labour), so total can easily be **$600+**.
- **Wiring bug:** The **displayed qty** (13) does **not** match the **qty used for the total** (merged qty). So the line looks wrong and the total looks wrong relative to the visible "13 x 4.5".

### 2.3 Conditional materials (affected)

- **Brackets (BRK-*), screws (SCR-SS), clips (SCL-*, ACL-*):** Inferred from gutter/downpipe in backend; same product ID can come from both canvas (standalone) and expansion. Backend merges by `assetId`; frontend then applies `manualOverrides` from **pre-rebuild** rows, which can be the standalone qty only.
- **Gutter/downpipe:** Section header length overrides and bin-packing are preserved; these are consistent. The inconsistency is specifically when **inferred/conditional** lines are merged with **standalone** same-product rows and we persist a **user-visible qty** that is less than the merged qty used for `line_total`.

---

## 3. Code references (no assumptions)

| Area | File / location | What to check / fix |
|------|------------------|---------------------|
| Preserve overrides | `frontend/app.js` ~4846–4875 | `manualOverrides[r.dataset.assetId]` is taken from **all** material rows before rebuild, including canvas-origin standalone (e.g. bracket 13). When backend returns **merged** qty for same assetId, we must not use that override so that displayed qty = backend qty and qty × unit = line_total. |
| Apply override in render | `frontend/app.js` ~4738–4743, 4747 | `overrideQty = manualOverrides[line.id]`; `qtyDisplay = overrideQty != null ? String(overrideQty) : …`. For lines that are **inferred** and **merged** (same id from expansion + table), either: (a) do not apply override so we show backend qty, or (b) if we keep override, recalc line_total from override qty × unit price so summary and total cell match (then materials subtotal would diverge from backend unless we also recalc all from table). Preferred: (a) for merged inferred lines, do not use preserved override. |
| Identify “merged” inferred | `frontend/app.js` | When rebuilding, we have `materialsToProcess` from backend. A line is “merged” if it is inferred (BRK-*, SCR-SS, SCL-*, ACL-*) and the **request** sent both gutter/downpipe (that expand to that id) and a standalone row with that id. We don’t have request in rebuild; we can treat **inferred** rows as “use backend qty when we would have applied an override” so displayed qty always matches line_total. |
| getElementsFromQuoteTable | `frontend/app.js` ~4181–4298 | Confirmed: skips `row.dataset.inferred === 'true'` so we don’t double-send inferred items. Sends gutter from header length, bracket from canvas. No change needed for payload; fix is display/override logic. |
| recalcQuoteTotalsFromTableBody | `frontend/app.js` ~1629–1656 | Sums `row.cells[5]` (`.quote-cell-total-value` or text). Correct; no change. |
| syncMobileQuoteLineSummaries | `frontend/app.js` ~1940, 2117–2130 | Builds "qty x unitPrice" from `getQuoteLineQuantityMeta(row).value` and `getQuoteLineUnitPrice(row)`. So summary reflects **displayed** qty. Fix: make displayed qty = backend qty for merged inferred lines so summary and total cell match. |
| Backend expand | `backend/app/gutter_accessories.py` ~212–312 | Merges by `assetId`; no bug. Quantity is correct for pricing. |

---

## 4. Proposed fix (plan only)

1. **Do not apply manualOverrides to inferred lines when backend returned a different qty**  
   - In `calculateAndDisplayQuote()`, when building `manualOverrides`, either:
     - **Option A:** Do not store override for rows that have `dataset.inferred === 'true'` (so after rebuild, inferred lines always use backend qty), or  
     - **Option B:** When rendering an inferred line (`isInferredItem`), if `manualOverrides[line.id]` is present but not equal to `line.qty`, **ignore the override** and use `line.qty` so displayed qty matches `line_total` (avoids “13 x 4.5” with $99 total).
2. **Prefer Option B** so that user-edited inferred qty (after first load) is still preserved when it matches backend (e.g. user changed 22 → 20); only when backend merged and we had a stale override (13) do we show backend qty (22).
3. **Edge cases:**  
   - **Labour:** Unchanged; labour rows are separate, default 0 hours; no override issue.  
   - **Desktop:** Same DOM and recalc logic; fix applies to both; desktop behaviour unchanged except that displayed qty for merged inferred lines will now match total.  
   - **Mobile:** Line summary ("13 x 4.5") will show the correct (backend) qty after fix, so total and line will match.

---

## 5. Verification (after implementation)

- Open quote from canvas with **only** brackets (e.g. ATY 13): line shows 13 × unit, total = 13 × unit (e.g. $58.50).
- Open quote with **gutter (with length) + same-profile brackets on canvas**: bracket line shows **merged** qty and total = merged qty × unit; no “13 x 4.5” with $600+ total.
- Edit inferred line qty in modal, recalc: override preserved when backend returns same structure; total stays consistent with displayed qty.
- Smoke-test: materials subtotal, labour subtotal, total; Print/Copy; Add to Job; Railway deploy unchanged.

---

## 6. Task list update

- Add task to **Section 50** (quote modal + REP-LAB): fix quote modal total vs line summary mismatch for conditional/inferred materials (brackets, etc.); ensure displayed qty matches line total when backend merges canvas + inferred quantities.
- Reference this plan in the section file and in `TASK_LIST.md` uncompleted table.
