# Plan: Mobile diagram toolbar disappearing at top – fix

**Date:** 2026-02-20  
**Scope:** Mobile-only diagram toolbar (`#diagramFloatingToolbar` / `.diagram-floating-toolbar`). No desktop behaviour changes.  
**Constraint:** All changes must remain deployable to Railway (no new dependencies or build steps).

---

## 1. Goal

Fix the mobile issue where the diagram toolbar can “disappear” when at the top, by (1) removing dead “swipe away” code that could hide it, (2) hardening clamp/layout so the toolbar never stays off-screen, and (3) confirming scroll/layout does not put the toolbar above the visible area on mobile.

---

## 2. Verified findings from codebase

### 2.1 Deprecated “swipe away” behaviour (`diagram-toolbar-hidden`)

| Location | What exists |
|----------|-------------|
| **CSS** `frontend/styles.css` ~2126–2130 | `body[data-viewport-mode="mobile"] .diagram-floating-toolbar.diagram-toolbar-hidden { transform: translateX(-50%) translateY(calc(-100% - 1rem)); opacity: 0; pointer-events: none; }` – when the class is present, toolbar is moved off-screen and hidden. |
| **JS** `frontend/app.js` line 5626 | `toolbar.classList.remove('diagram-toolbar-hidden');` inside `initDiagramToolbarDrag()` – class is only ever **removed**, never added. |
| **HTML** `frontend/index.html` line 141 | `<div class="diagram-floating-toolbar" id="diagramFloatingToolbar" ...>` – initial markup does **not** include `diagram-toolbar-hidden`. |

**Conclusion:** No code path in the repo adds `diagram-toolbar-hidden`. The add-path (e.g. swipe-to-hide) has been removed; only the “show again” side remains (removal in init + the CSS rule). If the class were ever added (e.g. by leftover state or an unknown path), the toolbar would stay hidden until the next time `initDiagramToolbarDrag()` runs (e.g. switching to canvas view, or viewport switch to mobile). Removing the dead CSS and the redundant `classList.remove` eliminates this hide path entirely and avoids any future code accidentally reusing the class.

### 2.2 Clamp / layout

| Location | Behaviour |
|----------|-----------|
| **JS** `frontend/app.js` 5580–5597 | `clampDiagramToolbarToWrap(toolbar, wrap)` uses `wrap.getBoundingClientRect()` and a pad of 8px to keep the toolbar inside the wrap. |
| **Early return** 5586–5587 | `if (ww < 20 || wh < 20) return;` – when the wrap is too small (e.g. mobile layout not yet ready), clamp is **skipped** and the toolbar keeps its current position, which can be off-screen. |

**Conclusion:** “Disappear after collapse” and “disappear when at top” can both be the same kind of timing/layout issue: clamp is skipped when wrap dimensions are invalid, so the toolbar is never corrected. Task 54.50 already calls out: run clamp after collapsed layout (e.g. double rAF) and ensure the toolbar stays on-screen on resize.

### 2.3 Top zone and orientation

| Location | Behaviour |
|----------|-----------|
| **JS** `frontend/app.js` 5661–5664 | In `updateOrientationFromPosition()`, when the toolbar is in the top zone, `toolbar.style.top = pad + 'px'` (12px). That is valid; the only way it “disappears” from that is if the wrap is scrolled or the wrap’s visible area does not include that top. |

### 2.4 Scroll and containment

| Location | Behaviour |
|----------|-----------|
| **CSS** `frontend/styles.css` 1209–1220 | `.blueprint-wrap` has `position: relative; overflow: hidden`. The diagram toolbar is `position: absolute` inside it, so it does not scroll with page scroll. |
| **CSS** body ~23 | `body { overflow: hidden; height: 100vh; }` – no body scroll. |
| **Mobile** | `.workspace` and `#view-canvas` do not introduce a scroll container for the canvas area; mobile `.blueprint-wrap` only adds `min-width: 0`. |

**Conclusion:** The toolbar is not inside a scrollable area that would move it out of view. “Disappear at top” is therefore either (1) the deprecated `diagram-toolbar-hidden` class being present, or (2) clamp being skipped so the toolbar keeps an out-of-view position (e.g. from a previous layout or collapse).

### 2.5 Where `initDiagramToolbarDrag()` runs

- ~5838: when canvas is set up (during app/canvas init).
- ~9023: when viewport switches to mobile (`applyViewportMode` → `requestAnimationFrame(() => initDiagramToolbarDrag())`).
- ~10133: when `switchView()` shows `view-canvas` (after `resizeCanvas(); draw();`).

So the class is cleared on every re-init; if something ever added the class, it would stay hidden until one of these paths runs.

---

## 3. Recommended implementation (no code written yet)

### 3.1 Remove dead “swipe away” UX (mobile-only)

- **CSS** `frontend/styles.css`: Remove the block at ~2126–2130:  
  `body[data-viewport-mode="mobile"] .diagram-floating-toolbar.diagram-toolbar-hidden { ... }`
- **JS** `frontend/app.js`: Remove the single line 5626:  
  `toolbar.classList.remove('diagram-toolbar-hidden');`  
  inside `initDiagramToolbarDrag()`.

**Desktop impact:** None. The rule is under `body[data-viewport-mode="mobile"]`; the JS line only removed a class that is never set in the current codebase.

**E2E / regression:** No E2E test references `diagram-toolbar-hidden`; grep only finds `diagram-floating-toolbar--collapsed`. Safe to remove.

### 3.2 Harden clamp / layout (54.50)

- **When clamp is skipped** (`ww < 20 || wh < 20`): Do not leave the toolbar at an old position. Either:
  - **Option A:** Apply a safe default position (e.g. `left: pad`, `top: pad`) when clamp bails out, so the toolbar is always in a valid region once the wrap has size; or
  - **Option B:** Schedule a single retry (e.g. `requestAnimationFrame` or `setTimeout(..., 0)`) to call `clampDiagramToolbarToWrap` again when layout may have settled.
- **After collapse:** Already using double rAF in `onCollapseClick()` (5775–5779) before calling `clampDiagramToolbarToWrap`. Verify on mobile that the wrap has valid dimensions by the second rAF; if not, consider a short delay or the fallback position above.
- **ResizeObserver:** Already calls `clampDiagramToolbarToWrap` and `updateOrientationFromPosition` on wrap resize (5806–5810). Ensure when wrap was previously too small and then grows, clamp runs and brings the toolbar back on-screen.

**Desktop impact:** Clamp and ResizeObserver are shared; any change to `clampDiagramToolbarToWrap` (e.g. fallback when dimensions invalid) applies to both. The fallback position (pad, pad) is valid for desktop and mobile; no viewport-specific branch required unless desired.

### 3.3 Inspect scroll (verification only)

- On mobile, manually confirm: with the toolbar at the top (top zone, horizontal), it remains visible and not clipped.
- Confirm that neither `.workspace` nor `#view-canvas` nor `.blueprint-wrap` introduces a scroll that would move the toolbar out of view. Code inspection above says they do not; QA confirms.
- If any edge case appears (e.g. a parent with overflow/scroll in a specific flow), document in TROUBLESHOOTING and adjust layout or clamping as needed (e.g. minimum top or scroll compensation). No change required if verification passes.

---

## 4. Edge cases and accessibility

- **Wrap not yet laid out on first paint (mobile):** Handled by 3.2 (fallback position or retry clamp when dimensions were invalid), so the toolbar does not stay at an old off-screen position.
- **Resize / orientation change:** ResizeObserver already re-runs clamp and orientation; fallback in clamp ensures that after a resize from “tiny” to “valid” wrap, the toolbar is corrected.
- **No new ARIA or keyboard behaviour:** Changes are layout/CSS and one class removal; no new interactive behaviour. Existing 44px targets and focus order unchanged.
- **Railway:** No new dependencies or build steps; frontend remains static files served by FastAPI.

---

## 5. Task list alignment

- **54.50** already: “Mobile: Toolbar never disappears after collapse. Verify clamp runs after collapsed layout (double rAF), wrap dimension guard prevents off-screen position; toolbar remains on-screen after collapse and on resize.”  
  Implementation will satisfy this by: (1) ensuring clamp never “no-ops” without a safe state (fallback or retry), (2) keeping double rAF after collapse.
- **New task (recommended):** “Mobile: Remove dead diagram-toolbar-hidden (swipe-away) code.” – Remove the mobile-only CSS rule and the redundant `classList.remove` in `initDiagramToolbarDrag`.
- **54.52 / 54.53:** Include in QA checklist: “Toolbar at top (horizontal) stays visible; no disappear after collapse or when at top.”

---

## 6. Summary

| Finding | Action |
|--------|--------|
| Deprecated “swipe away” | Remove `body[data-viewport-mode="mobile"] .diagram-floating-toolbar.diagram-toolbar-hidden` rule and `toolbar.classList.remove('diagram-toolbar-hidden')` in app.js. |
| Clamp skipped when wrap too small | In `clampDiagramToolbarToWrap`, when `ww < 20 || wh < 20`, apply a safe default position (or retry clamp) so the toolbar never remains off-screen. |
| Scroll | Verification only; code shows no scroll container that would hide the toolbar; add to 54.52/54.53 QA. |

All changes are mobile-safe and desktop-safe; deployment to Railway unchanged.
