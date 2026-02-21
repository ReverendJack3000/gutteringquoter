# QA Audit Report: 54.93.6 & 54.93.7 (Mobile Quote Stepper – Metres & Labour)

**Date:** 2026-02-21  
**Auditor role:** Strict Senior QA Engineer  
**Scope:** Implementation of mobile quote stepper for measurable products (metres) and labour rows, including `getQuoteLineQuantityMeta` changes, `syncMobileQuoteLineSummaries` stepper/cleanup logic, and CSS.  
**Constraints checked:** Desktop vs mobile isolation, Railway deployment safety, UI/UX best practices.

---

## 1. Regression & conflict check

### 1.1 Mobile layout / CSS bleeding into desktop

| Check | Result | Notes |
|-------|--------|--------|
| New or modified CSS is scoped under `body[data-viewport-mode="mobile"]` | **Pass** | All stepper and labour-hidden rules use `body[data-viewport-mode="mobile"] #quoteModal` (e.g. `.quote-mobile-qty-stepper*`, `.quote-labour-hours-input--hidden-mobile`, `.quote-mobile-editable-line`). |
| Global quote-mobile-* rules do not expose mobile-only UI on desktop | **Pass** | `.quote-mobile-line-summary`, `.quote-mobile-line-qty-summary`, etc. have a global `display: none` (styles.css ~4206–4212). Mobile then overrides with `display: block` under the mobile selector. Desktop never sees these elements. |
| No desktop-only quote table rules removed or overridden by new code | **Pass** | No changes to base `.quote-parts-table` or desktop-editing rules. New rules are additive and mobile-scoped. |

**Category result: Pass** (no mobile CSS bleeding into desktop).

---

### 1.2 JavaScript behaviour: desktop vs mobile

| Check | Result | Notes |
|-------|--------|--------|
| Stepper creation is gated by `isMobile` | **Pass** | `useStepper = isMobile && (isLabourRow \|\| isMetresRow \|\| !isLabourRow)`; when `!isMobile`, no stepper DOM is created. |
| Desktop cleanup runs when `!isMobile` and restores correct control per row type | **Partial** | Labour: stepper removed, hours input shown (class removed). Metres (complete): qty cell set to "X m". Material: `quote-line-qty-input` restored. **Fail:** Incomplete metres rows (see §2). |
| `getQuoteLineQuantityMeta` changes affect only semantics, not desktop layout | **Pass** | Additive metres/labour branches; used by both viewports for calculations. Desktop does not render stepper; same data used for totals/API. |
| Mobile-only event handlers remain gated | **Pass** | Table body click/keydown that open labour editor still use `isMobileQuoteViewport()` and skip when target is `.quote-mobile-qty-stepper`. |

**Category result: Fail** (one logic gap in desktop cleanup – see §2).

---

### 1.3 Desktop cleanup logic – row-type branching

| Check | Result | Notes |
|-------|--------|--------|
| Labour row: stepper removed, hours input visible | **Pass** | Stepper removed; `quote-labour-hours-input--hidden-mobile` removed; input remains in cell. |
| Metres row (complete: `manualLength` + `lengthMm`): restore "X m" text | **Pass** | `qtyCell.textContent = m + ' m'` with `mmToM` and numeric guard. |
| Metres row (incomplete: has `.quote-qty-metres-input`, no committed length): restore metres input | **Fail** | Not implemented. Incomplete metres rows are detected on mobile as `isMetresRow` (via `.quote-qty-metres-input`) and get a stepper. On switch to desktop, cleanup only treats as “metres” when `row.dataset.manualLength === 'true' && row.dataset.lengthMm`. Incomplete rows do not have those set, so they fall into the **material** branch and get a `quote-line-qty-input` (integer qty) instead of a `.quote-qty-metres-input` (Metres?). |
| Material row: restore `quote-line-qty-input` | **Pass** | Uses `getQuoteRowStoredQty(row)` and restores number input. |
| Section header / empty row never given stepper, so cleanup never mis-applies | **Pass** | Stepper only added in `rows.forEach` where `rows = filter(isEditableQuoteLineRow)`; section headers and empty row are excluded. |

**Category result: Fail** (incomplete metres row restoration missing).

---

## 2. Bugs / logic gaps / missing cleanup (no fixes applied)

### 2.1 **Logic gap: Incomplete metres row on viewport switch to desktop**

- **Location:** `syncMobileQuoteLineSummaries`, desktop cleanup block (~1325–1349).
- **Current behaviour:** Metres restoration only runs when `row.dataset.manualLength === 'true' && row.dataset.lengthMm != null && row.dataset.lengthMm !== ''`. Rows that are still “incomplete” (have `.quote-qty-metres-input` with “Metres?” placeholder, no committed length) do not satisfy this, so they are restored as **material** (integer qty input).
- **Expected behaviour:** Rows that have (or had) `.quote-qty-metres-input` and no committed length should be restored as metres input (placeholder “Metres?”), not as a quantity input.
- **Suggested fix (for approval):** In desktop cleanup, treat as metres either when (a) `manualLength === 'true'` and `lengthMm` is set, or (b) the row has or had a metres role (e.g. row originally had `.quote-qty-metres-input` before we cleared the cell). For (b), either restore a `.quote-qty-metres-input` with placeholder and wire `commitMetresInput`, or detect “incomplete metres” by another stable flag (e.g. `data-incomplete-measurement` or asset type) and restore the metres input accordingly.

---

### 2.2 **Edge case: Labour row without `.quote-labour-hours-input`**

- **Location:** Labour stepper creation (~1431–1441); `applyStep` for labour (~1455–1463).
- **Current behaviour:** If `row.querySelector('.quote-labour-hours-input')` is null, we still append the stepper and set `applyStep` to update `hoursInput.value`; `hoursInput` is null so clicks do not update any input. `updateLabourRowTotal(row)` still runs but has no effect without an input.
- **Expected behaviour:** Labour rows are always created with an hours input (`createLabourRow`). So this is a defensive edge case only (e.g. DOM corruption).
- **Severity:** Low. No fix required unless product wants a guard (e.g. do not show labour stepper if input is missing).

---

## 3. Railway deployment safety

| Check | Result | Notes |
|-------|--------|--------|
| No new environment variables | **Pass** | None introduced. |
| No new build step or dependency | **Pass** | Vanilla JS/CSS only. |
| No change to Procfile / nixpacks / run command | **Pass** | Not touched. |
| Backend / API unchanged | **Pass** | Only frontend quote modal and sync logic. |

**Category result: Pass.**

---

## 4. UI/UX best practices

| Check | Result | Notes |
|-------|--------|--------|
| Touch targets (Apple HIG 44pt) | **Pass** | Stepper buttons use existing `.quote-mobile-qty-stepper-btn` with min-width/height 44px. |
| ARIA: stepper buttons | **Pass** | Labour: “Decrease hours” / “Increase hours”. Material/metres: “Decrease quantity” / “Increase quantity”. |
| ARIA: live region for value changes | **Pass** | `.quote-mobile-qty-stepper-value` has `aria-live="polite"`. |
| Labour value display | **Pass** | Uses existing `formatLabourHoursDisplay(qtyMeta.value)`. |
| Metres value display | **Pass** | Value + " m" (e.g. "2.5 m"); step 0.1. |
| No duplicate or conflicting labels | **Pass** | Row-level aria-label and stepper button labels are consistent. |

**Category result: Pass.**

---

## 5. Summary: strict Pass/Fail by category

| Category | Result |
|----------|--------|
| 1. Regression & conflict (mobile CSS → desktop) | **Pass** |
| 2. JavaScript desktop vs mobile / cleanup correctness | **Fail** (incomplete metres row) |
| 3. Desktop cleanup row-type branching | **Fail** (same gap) |
| 4. Railway deployment safety | **Pass** |
| 5. UI/UX (touch, ARIA, display) | **Pass** |

**Overall:** **Fail** until desktop cleanup correctly restores **incomplete** metres rows (e.g. with `.quote-qty-metres-input` / “Metres?”) instead of a material qty input.

---

## 6. Recommended next step

- Implement the incomplete-metres restoration path in the desktop cleanup block (see §2.1) and re-run this audit (and any quote E2E) after your approval of this report.
