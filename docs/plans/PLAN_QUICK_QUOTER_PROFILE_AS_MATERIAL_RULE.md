# Plan: Profile/Size as Material Rule – Single Logical Part Display

**Status:** Plan only; no code changes until approved.

**Scope:** Decongest the Material Rules Part Templates view and align UX so repair types (e.g. "External Corner") display as one logical part, with profile/size mapping driven by user choice (Quick Quoter or quote modal) rather than by editing SC/CL and 65/80 per row. Desktop admin view and optional Quick Quoter / quote modal behaviour.

---

## 1. Why We Currently Have Two Profiles (or Sizes) per Part

### 1.1 Data model (current)

- **`quick_quoter_repair_types`:** Each repair type has `requires_profile` (boolean) and `requires_size_mm` (boolean). These indicate that resolution **depends** on the user’s profile (Storm Cloud → SC, Classic → CL) and/or size (65mm / 80mm).
- **`quick_quoter_part_templates`:** Each row is one (repair_type_id, product_id, qty_per_unit, **condition_profile**, **condition_size_mm**, length_mode, …). So for one logical part we store **one row per variant**:
  - Profile: e.g. `EC-SC-MAR` (condition_profile=SC) and `EC-CL-MAR` (condition_profile=CL) for External Corner.
  - Size: e.g. `ACL-65` (condition_size_mm=65) and `ACL-80` (condition_size_mm=80) for adjustable clips.

So “2 profiles for each part” exists because the **resolver** must select the correct product_id from the user’s profile/size. The backend filters templates by `condition_profile` and `condition_size_mm` at resolve time (`backend/app/quick_quoter.py`: `resolve_quick_quoter_selection(profile, size_mm, selections)`). The mapping is already automatic when profile/size are known.

### 1.2 Where profile/size appear today

| Place | Behaviour |
|-------|-----------|
| **Quick Quoter modal** | Profile (Storm Cloud / Classic) and Size (65mm / 80mm) dropdowns at top. Required when any selected repair type has `requires_profile` / `requires_size_mm`. On Done, frontend calls `POST /api/quick-quoter/resolve` with `profile`, `size_mm`, `selections`. |
| **Material Rules (admin)** | Part Templates table shows **every** template row with columns: Product ID, Qty/Unit, **Profile**, **Size**, Length Mode, Active. So e.g. External Corner has many rows (EC-SC-MAR, EC-CL-MAR, GUT-SC-MAR-3M, GUT-CL-MAR-3M, J-SC-MAR, J-CL-MAR, …). |
| **Quote modal** | Does not ask for profile/size; it receives already-resolved elements from Quick Quoter (or canvas). |

So profile selection is “allowed” in Quick Quoter because the API **requires** profile/size to resolve which template rows (which product_ids) to use. The congestion is in the **admin** Part Templates view, where each variant is a separate row.

---

## 2. Goal (Material Rule Approach)

- **Admin view:** Show one **logical part** per line (e.g. “External Corner” → “Marley External Corner (SC/CL)”) instead of one row per profile/size variant. Admins and the system still “know” there are two profiles (or two sizes) for certain parts; that knowledge is encoded in the existing DB rows and in the resolver, not in duplicated editable rows.
- **User flow:** User’s profile choice (and size, if applicable) continues to **automatically** map at resolve time. Optionally, profile/size can be collected in the **quote modal** (e.g. one-time prompt) instead of (or in addition to) Quick Quoter, so the same “material rule” behaviour works even if Quick Quoter UI is simplified.
- **Backend:** No change to the resolve contract: it still accepts `profile`, `size_mm`, and `selections` and filters by `condition_profile` / `condition_size_mm`. No schema change required for Phase 1.

---

## 3. Dependencies (Verified in Codebase)

| Dependency | Location | Notes |
|------------|----------|--------|
| Resolve API | `POST /api/quick-quoter/resolve` (body: profile, size_mm, selections) | `backend/main.py` ~1920; calls `resolve_quick_quoter_selection(supabase, profile, size_mm, selections)`. |
| Resolver filter logic | `backend/app/quick_quoter.py` | Uses `condition_profile` and `condition_size_mm` to include/exclude template rows; `profile` mapped storm_cloud→SC, classic→CL. |
| Repair type flags | `quick_quoter_repair_types.requires_profile`, `requires_size_mm` | Read by catalog and by resolver to require profile/size when needed. |
| Admin load/save | `GET/PUT /api/admin/material-rules/quick-quoter` | `backend/app/material_rules.py`: returns/accepts repair_types + templates with `condition_profile`, `condition_size_mm` per template row. |
| Admin Part Templates UI | `frontend/modules/admin-products-bonus.js` | `getMaterialRulesTemplateSections()`, `appendMaterialRulesTemplateRow()`, `collectMaterialRulesTemplatesPayload()`; table columns include Profile and Size per row. |
| Quick Quoter state | `frontend/app.js` | `quickQuoterState.profileValue`, `quickQuoterState.sizeMmValue`; passed to resolve; used for row labels (SC/CL, RP65/RP80). |
| Quote modal | `frontend/app.js` | Receives merged elements from `mergeQuickQuoterResolvedWithQuote()`; does not currently ask for profile/size. |

---

## 4. Assumptions

1. **Schema unchanged for Phase 1:** We do **not** add a new “logical part” table or change `quick_quoter_part_templates` columns. Grouping is a **display and optional save/load convention** in the admin UI only; the backend continues to read/write one row per (repair_type_id, product_id, condition_profile, condition_size_mm, …).
2. **Resolver unchanged:** `resolve_quick_quoter_selection(profile, size_mm, selections)` remains the single place that maps profile/size to product_ids. No “material rule” table is used at resolve time beyond the existing template rows.
3. **Grouping key for “logical part”:** Rows that differ **only** by `condition_profile` and/or `condition_size_mm` (same repair_type_id, same qty_per_unit, same length_mode, and product_ids that are the “same” logical product, e.g. EC-SC-MAR vs EC-CL-MAR) can be shown as one row in the admin. Grouping can be heuristic (e.g. same product name stem or same (repair_type_id, length_mode, qty_per_unit) with only condition_* varying) or convention-based; exact rule TBD in implementation.
4. **Desktop vs mobile:** Material Rules view is **desktop-only** (admin). Quick Quoter is used on **mobile and desktop**. Quote modal is **shared**. So: (a) Part Template “logical part” display = desktop admin only; (b) any move of profile/size to “prompt in quote modal” = shared desktop + mobile.
5. **Admins know the rule:** All admins understand that certain parts have two profiles (SC/CL) or two sizes (65/80); we are not changing that fact, only reducing how much they have to “deal with” it in the template table (one line per logical part, with profile/size implied).

---

## 5. Proposed Implementation (Phased)

### Phase 1 – Admin Part Templates: Grouped display (desktop-only)

- **Objective:** Show one row per **logical part** in the Part Templates table instead of one row per profile/size variant.
- **Mechanism (option A – display grouping only):**
  - When building sections, **group** template rows that belong to the same “logical part”. Logical part = same repair_type_id + same “product family” (e.g. product_ids that only differ by -SC-/-CL- or -65/-80, or same (qty_per_unit, length_mode) with only condition_profile/condition_size_mm differing).
  - Render **one table row per group** with a combined label, e.g. “EC (SC/CL)” or “Marley External Corner — SC: EC-SC-MAR, CL: EC-CL-MAR”, and **hide** the per-row Profile/Size columns for grouped rows (or show as a single “Profile/Size” badge).
  - **Save/load:** When the user edits a grouped row, we must still read/write the **underlying** DB rows (e.g. two rows for EC-SC-MAR and EC-CL-MAR). So either: (1) grouped row is read-only summary with “Expand” to show and edit the underlying rows, or (2) grouped row is editable via a small sub-form (e.g. “SC product: [select], CL product: [select]”) that maps to two template rows on save. Option (1) is simpler and avoids changing collect/save logic; option (2) gives a true “one row per logical part” edit experience but requires careful mapping to existing payload shape.
- **Files:** `frontend/modules/admin-products-bonus.js` (getMaterialRulesTemplateSections or new grouping helper, appendMaterialRulesTemplateRow or new grouped row renderer, table thead to optionally hide Profile/Size or show one column “Variant”). No backend or API change.
- **Desktop only:** View is already desktop-only; no mobile impact.

### Phase 2 (optional) – Profile/size in quote modal

- **Objective:** If we want to avoid or de-emphasise profile/size in the Quick Quoter modal, collect them once in the **quote modal** (e.g. when opening from Quick Quoter with unresolved profile/size).
- **Mechanism:** When opening the quote modal after “Done” from Quick Quoter, if any selected repair type had `requires_profile` or `requires_size_mm` and the user left profile/size blank (or we remove those dropdowns), show a one-time prompt in the quote modal: “Select profile” and/or “Select size” (or use a saved default). Then call `POST /api/quick-quoter/resolve` with that profile/size and the same selections, and merge the result into the quote. Alternatively, keep profile/size in Quick Quoter as today and only add quote-modal prompt as a fallback when profile/size are missing.
- **Dependencies:** Same resolve API; `quickQuoterState.profileValue` / `sizeMmValue` could be set from quote modal before resolve, or we pass profile/size when merging. No backend change.
- **Desktop + mobile:** Quote modal is shared; prompt would appear on both.

### Phase 3 (optional, future) – Logical part in DB

- **Objective:** Store one “logical part” row and a mapping (e.g. profile → product_id) so the admin truly edits one row per part.
- **Assumption:** Would require a schema change (e.g. logical_part_id, or a mapping table profile/size → product_id) and resolver changes to read from that structure. **Out of scope** for this plan; Phase 1 avoids schema change.

---

## 6. Edge Cases and Safeguards

- **Mixed rows:** Some repair types have both profile-only rows (e.g. J-SC-MAR, J-CL-MAR), size-only (ACL-65, ACL-80), and profile+size (e.g. EO-SC-MAR-65, EO-CL-MAR-80). Grouping logic must handle all cases and not merge rows that are not the same logical part.
- **Existing payload:** `PUT /api/admin/material-rules/quick-quoter/templates` expects a flat list of template rows with condition_profile and condition_size_mm. Any “grouped” edit must expand back to that flat list when saving; we must not drop or duplicate rows.
- **E2E and tests:** Backend tests in `backend/tests/test_quick_quoter.py` and `test_material_rules_api.py` assume current payload shape; no change there for Phase 1. E2E that touches Material Rules Part Templates (e2e/run.js) may need updates if we change the number or structure of rows in the DOM (e.g. grouped row vs multiple rows).

---

## 7. Task List Update (Draft)

- **Section:** Add to Section 63 (Quick Quoter Backend + DB / Material Rules) as a new task, e.g. **63.19**.
- **Title:** Profile/Size as material rule: single logical part display in Part Templates (desktop admin); optional profile/size prompt in quote modal.
- **Checkboxes (draft):**
  - [ ] **63.19.1** Plan approved; implement Phase 1 (admin Part Templates grouped display: one row per logical part, profile/size as implied mapping; no API/schema change).
  - [ ] **63.19.2** (Optional) Phase 2: profile/size prompt in quote modal when opening from Quick Quoter without profile/size set.
  - [ ] **63.19.3** Desktop QA + Railway safety sign-off.

---

## 8. Summary

- **Why two profiles per part:** Backend needs one template row per (product_id, condition_profile, condition_size_mm) so resolve can filter by user’s profile/size. The mapping is already automatic at resolve time.
- **What we change:** (1) **Admin only:** Show one logical part per line in the Part Templates view (grouped display; save still writes existing payload shape). (2) **Optional:** Collect profile/size in quote modal instead of or in addition to Quick Quoter.
- **What we do not change:** Resolver logic; API contract; DB schema (Phase 1). No assumptions beyond the dependencies and grouping rules above.
