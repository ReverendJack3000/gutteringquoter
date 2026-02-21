# Plan: Confirm Job Details popup – equal height for three financial columns

**Date:** 2026-02-22  
**Scope:** Quote modal → Job Confirm overlay → financial row (Current Job Total | + This Quote | = New Total).  
**Goal:** Make the three `.job-confirm-financial-col` divs the same height so "= NEW TOTAL" is not shorter than the other two.  
**Constraint:** No code changes until plan approved; desktop and mobile both in production; changes must not break Railway deploy.

---

## 1. Context (verified from codebase)

- **Single codebase:** Desktop and mobile share the same Quote modal and Confirm Job overlay (`#jobConfirmOverlay`). Layout is adaptive (viewport + optional `data-viewport-mode="mobile"`).
- **Relevant files:**
  - **HTML:** `frontend/index.html` — `#jobConfirmOverlay` → `.job-confirm-card` → `.job-confirm-financial` → three `.job-confirm-financial-col` (`.job-confirm-financial-col--current`, `--quote`, `--new`).
  - **CSS:** `frontend/styles.css` — `.job-confirm-financial` (4877–4890), `.job-confirm-financial-col` (4890–4901), responsive block at 4938–4960 (max-width: 520px stacks columns), mobile-only rule at 5971 (hides `.job-confirm-financial-gst` on mobile).
  - **JS:** `frontend/app.js` — populates `#jobConfirmCurrent`, `#jobConfirmQuote`, `#jobConfirmNew` (and GST spans); no structural changes needed for this task.
- **Task list:** Section 51, task **51.7** (“Confirm Job Details popup: Further refine UI (spacing, alignment, typography, responsive behaviour) as needed”). This plan adds an explicit sub-task **51.7.1** for the equal-height refinement.

---

## 2. Root cause (no assumptions)

- **Current behaviour:** `.job-confirm-financial` is a grid with `grid-template-columns: 1fr 1fr 1.2fr` and **`align-items: start`** (line 4884). So each column’s height is determined only by its own content.
- **Observed heights (user):** `--current` and `--quote` ≈ 90px; `--new` ≈ 76px. The third column has less content or wraps to fewer lines (e.g. one line for “= NEW TOTAL $290.00” plus optional GST span), so it ends up shorter.
- **Conclusion:** The height difference is caused by content-driven row height plus `align-items: start`. No bug in HTML or JS structure.

---

## 3. Proposed fix (CSS only)

- **Change:** In `frontend/styles.css`, in the rule `.job-confirm-financial` (around line 4884), replace **`align-items: start`** with **`align-items: stretch`**.
- **Effect:** In the horizontal 3-column layout, all three grid cells (the three `.job-confirm-financial-col` divs) will stretch to the same height (the height of the tallest column). Column content stays top-aligned because `.job-confirm-financial-col` already uses `display: flex; flex-direction: column; justify-content: flex-start`.
- **Responsive (max-width: 520px):** The grid becomes a single column (`grid-template-columns: 1fr`); each column is in its own row. `align-items: stretch` still applies but each row has one cell, so behaviour is unchanged (no regression).
- **Mobile viewport:** No `data-viewport-mode="mobile"`-specific override is needed; the same modal and CSS apply. The only mobile-specific rule for this block is hiding `.job-confirm-financial-gst` (5971), which does not affect column height logic.

---

## 4. Desktop vs mobile impact

- **Desktop:** Same modal; the three columns will become equal height. No other layout or behaviour change.
- **Mobile:** Same fix; when the Confirm Job popup is shown in mobile view (e.g. portrait), the horizontal layout (if breakpoint &gt; 520px) gets equal-height columns; when stacked (≤520px), rows are unchanged. No mobile-only code.

---

## 5. What we are not changing

- **HTML:** No change to `index.html` (no new classes or structure).
- **JS:** No change to `app.js` (content and IDs stay as-is).
- **Other CSS:** No `min-height` on columns (stretch is sufficient); no new media queries or viewport-mode scoping for this fix.
- **Railway / build:** No new env vars, no new build step; static CSS only. Deploy remains valid.

---

## 6. Verification (after implementation)

1. **Desktop:** Open Quote modal → trigger Confirm Job flow → confirm the three financial columns (Current | + Quote | = New Total) have the same height in the horizontal layout.
2. **Narrow (≤520px):** Resize or use device toolbar so the financial block stacks; confirm no overflow or visual regression.
3. **Mobile viewport:** With `?viewport=mobile` or real device, open Confirm Job popup; confirm equal heights when in horizontal layout and no regression when stacked.
4. **E2E / deploy:** Run `./scripts/run-server.sh` and quick smoke test; ensure `npm test` (if run) and Railway deploy still succeed.

---

## 7. Task list update (after implementation)

- In **`docs/tasks/sections-49-53.md`:** Add sub-task **51.7.1** under 51.7: “Equalise height of the three job-confirm financial columns (Current | + Quote | = New Total).” When the fix is done, mark **51.7.1** as `[x]`. If no other 51.7 refinements remain, mark **51.7** as `[x]` and remove the 51 row from the uncompleted table in **`TASK_LIST.md`** when section 51 is fully complete.
- **`TASK_LIST.md`:** The uncompleted table already has “51 | 51.7, 51.8 | Confirm Job popup UI refine; …”. No change to the table until 51.7 (and 51.7.1) are complete; then remove the 51 row if nothing else is pending in section 51.

---

## 8. Summary

| Item | Detail |
|------|--------|
| **Change** | One line in `frontend/styles.css`: `.job-confirm-financial` → `align-items: stretch` (replace `start`). |
| **Risk** | Low; layout-only, no logic. |
| **Desktop** | Unaffected except equal column heights (improvement). |
| **Mobile** | Same improvement; no separate code path. |
| **Railway** | No impact. |

This plan is based only on the current code and your reported heights; no assumptions or oversights intended. Once approved, the single CSS change and the section-file task update (51.7.1) can be applied.
