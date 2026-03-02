# Plan: Consolidate Part Templates by Type of Part (Desktop Material Rules Only)

**Status:** Implemented (63.19.2.1). Quote-modal profile/size path is out of scope and not planned.

**Goal:** In the **desktop Material Rules** Part Templates view, show one row per logical part (e.g. “Bracket”, “Expansion Joiner”) instead of one row per profile/size variant. Profile/size remain chosen in **Quick Quoter** before Done; resolve and quote modal behaviour are unchanged. Backend and API unchanged.

**Scope:** Desktop admin only. No quote modal changes, no Quick Quoter Done flow changes, no `openQuoteModalForElements` or `getElementsFromQuoteTable` changes.

---

## 1. Implemented Behaviour

- **Part Templates (admin):** Sections per repair type; within each section, template rows are grouped by “logical part” (same product family / profile-size variants). Multi-row groups render as one **summary row** (with repair type label when the section has only one group) and member rows **collapsed** by default; Expand shows the underlying product rows. Single-row groups render as one template row. Save/load and collect use only rows with `data-material-rules-template-row="true"`; summary rows are display-only.
- **Grouping logic** (`frontend/modules/admin-products-bonus.js`): `getMaterialRulesProductFamilyStem(product_id)` for stem (hyphen pattern -SC-/-CL-/-65/-80; colon fallback for display-name-style ids with spacing preserved). `getMaterialRulesTemplateGroupsForSection(rows)` keys by qty, length_mode, stem; rows with empty `product_id` get a unique key so they are not merged. A **merge pass** then combines profile/size variant pairs (SC/CL or 65/80) with same qty and length_mode that ended up in separate groups (e.g. when stem differed).
- **Quote modal:** Unchanged. Profile/size are selected in Quick Quoter; Done calls resolve; quote modal receives resolved product rows as today. No logical rows, no profile/size bar in quote modal.

---

## 2. Key Files and Touch Points (Implemented)

| Area | File(s) | Notes |
|------|---------|--------|
| Stem & grouping | `frontend/modules/admin-products-bonus.js` | `getMaterialRulesProductFamilyStem` ~2018; `getMaterialRulesTemplateGroupsForSection` ~2052 (stem key + variant merge); `formatMaterialRulesGroupSummaryLabel` ~2092. |
| Summary row & render | `frontend/modules/admin-products-bonus.js` | `appendMaterialRulesTemplateGroupSummaryRow` ~2371 (aria-label, expand/collapse); `renderMaterialRulesTemplateSections` ~2406 (single-group section label ~2452). |
| Collect / save | `frontend/modules/admin-products-bonus.js` | Collect uses `tr[data-material-rules-template-row="true"]` only; summary rows excluded. No API change. |
| Backend / quote modal | — | No change. |

---

## 3. Out of Scope (Removed from Plan)

- **Quote-modal profile/size path:** No “Done without profile/size”, no `pendingQuickQuoterSelections`, no logical rows in quote table, no profile/size bar in quote modal, no resolve from quote modal. Quick Quoter continues to require profile/size when applicable before Done; quote modal continues to receive only resolved elements.

---

## 4. Task List

- **63.19.2.1** completed in `docs/tasks/section-63.md`: Part Templates (desktop Material Rules only), one row per repair type, grouping and variant merge as above; quote modal unchanged.
- **63.19.2** (optional profile/size in quote modal) remains in the section file as an optional, separate task; this plan no longer describes that path.
