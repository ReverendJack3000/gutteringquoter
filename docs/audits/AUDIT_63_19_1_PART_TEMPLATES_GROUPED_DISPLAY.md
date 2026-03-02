# Audit Report: Task 63.19.1 – Admin Part Templates Grouped Display

**Date:** 2026-03-02  
**Scope:** Phase 1 implementation (grouping helper, summary rows, expand/collapse, CSS).  
**Constraints:** Desktop vs. mobile production, Railway deployment safety, UI/UX best practices.  
**Auditor role:** Strict Senior QA Engineer.

---

## 1. Regression & Conflict Check

### 1.1 Desktop vs. Mobile Viewport / CSS Bleed

| Check | Result | Notes |
|-------|--------|--------|
| Mobile layout rules accidentally applied in desktop viewport | **Pass** | No new mobile-specific CSS or media queries were added. |
| Desktop-only changes accidentally applied in mobile viewport | **Pass** | Material Rules view is desktop-only (menu hidden when `!canAccessDesktopAdminUi()`, route guard at `view-material-rules`). New classes (`.material-rules-group-*`) are only rendered inside that view. |
| New CSS scoped to avoid affecting other views | **Pass** | All new selectors are under `.material-rules-*` and only appear in the Part Templates table. |
| Consistency with existing Material Rules scoping | **Minor gap** | One existing rule uses `#view-material-rules .material-rules-form-group--product-assignments-hidden`. New Phase 1 rules do **not** use `#view-material-rules` prefix. They rely on the fact that these classes are only ever created inside that view. **Recommendation (hardening):** Optionally prefix new group styles with `#view-material-rules` for consistency and to guarantee no future bleed if the same class names are ever used elsewhere. |

### 1.2 Backend / API / Database

| Check | Result | Notes |
|-------|--------|--------|
| No schema or migration change | **Pass** | No backend or DB changes. |
| No change to payload shape or collect logic | **Pass** | `collectMaterialRulesTemplatesPayload()` still uses `#materialRulesTemplateGroups tr[data-material-rules-template-row="true"]`; summary rows are excluded; payload shape and order preserved. |
| Resolver and admin API unchanged | **Pass** | No changes to `quick_quoter.py` or Material Rules API. |

### 1.3 Railway Deployment Safety

| Check | Result | Notes |
|-------|--------|--------|
| No new env vars or build steps | **Pass** | None introduced. |
| No new dependencies | **Pass** | None. |
| Static frontend only (no backend change) | **Pass** | Changes are HTML/CSS/JS only; deploy path unchanged. |

### 1.4 Existing Behavior (No Regressions)

| Check | Result | Notes |
|-------|--------|--------|
| Save/load still emits correct flat template list | **Pass** | Collect iterates template rows in DOM order; summary rows have no `data-material-rules-template-row`, so they are skipped. |
| Add Template still appends one row to section tbody | **Pass** | Add Template handler unchanged; new row has no `groupId`, so it renders as a single ungrouped row. |
| Repair type drag-and-drop unchanged | **Pass** | Template rows do not have drag handles; only repair type rows do. No change to `bindMaterialRulesTableRowReorder` or its call sites. |
| sort_order computation in collect | **Pass** | Running count per `repairTypeId` is unchanged; DOM order of template rows is preserved (summary rows omitted from collection). |

---

## 2. Logic & UX Gaps (Bugs / Missing Cleanup / Edge Cases)

### 2.1 Orphan summary row when all member rows are removed

| Severity | Finding |
|----------|--------|
| **Medium** | If the user removes **every** member row in a group (via each row’s “Remove” button), the **summary row remains** in the DOM. It has no `data-material-rules-template-row`, so it is not collected on save. On **reload**, that group disappears (no rows), so data is correct. **In-session:** the user is left with a summary row (e.g. “EC (SC/CL)”) that cannot be removed and no longer has an “Expand” to show content. **Recommendation:** When the last member row of a group is removed, remove the corresponding summary row from the DOM, or hide it and treat the group as empty until next load. |

### 2.2 Single-row group after partial remove (cosmetic)

| Severity | Finding |
|----------|--------|
| **Low** | If the user removes all but **one** member in a group, the UI still shows “summary row + one member row” until the next save/reload. After reload, that group becomes a single template row (no summary). **Recommendation:** Optional: on Remove, if the group has exactly one remaining member, re-render that section to show a single row (no summary) for a consistent “one row per logical part” experience in-session. Not required for correctness. |

### 2.3 Expand button: focus and keyboard

| Severity | Finding |
|----------|--------|
| **Low** | The Expand/Collapse button has `aria-label` and `aria-expanded`. No focus management when expanding (e.g. focus does not move to the first editable control in the expanded rows). Keyboard-only users can still expand and then tab into the first control. **Recommendation:** Optional: on Expand, move focus to the first focusable control in the first visible member row for faster keyboard flow. |

### 2.4 Collapsed state: screen reader and semantics

| Severity | Finding |
|----------|--------|
| **Low** | When a group is collapsed, member rows use `display: none`, so they are not exposed to assistive tech. The summary row exposes only the Expand button (with aria-expanded). The summary **label** (e.g. “EC (SC/CL)”) is in a `<span>`, which is fine. **Recommendation:** Optional: add a short live region or aria-description so screen reader users understand that expanding reveals editable rows for that logical part. |

---

## 3. UI/UX Practice Standards

| Check | Result | Notes |
|-------|--------|--------|
| Summary label and control escaped (XSS) | **Pass** | `summaryLabel` and `expandLabel` are passed through `escapeHtml()` in the summary row markup. |
| groupId in selector safe from injection | **Pass** | `groupId` is built from `section.repairTypeId` and `groupIndex` (no user input). |
| Expand/Collapse semantics | **Pass** | Button has `aria-expanded` and `aria-label` updated on toggle. |
| Touch target (desktop-only) | **Pass** | Expand button has padding 4px 8px; feature is desktop-only admin UI. Apple HIG 44px minimum is not strictly required here; acceptable for desktop. |
| Table structure valid | **Pass** | Summary row is a single `<tr>` with one `<td colspan="7">`; column count matches thead (7). |

---

## 4. Pass/Fail Summary by Category

| Category | Result | Failing / at-risk items |
|----------|--------|--------------------------|
| **Mobile layout bleeding into desktop** | **Pass** | None. |
| **Desktop changes bleeding into mobile** | **Pass** | None; view is desktop-only and not navigable on mobile. |
| **Railway deployment safety** | **Pass** | None. |
| **Backend / API / DB** | **Pass** | None. |
| **Regression: collect / save / load** | **Pass** | None. |
| **Regression: Add Template / drag** | **Pass** | None. |
| **Logic / edge cases** | **Fail** | Orphan summary row when all members removed (medium). |
| **UX polish (optional)** | **Minor** | Single-row-after-remove display, focus on expand, screen reader hint (all low/optional). |
| **CSS scoping consistency** | **Minor** | New rules could be prefixed with `#view-material-rules` for hardening. |

---

## 5. Conclusion

- **No regressions** to desktop or mobile layout, collect/save/load, Add Template, or drag-and-drop.  
- **No impact** on Railway deployment or backend/API/DB.  
- **One logic gap:** orphan summary row when all member rows are removed (fix: remove or hide summary when the last member is removed).  
- **Optional improvements:** in-session single-row group display, focus management on expand, screen reader hint, and `#view-material-rules` CSS prefix for consistency.

No fix code has been written; awaiting your approval on this audit before implementing any changes.
