# Plan: Mobile Global Header – Reorder Tools (Projects Top-Left) and Declutter

**Date:** 2026-02-21  
**Goal:** Mobile-only changes to the **tools within the global header** (not the diagram toolbar or any other toolbar): (1) Put Projects/Untitled at top-left and collapse button after it; (2) Put the dropdown indicator (chevron) to the left of “Projects” so tapping “Projects” is the only trigger; (3) Hide Export PNG, Saved diagrams (clock), and Accessibility settings buttons on mobile to reduce clutter. All changes must be scoped to `body[data-viewport-mode="mobile"]` so desktop and existing functionality are unchanged. Railway deployment must remain successful (no new dependencies or build steps).

**Scope:** We are **only** changing the tools/contents inside the global header. We are **not** changing the diagram floating toolbar or any other toolbar.

**Target DOM:** The header we are changing is exactly:
`div.app > div#view-canvas > div#globalToolbarWrap > header#globalToolbar`  
(i.e. the `header.toolbar.toolbar-floating#globalToolbar` inside `#globalToolbarWrap`).

**Implementation scope:** CSS only in `frontend/styles.css` (mobile-scoped). No HTML or JS changes required for the reorder or hide. Optional: minor JS only if we need to guard any mobile-only behavior (none anticipated).

---

## 1. Current State (from codebase)

- **Header we are changing:** Only the global header: `#globalToolbar` inside `#globalToolbarWrap` (DOM path: `div.app > div#view-canvas > div#globalToolbarWrap > header#globalToolbar`). We are not changing the diagram floating toolbar or any other toolbar.
- **HTML** (`frontend/index.html`): Inside that header, tool order is: `#toolbarDragHandle` (visually hidden), `#toolbarCollapseBtn`, `.toolbar-left` (contains `.toolbar-breadcrumbs-wrap` → `#toolbarBreadcrumbsNav`), `.toolbar-center`, `.toolbar-right`. Inside `#toolbarBreadcrumbsNav`: `.breadcrumb-prefix` (“Projects / ”), `#toolbarProjectNameInput`, `.breadcrumb-chevron`, `#breadcrumbGoBackBtn`.
- **Viewport mode:** Set on `document.body` and `document.documentElement` via `data-viewport-mode="mobile"` when width/media or `?viewport=mobile` triggers mobile layout. All mobile-only CSS must use `body[data-viewport-mode="mobile"]` selector.
- **Breadcrumb behavior:** Click on `#toolbarBreadcrumbsNav` (excluding input and go-back button) already opens project history dropdown (desktop) or diagrams bottom sheet (mobile). No separate “dropdown field” is required; the chevron is decorative on mobile (`pointer-events: none`). User wants chevron **visually** to the left of “Projects” on mobile.
- **E2E:** Main run uses 1280×720 (desktop) for toolbar/a11y checks. `browser-desktop-mobile-check.js` clicks `#openAccessibilitySettingsBtn` in both desktop and mobile runs; the button remains in the DOM when hidden with CSS, so programmatic `.click()` still works. No E2E changes required for the hide.

---

## 2. Requirements (no assumptions)

| # | Requirement | How verified |
|---|-------------|--------------|
| R0 | Only the **tools within the global header** (`#globalToolbar`) are changed; the diagram toolbar and other toolbars are not changed. | All CSS targets elements inside `#globalToolbarWrap` / `#globalToolbar` only. |
| R1 | Projects/Untitled (breadcrumb) is at the **top-left** of the mobile global header. | Flex order: `.toolbar-left` appears first. |
| R2 | Collapse button appears **after** the breadcrumb (to the right of Projects/Untitled). | Flex order: `.toolbar-collapse-btn` after `.toolbar-left`. |
| R3 | No separate dropdown control to the right of Projects/Untitled; tapping the bold “Projects” (breadcrumb) opens the dropdown/bottom sheet. | Already true in JS; chevron is indicator only. |
| R4 | Chevron (dropdown indicator) is **to the left** of the word “Projects” on mobile. | Flex order inside `.toolbar-breadcrumbs`: `.breadcrumb-chevron` before `.breadcrumb-prefix`. |
| R5 | On mobile only, hide: `#exportBtn`, `#diagramsDropdownBtn` (and its wrap `.toolbar-diagrams-wrap`), `#openAccessibilitySettingsBtn`. | CSS `display: none` under `body[data-viewport-mode="mobile"]`. |
| R6 | Spacing and padding on mobile remain correct (no overflow, 44px touch targets where applicable). | Reuse existing `--mobile-space-*` and header padding/gap; no horizontal scroll on global header. |
| R7 | Desktop layout and behavior unchanged. | All new/edited rules are inside `body[data-viewport-mode="mobile"]` selectors. |
| R8 | Railway deploy unchanged. | No new deps, no build step; only CSS (and optional trivial JS). |

---

## 3. Implementation Steps

### 3.1 Swap order of tools within the global header (mobile only)

- **File:** `frontend/styles.css`
- **Location:** In the existing `body[data-viewport-mode="mobile"]` global toolbar block (e.g. near 1881–1893, after `.toolbar-left` / `.toolbar-breadcrumbs` visibility rules).
- **Add:**
  - `body[data-viewport-mode="mobile"] .toolbar-left { order: -1; }` so the breadcrumb block is the first flex item.
  - `body[data-viewport-mode="mobile"] .toolbar-collapse-btn { order: 0; }` so the collapse button comes immediately after (optional if default order is already 0; add for clarity).
- **Do not** change the drag handle or `.toolbar-right` order unless needed; leaving them at default keeps right-side content in place. Result: visual order inside the header is [Breadcrumb] [Collapse] [Rest of header tools].

### 3.2 Chevron to the left of “Projects” (mobile only)

- **File:** `frontend/styles.css`
- **Location:** Near existing `body[data-viewport-mode="mobile"] .breadcrumb-chevron` (around 1908–1917).
- **Add:** `body[data-viewport-mode="mobile"] .breadcrumb-chevron { order: -1; }` (in addition to existing display/flex/align). Ensure `.toolbar-breadcrumbs` remains `display: flex` (it already is). Result: inside the breadcrumb nav, order is [Chevron] [Projects /] [Input] [Go back].

### 3.3 Hide Export, Diagrams dropdown, Accessibility buttons (mobile only)

- **File:** `frontend/styles.css`
- **Location:** In the same mobile global-toolbar / toolbar-right area (e.g. after the new order rules).
- **Add:**
  - `body[data-viewport-mode="mobile"] #exportBtn { display: none !important; }`
  - `body[data-viewport-mode="mobile"] .toolbar-diagrams-wrap { display: none !important; }` (hides both the clock button and its dropdown in the header)
  - `body[data-viewport-mode="mobile"] #openAccessibilitySettingsBtn { display: none !important; }`
- **Rationale:** Hiding the whole `.toolbar-diagrams-wrap` avoids a gap where the clock button was; Saved diagrams remain available on mobile via tapping the breadcrumb (Projects), which opens the diagrams bottom sheet. Accessibility remains available via profile menu (e.g. “Accessibility” menuitem). Export is removed from mobile toolbar only (no alternative in this task).

### 3.4 Spacing and padding

- **File:** `frontend/styles.css`
- **Action:** Reuse existing mobile toolbar padding and gap (`padding: clamp(...)`; `gap: var(--mobile-space-md)`). If the new order causes the first row to feel cramped, add a single rule such as `body[data-viewport-mode="mobile"] .toolbar-left { margin-right: 0; }` or rely on existing `.toolbar { gap: ... }` between `.toolbar-left` and `.toolbar-collapse-btn`. No reduction of touch target size; keep `min-height: 44px` / `min-width: 44px` for toolbar buttons and breadcrumb as already defined.

---

## 4. What we are not changing

- **Other toolbars:** We are **not** changing the diagram floating toolbar (`#diagramFloatingToolbar`) or any other toolbar. Only the **tools within the global header** (`#globalToolbar` in `#globalToolbarWrap`) are reordered or hidden.
- **HTML:** No reordering or removal of elements in `index.html`.
- **JS:** No changes to `app.js` or `toolbar.js` unless a bug is found (e.g. a handler that assumes visibility of the hidden buttons; current code uses `getElementById` and `.click()` which work when elements are `display: none`).
- **Desktop:** No new selectors without `body[data-viewport-mode="mobile"]`.
- **E2E:** No change to run.js or browser-desktop-mobile-check.js; desktop run has visible buttons; mobile run’s programmatic click on `#openAccessibilitySettingsBtn` still works because the element exists.

---

## 5. Edge cases and accessibility

- **Focus:** Hidden buttons are not focusable when `display: none`. Keyboard users on mobile (e.g. external keyboard) will not tab to Export/Diagrams/Accessibility in the header; they can use breadcrumb for diagrams and profile menu for accessibility. Acceptable per requirement to declutter.
- **Screen readers:** Hidden buttons are not announced when hidden. Export and “Open saved diagrams” in header are removed from mobile; “Projects” / breadcrumb still opens saved diagrams. Add/keep `aria-label` on the breadcrumb nav so “Project” (or “Projects, button”) is clear.
- **Resize:** When switching from mobile to desktop (e.g. resize or `?viewport=desktop`), `data-viewport-mode` changes and all mobile-only rules no longer apply; desktop layout is unchanged.
- **RTL:** Not in scope; no RTL-specific rules added.

---

## 6. Verification

- **Manual (mobile):** Load app with `?viewport=mobile` at 390×844 (or similar). Confirm: (1) In the **global header** (`#globalToolbar`) only: “Projects / Untitled” (and chevron to its left) is top-left; (2) collapse button is to the right of the breadcrumb; (3) Export, clock, and accessibility icon are not visible in the header; (4) Tapping “Projects” opens the diagrams bottom sheet; (5) Spacing/padding look correct, no horizontal scroll on the global header. Diagram toolbar and other toolbars unchanged.
- **Manual (desktop):** Load at 1280×720 (or without viewport override). Confirm: (1) Global header tool order and all buttons (including Export, clock, accessibility) unchanged; (2) Breadcrumb and collapse in original order.
- **E2E:** Run `npm test` (or `./scripts/run-e2e.sh`). All tests should pass; no changes to test files required.
- **Railway:** Push and deploy; confirm no build or runtime errors (CSS-only change).

---

## 7. Task list draft (for TASK_LIST.md)

Add under Section 54 (e.g. as **54.82**). Scope: **tools within the global header only** (`#globalToolbar`); we are not changing the diagram toolbar or any other toolbar.

- [ ] **54.82.1** **Mobile global header: Projects/Untitled top-left, collapse after.** In `frontend/styles.css`, under `body[data-viewport-mode="mobile"]`, set `.toolbar-left { order: -1; }` and `.toolbar-collapse-btn { order: 0; }` so breadcrumb is first, collapse second (within `#globalToolbar` only).
- [ ] **54.82.2** **Mobile breadcrumb: chevron left of “Projects”.** Under `body[data-viewport-mode="mobile"]`, set `.breadcrumb-chevron { order: -1; }` so the dropdown indicator appears to the left of “Projects /” (within the header breadcrumb only).
- [ ] **54.82.3** **Mobile: hide Export, Saved diagrams (clock), Accessibility in global header.** Under `body[data-viewport-mode="mobile"]`, add `#exportBtn`, `.toolbar-diagrams-wrap`, `#openAccessibilitySettingsBtn` with `display: none !important`. Desktop unchanged; diagrams still open via breadcrumb tap.
- [ ] **54.82.4** **Verify spacing and regression.** Confirm mobile header padding/gap and 44px targets; run `npm test`; manual desktop + mobile check; Railway deploy.

---

**Plan complete. No code written; ready for implementation and TASK_LIST update.**
