# Plan: Mobile header – collapse toolbar button → expand icon (4 arrows)

**Date:** 2026-02-22  
**Scope:** Mobile-only. Desktop unchanged. Railway-safe (no new build step or backend).  
**Target:** First icon change: `#toolbarCollapseBtn` in the global toolbar; same pattern can be reused for other header icons later.

---

## 1. Goal

Replace the global toolbar collapse button’s current text (“−” / “+”) with a proper **expand icon (four arrows pointing out)** on **mobile only**. When the toolbar is collapsed, the button shows “expand”; when expanded, it shows “collapse”. On mobile we use SVGs for both states; desktop keeps the existing text behaviour.

---

## 2. Current behaviour (no assumptions)

- **DOM:** `frontend/index.html` ~line 25  
  - `div.app > div#view-canvas > div#globalToolbarWrap > header#globalToolbar > button#toolbarCollapseBtn`  
  - Inner content: `<span aria-hidden="true">−</span>` (no SVG).
- **JS:** `frontend/app.js` `initGlobalToolbar()` (~10486–10578)  
  - `applyState()` toggles `#globalToolbar` class `toolbar--collapsed`, sets `aria-expanded` / `aria-label` / `title` on the button, and **sets the span’s text**: `if (span) span.textContent = collapsed ? '+' : '−'`.  
  - Click and pointerup handlers call `setCollapsed(!collapsed)`; no other DOM writes to the button content.
- **CSS:**  
  - `.toolbar-collapse-btn` (244–278): 36×36 base, flex, centering; `.toolbar.toolbar--collapsed .toolbar-collapse-btn span` gets `transform: rotate(-90deg)` and when `[aria-expanded="false"]` gets `content: "+"` and larger font (285–293).  
  - Mobile: `body[data-viewport-mode="mobile"] .toolbar-collapse-btn { order: 0; }` (1978); `body[data-viewport-mode="mobile"] .global-toolbar-wrap .toolbar-collapse-btn { min-height: 44px; min-width: 44px; }` (2901–2904).
- **Viewport:** `data-viewport-mode` on `body`; `layoutState.viewportMode` in JS. Mobile-only changes must be scoped with `body[data-viewport-mode="mobile"]` (CSS) and `layoutState.viewportMode === 'mobile'` only if JS logic must differ (not required for this icon swap if we use CSS show/hide).

---

## 3. Desktop vs mobile

- **Desktop:** No change. Button continues to show the existing `<span>` with “−” / “+” and current CSS (rotation, font-size). No new classes or DOM for desktop.
- **Mobile:**  
  - Hide the text span inside `#toolbarCollapseBtn` and show SVG(s) instead.  
  - When **collapsed** (`#globalToolbar.toolbar--collapsed`): show **expand icon** (four arrows out).  
  - When **expanded**: show **collapse icon** (e.g. minus or four-arrows-in) so both states are clear.  
  - All new/edited CSS must be under `body[data-viewport-mode="mobile"]` (and, if needed, under `#globalToolbar` / `.global-toolbar-wrap .toolbar-collapse-btn` so only the global toolbar collapse button is affected, not the diagram toolbar).

---

## 4. Implementation plan (step-by-step)

### 4.1 HTML (`frontend/index.html`)

- **Location:** Inside `#toolbarCollapseBtn`, immediately after or before the existing `<span aria-hidden="true">−</span>`.
- **Change:** Add a **mobile-only icon container** that will hold two SVGs (expand + collapse), so we can show one or the other via CSS based on toolbar state.  
  - Keep the existing `<span aria-hidden="true">−</span>` for desktop (JS continues to set its `textContent`).  
  - Add a wrapper (e.g. `<span class="toolbar-collapse-btn-icons toolbar-collapse-btn-icons--mobile" aria-hidden="true">`) containing:  
    1. An **expand icon** SVG (four arrows pointing out, matching the reference): give it a class e.g. `toolbar-collapse-expand-icon`.  
    2. A **collapse icon** SVG (e.g. minus or four arrows pointing in): class e.g. `toolbar-collapse-collapse-icon`.  
  - Expand icon: four L-shaped strokes or paths pointing to top-left, top-right, bottom-left, bottom-right from a central area; stroke `currentColor`, rounded caps/joins; viewBox e.g. 0 0 24 24, size ~20–24 so it fits 44px touch target.
- **Do not** remove or rename `#toolbarCollapseBtn` or its `aria-label` / `aria-expanded` / `title` (they are updated by JS and must stay for a11y).

### 4.2 CSS (`frontend/styles.css`)

- **Mobile-only:** All new/edited rules must be under `body[data-viewport-mode="mobile"]`. Prefer scoping to the global toolbar so the diagram toolbar is unaffected, e.g. `body[data-viewport-mode="mobile"] .global-toolbar-wrap .toolbar-collapse-btn` or `body[data-viewport-mode="mobile"] #globalToolbar .toolbar-collapse-btn`.
- **Hide text on mobile:**  
  - Under mobile scope: `.toolbar-collapse-btn > span[aria-hidden="true"]:not(.toolbar-collapse-btn-icons--mobile)` (or the single text span) → `display: none` (or visibility + size 0) so the “−”/“+” span is not visible on mobile. Use a specific class on the text span if needed to avoid hiding the new icon wrapper.
- **Show/hide SVGs by toolbar state:**  
  - When **collapsed** (`#globalToolbar.toolbar--collapsed`): show `.toolbar-collapse-expand-icon`, hide `.toolbar-collapse-collapse-icon`.  
  - When **expanded** (`#globalToolbar:not(.toolbar--collapsed)`): show `.toolbar-collapse-collapse-icon`, hide `.toolbar-collapse-expand-icon`.  
  - Use `display` or `visibility` + `opacity` so only one icon is visible at a time; keep 44×44 hit area (already set at 2901–2904).
- **Icon size:** Ensure each SVG fits inside the 44×44 button (e.g. width/height 20–24px, or 100% with a max size). Use `stroke: currentColor` so it respects button colour.
- **Do not** change desktop `.toolbar-collapse-btn` or `.toolbar.toolbar--collapsed .toolbar-collapse-btn span` rules (no removal of existing rotation/content rules).

### 4.3 JS (`frontend/app.js`)

- **No structural change required** for the icon to work: `applyState()` already sets `toolbar.classList.toggle('toolbar--collapsed', collapsed)` and `collapseBtn.setAttribute('aria-expanded', !collapsed)`, so the parent has the right class/attribute for CSS to show the correct SVG on mobile.
- **Optional (recommended):** In `applyState()`, when updating the span’s `textContent`, only do so when **not** mobile (e.g. `if (span && document.body?.getAttribute('data-viewport-mode') !== 'mobile') span.textContent = collapsed ? '+' : '−'`). This avoids unnecessary DOM writes on mobile where the span is hidden; if you prefer to keep one code path, leaving it as-is is safe (span still updated but hidden on mobile).
- **Do not** add viewport-mode checks that would break desktop; do not change click/pointer handlers or `setCollapsed` behaviour.

---

## 5. Expand icon design (reference)

- **Reference:** User-provided image: standard expand icon with **four arrows pointing out** from the centre (top-left, top-right, bottom-left, bottom-right). Black strokes, moderate weight, rounded corners/ends.
- **SVG:** Implement as inline SVG with `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, stroke-width ~1.5–2, rounded linecap/linejoin. Paths: four L-shaped or arrow-like segments pointing outward in the four diagonal directions so the result is rotationally symmetric. Size to fit ~20–24px in a 44px button.

---

## 6. Edge cases and accessibility

- **Viewport switch:** If user resizes from mobile to desktop (or `?viewport=desktop`), the mobile icon wrapper should be hidden (e.g. default `display: none` for `.toolbar-collapse-btn-icons--mobile` and only show under `body[data-viewport-mode="mobile"]`). Desktop then shows only the original span; no duplicate focusable content.
- **ARIA:** Button keeps `aria-label` and `aria-expanded` and `title` from JS; no need to add `aria-hidden` on the SVGs if the wrapper has `aria-hidden="true"`. Screen readers will still get “Expand toolbar” / “Collapse toolbar” from the button.
- **Touch target:** Existing mobile rule keeps 44×44 min size; SVGs are visual only inside the button; no reduction of hit area.
- **High contrast / reduced motion:** Rely on `currentColor` so the icon follows text/UI colour; avoid motion on the icon; existing focus-visible outline remains.

---

## 7. Railway and regression

- **Railway:** No new dependencies, no build step, no backend or env changes. Static HTML/CSS/JS only.
- **Regression:** Desktop: same markup and JS; only extra DOM that is hidden on desktop. E2E: if any test asserts exact text “−”/“+” inside the button, scope that to desktop or update assertion to allow mobile SVG (or skip assertion when viewport is mobile). Manual: verify desktop toolbar collapse/expand unchanged; mobile shows 4-arrow expand when collapsed and collapse icon when expanded.

---

## 8. Task list update (after implementation)

- **Section file:** `docs/tasks/section-54.md` – add a new task (e.g. **54.106**) for “Mobile header: collapse button → expand/collapse SVG icons (mobile-only)” and mark it `[x]` when done.
- **Index:** `TASK_LIST.md` – add a row to the uncompleted table for Section 54 referencing 54.106 (or the chosen number) until the task is complete; remove when section is fully done if applicable.

---

## 9. Handoff summary

- **First change only:** Replace/augment the **collapse button** content on **mobile** with the **expand icon (4 arrows)** when toolbar is collapsed, and a collapse icon when expanded. All under `body[data-viewport-mode="mobile"]` and without changing desktop behaviour or Railway deploy.
