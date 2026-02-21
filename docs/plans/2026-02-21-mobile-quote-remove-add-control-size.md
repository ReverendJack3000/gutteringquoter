# Mobile Quote Modal: Reduce Remove/Add Control Size to 33%

**Date:** 2026-02-21  
**Scope:** Mobile-only. First-column controls in `#quotePartsTable`: red circular minus (`.quote-row-remove-x`) and green circular plus (`.quote-row-add-plus`). Desktop unchanged; Railway-safe (CSS only).

---

## Goal

Reduce the **visual size** of the mobile quote table’s delete (red minus) and add-row (green plus) controls in the first column to **33% of their current size**. No behaviour or DOM changes.

---

## Current implementation (code-backed)

- **Location:** `#quoteModal` → `.quote-modal-content` → `#quotePartsTable` → `#quoteTableBody` → `tr` → `td[0]` (first cell).
- **Elements:**  
  - Editable rows: `<span class="quote-row-remove-x" role="button" tabindex="0" aria-label="Remove line">−</span>` (red circle).  
  - Empty row: `<span class="quote-row-add-plus" aria-hidden="true">+</span>` (green circle).
- **Current size (mobile):** 44×44px, font-size 22px (set in `frontend/styles.css` in two mobile-only blocks).

**CSS blocks to change (all in `frontend/styles.css`):**

1. **First-cell remove (red minus)** — ~lines 5703–5721  
   Selector: `body[data-viewport-mode="mobile"] #quoteModal .quote-parts-table tbody td:first-child .quote-row-remove-x`  
   Current: `min-width: 44px; min-height: 44px; width: 44px; height: 44px; font-size: 22px;`

2. **First-cell add (green plus)** — ~lines 5726–5745  
   Selector: `body[data-viewport-mode="mobile"] #quoteModal .quote-parts-table tbody td:first-child .quote-row-add-plus`  
   Current: same 44px dimensions and font-size 22px.

There is also a broader rule at ~5869: `body[data-viewport-mode="mobile"] #quoteModal .quote-row-remove-x` with 44px. The first-cell rule above is more specific (td:first-child), so only the two first-cell blocks need to be updated; the cascade will apply the new size to the controls in cell 0.

---

## Implementation

### 1. Size values (33% of current)

- **Box:** 44 × 0.33 ≈ 14.52 → use **15px** for `min-width`, `min-height`, `width`, `height`.
- **Font:** 22 × 0.33 ≈ 7.26 → use **7px** for `font-size`.

### 2. CSS changes (`frontend/styles.css` only)

- In the block **`body[data-viewport-mode="mobile"] #quoteModal .quote-parts-table tbody td:first-child .quote-row-remove-x`** (54.93.2 red circle):
  - Set `min-width`, `min-height`, `width`, `height` to `15px`.
  - Set `font-size` to `7px`.

- In the block **`body[data-viewport-mode="mobile"] #quoteModal .quote-parts-table tbody td:first-child .quote-row-add-plus`** (54.93.2 green plus):
  - Same: `min-width`, `min-height`, `width`, `height` → `15px`; `font-size` → `7px`.

No changes to:

- `frontend/app.js` (syncMobileQuoteLineSummaries, initQuoteModal, getQuoteRowStoredQty, setQuoteRowStoredQty, calculateAndDisplayQuote).
- `frontend/index.html`.
- Desktop-only or global `.quote-row-remove-x` / `.quote-row-add-plus` rules (e.g. base rule ~4124; desktop hover in cell 5).

### 3. Desktop vs mobile

- **Mobile:** Only the two rules above are under `body[data-viewport-mode="mobile"]` and target the first column; they are the only ones changed. Red minus and green plus in the first cell become 15×15px with 7px font.
- **Desktop:** Cell 0 has no remove/plus on desktop (sync removes them when not mobile). Cell 5 remove uses the base/hover styles; no 44px override in first cell. No desktop behaviour or layout change.

### 4. Accessibility note

- 15px is below the 44px minimum touch target (Apple HIG / WCAG 2.5.5). If needed later, increase hit area without changing visual size (e.g. extra padding or a larger transparent tap area). This plan implements the requested 33% visual size only.

### 5. Verification

- Run `npm test` after changes.
- Manual: open quote modal on mobile viewport; confirm first-column minus and plus are smaller; confirm delete and add-row behaviour unchanged; confirm desktop quote modal unchanged.

---

## Summary

| Item | Action |
|------|--------|
| File | `frontend/styles.css` |
| Selectors | First-cell `.quote-row-remove-x` and `.quote-row-add-plus` (mobile only) |
| Change | 44px → 15px (dimensions), 22px → 7px (font-size) |
| JS/HTML | None |
| Desktop | Unchanged |
| Railway | Safe (CSS only) |
