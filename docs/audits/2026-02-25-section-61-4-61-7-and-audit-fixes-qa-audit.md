# QA Audit Report: Section 61.4–61.7 + Audit Fixes Implementation

**Date:** 2026-02-25  
**Role:** Strict Senior QA Engineer  
**Scope:** Implementation of 61.4 (labour default $33, technician read-only cost), 61.5 (stepper 0.25), 61.6 (minutes when &lt;1 hr), 61.7 (regression), and five QA audit fixes.  
**Constraints:** Desktop vs. Mobile production, Railway deployment safety, UI/UX best practices.  
**Fix applied (2026-02-25):** closeAllModals/closeAccessibleModal doing-it-now abort—see §6 and end of document.

---

## 1. Regression & conflict check

### 1.1 Desktop layout unchanged when viewport is desktop

| Check | Result | Notes |
|-------|--------|------|
| New CSS under `body[data-viewport-mode="mobile"]` only for touch/button audit | **Pass** | Touch-target (44px) and doing-it-now button rules (lines 6825–6836 in styles.css) are scoped to `body[data-viewport-mode="mobile"]`. Desktop keeps 40px. |
| No new desktop-only CSS that could break mobile | **Pass** | No `body:not([data-viewport-mode="mobile"])` or desktop-only rules were added. |
| Labour readonly and labour display (61.4, 61.6) apply on both viewports by design | **Pass** | Section 61 scope: “Apply wherever labour is edited” on both desktop and mobile. `.quote-labour-unit-price-input--readonly` and `formatLabourHoursDisplay()` are viewport-agnostic; intended. |
| Stepper 0.25 (61.5) applied globally to labour only | **Pass** | `createLabourRow`, `getQuoteLineQuantityMeta`, and labour-editor fallbacks are not viewport-dependent; metre inputs remain step 0.5. |

### 1.2 Mobile layout unchanged when viewport is mobile

| Check | Result | Notes |
|-------|--------|------|
| No new mobile-only CSS that could break desktop | **Pass** | All new mobile-specific rules are additive (min-height 44px, align-self) under `body[data-viewport-mode="mobile"]`. |
| Labour editor (mobile) still receives technician read-only behaviour | **Pass** | `renderLabourEditorRows()` shows read-only unit price/markup when `isLabour && isTechnicianRole()`. |
| Quote modal and doing-it-now modal remain viewport-agnostic in DOM/visibility | **Pass** | No change to modal structure or viewport-specific show/hide. |

### 1.3 Cross-viewport bleed (summary)

| Category | Result |
|----------|--------|
| Mobile-only styles accidentally affecting desktop | **Pass** – None. |
| Desktop-only styles accidentally affecting mobile | **Pass** – None. |
| New global styles (readonly class, formatLabourHoursDisplay) correctly apply to both | **Pass** – By design. |

---

## 2. Railway deployment safety

| Check | Result | Notes |
|-------|--------|------|
| No new mandatory env vars | **Pass** | All changes are frontend-only; no new backend or env requirements. |
| No new build steps or dependencies | **Pass** | No new npm/package or build pipeline changes. `atob` / `JSON.parse` used in `getCurrentUserId()` are standard browser APIs. |
| Static assets (HTML/CSS/JS) remain deployable as-is | **Pass** | No change to run script or static serving. |
| JWT decode in `getCurrentUserId()` safe in production | **Pass** | Decode is client-side only; no secret used. Token already in memory; decode is for `sub`/`user_id` fallback when `authState.user` is null. |

---

## 3. UI/UX best practices (strict)

### 3.1 Touch targets (Apple HIG 44pt)

| Element | Result | Notes |
|---------|--------|------|
| Doing-it-now Yes/No buttons on mobile | **Pass** | `body[data-viewport-mode="mobile"] .job-confirm-add-btn, .job-confirm-create-new` set `min-height: 44px`. |
| Co-seller select on mobile | **Pass** | `body[data-viewport-mode="mobile"] .doing-it-now-coseller-select` set `min-height: 44px`. |
| Doing-it-now actions buttons (stretch when one wraps) | **Pass** | `body[data-viewport-mode="mobile"] .doing-it-now-actions .job-confirm-add-btn, .job-confirm-create-new` have `min-height: 44px` and `align-self: stretch`. |
| Desktop job confirm / doing-it-now controls | **Pass** | Remain 40px; no requirement to change for desktop. |

### 3.2 Labour UX (61.4, 61.5, 61.6)

| Check | Result | Notes |
|-------|--------|------|
| Technician labour cost read-only visible (greyed) | **Pass** | `.quote-labour-unit-price-input--readonly` uses background #f5f5f5, color #555, cursor default. |
| Labour hours &lt; 1 hr shown as minutes | **Pass** | `formatLabourHoursDisplay()` returns e.g. "15 min", "30 min", "45 min"; "1 hr" for 1; "X hrs" for &gt;1. |
| Stepper 0.25 available in table and labour editor | **Pass** | `step="0.25"` and `qtyStep` 0.25 used consistently for labour. |

### 3.3 Long “No” button label (audit 5.2)

| Check | Result | Notes |
|-------|--------|------|
| Button layout when label wraps | **Pass** | `align-self: stretch` on mobile keeps both buttons same height when one wraps. |
| Short label or truncation | **Neutral** | Full label retained; no shorter mobile-only copy. Acceptable if layout is sufficient; optional follow-up to add shorter mobile label if needed. |

### 3.4 Accessibility

| Check | Result | Notes |
|-------|--------|------|
| Technician readonly labour input not focusable | **Pass** | `tabIndex = -1` and `readOnly` set on labour unit price input for technician. |
| Labour editor: read-only unit price/markup for technician | **Pass** | Rendered as spans; no editable inputs for rate/markup when technician. |

---

## 4. Logic and lifecycle gaps

### 4.1 closeAllModals does not settle “Doing it now?” Promise or remove listeners

| Check | Result | Notes |
|-------|--------|------|
| Quote closed via hideQuoteModal | **Pass** | `hideQuoteModal()` calls `doingItNowModalAbort()` then closes labour editor and quote modal. Promise is rejected; listeners removed. |
| Quote (and doing-it-now) closed via closeAllModals | **Fail** | `closeAllModals()` (e.g. on auth failure 401/403 or when switching away from permission-restricted views) closes modals by calling `closeAccessibleModal(top.id)` in a loop. When it closes `doingItNowModal`, it does **not** call `doingItNowModalAbort()`. So: (1) The Promise returned by `showDoingItNowModal()` is never settled (no resolve/reject). (2) `handleCreateNew` can remain stuck at `await showDoingItNowModal(...)` if the user had clicked Create New Job and then e.g. session expired. (3) Yes/No click listeners remain attached to the buttons (stale closures / leak). |

**Recommendation:** When `doingItNowModal` is closed by any path other than the Yes/No buttons, the abort path must run. Options: (A) In `closeAccessibleModal()`, when `id === 'doingItNowModal'` and `typeof doingItNowModalAbort === 'function'`, call `doingItNowModalAbort()` before performing the close (and ensure `doingItNowModalAbort` does not call `closeAccessibleModal` to avoid recursion—e.g. abort only removes listeners, rejects Promise, and clears the ref). (B) In `closeAllModals()`, before the loop or when about to close `doingItNowModal`, call `doingItNowModalAbort()` if set. Option (A) keeps all close paths consistent. **Implemented:** Option (A): abort only removes listeners, clears ref, rejects; `closeAccessibleModal` invokes abort when closing `doingItNowModal`; `hideQuoteModal` calls abort then `closeAccessibleModal('doingItNowModal')` so the modal is actually closed.

### 4.2 Co-seller selfId fallback (audit 5.3)

| Check | Result | Notes |
|-------|--------|------|
| getCurrentUserId() used in showDoingItNowModal | **Pass** | `selfId = String(getCurrentUserId() || '').trim()`. |
| Fallback from JWT when authState.user is null | **Pass** | `getCurrentUserId()` decodes token payload for `sub` or `user_id` when `authState.user?.id` is missing. |
| Edge: JWT without sub/user_id | **Pass** | Returns null; `selfId` becomes `''`; filter `t.user_id !== selfId` still excludes no one (same as before), no incorrect inclusion. |

### 4.3 createNewBtn not re-enabled when Promise is rejected (DOING_IT_NOW_ABORTED)

| Check | Result | Notes |
|-------|--------|------|
| handleCreateNew returns on DOING_IT_NOW_ABORTED | **Pass** | `catch (e) { if (e === DOING_IT_NOW_ABORTED) return; throw e; }`. |
| createNewBtn left disabled if quote closed during modal | **Neutral** | When quote is closed via hideQuoteModal, the job confirm overlay is inside the quote modal and is hidden with it, so the button is not visible. Re-enabling the button after abort would be a no-op for the user in that flow. If a future path closed the doing-it-now modal but left the overlay visible, the button could stay in loading state; not the case with current close paths. **Pass** for current behaviour; optional improvement to clear loading state on abort if overlay is ever shown again without closing. |

---

## 5. Summary: Pass/Fail by category

| Category | Result |
|----------|--------|
| Regression: desktop layout / logic | **Pass** |
| Regression: mobile layout / logic | **Pass** |
| Cross-viewport CSS bleed | **Pass** |
| Railway deployment safety | **Pass** |
| UI/UX: Touch targets (44pt mobile) | **Pass** |
| UI/UX: Labour readonly, stepper, minutes display | **Pass** |
| UI/UX: Long “No” button layout | **Pass** (optional shorter label) |
| Logic: hideQuoteModal → abort and settle | **Pass** |
| Logic: closeAllModals → doing-it-now abort/settle | **Pass** (fix applied) |
| Logic: Co-seller selfId fallback | **Pass** |

---

## 6. Bug / gap list (no code changes)

1. **closeAllModals and doing-it-now modal (audit 5.4/5.5 follow-up):** If the user has the “Are you doing it now?” modal open and the app calls `closeAllModals()` (e.g. 401/403 or switching away from a restricted view), the doing-it-now modal is closed but `doingItNowModalAbort()` is never called. The Promise from `showDoingItNowModal()` never settles, so `handleCreateNew` can hang at `await showDoingItNowModal(...)`, and the Yes/No click listeners are never removed. **Fix applied:** (1) `doingItNowModalAbort` now only removes Yes/No listeners, sets the ref to null, and rejects the Promise—it does not call `closeAccessibleModal`. (2) At the start of `closeAccessibleModal(id)`, when `id === 'doingItNowModal'` and `doingItNowModalAbort` is set, we call `doingItNowModalAbort()` before performing the close, so any close path (including `closeAllModals`) settles the Promise and removes listeners. (3) In `hideQuoteModal`, after calling `doingItNowModalAbort()` we call `closeAccessibleModal('doingItNowModal')` so the modal is actually closed and removed from the stack.

---

*Fix for item 1 applied 2026-02-25.*
