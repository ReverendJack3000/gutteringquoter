# Plan: Part Templates summary row titles – product name with profile/mm in brackets

**Status:** Not started (plan only).  
**Goal:** In the desktop admin Material Rules → Part Templates view, change the **header/summary row** titles from **product ID** to **product name**, with **profile and mm kept in brackets** using **human-readable** labels. Example: **"3m Gutter Marley (Classic/Storm)"** instead of **"GUT-SC-MAR-3M (CL/SC)"**.

**Scope:** Desktop admin Material Rules only. No backend or API changes. No mobile or quote-modal changes.

---

## 1. Current behaviour (code-accurate)

- **Summary row title source:** The title shown on the grouped summary row (the expand/collapse header for a logical part) comes from **`formatMaterialRulesGroupSummaryLabel(rows)`** in `frontend/modules/admin-products-bonus.js` (lines ~2030–2050).
- **Current logic:**
  - **Single row in group:** returns `rows[0]?.product_id` (or `'—'` if empty).
  - **Multiple rows in group:** returns `firstProductId + " (SC/CL, 65mm/80mm)"` where the suffix is derived from `condition_profile` and `condition_size_mm` of the rows.
- **Where it’s used:**
  - `getMaterialRulesTemplateGroupsByDisplayGroupId(section.rows)` builds groups and sets `summaryLabel: formatMaterialRulesGroupSummaryLabel(rowsInGroup)` for each group.
  - In `renderMaterialRulesTemplateSections()`, when `group.rows.length > 1` we call `appendMaterialRulesTemplateGroupSummaryRow(tbody, summaryDisplayLabel, groupId, true)`. The `summaryDisplayLabel` is either:
    - **`section.label`** (repair type label, e.g. "Bracket Replacement") when the section has **only one group** (`singleGroupInSection`).
    - **`group.summaryLabel`** when the section has **multiple groups** (e.g. Outlet Replacement: Joiner + Expansion Outlet).
- So the **product-id-based** title we are changing is **`group.summaryLabel`**, i.e. the result of `formatMaterialRulesGroupSummaryLabel(rows)`. The repair-type-only title (`section.label`) is not product-id-based and is left as-is unless we explicitly extend scope later.

**Conclusion:** The only place that must change is **`formatMaterialRulesGroupSummaryLabel(rows)`** so it returns a product-**name**-based string: **base name** (with profile/mm stripped from the name) **plus** optional **bracketed human-readable profile/mm** (e.g. "(Classic/Storm)" or "(65mm/80mm)"). Existing call sites continue to use that value for the summary row title.

---

## 2. Data source for product name

- **Catalog in Material Rules:** `loadMaterialRules()` fetches `GET /api/products` (no auth required for that call in the same flow) and builds **`materialRulesState.productMetaById`** (Map of product id → full product object). So when rendering Part Templates we already have product metadata in memory.
- **Backend:** `GET /api/products` is implemented in `backend/main.py` and uses `backend/app/products.py` `get_products()`, which selects `id, name, category, thumbnail_url, diagram_url, profile` from `public.products`. The API returns camelCase (e.g. `name`, `thumbnailUrl`). So each product has a **`name`** field.
- **Existing frontend helpers:** In `admin-products-bonus.js`, **`getMaterialRulesProductNameOnly(productId)`** (lines ~1929–1936) already returns `materialRulesState.productMetaById.get(id)?.name || id`. So product name is available when the catalog is loaded; when a product is missing from the map we fall back to `id`.

**Conclusion:** We will use **product name** from `materialRulesState.productMetaById.get(product_id)?.name` (or equivalent), with fallback to **product_id** when name is missing or after stripping would be empty.

---

## 3. Base name: product name minus profile/mm (for the leading part)

- **Intent:** The **leading part** of the summary row should be a **base** part name (e.g. "3m Gutter Marley", "Joiner", "Expansion Outlet") — the product name with profile and size tokens stripped so it doesn’t duplicate the bracketed suffix.
- **Strip rule (to implement):** From the product **name** string, remove common profile and size tokens. Examples of what to strip (exact rules to be chosen in implementation):
  - **Profile:** "Storm Cloud", "Classic", "SC", "CL", and common variants (e.g. trailing/leading with spaces or punctuation).
  - **Size/mm:** "65mm", "80mm", " 65", " 80" (as whole tokens/suffixes to avoid breaking names like "Item 65"; prefer stripping trailing " 65mm", " 80mm", " 65", " 80" or after a comma/dash).
- **Fallback:** If after stripping the string is empty or only whitespace, use **product_id** so the summary row always shows something.

**Conclusion:** Add a helper **`getMaterialRulesSummaryDisplayName(productId)`** that: (1) gets `name` from `materialRulesState.productMetaById.get(productId)`; (2) applies a defined strip rule for profile and mm; (3) trims and returns the result, or `productId` if missing/empty.

---

## 3b. Bracketed suffix: keep profile/mm, human-readable

- **Intent:** Keep **profile and mm in brackets** so admins still see variants (e.g. Classic vs Storm, 65mm vs 80mm), but use **human-readable** labels instead of codes.
- **Format:** `" (Profile/Profile)"` and/or `" (65mm/80mm)"` — e.g. **"3m Gutter Marley (Classic/Storm)"** or **"Joiner (65mm/80mm)"** or **"3m Gutter Marley (Classic/Storm, 65mm/80mm)"**.
- **Profile code → display name (to implement):**
  - **SC** → "Storm" (or "Storm Cloud" if preferred; "Storm" keeps the label short).
  - **CL** → "Classic".
  - Unknown or empty → keep raw value or omit from bracket.
- **Size:** Keep as **65mm**, **80mm** (or as returned from `condition_size_mm`), already readable; no mapping needed.
- **When to show bracket:** Same as today: for **multi-row** groups, derive profile/size sets from `condition_profile` and `condition_size_mm` of the rows and append ` (HumanProfile/HumanProfile, 65mm/80mm)` when non-empty. For **single-row** groups, no bracket (just the base name).
- **Order:** Sort profile names and sizes for consistent display (e.g. "Classic/Storm", "65mm/80mm").

---

## 4. Implementation steps (when approved)

1. **Add helper** in `frontend/modules/admin-products-bonus.js`:
   - **`getMaterialRulesSummaryDisplayName(productId)`**: return product name with profile/mm stripped, else `productId`. Use a single, documented strip rule (e.g. regex or list of tokens) so behaviour is predictable and testable.
2. **Add helper** for human-readable bracket (same file):
   - **`getMaterialRulesSummaryBracketSuffix(rows)`** (or inline in `formatMaterialRulesGroupSummaryLabel`): from `condition_profile` and `condition_size_mm` of the rows, build a suffix string **` (Classic/Storm)`** and/or **` (65mm/80mm)`** using a fixed mapping (SC → "Storm", CL → "Classic"; sizes as-is). Return empty string for single-row or when no variants. Sort for consistent order.
3. **Change `formatMaterialRulesGroupSummaryLabel(rows)`** in the same file:
   - **Primary part:** use **`getMaterialRulesSummaryDisplayName(rows[0]?.product_id)`** instead of raw `product_id`.
   - **Bracketed suffix:** for multi-row groups, use the new human-readable suffix (e.g. `" (Classic/Storm, 65mm/80mm)"`) instead of `" (SC/CL, 65mm/80mm)"`.
   - **Single row:** no bracket; just the base name (or `'—'` if no product_id).
   - Preserve fallback to `'—'` when there is no product_id.
4. **No changes** to:
   - `appendMaterialRulesTemplateGroupSummaryRow` (it already receives the label string).
   - Single-group-in-section path that uses `section.label` (repair type label).
   - Backend, API, or mobile.

---

## 5. Edge cases

- **Catalog not loaded or product missing:** `productMetaById.get(productId)` is undefined → use `productId` as label (current behaviour).
- **Product name is only “Storm Cloud” or “65mm”:** After strip, result may be empty → use `productId`.
- **Product name contains “65” or “80” in a different sense:** Strip rule should target whole tokens/suffixes (e.g. " 65mm", " 80mm", trailing " 65", " 80") to avoid over-stripping.
- **Unknown profile code in data:** If `condition_profile` is something other than SC/CL, show raw value in bracket or omit; avoid breaking the UI.

---

## 6. Files to touch

| File | Change |
|------|--------|
| `frontend/modules/admin-products-bonus.js` | Add `getMaterialRulesSummaryDisplayName(productId)`; add or inline human-readable bracket suffix (SC→Storm, CL→Classic; sizes as-is); update `formatMaterialRulesGroupSummaryLabel(rows)` to use base name + bracketed suffix (e.g. "3m Gutter Marley (Classic/Storm)"). |

No changes to `index.html`, `styles.css`, `app.js`, backend, or task list beyond adding the task entry.

---

## 7. Task list

- **63.19.7** is already in `docs/tasks/section-63.md` and **TASK_LIST.md**. When implementing, use this plan: product name as base with profile/mm in brackets, human-readable (e.g. "3m Gutter Marley (Classic/Storm)").
- Add a row to the uncompleted table in **TASK_LIST.md** for 63.19.7 (or include 63.19.7 in the existing 63.19 row description so it’s visible).

---

## 8. Railway / deployment

- No backend or env changes. Frontend-only; deploy as usual. Optional: bump `STATIC_ASSET_VERSION` / `ASSET_VERSION` when deploying so PWA caches pick up the new script (per TROUBLESHOOTING).
