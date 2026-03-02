# Quote modal: 50.19 + stepper follow-up – continuation debugging plan

**Date:** 2026-03-02  
**Scope:** Quote modal (shared desktop + mobile). Fix remaining total/line misbehaviour after 50.19 and stepper follow-up.  
**Status:** Implemented (50.20). In `renderMaterialRow()` after the 50.19 block: when `isInferredItem && manualOverrides[line.id] != null && overrideQty === null`, set `row.dataset.inferred = 'true'`.

---

## 1. What’s already in place

- **50.19:** In `renderMaterialRow()` we ignore a preserved `manualOverride` for inferred lines (BRK-, SCR-SS, SCL-, ACL-) when it differs from `line.qty`, so first paint shows backend qty and the total matches the line.
- **Stepper/input follow-up:** For inferred-product rows we avoid calling the API on qty change: we update line total locally (`qty × getQuoteLineUnitPrice(row)`), then `recalcQuoteTotalsFromTableBody()` and `syncMobileQuoteLineSummaries()`, and do **not** call `calculateAndDisplayQuote()`.
- **Payload:** `getElementsFromQuoteTable()` skips rows with `row.dataset.inferred === 'true'` (~4254), so inferred rows are not re-sent when present.
- **Override preservation:** Before table rebuild, `manualOverrides` is built from existing rows (~4846–4875); inferred rows can contribute an override (e.g. from canvas or stepper).

---

## 2. Root cause of remaining bug (traced in code)

**Observed:** After first paint or after a recalc, the total or line can still be wrong, or incrementing bracket qty with the stepper can still cause the total to jump/double on a **subsequent** recalc.

**Cause:** When we **ignore** the override for an inferred line (50.19 block sets `overrideQty = null` because `overrideNum !== backendQty`), we correctly display backend qty and set the total cell from `line.line_total`. But we **do not** set `row.dataset.inferred = 'true'` in that case.

- `data-inferred` is only set at line 4758: `if (!isGutterOrDownpipe && !hasManualOverride) row.dataset.inferred = 'true'`.
- When we had a preserved override (e.g. 13 or 14 from canvas/stepper), `hasManualOverride` is true, so we **do not** set `data-inferred`.
- So the rebuilt row has **no** `data-inferred` even though we are showing merged backend qty.
- On the **next** recalc, `getElementsFromQuoteTable()` does **not** skip this row, so we send bracket (e.g. 22) **and** gutter. Backend merges again (e.g. 22 + 9 = 31) and the total jumps/doubles.

**Flow summary:**

1. Open modal: canvas bracket 13 + gutter with length → first payload: bracket 13 + gutter → backend returns merged bracket 22.
2. Rebuild: `manualOverrides['BRK-ATY'] = 13` (from initial rows). We ignore override (13 ≠ 22), show 22, but **don’t** set `data-inferred`.
3. User triggers recalc (e.g. gutter length change). Payload: bracket **22** (from table) + gutter → backend merges 22 + 9 = 31 → total doubles.
4. Alternatively: user uses stepper 13→14. We do local update only (correct). Later recalc: we preserve 14 in `manualOverrides`, rebuild shows backend 23, we ignore override, show 23, but again **don’t** set `data-inferred`. Next recalc sends 23 + gutter → 32.

---

## 3. Correct fix (no assumptions)

**Single code change:** In `frontend/app.js`, inside `renderMaterialRow()`, **after** the 50.19 block (after we may have set `overrideQty = null`), set `data-inferred` when we **ignored** a preserved override for an inferred line so that the row is skipped on future payloads:

- **Condition:** `isInferredItem && manualOverrides[line.id] != null && overrideQty === null`
- **Action:** `row.dataset.inferred = 'true'`

**Why this is safe:**

- **Standalone bracket (canvas only, no gutter):** No “previous” override from a merged response. First paint: we have override 13, backend 13, we do **not** clear override (`overrideQty` stays 13). So the condition is false; we do **not** set `data-inferred`. Row is sent on next recalc; backend returns 13. Correct.
- **Merged case (gutter + bracket):** We had override 13 (or 14), backend 22 (or 23), we set `overrideQty = null`. Condition true → set `data-inferred`. Next recalc we skip this row; only gutter is sent; backend returns merged line once. Correct.
- **Desktop vs mobile:** Same DOM and logic; no viewport-specific branching.

**Location:** In `renderMaterialRow()`, immediately after the 50.19 block (after line 4768), before `qtyDisplay = …`:

```js
// 50.19 follow-up: when we ignored override for merged inferred line, mark row so we don't re-send it (avoid double merge on next recalc)
if (isInferredItem && manualOverrides[line.id] != null && overrideQty === null) row.dataset.inferred = 'true';
```

---

## 4. Material Rules (Section 63) – no impact

- **Admin Material Rules UI** (`view-material-rules`, measured-length + Quick Quoter): Separate view and module; no reference to quote table, `data-inferred`, or `getElementsFromQuoteTable()`. Unaffected.
- **Measured rules in calculate-quote:** Backend still calls `get_measured_material_rules_for_quote(supabase)` and `expand_elements_with_gutter_accessories(raw_elements, rules_config=measured_rules)`. 50.20 only causes the frontend to omit inferred rows from the payload (so we don’t double-send). The backend still receives gutter/downpipe and applies the same rules; inference (bracket spacing, screw/clip product IDs, etc.) is unchanged.

## 5. Other checks (no changes required)

- **recalcQuoteTotalsFromTableBody** (1629–1656): Already calls `syncMobileQuoteLineSummaries()` at the end. The extra `syncMobileQuoteLineSummaries()` in the stepper/input path is redundant but harmless.
- **getQuoteLineUnitPrice(row):** For material rows uses `row.cells[4]` text; `renderMaterialRow` sets that from `line.sell_price`. Local update path uses correct unit price.
- **Backend** `expand_elements_with_gutter_accessories()`: Merges by `assetId`; no change needed.

---

## 6. Verification (after implementation)

- Open quote with **gutter (with length) + same-profile brackets on canvas**: first paint shows merged qty and matching total; trigger recalc (e.g. change gutter length) → total does **not** jump; bracket row still shows merged qty.
- Open quote with **only** brackets on canvas: line shows 13 × unit, total correct; trigger recalc → bracket row remains, total unchanged.
- Stepper +1 on inferred bracket: total increases by one unit price; trigger recalc later → line shows backend merged qty again (local edit “until next recalc” per TROUBLESHOOTING); total does **not** double.
- Smoke-test: materials subtotal, labour, Print/Copy, Add to Job; Railway deploy unchanged.

---

## 7. Task list update

- Add **50.20** in Section 50: set `data-inferred` when override is ignored for inferred line so next recalc does not re-send bracket and double total.
- Add 50.20 to `TASK_LIST.md` uncompleted table.
- Optionally extend `TROUBLESHOOTING.md` entry “Quote modal: total doubles when incrementing bracket…” to note that 50.20 sets `data-inferred` after ignoring override so recalc does not re-send the row.
