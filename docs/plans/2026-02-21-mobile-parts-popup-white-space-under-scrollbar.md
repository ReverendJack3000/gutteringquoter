# Plan: Mobile Parts Popup – Remove White Space Under Scroll Bar

**Date:** 2026-02-21  
**Goal:** When the mobile screen width is shortened with the parts (products) popup open, white space appears under the scroll bar. Remove this so the layout never shows white space below the scroll bar. Mobile-only; desktop behaviour and Railway deployment unchanged.

**Scope:** CSS in `frontend/styles.css` (mobile-scoped); optional JS in `frontend/app.js` (body class when panel open). No HTML or desktop UI changes.

---

## 1. Problem

- **Symptom:** On mobile, with the products panel (parts popup) open, when the viewport **width** is shortened past a certain point, white space appears under the scroll bar.
- **Actual cause (verified via user screenshots):** The white strip is **inside the Parts panel**, directly **below the product grid’s horizontal scrollbar**. It is **not** the page’s vertical scrollbar. The strip is caused by `body[data-viewport-mode="mobile"] .panel { padding-bottom: env(safe-area-inset-bottom); }`—that bottom padding on the panel creates a visible gap below the product grid and its horizontal scrollbar.
- **Constraint:** Fix must be mobile-only; desktop products panel and layout must be unaffected.

---

## 2. Root Cause (traced to code)

### 2.1 Page-level scroll (most likely)

- **Body:** `body` has `height: 100vh` and `overflow: hidden` (styles.css ~16–24). No class is added to `body` when the **products** panel opens on mobile.
- **Diagrams sheet:** When the **diagrams** bottom sheet opens, `document.body.classList.add('diagrams-bottom-sheet-open')` is applied and CSS sets `body.diagrams-bottom-sheet-open { overflow: hidden; touch-action: none; }` (app.js ~10879, 10895; styles.css ~2698–2701). That prevents page scroll and scroll bleed on iOS.
- **Products panel:** There is **no** equivalent body class or scroll lock when the products panel is expanded on mobile. So when the viewport is resized (narrower width), layout reflow or `100vh` behaviour (e.g. mobile browser chrome) can make the document height exceed the visible viewport, producing a page scrollbar and white space below.

### 2.2 Viewport height

- `body` and `.app` use `height: 100vh`. On mobile, `100vh` can be larger than the visible viewport when the browser UI (e.g. address bar) is shown; after resize, this can contribute to a mismatch and visible overflow.

### 2.3 Panel structure (if issue is inside the panel)

- Mobile panel: `body[data-viewport-mode="mobile"] .panel.expanded` has `height: 50vh; max-height: min(50vh, 420px)` (styles.css ~2075–2082).
- `body[data-viewport-mode="mobile"] .panel.expanded .panel-content` has `flex: 1; overflow-y: auto; min-height: 0` (~2096–2104). Children: `.panel-header`, `.panel-tip`, `.panel-filters`, `.product-grid` (flex: 0 0 auto for grid). If the combined content is shorter than the panel height, the scroll container would show white at the bottom; narrowing width could change wrapping and make this more visible.

---

## 3. Verification Steps (before implementing)

1. **Reproduce:** Open app at mobile viewport (e.g. `?viewport=mobile` or narrow window). Open the products panel (Parts). Resize the browser to shorten **width** (e.g. 390px → 360px → 320px).
2. **Screenshot:** When white space appears under the scroll bar, capture screenshots.
3. **Classify:**
   - If the **browser’s** vertical scrollbar (page scroll) is visible and scrolling shows white below → **page-level** (Section 4.1).
   - If only the **panel’s** scrollbar is visible and white appears below the product strip inside the panel → **panel-internal** (Section 4.2).

---

## 4. Proposed Fix (mobile-only)

### 4.1 Page-level: prevent document scroll when products panel is open

- **JS (app.js):** In `setPanelExpanded(expanded, …)`:
  - When `layoutState.viewportMode === 'mobile'` and `expanded === true`, add `document.body.classList.add('products-panel-open')`.
  - When `expanded === false` (or when closing), remove `document.body.classList.remove('products-panel-open')`.
  - Ensure the class is removed when viewport switches to desktop (e.g. in `applyViewportMode` when switching to desktop, remove `products-panel-open` if present).
- **CSS (styles.css):** Add a block **scoped to mobile only**:
  - `body[data-viewport-mode="mobile"].products-panel-open { overflow: hidden; }`
  - Optionally: `height: 100%; min-height: 100dvh; max-height: 100dvh;` so the layout is strictly viewport-bounded and cannot grow past the visible area when the panel is open. Use `100dvh` so mobile browser chrome changes don’t create a mismatch.
- **Desktop:** Do not add `products-panel-open` when viewport is desktop; no CSS changes outside `body[data-viewport-mode="mobile"]`.

### 4.2 Panel-internal: no white space below product strip (actual fix)

- **Root cause:** The panel has `padding-bottom: env(safe-area-inset-bottom)` (base mobile `.panel` rule). When expanded, that padding appears as a white strip **below the product grid’s horizontal scrollbar**.
- **Fix applied:** Override for expanded panel only: `body[data-viewport-mode="mobile"] .panel.expanded { padding-bottom: 0; }` so there is no gap under the horizontal scrollbar. The product-grid already has `padding: 12px 16px`, so the bottom edge remains padded with the same white background.
- Other safeguards (already in place): `justify-content: flex-start` on `.panel-content`; `.product-grid` with `flex: 0 0 auto`.

### 4.3 Optional: consistent viewport height on mobile

- For mobile only, consider setting `body` (or `.app`) to `min-height: 100dvh` when products panel is open so the layout never exceeds the dynamic viewport. This can be part of the `body.products-panel-open` rule above.

---

## 5. Files to Touch

| File | Change |
|------|--------|
| `frontend/app.js` | In `setPanelExpanded`, add/remove `products-panel-open` on `document.body` when mobile and expanded; in `applyViewportMode`, remove `products-panel-open` when switching to desktop. |
| `frontend/styles.css` | New block: `body[data-viewport-mode="mobile"].products-panel-open { overflow: hidden; }` and optionally height/100dvh; if needed, panel-internal rules under same selector for `.panel-content`. |

---

## 6. Desktop and Railway

- **Desktop:** All new logic is gated by `layoutState.viewportMode === 'mobile'` and `body[data-viewport-mode="mobile"]`. Desktop panel and layout are unchanged.
- **Railway:** No build, env, or config changes; frontend-only CSS/JS.

---

## 7. Task List Update (draft)

- **Section file:** `docs/tasks/section-54.md` – add new task (e.g. **54.91** or next free number) for “Mobile: remove white space under scroll bar when parts popup open (scroll lock + optional 100dvh)” and sub-tasks for JS body class, CSS scroll lock, verification.
- **TASK_LIST.md:** Add one row to the uncompleted table for this section/task once the section file is updated.
