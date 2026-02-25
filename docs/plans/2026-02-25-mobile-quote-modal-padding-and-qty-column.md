# Plan: Mobile quote modal – right-hand padding and Qty column polish

**Date:** 2026-02-25  
**Scope:** Mobile-only (`body[data-viewport-mode="mobile"]`); desktop quote modal and layout unchanged. Railway-safe (CSS only).  
**Context:** Quote modal on mobile is hard against the screen border and sometimes cut off; Qty column (header + section-header metres + material steppers) needs polishing.

---

## 1. Goal

- Fix right-hand (and left) padding of the quote modal on mobile so content is not hard against the screen and is not cut off (including on notched devices).
- Polish the Qty column on mobile: apply consistent padding and formatting to the **Qty** header (`thead th`), **section-header** rows (measured Gutter/Downpipe length with metre stepper), and **automatic dependent materials** (e.g. screws) and all other rows that show the qty stepper.

---

## 2. Current state (code)

- **Modal content (mobile):** `frontend/styles.css` ~7609–7626  
  `body[data-viewport-mode="mobile"] #quoteModal .quote-modal-content` has `padding: 0`, `width: 100vw`, `max-width: 100vw`. Table has `margin: 0`, `width: 100%`. So the table runs edge-to-edge and can be cut off or feel cramped on the right.
- **Header:** `.quote-modal-header` on mobile has `padding: max(8px, env(safe-area-inset-top)) 12px 8px` (7638) so the header has 12px horizontal; the content below has no horizontal padding.
- **Qty column (mobile):** ~7688–7690: all `th`/`td` have `padding: 10px 8px`. ~7873–7880: column 2 has `width: 30%` and `border-left: 1px solid #e5e7eb`. Stepper buttons are 44×44px (~7827). No extra padding or alignment specific to the Qty column; section-header and material rows both use the same table cell rules.

---

## 3. Proposed implementation (100% correct, no assumptions)

### 3.1 Right-hand (and left) padding – mobile quote modal content

- **File:** `frontend/styles.css`
- **Where:** In the block  
  `body[data-viewport-mode="mobile"] #quoteModal .quote-modal-content,`  
  `body[data-viewport-mode="mobile"] #quoteModal.quote-modal--mobile-fullscreen .quote-modal-content`  
  (lines ~7609–7626).

- **Change:** Replace `padding: 0` with horizontal padding that respects safe areas and gives a minimum inset:
  - `padding-inline: max(12px, env(safe-area-inset-left)) max(12px, env(safe-area-inset-right));`
  - Keep vertical padding zero for the content box (header already has its own padding; totals and ServiceM8 sections have their own padding). So:
  - **Set:** `padding: 0 max(12px, env(safe-area-inset-right)) 0 max(12px, env(safe-area-inset-left));`  
    or equivalently:  
    `padding-inline: max(12px, env(safe-area-inset-left)) max(12px, env(safe-area-inset-right));`  
    and leave `padding-block` as 0 (or omit if already 0).

- **Effect:** The entire scrollable content (table, totals, ServiceM8) is inset from the left and right. No new HTML or JS. Desktop is unchanged (rule is under `body[data-viewport-mode="mobile"]`).

### 3.2 Qty column polish – mobile only

- **File:** `frontend/styles.css`
- **Where:** Under `body[data-viewport-mode="mobile"] #quoteModal`, after the existing Qty column rules (e.g. after ~7880, the vertical divider rule for `th:nth-child(2)` / `td:nth-child(2)`).

- **Targets (all mobile, same column):**
  - **Header:** `#quoteModal .quote-parts-table thead th:nth-child(2)` (“Qty”)
  - **Section-header rows:** `#quoteModal .quote-parts-table tbody tr.quote-section-header td:nth-child(2)` (metre stepper: “− 5 m +”)
  - **Material rows:** `#quoteModal .quote-parts-table tbody tr.quote-mobile-editable-line td:nth-child(2)` (qty stepper)
  - **Labour / empty / other rows:** already covered by the generic `td:nth-child(2)` rule.

- **Changes (add new rules, do not remove row-height or 44px touch targets):**
  1. **Padding:** Give the Qty column a bit more right padding so the plus button and “Qty” text are not flush to the (now padded) content edge. For example:
     - `body[data-viewport-mode="mobile"] #quoteModal .quote-parts-table th:nth-child(2),`
     - `body[data-viewport-mode="mobile"] #quoteModal .quote-parts-table td:nth-child(2) { padding-right: 12px; }`  
     (existing padding is 10px 8px; this overrides the right side only to 12px). Optionally set `padding-left` for the Qty column to the same 12px for symmetry (currently 8px from the shared rule).
  2. **Alignment (optional but recommended):** Center-align the Qty header and the content of the Qty cells so the stepper and “Qty” label read clearly:
     - `text-align: center` for `th:nth-child(2)` and `td:nth-child(2)` on mobile.
     - For cells that contain the stepper (`.quote-mobile-qty-stepper`), ensure the flex container remains centered (existing `.quote-mobile-qty-stepper` is already inline-flex; the cell can use `text-align: center` or a small wrapper with `display: flex; justify-content: center` if needed—current structure may already center with text-align: center on the td).

- **Measured header rows and dependent materials:** The same `td:nth-child(2)` (and `th:nth-child(2)`) selectors apply to:
  - Section headers with metre stepper (`.quote-section-header--has-metres td:nth-child(2)`),
  - All material rows (including indent-level-1/2 e.g. screws),
  - Labour rows,
  - Empty row.  
  So one consistent rule set for `th:nth-child(2)` and `td:nth-child(2)` under the mobile quote modal covers all of them.

### 3.3 What we are not changing

- Row heights: unchanged (user confirmed they are happy with them).
- Desktop: no changes; all new/edited rules are under `body[data-viewport-mode="mobile"] #quoteModal`.
- HTML: no DOM changes.
- JS: no changes.
- Build/deploy: CSS only; Railway deploy unchanged.

---

## 4. Edge cases and accessibility

- **Safe area:** Using `max(12px, env(safe-area-inset-*))` avoids content being cut off on notched devices and keeps a minimum 12px on devices without notches.
- **RTL:** If the app ever supports RTL, `padding-inline` is already logical; for the Qty column, `padding-right` could be replaced with `padding-inline-end: 12px` for symmetry with `padding-inline-start` if we add left padding. Optional follow-up.
- **200% zoom / accessibility:** Extra padding and centered Qty column do not reduce touch target size (stepper remains 44px); no removal of focus or ARIA.

---

## 5. Verification

- Manual: Open quote modal on mobile viewport (e.g. 390px width, or real device); confirm content is inset from left/right and not cut off; confirm Qty header and all Qty cells (section header metre stepper, material stepper) have consistent padding and alignment.
- Desktop: Confirm quote modal and table look unchanged.
- Run `npm test`; no Railway config or infra changes.

---

## 6. Task list update (draft)

- **Section file:** `docs/tasks/section-54.md` – add new subsection **54.93.10** with two checkboxes (e.g. 54.93.10.1 padding, 54.93.10.2 Qty column polish).
- **TASK_LIST.md:** Add one row to the uncompleted table for Section 54: e.g.  
  `54 | 54.93.10.1–54.93.10.2 | (Mobile-only) Quote modal: right-hand padding and Qty column polish (safe-area, measured headers + materials).`
