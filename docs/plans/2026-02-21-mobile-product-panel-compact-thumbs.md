# Mobile product panel: compact thumbs and vertical space (plan)

**Date:** 2026-02-21  
**Scope:** Mobile-only (all changes under `body[data-viewport-mode="mobile"]`). Desktop and Railway deployment unchanged.  
**Goal:** Reduce vertical space used by the Products panel on mobile so users see as much as possible of the blueprint/canvas image; avoid very tall product thumbs that waste vertical space.

---

## 1. Problem (verified from code and reference image)

- **Current mobile product grid:** `frontend/styles.css` ~2162–2179: `.product-grid` is `display: flex; flex-direction: row; overflow-x: auto; overflow-y: hidden` with `.product-thumb` at `width: 120px; min-width: 120px; flex: 0 0 auto`.
- **Base `.product-thumb`** (~2799–2832): `aspect-ratio: 1`, flex column, `img` with `max-height: 70%`, `max-width: 100%`.
- **Observed behaviour:** On mobile, thumbs can reach **223px height** (reference image: productGrid height 259px, product-thumb height 223px). Cause: in a flex row the row’s cross-size is driven by the tallest item; SVGs with tall intrinsic aspect ratios can make one thumb very tall, and with default `align-items: stretch` all thumbs in the row stretch to that height. Result: only about one row of products visible, heavy vertical space use, and wasted room that could show more canvas.
- **User goal:** “See as much as possible of the image” and avoid “wasting so much vertical space when opening products”; consider “reducing the amount of items in view at once” if it helps (e.g. smaller thumbs so the strip is shorter, or more items visible in a shorter strip).

---

## 2. Desktop vs mobile impact

- **Mobile:** Only the products panel (bottom sheet) and product grid/thumb styling are changed. All new rules must be under `body[data-viewport-mode="mobile"]` (or equivalent mobile-only selector). No change to desktop layout, desktop panel, or desktop product grid.
- **Desktop:** No changes. Desktop keeps current 2-column grid, aspect-ratio 1 thumbs, and resizable side panel.

---

## 3. Proposed implementation (mobile-only)

### 3.1 CSS (`frontend/styles.css`)

- **Product grid (mobile):** Keep existing `body[data-viewport-mode="mobile"] .product-grid` (flex row, overflow-x, scroll-snap, gap, padding). Optionally cap the grid’s height so the strip doesn’t dominate the panel (e.g. `max-height: min(40vh, 160px)` or similar) with `overflow-y: hidden` so the horizontal strip is clearly a single row. This makes the “products strip” compact and leaves more of the panel for header/filters/search and, when panel is expanded, more perceived space for the canvas above.
- **Product thumb height (mobile):** Under `body[data-viewport-mode="mobile"] .product-grid .product-thumb` (or a dedicated mobile `.product-thumb` block), add:
  - **Height constraint:** e.g. `max-height: 100px` or `height: 100px` (or 96px for 44px touch target + image + label). This overrides the effective “stretch to tallest” behaviour and keeps the row short.
  - **Aspect-ratio override:** e.g. `aspect-ratio: auto` so the fixed/max height is respected; thumb width stays 120px (or reduced per 3.2).
  - **Image and label:** Ensure `img` fits within the thumb (e.g. `object-fit: contain`, `max-height: 60%` or similar so label remains visible) and label stays readable; keep `min-height: 44px` for touch target only if it doesn’t force the card too tall (prefer one compact touch target for the whole card).
- **Alignment:** Set `align-items: flex-start` on the mobile `.product-grid` so thumbs don’t stretch vertically if any content is taller than the cap.
- **Responsive baseline:** Design for 360px (Android) and 390px (iOS) logical width. At 360px, consider slightly smaller thumb width (e.g. 100px or 96px) so more items fit in view and the strip stays one row; keep touch target ≥44px (whole card tappable). Use a single mobile rule or a narrow `@media (max-width: 400px)` under the mobile block only if a second size is needed.

### 3.2 Optional: reduce “items in view” wording

- “Reducing the amount of items in view at once” can be achieved by **shortening the strip** (smaller thumbs or height cap) so the panel uses less vertical space; the number of items “in view” horizontally can stay the same or increase (more items if thumbs are narrower). No requirement to explicitly limit the count of items; the main lever is thumb size and strip height.

### 3.3 Panel filters: two dropdowns side-by-side (mobile only)

- **Current:** `.panel-filters` contains two full-width selects (`#profileFilter`, `#sizeFilter`); base CSS uses `select + select { margin-top: 8px }` so they stack vertically. On mobile this uses ~94px vertical space (two 37px-high rows plus padding).
- **Change:** Under `body[data-viewport-mode="mobile"]`, add rules for `.panel-filters`:
  - **Layout:** `display: flex; flex-direction: row; gap: 8px; align-items: center` so the two dropdowns sit side-by-side.
  - **Selects:** Each select `flex: 1` (or `min-width: 0`) so they share the row evenly; remove the vertical margin (override `select + select { margin-top: 0 }` on mobile). Keep full height for touch targets (e.g. min-height 44px).
- **Result:** One horizontal row for both filters, saving vertical space. Labels remain associated (visually-hidden labels); no HTML change required.

### 3.4 Search focus and keyboard: grid in view above keyboard (mobile only)

- **Requirement:** When the user taps `#productSearch` on mobile, the virtual keyboard opens. The scrollable product thumbnail strip (`#productGrid`) must appear in full view **above** the keyboard, and results must refine as they type.
- **Refine as they type:** Already implemented: `search.addEventListener('input', () => applyProductFilters())` (app.js ~9785). No change needed; verify it still runs and that filtered results render in the grid.
- **Grid above keyboard:**
  - **Option A – Flex order:** On mobile, give `.product-grid` a lower flex order than `.panel-search` so the grid is laid out (visually) above the search field. Then when the keyboard opens, the visible viewport shrinks and the content above the input (the grid) stays in view. Use `body[data-viewport-mode="mobile"] .panel-content`: set `#productGrid` (or `.product-grid`) to `order: 0` (or lower) and `.panel-search` to `order: 1` (or higher), so in the column layout the grid appears above the search. Then the DOM order (header, tip, filters, search, grid) is overridden visually: filters, grid, search. That way the scrollable strip sits above the search and thus above the keyboard.
  - **Option B – Scroll on focus:** When `#productSearch` receives focus on mobile, scroll the panel’s scrollable container (e.g. `.panel-content`) so that `#productGrid` is brought into view above the keyboard. Use `productGrid.scrollIntoView({ behavior: 'smooth', block: 'start' })` or scroll the panel-content so the grid is in the visible region. May need to run after a short delay (e.g. `requestAnimationFrame` or `setTimeout`) so the keyboard animation has started and we can use `visualViewport.height` if needed to position content.
  - **Recommendation:** Prefer Option A (flex order) so the grid is always above the search on mobile; then the strip is naturally above the keyboard when the user taps search. If the panel content is scrollable, optionally on `#productSearch` focus scroll the panel so the grid is at the top of the visible area (one-time scroll) for a consistent “grid in view above keyboard” experience.
- **JS:** Mobile-only: on focus of `#productSearch`, optionally scroll `#productGrid` (or the panel content) so the thumb strip is visible above the keyboard; ensure no desktop behaviour change. If flex order is used, focus scroll may still be needed so the grid isn’t off-screen above.

### 3.5 HTML / JS

- **HTML:** No structural changes required for thumbs or filters; `#productGrid`, `.product-thumb`, `.panel-filters`, and `#productSearch` stay as-is. Optional: if flex order is insufficient, consider moving `#productGrid` above `.panel-search` in the DOM for mobile (would require a single shared order that works for both; CSS order is simpler).
- **JS:** (1) Filters: no JS change for side-by-side (CSS only). (2) Search/keyboard: add mobile-only focus handler on `#productSearch` to scroll panel content or `#productGrid` into view so the strip appears above the keyboard; gate with `layoutState.viewportMode === 'mobile'`. Keep existing `input` → `applyProductFilters()` so results refine as they type.

### 3.6 Touch targets and accessibility

- **54.2 / Apple HIG:** Minimum 44px touch target for interactive elements. The whole `.product-thumb` is the control; ensure the thumb’s **minimum** touch area is at least 44×44px (e.g. min-height at least 44px if width is 120px, or ensure clickable area is at least 44px in both axes). With a height cap of ~96–100px and width 120px, the card remains well above 44px. Panel filter dropdowns in the side-by-side row must each retain at least 44px height.
- **Focus and scroll:** Keep existing focus-visible and scroll-snap behaviour; ensure keyboard/screen reader users can still reach all thumbs when the grid scrolls. When search has focus, ensure product grid remains keyboard-accessible (e.g. tab order, scroll into view).

---

## 4. Edge cases and mitigations

1. **Very tall SVG thumbs:** Some product SVGs may have a tall intrinsic aspect ratio. Capping thumb height and using `object-fit: contain` plus `max-height` on the img keeps the card compact and avoids one thumb stretching the row.
2. **Long product names:** Label text can wrap or truncate. Keep `text-align: center` and consider `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` or a two-line clamp so the card height doesn’t grow; ensure aria-label still has full name for screen readers.
3. **Orientation (54.12):** Panel already uses 70vh / max 55vh in landscape. Compact thumb height works in both orientations; no extra rules needed unless testing shows otherwise.
4. **200% zoom / Dynamic Type:** Ensure at 200% zoom the thumb remains usable (min 44px logical) and label readable; avoid fixed pixel heights that become too small when zoomed (prefer rem or clamp if needed).
5. **Keyboard overlap (search focus):** On small viewports the virtual keyboard can cover most of the panel. Using flex order to place the grid above the search, plus optional scroll-on-focus, keeps the thumb strip visible above the keyboard. Test on iOS and Android; use `visualViewport` resize/scroll if needed to adjust layout when keyboard opens.
6. **Side-by-side filters at narrow width:** At 360px two equal-width dropdowns may feel tight; ensure labels (visually-hidden) stay associated and dropdowns remain tappable (min 44px height). If needed, use a small gap and `min-width: 0` on selects so they don’t overflow.

---

## 5. Verification

- **Manual:** On a narrow viewport (360px, 390px), open Products panel; confirm thumbs are short (e.g. ~96–100px height), one horizontal row, horizontal scroll works, tap-to-add works, panel closes on tap. Check portrait and landscape.
- **Filters:** Confirm the two dropdowns (profile, size) are side-by-side on mobile and stacked on desktop; touch targets and labels unchanged.
- **Search + keyboard:** Tap `#productSearch` on a real device or keyboard simulation; confirm the product thumbnail strip is visible above the keyboard and that typing refines the list (existing input handler). Confirm no desktop behaviour change.
- **Desktop:** Confirm desktop product grid, thumb layout, and filter layout unchanged (2-column grid, stacked filters).
- **E2E:** Run existing `npm test`; fix any product-panel or mobile assertions that depend on current thumb dimensions or panel structure (e.g. selectors or visibility).
- **Railway:** No new dependencies or build steps; deploy as usual.

---

## 6. Task list update (draft)

- Section **54.85** in `docs/tasks/section-54.md` (already added) is extended with:
  - **54.85.1** Mobile product grid: cap thumb height and align row (CSS only, `body[data-viewport-mode="mobile"]`).
  - **54.85.2** Mobile product thumb: constrain height and image/label so strip uses less vertical space; keep 44px touch target.
  - **54.85.3** (Optional) Responsive thumb width at narrow mobile (e.g. ≤400px) for more items in view.
  - **54.85.4** Verify desktop unchanged, E2E green, manual mobile QA (thumbs and filters).
  - **54.85.5** Mobile panel filters: two dropdowns side-by-side. Under `body[data-viewport-mode="mobile"]`, style `.panel-filters` as a single row (`display: flex; flex-direction: row; gap`); override `select + select` margin; keep 44px min height; desktop unchanged.
  - **54.85.6** Mobile search focus: product grid in view above keyboard. When `#productSearch` is focused on mobile, ensure the scrollable thumbnail strip (`#productGrid`) is in full view above the virtual keyboard (e.g. flex order so grid is above search, and/or scroll panel/grid into view on focus); gate with viewport mode.
  - **54.85.7** Mobile search: verify refine-as-you-type. Confirm existing `input` → `applyProductFilters()` works when search is focused and keyboard is open; results update as user types; no new logic required unless testing finds gaps.
- **“Auto collapse global toolbar when products opened”** remains an incomplete task (54.84.3).

---

## 7. Files to touch

| File | Change |
|------|--------|
| `frontend/styles.css` | Mobile-only rules for `.product-grid`, `.product-thumb` (height cap, aspect-ratio, alignment); `.panel-filters` (flex row, side-by-side selects); optional `.panel-content` / `.product-grid` and `.panel-search` flex order so grid appears above search on mobile. |
| `frontend/app.js` | Mobile-only: on `#productSearch` focus, optionally scroll `#productGrid` or panel content into view so thumb strip is above keyboard; gate with `layoutState.viewportMode === 'mobile'`. No change to filter or search logic (applyProductFilters already runs on input). |
| `docs/tasks/section-54.md` | Add 54.85.5–54.85.7 (filters side-by-side, search/keyboard grid in view, verify refine-as-type). |
| `TASK_LIST.md` | Ensure 54.85 row in uncompleted table reflects full range (54.85.1–54.85.7). |

No HTML structure changes required for filters (labels stay); optional DOM reorder for grid/search only if CSS order is insufficient. No backend changes.
