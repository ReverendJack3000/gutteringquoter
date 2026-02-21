# Mobile Quote Modal UX Tidy (54.92)

**Date:** 2026-02-21  
**Scope:** Mobile-only full-screen Quote modal (`#quoteModal` when `body[data-viewport-mode="mobile"]`). Desktop quote modal and all calculation/API behaviour unchanged. Railway-safe (CSS/HTML/JS only; no new env or build).

**Reference DOM:** `div#quoteModal > div.quote-modal-content`; table `#quotePartsTable` (thead Product, Qty, Total); tbody `#quoteTableBody`; `#quoteServicem8Section`; `#quoteLabourWarning`.

---

## 1. Remove grid lines → horizontal dividers only (mobile)

**Current (code):**
- Global `.quote-parts-table th, .quote-parts-table td { border: 1px solid #e0e0e0 }` (styles.css ~4056–4060).
- Mobile block already sets `#quoteModal .quote-parts-table { border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb }` but does not override cell borders, so the full grid still applies from the global rule.

**Required:**
- Under `body[data-viewport-mode="mobile"] #quoteModal` only:
  - Set `.quote-parts-table th, .quote-parts-table td { border: none; border-bottom: 1px solid <divider-color> }` (or equivalent) so only horizontal dividers between rows remain; no vertical grid lines.
  - Optionally give `thead tr` a single bottom border and tbody rows a bottom border only (no left/right on cells).
- Ensure thead remains visually distinct (e.g. background #f8f8f8 or existing header styles).

**Files:** `frontend/styles.css` (mobile quote block ~5644–5677).

---

## 2. Item grouping: nested look for sub-items (mobile)

**Current (code):**
- Rows with Brackets/Screws use `.quote-product-indent-level-1` or `.quote-product-indent-level-2` (padding-left + `::before` '↳') (styles.css 4383–4409).
- `data-section-for` marks child rows (e.g. SC, CL, downpipe-65); section headers use `data-section-header` (e.g. "Gutter Length: Storm Cloud (1.5 m)").
- Parent/child relationship is sequence in DOM: header row then material rows with same sectionFor.

**Required:**
- Under mobile only, make indented/child rows visually nested under the main product (e.g. "Gutter 1.5m"):
  - **Option A:** Light background tint on `tr` when the row has `.quote-product-indent-level-1` or `.quote-product-indent-level-2` (e.g. `background: rgba(0,0,0,0.03)` or #f9fafb).
  - **Option B:** Left border or vertical connector line (e.g. `border-left: 3px solid #e5e7eb`) on those rows.
- Use lighter font weight for sub-items on mobile (e.g. `font-weight: 500` or 400 for indent-level-1/2) so they read as secondary to the main product name.

**Files:** `frontend/styles.css` (new rules under `body[data-viewport-mode="mobile"] #quoteModal` for `.quote-product-indent-level-1`, `.quote-product-indent-level-2`, or `tr` that contain them).

---

## 3. Line items: alignment and compact qty (mobile)

**Current (code):**
- Product cell: contains product name (or `<span class="nameClass">`) and, on mobile, `.quote-mobile-line-summary` (e.g. "4 x $4.50 · Tap to edit") added by `syncMobileQuoteLineSummaries()` (app.js ~1294–1336).
- Total cell: `.quote-cell-total` with flex and `.quote-cell-total-value`; mobile already has `display: flex; justify-content: space-between` (5721–5729).
- Qty: mobile hides inline inputs and shows `.quote-mobile-line-qty-summary` in the qty cell; labour row still has hidden inputs; empty row has `.quote-empty-qty-input`. Widths: `td:nth-child(2)` 18%, `td:nth-child(6)` 26% (5671–5676).

**Required:**
- **Product column:** Left-align product name and subtitle (unit price x qty). Ensure product cell is `text-align: left` and the summary line is below the name (block or flex column); no centering.
- **Total column:** Right-align the total price text only. Remove any box/border/background on `.quote-cell-total` that creates visual clutter; keep plain currency text, right-aligned. (Current mobile CSS has no explicit box; verify and ensure no border/background.)
- **Qty column:** Keep quantity summary compact and aligned; if any numeric input remains visible on mobile (e.g. empty row), standardize its width (e.g. fixed width or max-width) so all such inputs are consistent.

**Files:** `frontend/styles.css` (mobile quote block); optionally `frontend/app.js` if product cell structure needs a wrapper for name vs subtitle (currently name and summary are siblings in product cell).

---

## 4. Labour section visually distinct (mobile)

**Current (code):**
- Labour is a table row `.quote-row-labour`; product cell has `.quote-labour-label` (bold "Labour") and `.quote-labour-dup-btn` (+👷). No separate section wrapper.
- On mobile, labour row shows summary like other rows (`.quote-mobile-line-summary`, `.quote-labour-mobile-qty-summary`).

**Required:**
- Make the Labour row read as a service, not a material:
  - **Option A:** Different icon (e.g. wrench or person) next to "Labour" in the product cell (replace or supplement +👷 for mobile, or add a small icon before the label).
  - **Option B:** Bold or larger header treatment for the labour row product cell (already bold; can add a subtle top border or background tint for the row).
- Ensure labour row has a clear visual separator or background so it’s distinct from material rows.

**Files:** `frontend/styles.css` (mobile); optionally `frontend/index.html` or `frontend/app.js` if adding an icon element (e.g. span with aria-hidden icon next to .quote-labour-label in createLabourRow).

---

## 5. Footer: Materials subtotal + Add to Job (mobile)

**Current (code):**
- `.quote-totals-section` (padding 12px, background #f2f2f7 on mobile) contains `.quote-total-line` for Materials subtotal, Labour subtotal, Total (ids: materialsTotalDisplay, labourTotalDisplay, quoteTotalDisplay).
- `.quote-servicem8-section` (sticky bottom, backdrop blur) contains title, `#quoteLabourWarning`, Job # input, Add to Job button. Mobile hides Print/Copy/Close (5791–5794). `.quote-servicem8-btn` has min-height 44px and border-radius 12px on mobile (5785–5787).

**Required:**
- **Materials subtotal:** Make "Materials subtotal" line stand out (e.g. slightly larger font-size or font-weight for that line on mobile).
- **Add to Job button:** Style as full-width primary action: e.g. `width: 100%` or `flex: 1` within its container so it spans the footer width; keep min-height 44px and primary (green when valid) styling.

**Files:** `frontend/styles.css` (mobile block for .quote-totals-section, .quote-total-line, and .quote-servicem8-controls / .quote-servicem8-btn).

---

## 6. Labour warning: integrated error state (mobile)

**Current (code):**
- `#quoteLabourWarning` (index.html 666): `<p id="quoteLabourWarning" class="quote-labour-warning" ...>Add labour hours to the quote before adding to a job.</p>`; shown when labour hours ≤ 0 (app.js 2144–2148, 2269–2275). CSS: `.quote-labour-warning { margin: 6px 0 10px; font-size: 13px; color: #c62828; font-weight: 500; }`.
- On mobile, labour row shows summary "0 hrs … · Tap to edit"; the actual hours input is hidden.

**Required:**
- **In-context warning (labour row):** When total labour hours are 0, show a warning icon (e.g. ⚠️ or SVG) immediately next to the labour row’s summary (e.g. in the product cell or qty cell of the labour row). Icon should be visible only when labour hours === 0; hide when labour > 0. Prefer placing icon next to the "0 hrs" summary so it reads as "0 hrs ⚠️" or "⚠️ 0 hrs".
- **Footer message as alert box:** Style the existing `#quoteLabourWarning` on mobile as a dedicated alert (e.g. `role="alert"` if not already; add background tint and border-left, or a rounded alert box) so it doesn’t look like floating red text. Keep the same message and show/hide logic; only change presentation.

**Files:** `frontend/styles.css` (mobile .quote-labour-warning as alert box); `frontend/app.js` (ensure labour row gets a warning icon node when hours === 0, or inject icon in syncMobileQuoteLineSummaries for labour row when total labour is 0); optionally `frontend/index.html` if we add a dedicated icon element in the labour row template.

---

## 7. Desktop and regression

- All new/edited selectors must be under `body[data-viewport-mode="mobile"] #quoteModal` (or equivalent mobile-only scope) so desktop quote modal is unchanged.
- No changes to quote calculation, ServiceM8 API, or Add to Job logic.
- Verify: desktop quote modal still shows full table with grid, all columns, Print/Copy/Close; mobile quote remains full-screen with back button and sticky footer; E2E and manual QA.

---

## 8. Task list mapping (draft)

- **54.92.1** Mobile quote: remove grid lines; use horizontal dividers only between line items.
- **54.92.2** Mobile quote: visual nesting for indented items (light background or vertical connector; lighter font weight for sub-items).
- **54.92.3** Mobile quote: left-align product name and unit price x qty subtitle; right-align total; compact consistent qty.
- **54.92.4** Mobile quote: make Labour row visually distinct (icon or bold header / separator).
- **54.92.5** Mobile quote: Materials subtotal stands out; Add to Job button full-width primary at bottom.
- **54.92.6** Mobile quote: labour 0-hrs warning as icon next to labour row summary + footer message as alert box.
- **54.92.7** Verify desktop unchanged and regression (E2E/manual); Railway-safe.

---

## Key UI checklist (from user)

| Feature            | Current issue                 | Fix (mobile)                                              |
|-------------------|-------------------------------|-----------------------------------------------------------|
| Hierarchy         | Parent and child look similar | Lighter font weight for sub-items; indent + tint/connector|
| Total column      | Boxes create clutter          | No boxes; currency text right-aligned                    |
| Input fields      | Qty width inconsistent        | Standardize width for numeric inputs                      |
| Labour alert      | Looks like floating error     | Warning icon next to 0 hrs; footer message as alert box  |
