# Mobile Quote: Stepper for Metres Rows and Labour Rows (54.93.6, 54.93.7)

**Date:** 2026-02-21  
**Scope:** Mobile-only Quote modal (`#quoteModal` when `body[data-viewport-mode="mobile"]`). Desktop quote modal and all calculation/API unchanged. Railway-safe (no new env or build).

**Context:** 54.93.3 added a qty stepper for **material** rows (integer qty, step 1). This plan adds: (54.93.6) a stepper for **measurable products** (metres rows: gutter/downpipe length in metres, decimal step); (54.93.7) a stepper for **labour** rows (hours, step 0.5). Both must be wired to existing quote logic and preserved across sync/rebuild where applicable.

---

## 1. Code references (verified)

| Area | Location | Purpose |
|------|----------|---------|
| **app.js** | `syncMobileQuoteLineSummaries` ~1296 | Builds mobile summary, remove/plus, and stepper; runs after calc and on viewport change. |
| **app.js** | `useQtyStepper` condition ~1368 | Currently: `isMobile && !labour && !row.querySelector('.quote-qty-metres-input')` → material only. |
| **app.js** | `getQuoteLineQuantityMeta` 1242–1260 | Returns `{ value, step }`: labour → hours + 0.5; else qty input or stored/cell. No metres branch yet. |
| **app.js** | `commitMetresInput` 2358 | Commits metres input: sets `lengthMm`, `manualLength`, removes incomplete state, recalc. |
| **app.js** | manualOverrides loop 3529–3541 | Preserves qty per `row.dataset.assetId`; for rows without `.quote-line-qty-input` uses `getQuoteRowStoredQty(row)`. |
| **app.js** | `getElementsFromQuoteTable` 2939, 3061, 3159 | Reads `.quote-qty-metres-input` and `row.dataset.lengthMm` for metres; sends `length_mm` in elements. |
| **app.js** | `createLabourRow` 1803–1895 | Labour row has `.quote-labour-hours-input` in qty cell (step 0.5). |
| **styles.css** | `.quote-mobile-qty-stepper*` ~5749–5784 | Existing stepper styles; 44px buttons, value span. Reuse for metres and labour. |
| **styles.css** | 5823–5829 | Mobile: hide labour hours input, metres input, qty input in editable lines (show summary/stepper). |

---

## 2. 54.93.6 – Stepper for measurable products (metres rows)

### 2.1 Definition of “metres rows”

- Rows that represent length in metres: gutter or downpipe with manual length.
- **Incomplete:** row has `.quote-qty-metres-input` (placeholder “Metres?”); value not yet committed.
- **Complete:** row has `dataset.lengthMm`, `dataset.manualLength === 'true'`, and qty cell shows e.g. “2.5 m” (no input).

### 2.2 getQuoteLineQuantityMeta – metres branch

- **Add** before the existing labour/qty-input branches:
  - If row has `.quote-qty-metres-input`: `value = parseFloat(input.value) || 0`, `step = 0.1` (or 0.01 if product requires finer step).
  - Else if row has `dataset.lengthMm` (and optionally `dataset.manualLength === 'true'`): `value = mmToM(parseFloat(row.dataset.lengthMm))`, `step = 0.1`.
- Use existing `mmToM` (app.js ~246). Ensure step is a number; document choice of 0.1 vs 0.01 (0.1 is sufficient unless product spec requires 0.01).

### 2.3 useQtyStepper → include metres

- **Current:** `useQtyStepper = isMobile && row.dataset.labourRow !== 'true' && !row.querySelector('.quote-qty-metres-input')` → excludes labour and metres.
- **Change:** Introduce a single “use stepper on mobile” condition that includes:
  - Material (current): no labour, no metres input → keep step 1 from existing logic.
  - Metres: row has `.quote-qty-metres-input` **or** (`dataset.manualLength === 'true'` and `dataset.lengthMm`). Use `getQuoteLineQuantityMeta` for value/step (step 0.1).
  - Labour: handled in 54.93.7 (separate condition or same block with branch inside).
- So either:
  - **Option A:** One `useStepper = isMobile && (material || metres || labour)` and inside the stepper block branch on row type for step and apply logic; or
  - **Option B:** `useQtyStepper` (material), `useMetresStepper` (metres), `useLabourStepper` (labour) and three code paths that all render the same `.quote-mobile-qty-stepper` DOM but with different `step` and apply behaviour.
- Recommendation: Option A with a single stepper block; derive `step` and “apply” behaviour from row type (material vs metres vs labour) to avoid duplicating stepper DOM creation.

### 2.4 Stepper apply logic for metres

- **On minus/plus:** `applyStep(delta)` where delta is ±step (0.1 for metres).
- Current metres value: from `getQuoteLineQuantityMeta(row).value` (already in metres).
- Next value: `nextMetres = Math.max(0, currentMetres + delta)` (or enforce a small min if needed).
- Then:
  - `tr.dataset.lengthMm = String(mToMm(nextMetres))`.
  - `tr.dataset.manualLength = 'true'`.
  - Remove incomplete state: `tr.removeAttribute('data-incomplete-measurement')`, `tr.classList.remove('quote-row-incomplete-measurement')`.
  - If `.quote-qty-metres-input` exists in qty cell, remove it (user has “committed” via stepper).
  - Call `calculateAndDisplayQuote()`, then `syncMobileQuoteLineSummaries()` so display and any backend sync update.
- Display in stepper value span: show metres (e.g. “2.5 m” or “2.5”) using a small formatter; can reuse `formatQuoteQtyDisplay` for number only or add “ m” for metres.

### 2.5 manualOverrides / rebuild

- Rebuild (e.g. table rebuild around 3542–3547) removes material rows and recreates from backend; labour and empty row are preserved.
- Gutter/downpipe **length** is preserved via **section headers**: `profileLengthOverride`, `downpipeLengthOverride` (from `.quote-header-metres-input`), not per-row `manualOverrides`. So for **header-based** metres, no change needed.
- For **per-row** metres (single manual-length row): `getElementsFromQuoteTable()` already sends `length_mm` from `row.dataset.lengthMm`; rebuild uses that in the payload. Ensure after stepper update we set `dataset.lengthMm` and `dataset.manualLength` so the next `getElementsFromQuoteTable()` and any rebuild preserve length. No new override structure required if the existing flow already sends and re-applies length; if rebuild does not re-apply per-row length, add a note in TROUBLESHOOTING and/or extend rebuild to re-apply length from a preserved map keyed by row/asset.
- **Task wording:** “preserve in manualOverrides on rebuild” — interpret as: ensure the value set by the stepper is not lost on recalc/rebuild. Primary mechanism: `dataset.lengthMm` + existing `getElementsFromQuoteTable` and section-header overrides; confirm rebuild path preserves length and only add manualOverrides-style preservation if the codebase stores per-asset length elsewhere.

### 2.6 Desktop cleanup (viewport switch to desktop)

- In `syncMobileQuoteLineSummaries`, when `!isMobile` and we remove the stepper from a row, we currently restore a **generic** `quote-line-qty-input` (lines 1314–1327). That is wrong for metres and labour.
- **Metres rows:** When removing the mobile stepper from a metres row, restore the correct desktop UI:
  - If row is “incomplete” (should not normally happen after stepper use), restore `.quote-qty-metres-input` in qty cell.
  - Else restore “X m” text in qty cell and ensure `dataset.lengthMm` and `dataset.manualLength` remain set so `getElementsFromQuoteTable` still sends `length_mm`.
- So: in the desktop cleanup loop, detect “metres row” (e.g. `row.querySelector('.quote-qty-metres-input')` previously existed or `row.dataset.manualLength === 'true'` and row has lengthMm). Then set qty cell content to the metres value + “ m” (no input), or restore metres input only if we explicitly support “incomplete” state on desktop after switch.

---

## 3. 54.93.7 – Stepper for labour rows (hours)

### 3.1 Labour row model

- Labour rows: `dataset.labourRow === 'true'`, qty cell contains `.quote-labour-hours-input` (step 0.5). `getQuoteLineQuantityMeta` already returns `{ value: hours, step: 0.5 }`. Totals use `updateLabourRowTotal(tr)` and `calculateAndDisplayQuote()`.

### 3.2 Include labour in “use stepper” on mobile

- Extend the condition so that on mobile, **labour** rows also get a stepper (same `.quote-mobile-qty-stepper` UI, step 0.5).
- Value/step: use `getQuoteLineQuantityMeta(row)` (already correct for labour).
- Display: use `formatLabourHoursDisplay(qtyMeta.value)` for the stepper value span.

### 3.3 Stepper apply logic for labour

- **On minus/plus:** get current hours from `.quote-labour-hours-input` (or from getQuoteLineQuantityMeta); apply delta (step 0.5); clamp min 0.
- Set `hoursInput.value = String(nextHours)`.
- Call `updateLabourRowTotal(row)` then `calculateAndDisplayQuote()` then `syncMobileQuoteLineSummaries()`.
- Do **not** use `setQuoteRowStoredQty` for labour; source of truth is the input.

### 3.4 Keep hours input in DOM on mobile

- On mobile we hide `.quote-labour-hours-input` via CSS (5823–5829). If we replace qty cell content with only the stepper, we would remove the input and lose the canonical value.
- **Approach:** When building the labour stepper, do **not** do `qtyCell.innerHTML = ''`. Instead: remove only the summary and any existing stepper; append the stepper wrapper; **keep** the existing `.quote-labour-hours-input` in the cell and add a class (e.g. `quote-labour-hours-input--hidden-mobile`) so it stays in DOM but hidden. Stepper +/- update `hoursInput.value`. On desktop cleanup, remove the stepper and the hidden class so the input is visible again.

### 3.5 manualOverrides

- Labour rows are not removed on rebuild (`rowsToRemove` excludes `dataset.labourRow`); the DOM and `.quote-labour-hours-input` values persist. No change to manualOverrides for labour. Task: “preserve in manualOverrides if labour qty is stored per row” — labour is stored in the input, not in manualOverrides; no extra preservation needed.

---

## 4. Desktop cleanup (unified)

- In the existing block that runs when `!isMobile` and finds `.quote-mobile-qty-stepper` in qty cell (lines 1314–1327), **branch by row type** instead of always restoring `quote-line-qty-input`:
  - **Labour:** Remove stepper; ensure `.quote-labour-hours-input` is present and visible (remove `quote-labour-hours-input--hidden-mobile` if used). Do not overwrite with a number input.
  - **Metres:** Remove stepper; set qty cell to the metres value (from `dataset.lengthMm` → `mmToM`) plus “ m”, or restore `.quote-qty-metres-input` if row is incomplete.
  - **Material:** Keep current behaviour: restore `quote-line-qty-input` with value from `getQuoteRowStoredQty(row)`.

---

## 5. Edge cases and accessibility

- **Metres step:** Use 0.1 unless product/backend requires 0.01; document in code comment.
- **Min value:** Metres and labour: clamp to ≥ 0; material already clamps to ≥ 0.
- **ARIA:** Reuse existing stepper labels: “Decrease quantity” / “Increase quantity”; for labour consider “Decrease hours” / “Increase hours” (optional).
- **Viewport switch:** Ensure desktop cleanup runs for all three row types so no mobile-only stepper or hidden input is left on desktop.
- **E2E:** Add or extend mobile quote tests to cover: metres row stepper updates length and recalc; labour stepper updates hours and total; viewport switch restores correct controls.

---

## 6. Files to touch

| File | Changes |
|------|---------|
| **frontend/app.js** | `getQuoteLineQuantityMeta`: add metres branch (value in metres, step 0.1). `syncMobileQuoteLineSummaries`: extend `useQtyStepper` (or add metres/labour conditions) to include metres and labour; single stepper block with step/apply branched by row type (material vs metres vs labour). Metres apply: set lengthMm, manualLength, remove incomplete state, remove metres input if present, recalc, sync. Labour apply: update .quote-labour-hours-input, updateLabourRowTotal, recalc, sync; keep hours input in qty cell with hidden class when stepper shown. Desktop cleanup: branch by labour / metres / material and restore correct control (hours input, metres text/input, qty input). |
| **frontend/styles.css** | Optional: class to hide labour hours input when labour stepper is shown (e.g. `.quote-labour-hours-input--hidden-mobile`) under `body[data-viewport-mode="mobile"]` so the input stays in DOM but invisible. Existing `.quote-mobile-qty-stepper*` styles reused. |

---

## 7. Task list (no change to section file content)

- **54.93.6** Mobile quote: stepper for measurable products (metres rows) — decimal step 0.1 (or 0.01), wired to lengthMm, setQuoteRowStoredQty not used for metres; use dataset.lengthMm and calculateAndDisplayQuote; preserve length on rebuild via existing section-header overrides and getElementsFromQuoteTable.
- **54.93.7** Mobile quote: stepper for labour rows — step 0.5, wired to .quote-labour-hours-input and calculateAndDisplayQuote; keep input in DOM (hidden) when stepper shown; no manualOverrides change.

---

## 8. Summary

- **54.93.6:** Add metres branch in `getQuoteLineQuantityMeta`; include metres rows in mobile stepper; apply step by updating `lengthMm`/`manualLength` and recalc; desktop cleanup restores metres display/input.
- **54.93.7:** Include labour rows in mobile stepper; use existing hours input (hidden) as source of truth; apply step by updating input and updateLabourRowTotal; desktop cleanup restores visible hours input.
- **Shared:** One stepper UI for all three (material, metres, labour) with step and apply logic branched by row type; desktop cleanup branches by row type so desktop is unchanged. Railway and desktop behaviour unchanged; mobile-only.
