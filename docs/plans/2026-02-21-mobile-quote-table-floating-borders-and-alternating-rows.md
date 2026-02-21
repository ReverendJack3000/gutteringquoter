# Plan: Mobile quote table – floating borders/fills and alternating row colours

**Date:** 2026-02-21  
**Scope:** Mobile-only full-screen quote modal (`body[data-viewport-mode="mobile"] #quoteModal`). Desktop quote table and logic unchanged; CSS-only; Railway-safe.  
**Status:** Implemented (2026-02-21). E2E passed.

**Completed steps:**
- [x] 3.1 Alternating row colours: removed indent-row background override so global `tbody tr:nth-child(odd/even)` applies.
- [x] 3.2 Labour row: `border-top: 1px solid #e5e7eb`, `background: #fafafa`.
- [x] 3.3 Stepper: `.quote-mobile-qty-stepper-btn` `background: transparent` (44px and border preserved).
- [x] 3.4 Combobox + empty qty: mobile modal overrides `border-color: #e5e7eb`, `background: transparent` for `.quote-product-combobox-input` and `.quote-empty-qty-input`.

---

## 1. Summary of issues

1. **Floating borders and fills (janky look)**  
   Editable rows (labour, material lines, empty/add row) and the Qty stepper look like separate “boxes” instead of part of one table: strong borders and distinct backgrounds make the table feel fragmented.

2. **Alternating row colours not respected for inherited items**  
   Rows for items like Bracket and Screws (inherited from measured materials, with `.quote-product-indent-level-1` / `.quote-product-indent-level-2`) all get the same grey fill (`#f9fafb`), so they don’t follow the odd/even stripe pattern.

---

## 2. Investigation findings

### 2.1 Desktop baseline (unchanged)

- **Global** (lines 4070–4076):  
  `.quote-parts-table tbody tr:nth-child(even)` → `background: #fafafa`;  
  `.quote-parts-table tbody tr:nth-child(odd)` → `background: #fff`.
- **Section header** (4332–4335): `.quote-section-header` → `background: #f8f9fa`.
- **Indent** (4383–4409): `.quote-product-indent-level-1` / `.quote-product-indent-level-2` – layout/indent only; no row background in global CSS. So on desktop, indent rows get normal odd/even.

### 2.2 Cause of “floating” look (mobile)

| Source | Location | What it does | Effect |
|--------|----------|--------------|--------|
| Labour row | 5676–5679 | `tr.quote-row-labour td` → `background: #f8fafc`, `border-top: 2px solid #e5e7eb` | Labour looks like a separate block with a strong top edge. |
| Indent rows | 5666–5669 | `tbody tr:has(td .quote-product-indent-level-1/2)` → `background: #f9fafb` | All inferred rows (Bracket, Screws, etc.) same grey; no alternation. |
| Stepper buttons | 5755–5772 | `.quote-mobile-qty-stepper-btn` → `border: 1px solid #e5e7eb`, `border-radius: 8px`, `background: #f9fafb` | Each −/+ is a visible box; stepper reads as a cluster of boxes. |
| Combobox (add product) | 4253–4259 (global) | `.quote-product-combobox-input` → `border: 1px solid #ddd`, `border-radius: 6px` | “Type or select product…” has a strong input box. |
| Empty qty input | 4427–4433 (global) | `.quote-empty-qty-input` → `border: 1px solid #ddd`, `border-radius: 6px` | The “1” in the add row has a visible box. |
| Line qty input | 4412–4418 (global) | `.quote-line-qty-input` → `border: 1px solid #ddd` | Hidden on mobile (replaced by stepper) but confirms global input styling. |

Mobile does not override combobox/empty-input borders, so those global borders appear in the modal and add to the “floating” feel.

### 2.3 Cause of broken alternating colours (mobile)

- **Intended:** Odd rows `#fff`, even rows `#fafafa` (from global `.quote-parts-table tbody tr:nth-child(odd/even)`).
- **What happens:**  
  Mobile rule at **5666–5669** overrides for any row that contains an indent cell:  
  `tbody tr:has(td .quote-product-indent-level-1),  
  tbody tr:has(td .quote-product-indent-level-2)` → `background: #f9fafb`.  
  So every such row gets the same grey, regardless of position (odd/even). Section headers and labour have their own backgrounds; the main break is this single override for all indent rows.

### 2.4 Specificity and order

- Global odd/even: `.quote-parts-table tbody tr:nth-child(...)` (one class + one pseudo).
- Mobile indent: `body[data-viewport-mode="mobile"] #quoteModal .quote-parts-table tbody tr:has(...)` (higher specificity, later in file).  
  So the mobile indent rule wins and forces one colour for all indent rows.

---

## 3. Proposed fixes (CSS-only, mobile-scoped)

### 3.1 Alternating row colours for indent rows

- **Change:** Stop forcing one background for all indent rows on mobile.
- **Option A (recommended):** Remove the **background** from the mobile indent-row rule (5666–5669). Keep only the font-weight rule for the text (5671–5674). Then global `tbody tr:nth-child(odd/even)` will apply to indent rows as well, so Bracket/Screws/etc. will alternate with white and light grey.
- **Option B:** Replace the single `#f9fafb` with two rules that respect odd/even, e.g.  
  `tr:has(td .quote-product-indent-level-1):nth-child(odd)` → `#fff`,  
  `tr:has(td .quote-product-indent-level-1):nth-child(even)` → `#fafafa`  
  (and same for level-2).  
  Option A is simpler and keeps one source of truth for alternating.

**Caveat:** If section-header or labour rows are in the tbody and use `nth-child`, they will also get odd/even unless we keep or add specific overrides for them. Currently labour has `tr.quote-row-labour td { background: #f8fafc }` (on `td`, not `tr`), so it already overrides. Section header has global `background: #f8f9fa`; that can stay so header rows don’t alternate with data rows. No change needed for section header for this fix.

### 3.2 Softer labour row (reduce “floating” block)

- **Current:** `tr.quote-row-labour td` → `background: #f8fafc`, `border-top: 2px solid #e5e7eb`.
- **Proposed:** Keep labour visually distinct but more integrated:  
  - Use the same alternating as other rows for the labour **row** (so labour participates in odd/even). Set `tr.quote-row-labour td { background: transparent }` (or inherit) and add a mobile-only rule for `tr.quote-row-labour` that sets `background` from `nth-child` (e.g. if labour is the 2nd tbody row, it would get even).  
  **Simpler approach:** Keep a subtle tint so labour stays distinct: set labour row `background` to the “even” colour `#fafafa` (or a very subtle blue tint like `#f8fafc`) and reduce the top border from `2px` to `1px solid #e5e7eb` so it matches the row dividers and doesn’t look like a heavy bar.  
- **Recommendation:**  
  - `tr.quote-row-labour td`: set `border-top: 1px solid #e5e7eb` (was 2px).  
  - Set labour row background to `#fafafa` so it aligns with “even” rows and doesn’t look like a separate card; or keep `#f8fafc` if product wants labour to stay slightly tinted. Document the choice.

### 3.3 Softer stepper (reduce boxiness)

- **Current:** `.quote-mobile-qty-stepper-btn` has `border: 1px solid #e5e7eb`, `border-radius: 8px`, `background: #f9fafb`.
- **Proposed (mobile quote only):**  
  - Use a lighter border and/or background so the stepper blends with the row: e.g. `border: 1px solid #e5e7eb` (keep) but `background: transparent` or `background: inherit` so the row stripe shows through; or a very light `#fafafa` only when needed for contrast.  
  - Ensure 44px touch targets and focus visibility are preserved.

### 3.4 Softer add-product row (combobox + empty qty input)

- **Current:** Global `.quote-product-combobox-input` and `.quote-empty-qty-input` use `border: 1px solid #ddd`, so they look like strong boxes inside the table.
- **Proposed:** Under `body[data-viewport-mode="mobile"] #quoteModal`, add overrides so that inside the quote modal these controls are softer:  
  - `.quote-product-combobox-input`: e.g. `border-color: #e5e7eb`, optional `background: transparent` or match row.  
  - `.quote-empty-qty-input`: same idea – `border-color: #e5e7eb`, optional background to match row.  
  Do not change behaviour or layout; only border/background so they don’t look like floating boxes.

### 3.5 Optional: section header

- Section header (e.g. “Gutter Length: Storm Cloud (5 m)”) uses global `background: #f8f9fa`. No change required for the two main issues; optional later tweak to align with thead (`#f8f8f8`) or keep as-is.

---

## 4. Implementation order and safety

1. **Alternating rows (3.1)**  
   In `frontend/styles.css`, in the mobile `#quoteModal .quote-parts-table` block, remove `background: #f9fafb` from the rule at 5666–5669 (indent rows). Keep the rule selector if we need it for other properties, or keep only the font-weight block (5671–5674). Verify that section headers and labour still look correct (they have their own backgrounds).

2. **Labour row (3.2)**  
   In the same mobile block, adjust the rule at 5676–5679: change `border-top` to `1px solid #e5e7eb`; set labour background to `#fafafa` (or keep `#f8fafc` by product preference).

3. **Stepper (3.3)**  
   Add or adjust mobile quote modal rules for `.quote-mobile-qty-stepper-btn`: softer background (e.g. transparent or inherit), keep 44px and border-radius; keep or soften border.

4. **Combobox and empty qty (3.4)**  
   Add mobile quote modal overrides for `.quote-product-combobox-input` and `.quote-empty-qty-input`: lighter border colour (e.g. `#e5e7eb`), optional background to match row.

All changes must remain under `body[data-viewport-mode="mobile"] #quoteModal` (or more specific) so desktop is untouched. No HTML or JS changes.

---

## 5. Verification

- **Desktop:** Quote modal unchanged (grid, borders, 6 columns, alternating, labour/section styling).
- **Mobile:**  
  - Indent rows (Bracket, Screws, etc.) alternate white / light grey.  
  - Labour row no longer has a heavy top bar; still distinct.  
  - Stepper and add-product row feel integrated (softer borders/backgrounds).  
- **E2E:** `npm test`; no regressions.  
- **Railway:** CSS-only; deploy-safe.

---

## 6. Files and line references

| Item | File | Lines (approx) |
|------|------|----------------|
| Global alternating | styles.css | 4070–4076 |
| Mobile indent row background | styles.css | 5666–5669 |
| Mobile labour row | styles.css | 5676–5679 |
| Mobile stepper buttons | styles.css | 5755–5772 |
| Global combobox input | styles.css | 4253–4259 |
| Global empty qty input | styles.css | 4427–4433 |

---

*Plan based on codebase inspection only; no assumptions beyond the referenced CSS and DOM.*
