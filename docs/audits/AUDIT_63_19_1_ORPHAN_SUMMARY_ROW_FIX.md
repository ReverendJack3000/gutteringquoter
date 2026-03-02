# Audit Report: Orphan Summary Row Fix (63.19.1 Follow-up)

**Date:** 2026-03-02  
**Scope:** Fix to remove the summary row when the last member of a group is removed (Remove button on template rows).  
**Constraints:** Desktop vs. mobile production, Railway deployment safety, UI/UX best practices.  
**Auditor role:** Strict Senior QA Engineer.

---

## 1. Change Under Review

**File:** `frontend/modules/admin-products-bonus.js`  
**Location:** Remove button click handler inside `appendMaterialRulesTemplateRow` (lines ~2342–2354).

**Behavior:**
- On "Remove" click for a template row, if the row is a grouped member (`tr.dataset.materialRulesGroupId`), count other member rows in the same `tbody` with that `groupId`.
- If there are no other members (`otherMembers.length === 0`), find and remove the summary row for that `groupId` in the same `tbody`, then remove the current row.
- Otherwise, or if the row is not in a group, only the current row is removed.

---

## 2. Regression & Conflict Check

### 2.1 Desktop vs. Mobile Viewport / CSS

| Check | Result | Notes |
|-------|--------|--------|
| Mobile layout or viewport logic in the fix | **Pass** | No viewport checks, no mobile-specific code. Fix runs only when a template row’s Remove is clicked; Material Rules view is desktop-only. |
| Desktop-only scope preserved | **Pass** | Logic is entirely within the existing Material Rules template table (desktop-only view). No new CSS or DOM used outside that view. |

### 2.2 Backend / API / Database / Railway

| Check | Result | Notes |
|-------|--------|--------|
| Backend / API / DB impact | **Pass** | No backend, API, or DB changes. |
| Railway deployment safety | **Pass** | Frontend-only; no env, build, or dependency changes. |

### 2.3 Existing Behavior (No Regressions)

| Check | Result | Notes |
|-------|--------|--------|
| Remove on non-grouped row | **Pass** | Rows without `groupId` (single template row or “Add Template” row) skip the `if (groupId)` block; only `tr.remove()` runs. Behavior unchanged. |
| Remove when group has multiple members | **Pass** | `otherMembers.length > 0`; summary row is not removed; only the clicked row is removed. Correct. |
| Remove when group has one member (last) | **Pass** | `otherMembers.length === 0`; summary row is removed, then the row. Orphan summary row no longer remains. |
| collectMaterialRulesTemplatesPayload | **Pass** | Collect still uses `tr[data-material-rules-template-row="true"]`. Summary row has no such attribute; removing it does not change which rows are collected. Payload shape and order unchanged. |
| Add Template / repair type drag | **Pass** | Not modified; no impact. |

### 2.4 Order of Operations and DOM

| Check | Result | Notes |
|-------|--------|--------|
| Remove order | **Pass** | Summary row is removed first, then the member row. DOM order is summary then members; removing summary then member is correct and avoids leaving a summary with no members. |
| Dangling references | **Pass** | Summary row and its button are removed together; no need to unbind. Member row’s Remove handler holds references to `tr` and `tbody`; after `tr.remove()`, the row is detached. No obvious leak or stale reference. |

---

## 3. Logic & Selector Safety

| Check | Result | Notes |
|-------|--------|--------|
| groupId source | **Pass** | `groupId` is from `tr.dataset.materialRulesGroupId`, set only by our code as `${section.repairTypeId}-g${groupIndex}`. Not user input. |
| Selector injection (defense-in-depth) | **Pass (hardening applied)** | All selectors that interpolate groupId into data-material-rules-group-id now use CSS.escape(groupId) in the remove handler, expand/collapse handler, and post-render collapse loop. Documented in TROUBLESHOOTING.md and in-code comments. |
| Summary row missing | **Pass** | Code uses `if (summaryRow) summaryRow.remove()`. If the summary was already removed (e.g. duplicate click or edge case), no error. |

---

## 4. UI/UX Practice Standards

| Check | Result | Notes |
|-------|--------|--------|
| No new user-facing strings | **Pass** | No new labels or messages; existing “Remove” button and behavior. |
| Accessibility | **Pass** | No change to focus, ARIA, or keyboard behavior. Removing the summary row removes its Expand button from the accessibility tree as expected. |

---

## 5. Pass/Fail Summary by Category

| Category | Result | Failing / at-risk items |
|----------|--------|--------------------------|
| Mobile layout bleeding into desktop | **Pass** | None. |
| Desktop changes bleeding into mobile | **Pass** | None. |
| Railway deployment safety | **Pass** | None. |
| Backend / API / DB | **Pass** | None. |
| Regression: Remove (grouped vs ungrouped) | **Pass** | None. |
| Regression: collect / save / load | **Pass** | None. |
| Logic: orphan summary row | **Pass** | Fix addresses the previous audit finding. |
| Selector safety (groupId) | **Pass** | Hardening applied: `CSS.escape(groupId)` used in all four selector sites (see §3). |

---

## 6. Conclusion

- The orphan summary row fix behaves as intended: when the last member of a group is removed, the summary row is removed and no orphan remains.
- No regressions found for desktop/mobile, Railway, backend, collect/save/load, or other template/repair-type behavior.
- **Selector hardening applied (2026-03-02):** All attribute selectors that interpolate `groupId` now use `CSS.escape(groupId)` (or a local `escapedId`). See TROUBLESHOOTING.md entry "Material Rules Part Templates: CSS.escape(groupId) in group selectors".
