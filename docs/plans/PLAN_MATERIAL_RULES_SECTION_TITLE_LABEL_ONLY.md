# Plan: Material Rules Part Templates – section titles label-only (remove repair_type_id from heading)

**Status:** Not started (plan only).  
**Goal:** In the desktop admin Material Rules → Part Templates view, show only the human-readable repair type label in each section heading (the `<h4>`), not the technical ID in parentheses. Example: change "Expansion Joiner Replacement (expansion_joiner_replacement)" to "Expansion Joiner Replacement".

**Scope:** Desktop admin Material Rules Part Templates section headings only. No backend or API changes. No mobile (Material Rules is desktop-only). Railway-safe.

---

## 1. Current behaviour (code-accurate)

- **Section headings** are built in `renderMaterialRulesTemplateSections()` in `frontend/modules/admin-products-bonus.js` (lines 2422–2492).
- **Data source:** `getMaterialRulesTemplateSections()` (lines 1990–2026) returns sections with `repairTypeId`, `label`, `isUnknown`, `rows`. For known repair types, `label` comes from `repairType?.label` (API) or fallback `repairTypeId` (line 2005). For unknown types, `label` is the repairTypeId (line 2020).
- **Current title logic (lines 2435–2438):**
  - Known sections: `sectionTitleRaw = \`${section.label} (${section.repairTypeId})\``, then `sectionTitle = sectionTitleRaw.replace(/:/g, '')`.
  - Unknown sections: `sectionTitleRaw = \`Unknown repair type: ${section.label}\``, then same colon strip.
- **Consumers of `sectionTitle`:**
  - Line 2441: `<h4>${escapeHtml(sectionTitle)}</h4>` inside `.material-rules-template-section-head`.
  - Line 2445: table `aria-label="Templates for ${escapeHtml(sectionTitle)}"`.
- **ID remains in DOM:** `sectionEl.dataset.repairTypeId = section.repairTypeId` (line 2434); Add Template button and tbody also have `data-repair-type-id`. No functional change to save/load or navigation.

**Conclusion:** Use only the human-readable `section.label` (with colons stripped) for the visible title. The repair_type_id stays on the section element for any JS that needs it.

---

## 2. Implementation (when approved)

**Single change** in `frontend/modules/admin-products-bonus.js` in `renderMaterialRulesTemplateSections()`:

- Replace the two-line title logic (lines 2435–2438) with a single `sectionTitle` that does not append `(${section.repairTypeId})` for known sections:
  - **Known sections:** `sectionTitle = section.label.replace(/:/g, '')`.
  - **Unknown sections:** keep current behaviour: `sectionTitle = \`Unknown repair type: ${section.label}\`.replace(/:/g, '')`.
- Remove the intermediate `sectionTitleRaw` variable (use one variable `sectionTitle` only).
- No change to the rest of the template (h4 and aria-label already use `sectionTitle`).

**No changes to:** backend, API, HTML structure elsewhere, `getMaterialRulesTemplateSections()`, dataset attributes, or mobile. If any E2E or tests assert on the exact string "Expansion Joiner Replacement (expansion_joiner_replacement)" in the heading, update them to assert "Expansion Joiner Replacement" only (none found in repo at plan time).

---

## 3. Edge cases

- **Empty label:** For known types, `label` is always set (fallback to `repairTypeId` in getMaterialRulesTemplateSections). For unknown types, label is the id. No empty heading.
- **Colons:** Existing behaviour strips colons from the title; keep using `section.label.replace(/:/g, '')` for consistency with 63.19.7 (summary row colons stripped).

---

## 4. Files to touch

| File | Change |
|------|--------|
| `frontend/modules/admin-products-bonus.js` | In `renderMaterialRulesTemplateSections`, set `sectionTitle` to label-only for known sections (and keep unknown format); remove `sectionTitleRaw`. |

---

## 5. Task list

- Add **63.19.9** in `docs/tasks/section-63.md` and a row in the uncompleted table in **TASK_LIST.md** (see task-list-completion rule). After implementation: check 63.19.9 in the section file; if section 63 becomes fully complete, update the index.
