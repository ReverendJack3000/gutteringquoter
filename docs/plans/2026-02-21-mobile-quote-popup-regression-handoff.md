# Mobile Quote Popup Regression Handoff (Labour Duplicate + Qty 111)

Date: 2026-02-21

## Purpose
Handoff for a fresh debugging chat focused on two mobile quote regressions after the mobile popup editor rollout:

1. Labour row shows duplicate helper lines (appears as two default labour items in UI).
2. Adding a single element can produce `Qty = 111` in mobile quote modal.

## Recent Change Summary (what was modified)
- Mobile quote popup editor expanded from labour-only to all editable quote rows.
- Mobile rows are now summary-first in-table and tap-to-edit via popup.
- Popup save path now applies material qty via existing row handlers.

Primary files changed:
- `frontend/app.js`
- `frontend/styles.css`
- `frontend/index.html`
- `e2e/run.js`
- `docs/tasks/section-54.md`
- `TASK_LIST.md`

## Repro Context
- Mode: mobile (`?viewport=mobile`).
- Open quote modal from canvas with at least one material item.
- Observe labour row helper text duplication and possible qty inflation behavior.

## High-Priority Investigation Map

### A) Duplicate labour helper line / “2 items under labour”
Likely caused by both generic and legacy labour summary nodes being rendered and both displayed.

- Summary node creation for all rows: `frontend/app.js:1272`
- Legacy labour summary creation retained for compatibility: `frontend/app.js:1288`
- Generic summary CSS visible on mobile: `frontend/styles.css:5558`
- Legacy labour summary CSS also visible on mobile: `frontend/styles.css:5559`
- Base hidden rules for summary classes: `frontend/styles.css:4147`

Why suspect this:
- Labour row currently gets `.quote-mobile-line-summary` and `.quote-labour-mobile-summary`.
- Mobile CSS explicitly displays both selectors, so duplicate text appears in product cell.

### B) Qty becoming `111` after single element add
Focus on qty parsing and fallback paths interacting with mobile summary DOM.

- Qty extraction helper (material fallback to `qtyCell.textContent`): `frontend/app.js:1205`
- Mobile summary sync that appends qty summary spans into qty cell: `frontend/app.js:1280`
- Row tagging as mobile editable and hidden inline qty input on mobile: `frontend/app.js:1260`, `frontend/styles.css:5552`
- Material save/apply path from popup: `frontend/app.js:1567`
- Quote elements payload build from table (uses input if present, else text fallback): `frontend/app.js:2741`
- Text fallback that can parse concatenated cell text: `frontend/app.js:2762`
- Material row rebuild and qty input wiring in quote calculation: `frontend/app.js:3186`, `frontend/app.js:3210`, `frontend/app.js:3253`
- Manual overrides capture before table rebuild: `frontend/app.js:3300`, `frontend/app.js:3325`

Why suspect this:
- If a row enters fallback parsing path (`parseFloat(qtyCell.textContent)`), appended summary text in qty/product cells can inflate parsed numbers.
- UI screenshot pattern (`111 x $28.81`) suggests qty state may be derived from repeated/concatenated text representations, then fed back through recalc/rebuild.

## Additional Files/Lines to Cross-Check
- Quote modal initialization and mobile row click handling: `frontend/app.js:1890`, `frontend/app.js:1935`
- Generate quote bootstrap and labour row injection: `frontend/app.js:1957`, `frontend/app.js:2027`
- Labour row creation guard (should be one default unless explicitly duplicated): `frontend/app.js:1724`, `frontend/app.js:1628`
- Full mobile quote regression block (current assertions): `e2e/run.js:1780`
- Popup modal markup (single modal reused for all lines): `frontend/index.html:723`

## Suggested Debug Sequence for New Chat
1. Log summary child counts per labour row after `syncMobileQuoteLineSummaries()`:
   - `.quote-mobile-line-summary`
   - `.quote-labour-mobile-summary`
2. Log qty read source in `getElementsFromQuoteTable()` for affected row:
   - whether `.quote-line-qty-input` exists
   - value of input
   - raw `qtyCell.textContent`
3. Log `manualOverrides` captured before rebuild and `qtyDisplay` used in `renderMaterialRow()`.
4. Add temporary guard to detect multi-summary text contamination before any `parseFloat(qtyCell.textContent)` path.

## Expected Fix Direction (not implemented here)
- Ensure only one visible helper summary line for labour rows on mobile.
- Remove or harden text-content qty fallback for editable material rows (prefer explicit input/data value source).
