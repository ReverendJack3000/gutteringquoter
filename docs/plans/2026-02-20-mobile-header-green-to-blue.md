# Plan: Mobile header (green → blue)

**Date:** 2026-02-20  
**Scope:** Mobile UI only; desktop and existing functionality unchanged.  
**Deployment:** No backend or build changes; frontend-only. Must remain deployable to Railway.

---

## 1. Goal

Change the **green** header/chrome that appears in the current **mobile** view to **blue**, without affecting desktop or existing behaviour.

---

## 2. Root cause (verified from codebase)

The “green header” in mobile view is **not** the in-page toolbar. The in-page toolbar (`.global-toolbar-wrap` + `.toolbar-floating`) uses a white/glass background (`rgba(255, 255, 255, 0.82)`) in both desktop and mobile; there is no green background on the toolbar in CSS.

The green comes from:

1. **`<meta name="theme-color" content="#71C43C">`** in `frontend/index.html` (line 7).  
   On mobile browsers this colours the **browser chrome** (status bar, address bar, etc.).
2. **`theme_color": "#71C43C"`** in `frontend/manifest.webmanifest` (line 10).  
   When the app is opened as an installed PWA, this colour is used for the app’s system chrome.

No other green styling is applied to the mobile “header” (no mobile-only toolbar background using `#71C43C` in `styles.css`).

---

## 3. Desktop vs mobile impact

- **Mobile:** Browser chrome (and optionally PWA chrome) will show **blue** instead of green. In-page toolbar stays white/glass; no layout or behaviour change.
- **Desktop:** Must remain unchanged. Strategy: update theme-color **only when viewport is mobile** via JavaScript (see below). Desktop keeps current green in the meta tag until/unless we explicitly set it when in desktop mode (we will set meta to green when desktop so initial load and resize both behave correctly).

---

## 4. Proposed implementation

### 4.1 JavaScript: mobile-only theme-color

- **Where:** `applyViewportMode(normalizedMode)` in `frontend/app.js` (around 9016–9026). This is the single place that sets `data-viewport-mode` on `document.body` and `document.documentElement`.
- **What:** After setting the viewport attribute, update the theme-color meta tag:
  - **Mobile:** set `content` to **`#54B3D9`** (blue).
  - **Desktop:** set `content` to **`#71C43C`** (current green) so desktop browser chrome is unchanged.
- **How:**  
  - Select the meta tag with `document.querySelector('meta[name="theme-color"]')`.  
  - If it exists, set `meta.setAttribute('content', normalizedMode === 'mobile' ? '#54B3D9' : '#71C43C')`.  
  - If it does not exist (defensive), create it and append to `document.head`.
- **Initial load:** On first run, `applyViewportMode(detectViewportMode(), { announce: false })` is called (around line 8868). So:
  - If the page loads in a mobile viewport, meta is set to blue.
  - If the page loads in desktop, meta is set to green.
- **Resize / orientation:** `handleViewportResize` and the `orientationchange` handler already call `applyViewportMode(nextMode, …)`, so theme-color will stay in sync when the user switches between mobile and desktop layout.
- **Forced viewport:** `?viewport=mobile` and `?viewport=desktop` already drive `applyViewportMode` with the forced mode, so theme-color will match the forced mode.

No new dependencies; no change to build or Railway config.

### 4.2 HTML

- **No structural change.** Keep `<meta name="theme-color" content="#71C43C">` in `index.html` as the default (so before JS runs, or if JS fails, the fallback is current behaviour). JS will override it as soon as `applyViewportMode` runs.

### 4.3 CSS

- **No change.** The in-page toolbar is not green; no mobile-only background needs to be added or overridden.

### 4.4 Manifest (optional, document impact)

- **Option A (recommended for strict desktop parity):** Leave `theme_color` in `manifest.webmanifest` as **`#71C43C`**.  
  - In-browser mobile: blue (from JS meta).  
  - Installed PWA on mobile: still green (manifest is static).  
  - Desktop: unchanged.
- **Option B:** Change manifest `theme_color` to **`#54B3D9`**.  
  - Installed PWA on mobile: blue.  
  - **Installed PWA on desktop:** status bar would also become blue (manifest applies to all PWA launches).  
  - Only do this if product accepts desktop PWA chrome changing to blue.

Plan recommends **Option A** unless product explicitly wants PWA-on-mobile chrome blue (then use Option B and document the desktop PWA impact).

---

## 5. Edge cases and accessibility

1. **Meta tag missing:** Use `querySelector` and, if null, create `<meta name="theme-color" content="…">` and append to `document.head` so we never assume the tag exists.
2. **Resize / orientation:** Already covered; `applyViewportMode` is called on resize (debounced) and on `orientationchange`, so theme-color stays correct.
3. **No regression to desktop:** Desktop always gets `#71C43C` from JS when in desktop mode; initial HTML is also `#71C43C`. No desktop-only code path changes.
4. **Accessibility:** theme-color is cosmetic (browser chrome). No focus, contrast, or screen-reader behaviour change. Existing focus and live-region behaviour unchanged.

---

## 6. Verification

- **Mobile:** Open app in mobile viewport (or `?viewport=mobile`). Confirm browser chrome (status/address bar) is blue; in-page toolbar still white/glass; all actions work.
- **Desktop:** Open app in desktop viewport. Confirm browser chrome (if it uses theme-color) remains green; layout and behaviour unchanged.
- **Resize:** From desktop → narrow to mobile width (or use `?viewport=mobile`), then back to desktop. Confirm theme switches blue ↔ green as expected.
- **Railway:** No new env or build steps; push and deploy as usual. Static frontend only.

---

## 7. Task list update (draft)

Add under **Section 54** (before Section 55), as incomplete tasks:

- **[ ] 54.67** **Mobile: theme-color blue.** In `applyViewportMode`, update `<meta name="theme-color">`: when `normalizedMode === 'mobile'` set content to `#54B3D9`, when desktop set to `#71C43C`. Create meta if missing. Ensure no desktop behaviour or layout change.
- **[ ] 54.68** **Mobile: verify header blue and desktop unchanged.** Manual check: mobile viewport → blue chrome; desktop viewport → green chrome; resize/orientation and `?viewport=` switch correctly; Railway deploy unchanged.

Optional (if product wants PWA-on-mobile chrome blue):

- **[ ] 54.69** **(Optional) Manifest theme_color blue.** Change `manifest.webmanifest` `theme_color` to `#54B3D9` and document that desktop PWA will also show blue chrome.

---

## 8. Summary

| Item              | Action |
|-------------------|--------|
| Green source      | `index.html` meta theme-color `#71C43C`; `manifest.webmanifest` theme_color |
| In-page toolbar   | Not green; no CSS change |
| Change            | JS in `applyViewportMode`: set meta theme-color to `#54B3D9` when mobile, `#71C43C` when desktop |
| Desktop           | Unaffected (meta set to green when desktop) |
| Railway           | No backend/build changes; deploy as today |
