# Plan: Team Pool Button & Bonus View UI/UX Improvements

**Scope:** Mobile-only “team pool” toolbar button (`#mobileBonusDashboardBtn`) and, where it improves consistency, the technician bonus view header (e.g. Refresh in `.technician-bonus-header-right`). No backend or Railway deploy changes.

**Context:** Single codebase; desktop vs mobile via `body[data-viewport-mode="mobile"]`. Button is already mobile-only (`hidden` by default, shown only in mobile viewport). All new/changed rules must be scoped so desktop remains unchanged.

---

## 1. Goal

- Make the **team pool** button look clearly better: clearer hierarchy, polish, and optional light motion so it feels intentional and “premium” without being noisy.
- Add **behavioural/UX** improvements (feedback, affordance, optional notification cue) following common mobile and Apple HIG–style patterns.
- Optionally align the **bonus view header** (e.g. Refresh) so the whole bonus flow feels consistent.

---

## 2. Desktop vs Mobile

- **Mobile:** All visual and behavioural changes apply only on mobile (toolbar button is already mobile-only; bonus view is used on both, but Refresh styling can be scoped by view or left global if it’s a generic `.btn-text-icon`).
- **Desktop:** No change to desktop toolbar or layout. Ensure:
  - Any new/updated CSS for the team pool button is under `body[data-viewport-mode="mobile"]` (or within the existing `#mobileBonusDashboardBtn` block that is already mobile-scoped).
  - No new JS that runs in desktop viewport for this button (visibility logic already exists).
- **Bonus view Refresh:** If we style `#btnBonusRefresh` or `.technician-bonus-header-right`, use existing patterns; bonus view is used on desktop and mobile, so prefer shared base styles with optional mobile overrides only if needed.

---

## 3. Proposed Improvements

### 3.1 Visual (Team Pool Button)

- **Hierarchy and shape**
  - Keep pill shape (`border-radius: 999px`) but refine:
    - Slightly softer gradient or a single tint with subtle inner highlight so it doesn’t look flat.
    - Optional very light `box-shadow` (e.g. 0 1px 3px rgba(0,0,0,0.08)) for depth; ensure it doesn’t clash with `body.a11y-high-contrast` (consider `:not(.a11y-high-contrast)` for shadow).
  - Border: keep 1px but consider a slightly warmer or more defined border (e.g. `#e6b84d` or similar) so the button reads as “interactive” and distinct from the toolbar background.

- **Icon and label**
  - Icon: keep star/badge SVG; ensure it’s optically centered and same effective size as other toolbar icons (e.g. 20px). Optional: very subtle scale on press (see behaviour).
  - Label: keep “team pool”; consider slightly larger font (e.g. 13px) and consistent font-weight (600–700) for better legibility. Letter-spacing already set (0.02em); keep or slightly increase for clarity.

- **Colour and contrast**
  - Keep gold/amber theme (team pool = reward) but refine for WCAG and polish:
    - Background: e.g. `linear-gradient(180deg, #fff9e6 0%, #ffefc2 100%)` or a single `#fff5d6` with a 1px top highlight.
    - Text/icon: ensure contrast ratio ≥ 4.5:1 on the background (e.g. `#7a5a00` or `#6b4e00`).
  - In high-contrast mode: no new overrides; rely on existing `body.a11y-high-contrast` rules so the button stays safe.

- **States**
  - **Default:** As above.
  - **Hover (pointer):** Slightly darker background or stronger border so it’s clear it’s tappable (e.g. background tint shift, border `#d4a843`).
  - **Active / pressed:** Light scale (e.g. `transform: scale(0.97)`) and/or slightly darker background for 100–150ms so tap feels responsive.
  - **Focus-visible:** Clear focus ring (2px outline or box-shadow) that meets contrast requirements; don’t rely only on colour change.

### 3.2 Behavioural / UX (Team Pool Button)

- **Tap feedback**
  - On pointerdown/touchstart: apply active state (scale and/or colour) immediately; on pointerup/touchend remove after a short delay (e.g. 100–150ms) so the press feels instant. Use CSS `:active` for simplicity; if we need to avoid sticky active on scroll, consider a short `touch-action` or JS only if necessary.

- **Optional: “has updates” cue**
  - If the product roadmap includes “new activity in team pool”:
    - Small dot or badge on the button (e.g. top-right) when there’s unseen updates.
    - Requires a small amount of state (e.g. “last viewed bonus at T” vs “last server update at T”); could be a later phase. In the plan, only add the **visual hook** (e.g. `.mobile-bonus-btn--has-updates` with a dot) and leave wiring to a future task.

- **Reduced motion**
  - Respect `prefers-reduced-motion: reduce`: no scale or short transitions on the button (e.g. `transition: none` or only `color`/`background`).

### 3.3 Technician Bonus View Header (Refresh)

- **Consistency**
  - Make Refresh in `.technician-bonus-header-right` clearly a secondary action:
    - Same `.btn-text-icon` pattern; ensure min touch target 44px on mobile (padding/min-height).
    - Optional: icon + “Refresh” with a subtle hover/active state (e.g. opacity or background) so it feels consistent with the rest of the app.
  - No major layout change; only polish so the header doesn’t feel bare next to an improved team pool entry point.

### 3.4 Implementation Outline

- **HTML (`index.html`)**
  - Team pool button: no structural change required. Optional: add a `span` for a future notification dot (e.g. `<span class="mobile-bonus-btn-dot" aria-hidden="true" hidden></span>`) so we can show/hide via JS later without changing markup again.
  - Bonus header: no change unless we add a class for “loading” on Refresh (e.g. `aria-busy` + spinner); can be phase 2.

- **CSS (`styles.css`)**
  - All under existing `body[data-viewport-mode="mobile"]` (and optionally `:not(.a11y-high-contrast)` for shadows/gradients):
    - Refine `#mobileBonusDashboardBtn` gradient, border, and optional shadow.
    - Add `#mobileBonusDashboardBtn:hover` and `#mobileBonusDashboardBtn:active` (and `:focus-visible`).
    - Optional: `.mobile-bonus-btn-dot` for future badge (positioned top-right, small circle, hidden by default).
    - Add `@media (prefers-reduced-motion: reduce)` overrides for this button (no transform, minimal transition).
  - Bonus view: if needed, add or tweak `.technician-bonus-header-right .btn-text-icon` for 44px min height on mobile and a subtle hover/active state.

- **JS (`app.js`)**
  - No change for basic visual/behaviour improvements. Optional later: when “team pool has updates” is defined, show/hide the dot (e.g. set `hidden` on `.mobile-bonus-btn-dot` and add/remove a class on the button).

---

## 4. Edge Cases & Accessibility

- **High contrast:** All decorative effects (gradient, box-shadow) must not break existing `body.a11y-high-contrast` overrides. Use `:not(.a11y-high-contrast)` for any new gradient/shadow on the button so the global high-contrast rules still apply.
- **Focus and keyboard:** Button remains focusable; ensure `:focus-visible` has a visible outline (and that it’s not removed by a global reset). Don’t rely on colour alone for focus.
- **Reduced motion:** Respect `prefers-reduced-motion` so users who need it don’t get scale or distracting transitions.
- **Touch and scroll:** If the toolbar scrolls or is in a flex wrap, ensure `:active` doesn’t get stuck (standard `:active` is usually fine; if we add JS for feedback, avoid capturing touch in a way that blocks scroll).
- **RTL:** No layout change expected; icon + label in a row is RTL-safe if we use logical properties or keep margin/padding symmetric.

---

## 5. Task List Update (Draft)

- If this is tracked as a single task (e.g. under Section 54 or 59), after implementation:
  - In the relevant section file (e.g. `docs/tasks/section-54.md` or `docs/tasks/section-59.md`): add or check off a task such as “Mobile team pool button: visual and interaction polish (gradient, states, focus-visible, reduced-motion).”
  - If a section’s uncompleted table in `TASK_LIST.md` lists this work, update the description or remove the row when the section is complete.
- Suggested task title: **Mobile team pool button UI/UX polish** (visual hierarchy, hover/active/focus states, optional notification hook, accessibility and reduced-motion).

---

## 6. Summary Checklist (for implementation)

- [x] Refine team pool button gradient/border/shadow (mobile-only, high-contrast safe).
- [x] Add hover and active (and focus-visible) states; keep 44px min touch target.
- [x] Optional: notification dot markup + CSS (hidden by default); no JS wiring yet.
- [x] Respect `prefers-reduced-motion` (no or minimal transform/transition).
- [x] Optionally polish Refresh in technician bonus header (44px, subtle states).
- [x] Verify desktop unchanged; run E2E and manual check on mobile.
- [ ] Update task list when done (optional: add task to section 54 or 59 if tracking).

---

*Plan created 2026-02-26. Approve before implementation.*
