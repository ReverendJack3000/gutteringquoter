# Plan: Mobile panel – search bar position and thumbnail display (54.85 follow-up)

**Date:** 2026-02-21  
**Scope:** Mobile-only (all changes under `body[data-viewport-mode="mobile"]` or DOM move that is styled per viewport). Desktop and Railway deployment unchanged.  
**Goal:** (1) Move the product search bar from below the thumbnail strip to directly below the panel filter dropdowns; (2) Fix mobile product thumbnails so they use less white space, are uniform in size, show full text at ~10px, and display fewer items at once so image and label fit.

**Reference:** User screenshot and DOM positions; tasks 54.85.1–54.85.7 marked complete but search position and thumbnail display need this follow-up.

---

## 1. Current state (verified from code)

### 1.1 DOM and layout

- **HTML (`frontend/index.html` ~316–342):** Inside `#panelContent` the order is: `.panel-header`, `.panel-tip`, `.panel-filters` (two selects), `.panel-search` (input#productSearch), `.product-grid` (#productGrid).
- **Mobile CSS (54.85.6):** To keep the grid “above the keyboard” when search was focused, flex order was applied: `.product-grid` has `order: 0` and `.panel-search` has `order: 1`. So **visually** on mobile the grid appears above the search (grid at top, search at bottom). That is why the search bar appears at the bottom of the panel (e.g. top=679px in the reference).
- **User request:** Move the search bar so it sits **directly below the dropdowns** (e.g. top≈327px), i.e. visual order: filters → search → grid. User also asked to move the search **into** the DOM path of `.panel-filters` (i.e. make `.panel-search` a **child** of `.panel-filters`, just below the two selects).

### 1.2 Thumbnails

- **Mobile product grid (`frontend/styles.css` ~2186–2225):** `.product-grid` is flex row, overflow-x auto, gap 0.75rem, thumbs 120px wide (96px at ≤400px), max-height 100px, img max-height 60%, span has `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` (so text is truncated).
- **Issues:** Truncated labels (e.g. “Gutter: Stor...”), excess white space in and between thumbs, need uniform size and full text at ~10px, and “display fewer at once” so image and text fit.

---

## 2. Desktop vs mobile impact

- **Mobile:** Only the products panel (bottom sheet) is changed: DOM move of `.panel-search` into `.panel-filters`, mobile-only CSS for filters+search layout and for product thumbnails.
- **Desktop:** No behavioural change. The DOM move (search inside `.panel-filters`) is shared; desktop base styles for `.panel-filters` and `.panel-search` keep the same look (stacked filters, then search row, then grid). No new desktop-only logic.
- **Railway:** No new dependencies or build steps; static HTML/CSS and optional JS tweak only.

---

## 3. Implementation plan

### 3.1 Move search bar into `.panel-filters` (DOM + CSS)

**3.1.1 HTML (`frontend/index.html`)**

- **Current:** `.panel-filters` contains two `<label>` + `<select>` pairs; then a **sibling** `<div class="panel-search">` with `#productSearch`; then `.product-grid`.
- **Change:** Move the entire `<div class="panel-search">…</div>` block to **inside** `.panel-filters`, immediately after the second `</select>` (and its `</label>` if needed; the labels are already above each select). So the closing `</div>` of `.panel-filters` will now wrap the two selects and the `.panel-search` div.
- **Resulting structure:**
  ```html
  <div class="panel-filters">
    <label for="profileFilter" ...></label>
    <select id="profileFilter" ...>...</select>
    <label for="sizeFilter" ...></label>
    <select id="sizeFilter" ...>...</select>
    <div class="panel-search">
      <input type="search" id="productSearch" placeholder="Search products…" aria-label="Search Marley products" />
    </div>
  </div>
  <div class="product-grid" id="productGrid"></div>
  ```
- **IDs and JS:** `#productSearch` and `#productGrid` are unchanged; all existing `getElementById('productSearch')` and filter logic remain valid. No JS changes required for the DOM move.

**3.1.2 CSS – remove grid-above-search flex order (mobile)**

- **File:** `frontend/styles.css`.
- **Remove** the two rules that implement 54.85.6 “grid above search” (so search goes back to being visually below filters and above grid):
  - `body[data-viewport-mode="mobile"] .panel.expanded .panel-content .product-grid { order: 0; }` (lines ~2058–2060).
  - `body[data-viewport-mode="mobile"] .panel.expanded .panel-content .panel-search { order: 1; }` (lines ~2061–2063).
- **Reason:** With the new DOM, `.panel-search` is inside `.panel-filters`; we want visual order filters → search → grid. Natural DOM order (filters block including search, then grid) already gives that once we stop reordering. So removing these rules restores the intended order.

**3.1.3 CSS – mobile: filters row + search on next row**

- **Current mobile `.panel-filters`:** `display: flex; flex-direction: row; gap: 8px; align-items: center` (two dropdowns side-by-side).
- **Change:** So that `.panel-search` (now inside `.panel-filters`) sits on a **second row** below the dropdowns:
  - Add `flex-wrap: wrap` to the existing mobile `.panel-filters` block.
  - Under `body[data-viewport-mode="mobile"]`, add a rule for `.panel-filters .panel-search`: `flex: 0 0 100%; width: 100%;` (and if needed `order: 1` or rely on DOM order so it follows the two selects). This forces the search block to take the full width and wrap to the next row.
  - Keep the two selects in the first row (e.g. `flex: 1; min-width: 0` as today); ensure `.panel-search` has appropriate top margin or padding so it sits “just below” the dropdown row (e.g. `margin-top: 8px` or use gap if the wrap creates a logical gap).
- **Desktop:** Base `.panel-filters` is not flex (stacked layout); with the search div inside, it will simply appear below the two selects in block flow. Base `.panel-search` already has padding and border-bottom; no desktop-specific change needed unless testing shows overlap.

**3.1.4 JS – search focus handler (54.85.6)**

- **Current:** On mobile, when `#productSearch` gains focus, the code scrolls `#productGrid` into view so the strip is “above the keyboard.”
- **After moving search above the grid:** The grid is **below** the search; when the keyboard opens, the grid may be partly off-screen. Options: (a) Remove the focus scroll (no scroll on focus), or (b) Keep a scroll so that after focusing search, the grid is scrolled into view so the user can see results (optional UX).
- **Recommendation:** Remove the mobile-only focus handler that calls `grid.scrollIntoView(...)` (the block in `app.js` ~9788–9796), so we do not fight the new layout. Refine-as-you-type remains via existing `input` → `applyProductFilters()`. If product wants “scroll grid into view when search focused,” it can be re-added later.

---

### 3.2 Thumbnail display (mobile-only CSS)

**Goals:** Less white space, uniform thumb size, show all text, ~10px font, display fewer thumbs at once so image and text fit.

**3.2.1 Uniform size and less white space**

- **File:** `frontend/styles.css`, under `body[data-viewport-mode="mobile"]`.
- **`.product-grid`:** Reduce gap (e.g. from `0.75rem` to `var(--mobile-space-sm)` or 8px) to cut white space between thumbs. Keep `align-items: flex-start`, scroll-snap, overflow-x.
- **`.product-grid .product-thumb`:** Give a **fixed** height (e.g. `height: 100px` or keep `max-height: 100px` but set a consistent `min-height` so all cards are uniform). Reduce internal padding (e.g. from base 8px to 6px on mobile) so image and text have more room. Keep width larger than current so “fewer at once” (see below); e.g. **140px** or **150px** so roughly 2–2.5 thumbs visible on a typical phone, and image + label fit inside one card.

**3.2.2 Show all text, font ~10px**

- **`.product-grid .product-thumb span`:**  
  - Set `font-size: 10px` (or `0.625rem`) for mobile.  
  - Remove truncation: change from `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` to allow wrapping: e.g. `white-space: normal; overflow: visible` and use a short line-clamp if we want a max of 2 lines: `display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;` so long names wrap to two lines and we avoid excess height. Alternatively allow 2 lines without line-clamp and set a small `max-height` for the label area so the card height stays uniform.  
  - Keep `text-align: center` and ensure touch target for the whole card remains ≥44px.

**3.2.3 Display fewer at once**

- **Width:** Increase mobile thumb width from 120px (96px at ≤400px) to **140px** or **150px** (and optionally 120px at ≤400px if needed). This shows fewer thumbs in the viewport at once and gives each card more space for image and text.
- **Image:** Keep `object-fit: contain` and a sensible `max-height` (e.g. 55–60% of card height) so the image does not dominate and the label fits below.
- **Optional:** Add a mobile `max-height` on `.product-grid` (e.g. `min(45vh, 200px)`) so the strip does not grow too tall; keep one primary row with horizontal scroll.

**3.2.4 Responsive (≤400px)**

- Current `@media (max-width: 400px)` sets thumb width 96px. With the new “fewer at once” approach, either keep a slightly smaller width at narrow (e.g. 120px) so 2 thumbs still fit, or keep 140px and accept 2 thumbs in view. Align with “uniform size” and “show all text” so the card does not feel cramped.

---

## 4. Edge cases and accessibility

1. **Desktop:** With `.panel-search` inside `.panel-filters`, verify desktop panel still shows: filters (stacked) → search → grid, with no overlap or missing borders. Base styles use block layout for `.panel-filters`; the inner `.panel-search` will stack below the selects.
2. **Mobile keyboard:** With search above the grid, the virtual keyboard may cover the grid. Refine-as-you-type still works; we are not scrolling the grid into view on focus. If the product wants the grid visible while typing, a later enhancement can scroll the panel or the grid after focus.
3. **Long product names:** Two-line clamp (or 2 lines without clamp) at 10px keeps cards uniform; full name remains in `aria-label` on the thumb (already set in app.js). No change to a11y labels.
4. **Touch targets:** Whole `.product-thumb` remains the control; with height ≥44px and width 140–150px, the card stays above 44×44px. Filter and search inputs keep min-height 44px on mobile.
5. **E2E:** Any test that depends on panel structure (e.g. order of elements or position of search) should be checked after the DOM move; update selectors or expectations if they assume `.panel-search` as a direct child of `.panel-content`.

---

## 5. Files to touch

| File | Change |
|------|--------|
| `frontend/index.html` | Move `<div class="panel-search">…</div>` inside `.panel-filters`, after the two `<select>` elements. |
| `frontend/styles.css` | Remove mobile flex-order rules for `.product-grid` and `.panel-search`; add mobile `.panel-filters .panel-search` full-width wrap rule; mobile product grid/thumb: smaller gap, larger uniform thumb size, 10px label, allow 2-line wrap (line-clamp or similar), reduce padding. |
| `frontend/app.js` | Remove the mobile-only `#productSearch` focus handler that calls `grid.scrollIntoView(...)` (54.85.6). Keep `input` → `applyProductFilters()`. |
| `docs/tasks/section-54.md` | Add follow-up tasks 54.85.8–54.85.12 (or equivalent) and leave 54.85.1–54.85.7 as completed. |
| `TASK_LIST.md` | Re-add a row for section 54 covering the new 54.85.x follow-up tasks so they appear in the uncompleted table. |

---

## 6. Verification

- **Manual (mobile):** Open Products panel; confirm search bar is directly below the two dropdowns and above the product strip; confirm thumbnails are uniform, less gap, full text at ~10px, and roughly 2–2.5 thumbs visible; tap-to-add and panel close still work; portrait and landscape.
- **Desktop:** Confirm filters → search → grid unchanged in layout and behaviour.
- **E2E:** Run `npm test`; fix any failing assertions that depend on panel DOM order or search position.
- **Railway:** No config or dependency changes; deploy as usual.

---

## 7. Task list update (draft)

In **`docs/tasks/section-54.md`**, after the existing 54.85.1–54.85.7 block, add a follow-up subsection, e.g.:

**54.85 (follow-up) Mobile: search position and thumbnail display**

- [ ] **54.85.8** Move search bar into `.panel-filters`: DOM move in `index.html` so `.panel-search` is a child of `.panel-filters` (just below the two selects); mobile CSS so filters row + search on next row; remove mobile flex-order that put grid above search.
- [ ] **54.85.9** Mobile search focus: remove grid scroll-into-view on `#productSearch` focus (search is now above grid); keep refine-as-you-type.
- [ ] **54.85.10** Mobile thumbnails: uniform size, less white space (smaller gap, compact padding), show full text at ~10px (2-line wrap/line-clamp), display fewer at once (wider thumbs ~140–150px) so image and text fit.
- [ ] **54.85.11** Verify desktop unchanged and E2E green after DOM/CSS/JS changes.
- [ ] **54.85.12** Manual mobile QA: search below filters, thumbnails readable and uniform, tap-to-add and panel close.

In **`TASK_LIST.md`**, in the uncompleted table, add a row:

| 54 | 54.85.8–54.85.12 | (Mobile) Search bar below filters; thumbnail display: uniform size, full text ~10px, fewer at once. |

(Adjust task numbers if the section file uses a different numbering scheme.)
