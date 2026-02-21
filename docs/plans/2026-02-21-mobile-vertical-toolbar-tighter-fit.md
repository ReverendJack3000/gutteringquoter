# Plan: Mobile Vertical Diagram Toolbar – Tighter Fit (and Optional Drag Handle Span Cleanup)

**Date:** 2026-02-21  
**Goal:** Make the diagram floating toolbar on mobile (vertical orientation) a tighter fit so it is not needlessly long (e.g. 70×428px). Optionally address the empty `<span>` inside the drag handle for a cleaner DOM. Mobile-only for layout; optional span change is global DOM/CSS. No assumptions; desktop and Railway unchanged.

---

## 1. Context

- **Single codebase:** Desktop and mobile via `body[data-viewport-mode="mobile"]` and `layoutState.viewportMode`.
- **Diagram toolbar:** `#diagramFloatingToolbar` inside `#blueprintWrap`. When `data-orientation="vertical"` it’s a column: drag handle (44×44) + collapse button (44×44) + `.diagram-toolbar-tools-wrap` (tools in a column).
- **Observed issue:** On mobile, vertical toolbar is **70px wide × 428px tall** – the height is “needlessly long” and should be a tighter fit to content.
- **Drag handle:** `#diagramToolbarDragHandle` is a `<button>` containing a single empty `<span aria-hidden="true"></span>`. The button has fixed 44×44; the grip is drawn with `::before`. The span has `.diagram-toolbar-drag-handle span { display: block; width: 100%; height: 100%; }`. No JS references the span; only the button is used.

---

## 2. Root Cause of “Needlessly Long” Height

- **Mobile base rule** (2130–2155): `body[data-viewport-mode="mobile"] .diagram-floating-toolbar` sets `max-height: calc(100% - 24px)` and `width: auto`, and does **not** set `height` or `align-self`. So the toolbar can grow up to the wrap height.
- **Shared vertical tools-wrap** (1306–1310): `.diagram-floating-toolbar[data-orientation="vertical"] .diagram-toolbar-tools-wrap` sets `max-height: 60vh`. That applies on both desktop and mobile, so on a ~667px viewport the tools-wrap can be ~400px tall.
- **Flex behavior:** With `flex-direction: column` and `justify-content: flex-start`, the column doesn’t shrink by default; the tools-wrap (with 60vh max-height) can take a lot of space, so the **overall toolbar** becomes very tall (e.g. 428px).

So the length comes from (1) toolbar allowed to fill available height and (2) vertical tools-wrap having a large max-height (60vh) on mobile.

---

## 3. Proposed Changes (Mobile Only for Layout)

### 3.1 Vertical toolbar: height fits content (mobile only)

- **Where:** `frontend/styles.css`, under `body[data-viewport-mode="mobile"]`.
- **What:** For vertical orientation only, make the toolbar size to its content instead of stretching:
  - Add: `body[data-viewport-mode="mobile"] .diagram-floating-toolbar[data-orientation="vertical"]` with:
    - `height: fit-content;` (or `max-height: fit-content;` where supported), and/or
    - `align-self: flex-start;` if the toolbar is ever a flex child of the wrap (currently it’s absolute, so this may be N/A), and
    - Ensure the toolbar doesn’t grow past content: e.g. `max-height: min(fit-content, calc(100% - 24px));` if we still want a safety cap.
  - Prefer `height: fit-content` so the toolbar’s height is the sum of its children (drag handle + gap + collapse btn + gap + tools-wrap height). That gives a “tighter” pill.

### 3.2 Vertical tools-wrap: cap height + scroll on mobile (mobile only)

- **Where:** Same file, mobile-only.
- **What:** Override the shared `max-height: 60vh` for vertical tools-wrap on mobile so the column of tools doesn’t dominate, and **enable vertical scroll** when content exceeds the cap:
  - Add: `body[data-viewport-mode="mobile"] .diagram-floating-toolbar[data-orientation="vertical"] .diagram-toolbar-tools-wrap` with:
    - `max-height: min(50vh, 280px);` (or similar) so the tools column is capped and the overall toolbar shortens.
    - **`overflow-y: auto;`** so when the toolbar has many items and content exceeds the cap, the user can scroll within the pill. Optionally hide scrollbar for a cleaner look: `scrollbar-width: none;` and `::-webkit-scrollbar { display: none; }` (match horizontal toolbar pattern).
  - Ensure `overflow-x` remains `hidden` (or unchanged) so the vertical pill doesn’t gain horizontal scroll.

Result: On mobile, vertical toolbar height = drag (44) + gap + collapse (44) + gap + tools-wrap (capped at e.g. 280px), with scroll inside the tools-wrap when there are many items; 44px touch targets preserved.

---

## 4. Optional: Empty Drag Handle Span (Cleanup)

- **Observation:** The drag handle’s inner `<span aria-hidden="true"></span>` is empty and only used for CSS `width: 100%; height: 100%;`. The button already has fixed 44×44 and the grip is `::before`; no JS references the span.
- **Options:**
  - **A. Remove span (HTML + CSS):** Remove the `<span>` from `index.html` and remove the rule `.diagram-toolbar-drag-handle span { display: block; width: 100%; height: 100%; }`. Cleaner DOM; behavior unchanged.
  - **B. Keep span:** Leave as-is if you prefer to keep a stable hook for future styling or a11y.

Recommendation: **A** for a simpler DOM; scope is one line in HTML and one rule in CSS. No mobile-only requirement for this; it’s a global cleanup.

---

## 5. What Not to Change

- **Desktop:** No change to desktop vertical or horizontal toolbar layout. The 60vh for vertical tools-wrap remains for desktop.
- **Horizontal mobile toolbar:** No change; horizontal layout and scroll behavior stay as implemented.
- **Touch targets:** 44×44 for drag handle and collapse button remain on mobile.
- **Railway:** No build or config changes; CSS (and optional HTML) only.

---

## 6. Edge Cases

1. **Many tools / small viewport:** With a lower tools-wrap max-height (e.g. 280px), if there are many tools some may be off-screen. Mitigation: set **overflow-y: auto** on the vertical tools-wrap (mobile only) so the user can scroll within the pill when content exceeds the cap; optionally hide the scrollbar for a clean look.
2. **Collapsed state:** Collapsed toolbar stays 48×48; no change.
3. **Orientation switch:** When switching vertical ↔ horizontal, the new mobile rules only apply when `data-orientation="vertical"`; horizontal rules are unchanged.

---

## 7. Verification

- Manual: Load app with `?viewport=mobile`, resize to 375×667, drag diagram toolbar to left or right so it’s vertical. Confirm toolbar height is visibly reduced (tighter pill) and all tools remain usable.
- E2E: Run `npm test`; mobile diagram toolbar tests (collapse/expand, drag to edges, scroll) should still pass.
- Desktop: Confirm vertical toolbar on desktop unchanged (no regression).

---

## 8. Task List (Draft)

- See TASK_LIST.md Section 54 tasks **54.78.1–54.78.5** (and optional 54.78.6) for the detailed uncompleted task list; update uncompleted table at top of TASK_LIST as needed.

This plan avoids assumptions and limits layout changes to mobile only; the optional span cleanup is global but low-risk.

---

## 9. Code-verified implementation summary (no assumptions)

*Verified against `frontend/styles.css`, `frontend/index.html`, `frontend/toolbar.js`, and E2E references. Railway: CSS/HTML only, no build or config changes.*

### 9.1 Where to add CSS

- **File:** `frontend/styles.css`
- **Placement:** Inside the existing mobile diagram-toolbar block. The base mobile toolbar rule is at **2130–2155**; the existing mobile **vertical** tools-wrap rule is at **2236–2240** (`body[data-viewport-mode="mobile"] .diagram-floating-toolbar[data-orientation="vertical"] .diagram-toolbar-tools-wrap` with only `flex-direction: column; flex-wrap: nowrap;`). New rules must be **after** 2236 so they override the base mobile tools-wrap rule at 2156–2159 (`overflow: hidden`).

### 9.2 Exact changes (54.78.1–54.78.4)

| Task   | Selector | Property / change |
|--------|----------|-------------------|
| 54.78.1 | `body[data-viewport-mode="mobile"] .diagram-floating-toolbar[data-orientation="vertical"]` | Add **new rule**: `height: fit-content;`. Base rule already has `max-height: calc(100% - 24px)` so no extra cap needed. Toolbar is `position: absolute` so `align-self` is N/A. |
| 54.78.2 | `body[data-viewport-mode="mobile"] .diagram-floating-toolbar[data-orientation="vertical"] .diagram-toolbar-tools-wrap` | **Extend** the existing rule at 2236–2240 (or add adjacent block): `max-height: min(50vh, 280px);` to override shared 60vh from 1306–1310. |
| 54.78.3 | Same as 54.78.2 | In same rule: `overflow-y: auto;`. Explicitly keep `overflow-x: hidden` (or omit; base has `overflow: hidden`; this selector is more specific so overflow-y: auto overrides for y-axis only). |
| 54.78.4 | Same selector + `::-webkit-scrollbar` | Optional: `scrollbar-width: none;` and a separate rule `...vertical] .diagram-toolbar-tools-wrap::-webkit-scrollbar { display: none; }` (mobile-only), matching the horizontal pattern at 2234–2235. Touch scroll still works. |

### 9.3 Optional cleanup (54.78.6)

- **HTML:** `frontend/index.html` line ~143: remove the inner `<span aria-hidden="true"></span>` from `#diagramToolbarDragHandle`.
- **CSS:** Remove the rule at **2298–2302** (`.diagram-toolbar-drag-handle span { display: block; width: 100%; height: 100%; }`). No JS references the span (`toolbar.js` uses `diagramToolbarDragHandle` only).

### 9.4 Verification (54.78.5)

- Run `npm test` (E2E: `e2e/run.js` and `e2e/toolbar-collapse-expand.js` reference `#diagramFloatingToolbar`; mobile tests around 1435–1586).
- Desktop: no new selectors apply; shared rule at 1306–1310 unchanged for non-mobile.
- Manual: `?viewport=mobile`, 375×667, drag toolbar to left/right (vertical); confirm shorter pill and scroll inside tools when many items.

### 9.5 What not to touch

- Do not change `body[data-viewport-mode="mobile"] .diagram-floating-toolbar` (2130–2155) except via a **more specific** rule for `[data-orientation="vertical"]` (height: fit-content only).
- Do not modify horizontal mobile rules (2208–2235) or desktop vertical rules (1306–1310).
- Base mobile tools-wrap (2156–2159) stays; our vertical override is more specific and only applies when `data-orientation="vertical"`.

---

## 10. Future expansion: horizontal view (out of scope for 54.78)

We may want to tighten the **horizontal** diagram toolbar on mobile in a later pass (e.g. constrain height or make the horizontal pill a tighter fit). That would be a separate plan and task set; 54.78 is strictly vertical only. Horizontal toolbar currently uses single row + horizontal scroll (54.77); no change in this plan.
