# Plan: 54.93.9.1 – Mobile quote modal: Product vs Qty column visual separation

**Date:** 2026-02-21  
**Section:** 54 (Mobile app)  
**Task:** 54.93.9.1 – Mobile quote: Product vs Qty column visual separation  
**Scope:** Mobile-only full-screen quote modal; desktop quote table and layout unchanged; CSS-only; Railway-safe.

---

## 1. Goal

Improve the visual separation between the **Product** column (left, 70%) and **Qty** column (right, 30%) in the mobile-only full-screen quote modal. Currently separation is mostly whitespace and alignment; we want a clearer column split (e.g. vertical divider or column edge) without changing desktop.

---

## 2. Context (verified against code)

### 2.1 Mobile quote table CSS (current)

- **File:** `frontend/styles.css`
- **Block:** `body[data-viewport-mode="mobile"] #quoteModal .quote-parts-table` and related selectors, approx. **5644–5812** (table, thead/tbody, th/td, first-child flex, remove/plus, stepper, column widths, hidden columns).
- **Table rules (5644–5653):** `width: 100%`, `table-layout: fixed`, `border-top` / `border-bottom: 1px solid #e5e7eb`, no column borders.
- **th/td (5655–5659):** `padding: 10px 8px`, `border: none`, `border-bottom: 1px solid #e5e7eb` (54.92 horizontal row dividers — **must be preserved**).
- **Column widths (5800–5804):** `th:nth-child(1)`, `td:nth-child(1)` → 70%; `th:nth-child(2)`, `td:nth-child(2)` → 30%. Columns 3–6 hidden on mobile.
- **First column (5684–5745):** `tbody td:first-child` flex layout, product cell, `.quote-row-remove-x`, `.quote-row-add-plus` (33% size); 44px stepper in col 2 — **touch targets and layout must be preserved**.

### 2.2 Desktop (must remain unchanged)

- **Global table:** `.quote-parts-table` at **4051–4090** (border 1px solid #e0e0e0, 6 columns, padding, etc.).
- **Desktop quote modal:** `body:not([data-viewport-mode="mobile"]) .quote-parts-table` at **5530–5534** (margin, min-width, font-size).
- No changes may be made to these blocks or to any selector that affects desktop quote layout.

### 2.3 HTML

- Quote modal: `#quoteModal`; table: `#quotePartsTable` with class `.quote-parts-table`. No HTML or JS changes required for this task.

---

## 3. Implementation plan

### 3.1 Approach

Add a **vertical divider** between Product and Qty by giving the Qty column a left border. This:

- Keeps the Product cell (nth-child(1)) layout untouched (flex, remove/plus, summary).
- Uses the same border color as the existing horizontal row dividers (`#e5e7eb`) for consistency.
- Is one rule set, mobile-scoped only, no new DOM and no JS.

### 3.2 CSS change (mobile-only)

- **Where:** `frontend/styles.css`, inside the existing `body[data-viewport-mode="mobile"] #quoteModal` block, **after** the column-width rules (after 5804) and **before** any following mobile quote rules (e.g. 5806+).
- **What:** Add a single rule that applies a left border to the second column (header and cells):

```css
/* 54.93.9.1: vertical divider between Product and Qty */
body[data-viewport-mode="mobile"] #quoteModal .quote-parts-table th:nth-child(2),
body[data-viewport-mode="mobile"] #quoteModal .quote-parts-table td:nth-child(2) {
  border-left: 1px solid #e5e7eb;
}
```

- **Why `border-left` on nth-child(2):** Puts a single vertical line at the left edge of the Qty column; no risk of doubling borders or affecting the first column’s flex layout. Color matches 54.92 row dividers.

### 3.3 What not to do

- Do **not** add or change rules under `body:not([data-viewport-mode="mobile"])` or global `.quote-parts-table` (4051–4090, 5530).
- Do **not** remove or alter `border-bottom` on th/td (54.92 horizontal dividers).
- Do **not** change padding/widths in a way that shrinks 44px touch targets for stepper or remove/plus.
- No HTML or JS changes.

---

## 4. Verification

1. **Desktop:** Open quote modal on desktop; table layout, borders, and column count unchanged (still 6 columns, existing grid).
2. **Mobile:** Open quote modal in mobile viewport (`?viewport=mobile` or narrow width); Product (left) and Qty (right) show a clear vertical separation; horizontal row dividers unchanged.
3. **Regression:** Run `npm test`; no failures. Deploy remains Railway-safe (CSS-only).

---

## 5. Task list update (after implementation)

- In **`docs/tasks/section-54.md`**, mark task **54.93.9.1** as complete: `- [x] **54.93.9.1** ...`
- If section 54.93.9 is then fully complete, remove the 54.93.9.1 row from the **Uncompleted tasks** table in **`TASK_LIST.md`** (per task-list-completion rule).

---

## 6. Edge cases and accessibility

- **High contrast / zoom:** 1px `#e5e7eb` is subtle; if product later adopts a stronger “column edge” (e.g. 2px or darker token), it can be swapped here without changing structure.
- **RTL:** Not in scope for this MVP; if RTL is added later, consider `border-inline-start` instead of `border-left` for the divider.
- **Touch targets:** Divider is decorative only; 44px stepper and 15px remove/plus in col 1 are unchanged; no new interactive elements.

---

*Plan based on TASK_LIST.md, docs/tasks/section-54.md, frontend/styles.css (5644–5812, 4051–4090, 5530), and README.md. No assumptions beyond the codebase.*
