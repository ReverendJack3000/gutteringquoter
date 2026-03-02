# Plan: Material Rules Part Templates – profile/size dropdown background colours (match parts thumbnails)

**Status:** Not started (plan only).  
**Goal:** In the desktop admin Material Rules → Part Templates table, style the **Profile** and **Size** dropdowns so their **background and text colours** match the product thumbnail badges in the parts panel: Storm Cloud (yellow bg, black text), Classic (black bg, yellow text), 65mm (black bg, white text), 80mm (white bg, black text).

**Scope:** Desktop admin Material Rules Part Templates only. No backend or API changes. No mobile (Material Rules is desktop-only). Railway-safe.

---

## 1. Current behaviour (code-accurate)

- **Part Templates table:** Each template row is built in `appendMaterialRulesTemplateRow()` in `frontend/modules/admin-products-bonus.js` (function at lines 2260–2353).
- **Profile dropdown:** `<select class="material-rules-template-profile">` with options `Any` (value `""`), `SC`, `CL`. Values come from `row.condition_profile` (normalised to `SC`/`CL`).
- **Size dropdown:** `<select class="material-rules-template-size">` with options `Any` (value `""`), `65mm` (value `"65"`), `80mm` (value `"80"`). Values from `row.condition_size_mm`.
- **No existing CSS** targets `.material-rules-template-profile` or `.material-rules-template-size` for colour; they use default select styling.
- **Product thumbnail badges (parts panel):** Colours are defined in `frontend/styles.css`:
  - **Profile Storm:** `.product-thumb-profile-badge--storm` → `background: #FDED3D; color: #000000;` (lines 2544–2547).
  - **Profile Classic:** `.product-thumb-profile-badge--classic` → `background: #000000; color: #FDED3D;` (lines 2549–2552).
  - **Size 65mm:** `.product-thumb-size-badge--65` → `background: #444; color: #fff;` (lines 2568–2571).
  - **Size 80mm:** `.product-thumb-size-badge--80` → `background: #fff; color: #444; border: 1px solid #444;` (lines 2573–2577).
- **Panel profile filter:** `#profileFilter` uses classes `.profile-filter--storm-cloud` and `.profile-filter--classic` (toggled in JS) with the same yellow/black as above (lines 3336–3348). That pattern (reflect selected value on element for CSS) is what we will reuse.

**Conclusion:** We will (1) set `data-profile` and `data-size` on the two selects from their current value and keep them in sync on `change`; (2) add CSS that styles the **select box** (closed state) by `[data-profile="SC"]`, `[data-profile="CL"]`, `[data-size="65"]`, `[data-size="80"]` using the requested colours (see below). “Any” remains default (no data value or `any`).

---

## 2. Colour spec (match parts thumbnails)

| Context   | Background | Text   | Notes |
|----------|------------|--------|--------|
| Storm Cloud (SC) | Yellow `#FDED3D` | Black `#000000` | Same as product-thumb-profile-badge--storm and #profileFilter.profile-filter--storm-cloud. |
| Classic (CL)     | Black `#000000`   | Yellow `#FDED3D` | Same as product-thumb-profile-badge--classic and #profileFilter.profile-filter--classic. |
| 65mm             | Black `#000000`   | White `#ffffff`  | User requested “black background white text”; parts badge uses `#444`/`#fff` – use `#000`/`#fff` for consistency with “black”. |
| 80mm             | White `#ffffff`   | Black `#000000`  | User requested “white background black text”; parts badge uses `#fff`/`#444` – use `#fff`/`#000` for “black text”. Optional: `border: 1px solid #444` for clarity. |

---

## 3. Implementation steps (when approved)

1. **JS – set and sync data attributes** in `frontend/modules/admin-products-bonus.js` in `appendMaterialRulesTemplateRow`:
   - Immediately after assigning `tr.innerHTML` (after line 2325; template ends at 2324), get the two selects: `tr.querySelector('.material-rules-template-profile')`, `tr.querySelector('.material-rules-template-size')`.
   - Set initial state: `profileSelect.dataset.profile = conditionProfile === 'SC' || conditionProfile === 'CL' ? conditionProfile : 'any'`. `sizeSelect.dataset.size = (conditionSize === '65' || conditionSize === '80') ? conditionSize : 'any'`.
   - Add a `change` listener on each select (in addition to existing `markRowDirty` logic) that updates the same `dataset` from the select’s current `.value` (e.g. `profileSelect.dataset.profile = profileSelect.value || 'any'`; `sizeSelect.dataset.size = sizeSelect.value || 'any'`). Do not remove the existing `change` → `markRowDirty` listener; either add a second listener or update one shared handler so both run.
   - Use values: profile `''` → `'any'`, `'SC'`/`'CL'` as-is; size `''` → `'any'`, `'65'`/`'80'` as-is (size options already use value `"65"` and `"80"`).

2. **CSS – style the selects by selected value** in `frontend/styles.css` in the Material Rules block, e.g. after `.material-rules-group-summary-label--bold` (that rule is at lines 4327–4329; add the new rules after line 4329):
   - **Profile**
     - `.material-rules-template-profile[data-profile="SC"]`: `background: #FDED3D; color: #000000; border-color: #e0d535;` (match profile filter).
     - `.material-rules-template-profile[data-profile="CL"]`: `background: #000000; color: #FDED3D; border-color: #333;`
   - **Size**
     - `.material-rules-template-size[data-size="65"]`: `background: #000000; color: #ffffff; border-color: #333;`
     - `.material-rules-template-size[data-size="80"]`: `background: #ffffff; color: #000000; border: 1px solid #444;`
   - Use the full selectors above (class + attribute) so only these dropdowns are styled, not any other element with `data-profile`/`data-size`.
   - Ensure base `.material-rules-template-profile` and `.material-rules-template-size` have a default border/background so “Any” looks neutral; only override when the data attribute is set.
   - Optional: `font-weight` or contrast tweaks for readability; avoid changing layout.

3. **No changes** to: backend, API, HTML structure of options, other Material Rules sections, or mobile. No change to save/load or collect logic (they already read `.value` from the selects).

---

## 4. Edge cases

- **“Any” selected:** `data-profile="any"` or attribute absent / empty – no coloured override; default select styling.
- **Rapid change:** Updating `dataset` on `change` is sufficient; no debounce needed.
- **New rows:** When a new template row is added (e.g. “Add Template”), the row is built with default profile/size (empty); data attributes will be `any` until the user selects SC/CL or 65/80.
- **Accessibility:** Colours match existing high-contrast badge choices (yellow/black, black/white). No change to aria-labels or focus order.

---

## 5. Files to touch

| File | Change |
|-----|--------|
| `frontend/modules/admin-products-bonus.js` | In `appendMaterialRulesTemplateRow`, after setting `tr.innerHTML`: set `dataset.profile` and `dataset.size` on the two selects from current row values; add `change` handlers that update those data attributes from the select’s `.value`. |
| `frontend/styles.css` | Add rules for `.material-rules-template-profile[data-profile="SC"]`, `.material-rules-template-profile[data-profile="CL"]`, `.material-rules-template-size[data-size="65"]`, `.material-rules-template-size[data-size="80"]` with the colours above. |

---

## 6. Task list

- **63.19.8** is already present in `docs/tasks/section-63.md` (unchecked) and in the uncompleted table in **TASK_LIST.md**. After implementation: check 63.19.8 in the section file; if section 63 becomes fully complete, remove its row from the index.

---

## 7. Railway / deployment

- Frontend-only. No backend or env changes. Deploy as usual. Optional: bump `STATIC_ASSET_VERSION` / `ASSET_VERSION` when deploying so PWA caches pick up the updated script (per TROUBLESHOOTING).
