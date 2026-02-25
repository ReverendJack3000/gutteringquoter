# Plan: Section 61.4–61.7 + QA audit fixes (no code changes yet)

**Date:** 2026-02-25  
**Branch:** feature/61-1-technician-create-new-job-only  
**Scope:** 61.4 (labour default $33, technician read-only cost), 61.5 (stepper 0.25), 61.6 (minutes when &lt;1 hr), 61.7 (regression), plus five QA audit findings.  
**Constraint:** All section-61 tasks apply to **both desktop and mobile** unless stated; user requested **mobile-only** for audit UI/accessibility fixes (touch targets, button label).

---

## 1. Task 61.4 – Default labour cost $33; technicians cannot edit labour cost

### 1.1 Default $33

- **`getDefaultLabourUnitPrice()` (app.js ~2498–2500)**  
  - Currently: `cachedLabourRates.find(r => r.id === 'REP-LAB') || cachedLabourRates[0]` then `rate ? Number(rate.hourlyRate) : 100`.  
  - Change: fallback when no rate from `100` → `33`. So: `return rate ? Number(rate.hourlyRate) : 33;`
- **`getLabourCostPrice()` (app.js ~2503–2507)**  
  - Used for markup calculation in labour editor; fallback is 35. Task specifies “default labour cost … $33” as the **unit price** (selling price). Cost price fallback can remain 35 unless product provides it; no change required for 61.4.
- **Labour rates source:** `cachedLabourRates` is populated from `GET /api/labour-rates` (~2924–2931). If REP-LAB is in that response with an hourly rate, that is used; otherwise default 33. No backend change for 61.4.

### 1.2 Technician: labour cost read-only (both desktop and mobile)

- **Quote table labour row (desktop and mobile table):**
  - **`createLabourRow()` (app.js ~2527–2620)**  
    - After creating `unitPriceInput` (~2571–2577), when `isTechnicianRole()`: set `unitPriceInput.readOnly = true` and add a class (e.g. `quote-labour-unit-price-input--readonly`) for styling; optionally set `tabIndex = -1` so it’s not focusable. Keep `hoursInput` editable (no change).
  - **Existing labour rows:** When quote table is built or refreshed, labour rows already in the DOM need the same treatment. Any code that (re)builds or syncs labour rows (e.g. `ensureLabourRowsExist`, rebuild from `getElementsFromQuoteTable`, or initial open) must apply technician read-only to unit price. If the table is built only via `createLabourRow` and existing rows are not recreated on role change, consider a small helper that runs on quote open or when authState.role is known: query all `.quote-labour-unit-price-input` inside `.quote-row-labour` and set readOnly + class when `isTechnicianRole()`.
- **Mobile labour editor modal:**
  - **`renderLabourEditorRows()` (app.js ~2077–2283+)**  
    - When `isLabour && isTechnicianRole()`: do **not** render editable `rateEditor` or `markupEditor`. Instead show Unit Price (and optionally Markup) as read-only text (e.g. `unitValue`-style span with `formatCurrency(quoteLineEditorState.draftUnitPrice)`). Quantity (qty stepper and input) stays editable. Purchase Cost can remain read-only as now. This avoids technicians changing unit price or markup in the labour editor.
  - **`openLabourEditorModal`** – no change; state is already read from row. Apply logic in render only.
- **Places that read/write labour unit price:**  
  - `updateLabourRowTotal(row)` – reads unit price from input; with input read-only, value is still in the field, so no change.  
  - Duplicate labour row (dupBtn in `createLabourRow`): copies current row’s unit price; new row’s unit price input must also be set read-only when technician (handled if new row is created via `createLabourRow`).  
  - `revertLabourEditorToInitial` – only reverts when not technician or when technician only changed qty; no change needed.  
  - Add Labour Line in labour editor (~2976–2989): `quoteLineEditorState.qtyStep = 0.5` (will become 0.25 in 61.5); new row gets default unit price from `getDefaultLabourUnitPrice()` (33); when rendered in editor, technician sees read-only unit price.

### 1.3 Desktop vs mobile

- 61.4 applies to **both**: quote table is shared; labour editor is mobile-only in practice but the “wherever labour is edited” includes desktop table. So technician read-only in table (desktop + mobile) and in labour editor (mobile).

---

## 2. Task 61.5 – Labour stepper 0.25 increments

- **`createLabourRow()` (app.js ~2557):** `hoursInput.step = '0.5'` → `hoursInput.step = '0.25'`.
- **`getQuoteLineQuantityMeta()` (app.js ~1636–1638):** For labour row, return `step: 0.5` → `step: 0.25`.
- **Labour editor:** `quoteLineEditorState.qtyStep` is set from `getQuoteLineQuantityMeta(row)` in `openLabourEditorModal` (~2472) and hardcoded `0.5` when adding new labour row (~2978). Change the hardcode to `0.25`; the meta already comes from the row so once `getQuoteLineQuantityMeta` returns 0.25, editor will use it. Fallbacks that use labour step: `renderLabourEditorRows` (~2095–2097) uses `isLabour ? 0.5 : 1` when qtyStep not set → change to `isLabour ? 0.25 : 1`. `isQuoteLineEditorDirty` (~2036–2039) same fallback → `0.25` for labour.
- **Gutter/downpipe metres:** Step 0.5 in `.quote-header-metres-input` (~1717, 4411, 4469) is for **metres**, not labour; leave unchanged.
- Apply on **both desktop and mobile** (task wording).

---

## 3. Task 61.6 – Show minutes when total labour hours &lt; 1

- **`formatLabourHoursDisplay(hours)` (app.js ~1549–1553):**  
  - Currently: `if (!Number.isFinite(hours) || hours <= 0) return '0 hrs';` then `rounded` and `${rounded} hrs`.  
  - Change: when `rounded < 1` and `rounded > 0`, display as minutes: `Math.round(rounded * 60)` min (e.g. 0.25 → "15 min", 0.5 → "30 min", 0.75 → "45 min"). When `rounded >= 1`, keep "X hrs" (e.g. "1 hrs" or "1 hr" – consider singular "1 hr"). Zero stays "0 hrs".
- **Call sites (all in app.js):**  
  - ~1834: mobile summary / quote line display – will show minutes when &lt; 1 hr.  
  - ~1901, ~1953: valueSpan for labour – same.  
  No other call sites need changing; single function covers desktop and mobile.

---

## 4. Task 61.7 – Regression and role safety

- After 61.4–61.6:  
  - Verify editor/admin: Add to Job and Create New Job both available; no “doing it now?” modal.  
  - Technician: only Create New Job; mandatory pop-up appears; labour default 33, labour cost read-only, quantity editable; stepper 0.25; minutes when &lt; 1 hr.  
  - No broken quote or ServiceM8 flows.  
- Document in BACKEND_DATABASE or deployment docs only if any backend/permission change is made (none planned for 61.4–61.6).

---

## 5. QA audit fixes (docs/audits/2026-02-25-section-61-1-61-3-qa-audit.md)

### 5.1 Touch targets (44pt) – **mobile only**

- **styles.css:**  
  - Under `body[data-viewport-mode="mobile"]`:  
    - `.job-confirm-add-btn`, `.job-confirm-create-new`: increase `min-height` from 40px to 44px (for the doing-it-now Yes/No buttons that use these classes).  
    - `.doing-it-now-coseller-select`: `min-height` from 40px to 44px.  
  - Do **not** change desktop (40px remains) unless product accepts global 44px.

### 5.2 Long “No” button label – **mobile only**

- **index.html ~1166:** Button text “No, I can't do it now — please get the office to schedule” can wrap on narrow viewports.  
  - Option A: Add a shorter `data-short-label` or second span visible only on mobile (e.g. “No — get office to schedule”) and toggle via CSS or JS by viewport.  
  - Option B: In CSS, under `body[data-viewport-mode="mobile"]`, ensure `.doing-it-now-actions` (or the two buttons) have consistent min-height so when one wraps both buttons align (e.g. `min-height: 44px`, flex/grid).  
  - Prefer Option B first (layout); if copy is still too long, add shorter mobile label (Option A).

### 5.3 Co-seller: authState.user null

- **`showDoingItNowModal` (app.js ~15076):** `const selfId = String(authState.user?.id || '').trim();`  
  - When `authState.user` is null, `selfId` is `''`, so `t.user_id !== selfId` never filters out the current user.  
  - Fix: Derive current user id from a fallback when `authState.user` is null. Options: (1) Decode JWT (authState.token) for `sub`/user id if available; (2) Add a small endpoint that returns current user id; (3) Ensure authState.user is always set when token is present (investigate why it might be null). Prefer (3) first; if not feasible, (1) with a single decode helper. Document the chosen approach in TROUBLESHOOTING.md if it’s an edge case.

### 5.4 Quote modal closed while “Doing it now?” open – Promise and stack

- **Problem:** `hideQuoteModal()` (~1122) calls `closeAccessibleModal('labourEditorModal')` then `closeAccessibleModal('quoteModal')`. Doing-it-now modal is inside quote modal in DOM. When quote is closed, doingItNowModal is hidden by containment but is not explicitly closed; the Promise in `showDoingItNowModal` is never resolved, so `handleCreateNew` stays at `await showDoingItNowModal(...)`.
- **Fix:**  
  - In `hideQuoteModal()`, before or after closing quote modal, call `closeAccessibleModal('doingItNowModal')` so it’s removed from the stack and hidden.  
  - To avoid hanging Promise: store the Promise’s resolve/reject (or a single “settle” callback) in a module-level variable (e.g. `doingItNowModalSettle`) that `showDoingItNowModal` assigns when creating the Promise. When quote modal is closed (e.g. in `hideQuoteModal` or in `quoteModal`’s `onClose`), if doingItNowModal was open, call the stored settle with `{ doingItNow: false, coSellerUserId: null }` (or reject with a sentinel) so `handleCreateNew` continues. Then close doingItNowModal.  
  - Ensure `closeAccessibleModal('doingItNowModal')` is invoked when quote closes so the modal stack is consistent (and listeners can be cleared in that path if needed).

### 5.5 Listener cleanup when modal closed by non–Yes/No path

- **Problem:** Yes/No click listeners in `showDoingItNowModal` are only removed in `closeWith` (on button click). If doingItNowModal is closed by another path (e.g. quote close), listeners remain and Promise was not settled (covered by 5.4).  
- **Fix:** When closing doingItNowModal by any path other than Yes/No: (1) Remove the Yes/No listeners (requires keeping references to `onYes`/`onNo` or a single teardown function), and (2) Settle the Promise (resolve or reject) so handleCreateNew doesn’t hang. Implementing 5.4 (quote close closes doingItNowModal and settles the Promise) should include a single “abort” path that removes listeners and settles. Expose a small API: e.g. `abortDoingItNowModal(reason)` that removes listeners, settles the stored Promise with a default or rejection, and closes the modal. Call it from `hideQuoteModal` (and any future “close all” that closes quote).

---

## 6. Implementation order (no assumptions)

1. **61.4** – Default 33 + technician read-only (getDefaultLabourUnitPrice; createLabourRow unit price readOnly; renderLabourEditorRows read-only unit price/markup for technician; optional sync of existing labour rows on open).
2. **61.5** – Stepper 0.25 (createLabourRow step; getQuoteLineQuantityMeta; labour editor qtyStep fallbacks and add-row hardcode).
3. **61.6** – formatLabourHoursDisplay minutes when &lt; 1 hr.
4. **61.7** – Regression checks (manual + doc).
5. **Audit 5.1, 5.2** – CSS/HTML (mobile touch targets, button layout/label).
6. **Audit 5.3** – Co-seller selfId fallback.
7. **Audit 5.4, 5.5** – Quote-close closes doing-it-now, settle Promise, listener cleanup (unified abort path).

---

## 7. Files to touch (summary)

| Area | File | Changes |
|------|------|--------|
| 61.4 | app.js | getDefaultLabourUnitPrice fallback 33; createLabourRow unitPriceInput readOnly + class when isTechnicianRole(); renderLabourEditorRows show read-only unit price/markup for technician when isLabour; optional sync existing labour rows for technician. |
| 61.5 | app.js | createLabourRow hoursInput.step = '0.25'; getQuoteLineQuantityMeta labour step 0.25; labour editor qtyStep fallbacks 0.25 and add-row 0.25. |
| 61.6 | app.js | formatLabourHoursDisplay: &lt; 1 hr → minutes. |
| 61.7 | — | Verification only; docs if any backend change. |
| Audit 5.1–5.2 | styles.css, index.html | Mobile-only 44px min-height; doing-it-now button layout/label. |
| Audit 5.3 | app.js | showDoingItNowModal selfId fallback when authState.user null. |
| Audit 5.4–5.5 | app.js | hideQuoteModal (or quote onClose) close doingItNowModal + settle Promise; stored settle + teardown; abortDoingItNowModal-style path. |

---

## 8. Edge cases and oversight checks

- **Existing labour rows loaded from saved project:** When quote is opened with existing labour rows, they are in the DOM; technician read-only must apply. Either ensure they’re created via createLabourRow (so they get readOnly at creation) or run a one-time sync over existing `.quote-row-labour .quote-labour-unit-price-input` when quote modal opens and role is technician.
- **Role change during session:** If role were to change with quote open, labour inputs would need re-sync; current design assumes role is stable for the session; no extra handling unless required.
- **Desktop quote table:** Labour rows on desktop use the same createLabourRow and same class names; technician read-only in table applies to desktop as well.
- **Labour editor only on mobile:** `openLabourEditorModal` guards with `isMobileQuoteViewport()`; so labour editor is only used on mobile; read-only unit price/markup there is mobile-only in practice, but the task says “wherever labour is edited” so covering it is correct.
- **REP-LAB not in labour-rates:** If `/api/labour-rates` doesn’t return REP-LAB, getDefaultLabourUnitPrice already falls back to first rate or 100; changing to 33 only affects the “no rate” case.
- **61.6 “1 hr” vs “1 hrs”:** formatLabourHoursDisplay could use singular “1 hr” when rounded === 1 for grammar; task says “1 hr” in example.

No code changes have been made; this plan is for approval and then implementation.
