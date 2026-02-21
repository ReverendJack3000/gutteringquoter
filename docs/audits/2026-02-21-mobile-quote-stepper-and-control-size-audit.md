# Audit Report: Mobile Quote Stepper + Remove/Add Control Size (54.93.5 & stepper fix)

**Role:** Strict Senior QA Engineer  
**Date:** 2026-02-21  
**Scope:** Implementation and tasks completed for (1) reducing mobile quote first-cell remove/add control size to 33%, and (2) preserving stepper qty across `calculateAndDisplayQuote()` rebuild so the value does not snap back.  
**Constraints:** Desktop vs mobile production, Railway deployment safety, UI/UX best practices.

---

## 1. Regression & Conflict Check

### 1.1 Desktop viewport: no mobile-only CSS applied

**Result: PASS**

- All mobile quote table rules are scoped under `body[data-viewport-mode="mobile"]`:
  - First-cell `.quote-row-remove-x` and `.quote-row-add-plus` (15px, 7px font): lines 5704–5721, 5728–5745.
  - `.quote-mobile-qty-stepper*`: lines 5749–5784.
  - Broader `#quoteModal .quote-row-remove-x`: 5869–5882.
- Base `.quote-row-remove-x` (lines 4124–4146) has no width/height; it only controls opacity/hover for desktop (cell 5). Desktop does not use first-cell remove/plus or stepper.
- **Conclusion:** No mobile layout or 33% sizing bleeds into desktop.

### 1.2 Desktop viewport: no mobile-only JS behaviour

**Result: PASS**

- Stepper UI and first-cell remove/plus are only created in `syncMobileQuoteLineSummaries()` when `isMobileQuoteViewport()` (e.g. `isMobile` at 1297, 1368).
- Desktop cleanup branch (1307–1328) removes cell-0 remove/plus and replaces stepper with `.quote-line-qty-input`.
- `manualOverrides` preservation else-branch (no `.quote-line-qty-input` → `getQuoteRowStoredQty(r)`) only runs for rows that have no qty input. On desktop, after sync, material rows have inputs, so this branch is effectively for mobile stepper rows only.
- **Conclusion:** No mobile-only logic alters desktop quote behaviour.

### 1.3 Mobile viewport: stepper and control size behaviour

**Result: FAIL (logic gap — see §2)**

- 33% control size: implemented as specified; CSS-only, mobile-scoped.
- Stepper qty preservation: implemented only for rows where `r.dataset.inferred !== 'true'`. Inferred rows (e.g. Bracket, Screws) are excluded, so their stepper-updated qty is not preserved and the value snaps back after rebuild.

---

## 2. Logic Gaps & Bugs (root cause of continued snap-back)

### 2.1 Inferred rows excluded from `manualOverrides` (primary bug)

**Finding: BUG / LOGIC GAP**

- **Location:** `frontend/app.js` ~3529–3539 (preservation loop before table clear).
- **Current logic:**  
  `if (r.dataset.assetId && r.dataset.inferred !== 'true') { ... set manualOverrides from qtyInput or getQuoteRowStoredQty(r) }`
- **Effect:** Rows with `dataset.inferred === 'true'` (Bracket, Screws, and other backend-inferred items) never have their qty written to `manualOverrides`, even when the user changed qty via the stepper and `getQuoteRowStoredQty(r)` holds that value.
- **Downstream:** After rebuild, `renderMaterialRow(line, ...)` uses `overrideQty = manualOverrides[line.id]`, which is `undefined` for inferred lines, so `qtyDisplay = String(line.qty)` from the API and the user’s stepper value is discarded → **snap-back**.
- **UX impact:** User edits on inferred-item quantities are not respected; violates expectation that stepper changes persist.

**Required fix (for approval):** Include inferred rows in preservation when they have no `.quote-line-qty-input`: e.g. preserve `getQuoteRowStoredQty(r)` for **all** rows with `r.dataset.assetId` and no qty input (including when `r.dataset.inferred === 'true'`), so that stepper-updated qty for Bracket/Screws (and any inferred line) is written to `manualOverrides` and used in `renderMaterialRow`.

### 2.2 No other overwrite paths identified

- `getElementsFromQuoteTable()` correctly uses `getQuoteRowStoredQty(row)` when there is no `.quote-line-qty-input` (lines 2959–2965), so the API receives the updated qty.
- After rebuild, `syncMobileQuoteLineSummaries()` runs and builds the stepper from `getQuoteLineQuantityMeta(row)`, which reads the new row’s input (or stored qty) and sets the stepper value; no separate overwrite found.
- **Conclusion:** The only identified cause of snap-back is the exclusion of inferred rows from `manualOverrides` (see §2.1).

---

## 3. Railway Deployment Safety

**Result: PASS**

- No new environment variables or build steps.
- Changes are CSS (mobile-scoped) and JS (quote table logic only).
- No backend or deployment config touched.
- **Conclusion:** Safe for existing Railway deployment.

---

## 4. UI/UX Standards

### 4.1 Touch targets (33% control size)

**Result: FAIL (known trade-off)**

- 15×15px visual size is below the 44px minimum touch target (Apple HIG / WCAG 2.5.5).
- Plan and implementation explicitly chose 33% visual size per request; accessibility note suggests increasing hit area (e.g. padding) without changing visual size if needed later.
- **Conclusion:** Documented trade-off; not a regression from the agreed 33% change.

### 4.2 Stepper feedback and persistence

**Result: FAIL (due to §2.1)**

- Stepper correctly updates `dataset.quoteQtyValue` and the displayed value immediately.
- After `calculateAndDisplayQuote()` rebuild, inferred-item quantities revert to API `line.qty`, so user intent is not persisted → poor UX and inconsistent with “stepper changes stick” expectation.
- **Conclusion:** Fails until inferred rows are included in `manualOverrides` preservation.

---

## 5. Summary: Pass/Fail by Category

| Category | Result | Notes |
|----------|--------|--------|
| Desktop: no mobile CSS bleed | **PASS** | All mobile quote rules under `body[data-viewport-mode="mobile"]`. |
| Desktop: no mobile JS behaviour | **PASS** | Stepper/remove/plus and preservation else-branch are mobile-relevant only. |
| Mobile: 33% control size | **PASS** | Implemented as specified; mobile-only. |
| Mobile: stepper qty persistence | **FAIL** | Inferred rows excluded from `manualOverrides` → snap-back. |
| Railway deploy safety | **PASS** | No env/build/config changes. |
| UI/UX: touch target | **FAIL** | 15px below 44px (documented). |
| UI/UX: stepper persistence | **FAIL** | Same as mobile stepper qty persistence. |

---

## 6. Recommended Fix (awaiting approval)

- **Single change:** In the `manualOverrides` preservation loop (`frontend/app.js`, same block as ~3529–3539), preserve stored qty for **all** material rows that have no `.quote-line-qty-input` (including when `r.dataset.inferred === 'true'`), using `getQuoteRowStoredQty(r)` when finite.  
- **Do not** change: desktop behaviour, `getElementsFromQuoteTable()`, `renderMaterialRow()` override logic, or any CSS.  
- After change: re-run E2E (including quote modal / mobile) and manually confirm stepper +/− on both non-inferred and inferred rows (e.g. Bracket, Screws) keeps the new value after rebuild.

---

*End of Audit Report. No fix code has been written; awaiting approval before implementation.*
