# Material Rules Dashboard UX Improvements – Plan

**Context:** Quote App single codebase (desktop + mobile), deployed on Railway. Material Rules view is desktop-only, admin-guarded (`view-material-rules` + `canAccessDesktopAdminUi()`). This plan covers **improving clarity, labels, grouping, and feedback** so the dashboard is easier to use and understand. No mobile viewport changes; no new env or build; Railway-safe.

**Task list:** Section 63 in `docs/tasks/section-63.md`. Current open item: 63.16 (manual desktop QA + Railway sign-off). This plan is for the **next** work: dashboard UX (added as 63.18).

---

## 1. Goal

- Make the Material Rules dashboard easier to use and understand for a human admin.
- Improve: **clarity** (what each section/field does), **labels** (human-friendly where appropriate), **grouping** (logical subsections), **feedback** (save/load/error and optional inline cues).
- **Scope:** Desktop-only UI; no API or backend changes; no mobile layout changes; no new Railway env or build step.

---

## 2. Current State (from codebase)

### 2.1 Markup (`frontend/index.html` ~650–764)

- **View:** `#view-material-rules`, `.material-rules-view-container`, header (Back, title, Reload), `#materialRulesStatus` (role="status", aria-live="polite").
- **Section order (63.17 done):** Measured-Length Rules first, Quick Quoter Rules second.
- **Measured-Length section:** One `.material-rules-form-grid` with 14 controls: Bracket spacing (mm), Clip spacing (mm), Screws / bracket, Screws / dropper, Screws / saddle clip, Screws / adjustable clip, Screw product ID, Bracket product (SC), Bracket product (CL), Saddle clip product (65/80), Adjustable clip product (65/80), Clip selection mode (options: Auto by ACL presence, Force saddle clips, Force adjustable clips). Copy: "Controls accessory inference used by quote calculation."
- **Quick Quoter section:** Two subsections: (1) Repair Types table (`#materialRulesRepairTypesBody`) — columns Reorder, Label, Needs Profile, Needs Size, Active; copy: "Repair Type IDs are locked system keys and cannot be added, removed, or renamed here." (2) Part Templates container (`#materialRulesTemplateGroups`) — sections per repair type; copy: "Edit repair types and templates. Save applies changes live."

### 2.2 Logic (`frontend/modules/admin-products-bonus.js`)

- **Access:** `view-material-rules` guarded at ~1410: non-admin or non-desktop redirects with message; menu item `menuItemMaterialRules` hidden on mobile (app.js).
- **State:** `materialRulesState` (loading, savingQuickQuoter, savingMeasured, repairTypes, templates, measuredRules, productMetaById, productIds); `materialRulesDragState` for reorder.
- **Status:** `setMaterialRulesStatus(message, tone)`; `getMaterialRulesApiError()` maps API validation_errors to user-facing messages.
- **Measured form:** `populateMaterialRulesMeasuredForm()` / `collectMaterialRulesMeasuredPayload()` use fixed IDs (e.g. `materialRulesBracketSpacingMm`, `materialRulesScrewProductId`); product dropdowns filled via `getMaterialRulesProductSelectOptionsHtml()` (label: "id — name").
- **Quick Quoter:** Repair type rows built in `appendMaterialRulesRepairTypeRow()`; template rows in `appendMaterialRulesTemplateRow()` with Length Mode select values `none` | `missing_measurement`. Save order: repair types first, then templates; `updateMaterialRulesActionButtons()` disables Reload/Save/Add during load/save.

### 2.3 Styles (`frontend/styles.css` ~4145–4430)

- `.material-rules-view-container`, `.material-rules-header`, `.material-rules-main`, `.material-rules-section`, `.material-rules-form-grid` (2 columns), `.material-rules-subsection`, `.material-rules-table`, `.material-rules-template-section`, drag handles, inputs, status. No viewport-specific overrides for this view (desktop-only by route/menu).

### 2.4 Backend

- **Endpoints:** `GET/PUT /api/admin/material-rules/quick-quoter` (repair-types + templates), `GET/PUT /api/admin/material-rules/measured`. No changes planned.
- **Docs:** `docs/BACKEND_DATABASE.md` (measured_material_rules, API table refs).

---

## 3. Proposed Implementation Plan

### 3.1 Clarity and labels

- **Measured-Length Rules**
  - Keep existing section copy; optionally add one short sentence: e.g. "Used when generating quotes from gutter/downpipe lengths (brackets, clips, screws)."
  - **Clip selection mode:** Add a short description (in HTML, e.g. `<p class="material-rules-field-help">` or `aria-describedby`) explaining: Auto = choose by ACL presence; Force saddle = always saddle clips; Force adjustable = always adjustable clips. Optionally add `title` on the select for tooltip.
  - Product fields: Already show "ID — name" in dropdowns; no change required unless we add a "Product" grouping heading (see grouping).
- **Quick Quoter Rules**
  - Repair Types: Consider renaming column "Needs Profile" → "Requires profile (SC/CL)" and "Needs Size" → "Requires size (65/80)" in the **table header only** (thead) so the table remains understandable without changing JS row builders (they use the same class names).
  - Part Templates: Consider adding a one-line description under "Part Templates" subsection: e.g. "Parts added per repair type when user confirms Quick Quoter; order and active flag control what appears."
  - **Length Mode** (template table): Today values are `none` and `missing_measurement`. Consider **display labels** in the dropdown: e.g. "No length" for `none`, "Ask for metres" for `missing_measurement`. Implementation: in `appendMaterialRulesTemplateRow()` keep `value` as `none`/`missing_measurement` but show human text in `<option>` label; no API change.

### 3.2 Grouping

- **Measured-Length form**
  - Introduce **visual subgroups** inside the existing section without changing input IDs (so `collectMaterialRulesMeasuredPayload` and `populateMaterialRulesMeasuredForm` stay unchanged):
    - Group 1: "Spacing" — Bracket spacing (mm), Clip spacing (mm).
    - Group 2: "Screws per item" — Screws / bracket, Screws / dropper, Screws / saddle clip, Screws / adjustable clip.
    - Group 3: "Product assignments" — Screw product ID, Bracket (SC/CL), Saddle clip (65/80), Adjustable clip (65/80).
    - Group 4: "Clip selection" — Clip selection mode (+ optional short help).
  - In HTML: wrap each group in a `<div class="material-rules-form-group">` with an optional `<h3 class="material-rules-form-group-title">` or a `<span class="material-rules-form-group-label">` so the grid remains a single flow (same `.material-rules-form-grid` or a grid that contains these groups). Ensure DOM order and IDs of inputs are unchanged.
- **CSS:** Add `.material-rules-form-group` (e.g. margin/gap) and optional `.material-rules-form-group-title` so grouping is visible; keep existing form-grid layout.

### 3.3 Feedback

- **Status:** Already have `#materialRulesStatus` with load/save/error/success. Keep as-is; ensure success message is shown after Save (already done in `saveMaterialRulesQuickQuoter` / `saveMaterialRulesMeasured`).
- **Save buttons:** Already disabled during load/save. Optionally: temporarily set button text to "Saving…" (Measured) and "Saving…" (Quick Quoter) while `materialRulesState.savingMeasured` / `savingQuickQuoter` is true; restore "Save Measured Rules" / "Save Quick Quoter Rules" when done. Implementation in `updateMaterialRulesActionButtons()` or in the save handlers.
- **Reload:** On Reload, status is set to "Loading…" then cleared or "Material rules loaded." — no change required unless we want to explicitly clear any prior success message at start of fetch (already overwritten by new message).

### 3.4 Accessibility (desktop-only)

- New headings: Use proper hierarchy (h2 for section, h3 for subsection; if we add form groups, use h3 or a styled span so hierarchy isn’t broken).
- New description text: Associate with controls via `aria-describedby` where it helps (e.g. clip selection mode).
- Existing: aria-labels on inputs/tables; status has role="status" and aria-live="polite". Keep and extend as above.

### 3.5 Files to touch (summary)

| File | Changes |
|------|--------|
| `frontend/index.html` | Measured: optional extra sentence in section copy; form groups (wrappers only, same input IDs); optional help for clip selection mode. Quick Quoter: optional Repair Types column header text; optional Part Templates description. |
| `frontend/styles.css` | `.material-rules-form-group`, `.material-rules-form-group-title`, `.material-rules-field-help` (if used); within existing Material Rules block ~4145–4430. |
| `frontend/modules/admin-products-bonus.js` | Optional: Save button text swap to "Saving…" in `updateMaterialRulesActionButtons()` or in save handlers. Optional: Length Mode option display text in `appendMaterialRulesTemplateRow()` (value unchanged). No change to fetch/save/collect logic or API. |

### 3.6 What we are not doing

- No new backend endpoints or env vars.
- No mobile viewport or `data-viewport-mode` changes; no mobile-specific CSS for this view.
- No change to API request/response shapes or validation.
- No change to drag-and-drop or table structure (only labels/copy/grouping/feedback).

---

## 4. Edge cases and safeguards

- **Desktop vs mobile:** View and menu are already hidden on mobile; all changes are inside `#view-material-rules` and do not affect mobile layout or mobile-specific selectors.
- **Railway deploy:** No new dependencies, no new build step, no env; only HTML/CSS/JS. Existing `./scripts/run-server.sh` and Procfile/nixpacks unchanged.
- **Form binding:** Any new wrapper elements must not change the IDs or order of inputs used by `collectMaterialRulesMeasuredPayload` and `populateMaterialRulesMeasuredForm`; no new IDs for existing fields.
- **Regression:** Manual desktop QA of Material Rules after changes (load, edit Measured, save; edit Quick Quoter repair types/templates, save; Reload; Back to Canvas). Existing E2E does not need to target this view unless we add a dedicated admin E2E later.

---

## 5. Task list update (draft)

- **Section file (`docs/tasks/section-63.md`):** Add task **63.18** with checkboxes for: (1) Measured form grouping + optional copy/help, (2) Quick Quoter labels/descriptions + optional Length Mode display labels, (3) Optional Save "Saving…" feedback, (4) Desktop QA + Railway safety sign-off.
- **Index (`TASK_LIST.md`):** Add a row to the uncompleted table for Section 63 task 63.18 (Material Rules dashboard UX improvements) once 63.18 is added to the section file.

---

## 6. Verification

- Run `./scripts/run-server.sh`, open app on desktop, sign in as admin, open Material Rules from profile menu.
- Confirm: sections and groups render; labels/copy are clear; Save shows success in status; Reload works; no console errors; Back to Canvas works.
- Confirm on a narrow viewport (or mobile) that the Material Rules menu item remains hidden and the view is not reachable on mobile.
- Deploy to Railway and smoke-test Material Rules load/save once.

This plan is based solely on the current codebase and the constraints above; no assumptions beyond what is in the repo and the handoff.
