# Audit Report: 50.20 Quote modal – set data-inferred when override ignored

**Date:** 2026-03-02  
**Auditor role:** Strict Senior QA Engineer  
**Scope:** Recent 50.20 implementation and related task/doc updates. Constraints: Desktop vs Mobile production, Railway deployment safety, UI/UX best practices.  
**Verdict:** Pass with no defects identified. No fix code proposed; awaiting approval on this report.

---

## 1. Summary of changes audited

| Item | Change |
|------|--------|
| **frontend/app.js** | One conditional added in `renderMaterialRow()` after the 50.19 block: when `isInferredItem && manualOverrides[line.id] != null && overrideQty === null`, set `row.dataset.inferred = 'true'`. |
| **docs/tasks/sections-49-53.md** | Task 50.20 marked [x]; section status text updated. |
| **TASK_LIST.md** | Section 50 uncompleted row updated (50.20 removed from list; “50.19, 50.20 done” in description). |
| **TROUBLESHOOTING.md** | Quote modal “total doubles” entry: heading (50.19 + 50.20), symptom/cause/fix extended with recalc-doubling and 50.20 fix. |
| **docs/plans/quote-modal-50-19-stepper-follow-up-plan.md** | Status set to Implemented. |

---

## 2. Regression & conflict check

### 2.1 Desktop vs mobile viewport

| Check | Result | Notes |
|-------|--------|------|
| No new or changed CSS | **Pass** | No edits in `styles.css`. No new selectors, no `data-viewport-mode` or `[data-inferred]` in CSS. |
| No mobile-only JS branching changed | **Pass** | 50.20 is a single condition in shared quote-modal path; no `isMobileQuoteViewport()` or `layoutState.viewportMode` used or introduced. |
| No desktop-only JS branching changed | **Pass** | Same shared path; no desktop-only logic touched. |
| `data-inferred` consumers unchanged | **Pass** | (1) `getElementsFromQuoteTable()` still skips rows with `dataset.inferred === 'true'`. (2) `syncMobileQuoteLineSummaries()` still uses `row.dataset.inferred === 'true'` (or indent class) for AUTO badge – applies to both viewports. (3) Qty input `change` handler: only the **non-inferred** branch clears `data-inferred` before recalc; inferred branch does local update only and never clears it. No conflict with 50.20. |
| Mobile layout / desktop layout bleed | **Pass** | No CSS or viewport-specific JS added or modified. No risk of mobile-only behaviour on desktop or vice versa. |

### 2.2 Logic & data flow

| Check | Result | Notes |
|-------|--------|------|
| 50.19 behaviour preserved | **Pass** | Override vs backend qty logic and `overrideQty = null` assignment unchanged. 50.20 only runs after that block when `overrideQty === null` and a preserved override existed. |
| Stepper / qty input local update preserved | **Pass** | `isInferredProductRow(row)` and local update path (line total, recalc, sync) unchanged. Inferred rows still do not call `calculateAndDisplayQuote()` on qty change. |
| Standalone bracket (canvas-only) not over-marked | **Pass** | When there is no gutter, backend returns bracket qty equal to canvas (e.g. 13). Preserved override is 13, backend 13 → override not ignored, `overrideQty` stays 13. So `overrideQty === null` is false and 50.20 does **not** set `data-inferred`. Row remains in payload on next recalc. |
| Merged case (gutter + bracket) correctly marked | **Pass** | Preserved override (e.g. 13) ≠ backend (e.g. 22) → 50.19 sets `overrideQty = null`. Then 50.20 condition true → `data-inferred` set → row skipped in `getElementsFromQuoteTable()` on next recalc → no double merge. |
| No double-set or clear conflict | **Pass** | Line 4758 sets `data-inferred` when `!hasManualOverride`. 50.20 sets it when we had override but ignored it. The two “set” cases are mutually exclusive. Only the non-inferred qty `change` branch clears `data-inferred`; inferred rows never take that branch. |

### 2.3 Material Rules functionality (Section 63)

| Check | Result | Notes |
|-------|--------|------|
| Admin Material Rules UI (view-material-rules) | **Pass** | No shared code path. Material Rules live in `frontend/modules/admin-products-bonus.js`, `view-material-rules`, and admin API endpoints. Quote modal uses `#quoteModal`, `getElementsFromQuoteTable()`, and `renderMaterialRow()` in `frontend/app.js`. No references to `data-inferred`, quote table, or calculate-quote in Material Rules UI. |
| Measured rules used in calculate-quote | **Pass** | Backend still loads rules via `get_measured_material_rules_for_quote(supabase)` and passes them to `expand_elements_with_gutter_accessories(raw_elements, rules_config=measured_rules)`. 50.20 only changes **which** rows the frontend includes in `elements` (skips rows with `data-inferred === 'true'`). The backend still receives gutter/downpipe elements and applies the same rules to infer brackets, screws, clips. We simply omit a redundant inferred row that was already merged – rules (bracket_spacing_mm, screw_product_id, clip product IDs, etc.) are applied unchanged. |
| Quick Quoter rules | **Pass** | Quick Quoter repair types/templates are separate admin data; quote modal payload is built from the quote table only. No interaction. |

### 2.4 Railway deployment safety

| Check | Result | Notes |
|-------|--------|------|
| No new env vars | **Pass** | No `.env` or config references added. |
| No new dependencies | **Pass** | No change to `package.json` or backend `requirements.txt`. |
| No new build step | **Pass** | Frontend remains vanilla HTML/CSS/JS; no build step in README or run script. |
| Single-file JS change | **Pass** | Only `frontend/app.js` modified; static asset can be served as-is on Railway. |

### 2.5 UI/UX best practices

| Check | Result | Notes |
|-------|--------|------|
| No new UI components | **Pass** | No new buttons, inputs, or visible elements. |
| Correctness of totals (UX) | **Pass** | Fix ensures displayed line qty and total stay consistent and that recalc does not double totals; improves trust in the quote. |
| Accessibility | **Pass** | No change to ARIA, labels, or focus; existing quote table behaviour unchanged. |
| AUTO badge still correct | **Pass** | Rows that get `data-inferred` from 50.20 already have indent class (BRK/SCL/ACL/SCR); `isInferredRow` in `syncMobileQuoteLineSummaries` is true by indent or by `dataset.inferred`, so AUTO badge still shows. |

---

## 3. Strict Pass/Fail list by category

**Regression & conflict**

- Pass – No regression in 50.19 (override vs backend qty).
- Pass – No regression in stepper/qty input local update for inferred rows.
- Pass – No conflict with `getElementsFromQuoteTable()` skip logic.
- Pass – No conflict with qty input `change` handler (inferred vs non-inferred branches).
- Pass – Standalone-bracket and merged-case behaviour correct.

**Material Rules (Section 63)**

- Pass – Admin Material Rules UI (view-material-rules, measured + Quick Quoter) has no shared code with quote modal; unaffected.
- Pass – Measured rules still applied in `POST /api/calculate-quote` via `get_measured_material_rules_for_quote` and `expand_elements_with_gutter_accessories`; 50.20 only omits inferred rows from the payload, so rules apply to the same element types (gutter/downpipe) as before.

**Desktop vs mobile**

- Pass – No mobile layout or CSS bleed into desktop.
- Pass – No desktop layout or CSS bleed into mobile.
- Pass – No new viewport-specific branching; shared logic only.

**Railway deployment**

- Pass – No new env, deps, or build; deployment path unchanged.

**UI/UX**

- Pass – Totals and line consistency improved; no new UI; AUTO badge and a11y unchanged.

---

## 4. Findings (bugs / missing cleanup / logic gaps)

- **None.** No bug, missing cleanup step, or logic gap identified. No fix code proposed; awaiting your approval on this audit report.

---

## 5. Recommendations (informational)

- **Manual QA (already in plan):** After deployment, run the verification steps in `docs/plans/quote-modal-50-19-stepper-follow-up-plan.md` (gutter+bracket first paint and recalc; canvas-only bracket; stepper +1 then recalc; smoke-test totals/Print/Add to Job). This audit did not execute the app.
- **E2E (optional):** If quote-modal E2E exists, add or run a case that opens quote with gutter+bracket, triggers recalc (e.g. change gutter length), and asserts total does not double.
