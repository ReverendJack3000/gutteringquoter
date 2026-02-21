# Mobile: Diagram Toolbar Thumbnail Blend (Darker Background, Squircle, Mesh Gradient, ultraThinMaterial)

**Date:** 2026-02-21  
**Scope:** Mobile-only visual styling for the diagram floating toolbar (“thumbnail” look). No function, HTML, or JS changes. Desktop unchanged. Railway-safe (CSS only).

**Reference:** User request — blend the background of the thumbnail look with a darker background; use Squircle (continuous corner) buttons, subtle mesh gradients, and heavy use of ultraThinMaterial background blur. DOM: `#diagramFloatingToolbar`, `#diagramToolbarDragHandle` (button with `.diagram-toolbar-grip-icon` SVG).

---

## 1. Current state (code-backed)

**Container** — `frontend/styles.css` ~2309–2333:

- `body[data-viewport-mode="mobile"] .diagram-floating-toolbar`
- `background: rgba(255, 255, 255, 0.75);`
- `-webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px);`
- `border-radius: 9999px` (pill)
- `box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.05);`
- `border: 1px solid rgba(0, 0, 0, 0.06);`
- Collapsed: `border-radius: 50%`, 48×48px, same background/blur in same block.

**Drag handle** — `frontend/styles.css` ~2559–2564:

- `body[data-viewport-mode="mobile"] .diagram-toolbar-drag-handle`
- `background: rgba(255, 255, 255, 0.78); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); border-color: rgba(0, 0, 0, 0.06);`

**Handle visibility (product requirement):** On mobile, when the toolbar is **expanded** (non-collapsed), the drag handle must **always be visible** and sit on the **inside** edge of the toolbar (toward the canvas center). Positioning is driven by toolbar dock state (e.g. `.is-docked-left` → handle on right edge of pill). When the toolbar is **collapsed** (the "+" circle), the handle may be hidden or go out of sight. If the current code hides the handle in both states (e.g. 54.79.1), implementation must **restore** handle visibility when **not** collapsed and apply the thumbnail blend styling; keep handle hidden when `.diagram-floating-toolbar--collapsed`. All new rules under `body[data-viewport-mode="mobile"]`; desktop unchanged.

---

## 2. Goal (no behaviour change)

- **Darker background:** Replace light white tint with a darker, translucent tint so the toolbar reads as a darker “thumbnail” that still blends with the canvas.
- **Squircle (continuous corner):** Use a fixed, moderate border-radius for expanded state (e.g. 14px–18px) for a squircle-like continuous corner; keep collapsed as circle (`border-radius: 50%`).
- **Subtle mesh gradients:** Add a subtle gradient overlay (e.g. radial or linear) so the surface has a soft mesh feel without overpowering content.
- **ultraThinMaterial:** Rely heavily on backdrop blur (increase or keep strong blur, optionally add saturation); no removal of blur.
- **Handle visible when expanded:** When the toolbar is expanded (not collapsed), the drag handle is visible on the inside edge and gets the thumbnail blend styling; when collapsed, the handle may be hidden or out of sight.

---

## 3. Implementation plan

### 3.1 Files and scope

- **File:** `frontend/styles.css` only.
- **Scope:** All new/edited rules under `body[data-viewport-mode="mobile"]`. No changes to desktop rules, no HTML, no JS.

### 3.2 Container: `body[data-viewport-mode="mobile"] .diagram-floating-toolbar`

- **Background:** Darker base, e.g. `background: rgba(45, 48, 52, 0.72);` or equivalent dark translucent colour so the pill reads darker but still blends.
- **Backdrop (ultraThinMaterial):** Keep or increase blur, e.g. `-webkit-backdrop-filter: blur(24px) saturate(1.15); backdrop-filter: blur(24px) saturate(1.15);`. No reduction of blur.
- **Squircle:** For **expanded** state, set a fixed border-radius (e.g. `border-radius: 16px;`). Do **not** change collapsed state radius (keep `border-radius: 50%` in the existing collapsed block).
- **Mesh gradient:** Add a subtle overlay via `background-image` (e.g. `radial-gradient` or layered `linear-gradient`) that works with the darker base; use a single declaration that combines base colour + gradient if needed (e.g. `background: linear-gradient(135deg, rgba(55,58,62,0.78) 0%, rgba(40,42,46,0.82) 100%);` or similar). Ensure contrast and icon visibility remain sufficient.
- **Border / shadow:** Adjust if needed for the darker look (e.g. slightly lighter border `rgba(255,255,255,0.08)` or subtle shadow) so the pill doesn’t look flat; keep existing transition rules for border-radius/box-shadow where they exist.

### 3.3 Collapsed state

- Same darker background + blur + (optional) mesh in the existing `body[data-viewport-mode="mobile"] .diagram-floating-toolbar.diagram-floating-toolbar--collapsed` block. Keep `border-radius: 50%` and 48×48 sizing. Ensure collapse/expand transition still applies to border-radius (e.g. 16px ↔ 50%).

### 3.4 Drag handle (visible when expanded, inside edge; may be hidden when collapsed)

- **Visibility:** On mobile, when the toolbar is **expanded** (not `.diagram-floating-toolbar--collapsed`), the handle must be visible (e.g. min 44×44px for touch) and positioned on the **inside** edge (existing `.is-docked-*` positioning unchanged). When **collapsed**, the handle may be hidden or out of sight — do not force visibility in collapsed state.
- **Styling (expanded only):** e.g. `body[data-viewport-mode="mobile"] .diagram-floating-toolbar:not(.diagram-floating-toolbar--collapsed) .diagram-toolbar-drag-handle`: thumbnail blend — darker background, blur, squircle corners. Desktop handle rules unchanged.

### 3.5 Inner buttons / tools

- If any inner controls (e.g. `.toolbar-pill-btn`, `.diagram-toolbar-collapse-btn`) need to read as “Squircle” buttons, add mobile-only overrides with the same fixed border-radius (e.g. 12px) and optional subtle gradient; preserve 44px min touch targets and focus-visible. Do not change behaviour.

### 3.6 Horizontal/vertical variants

- Existing blocks for `[data-orientation="horizontal"]` and `[data-orientation="vertical"]` keep their layout (flex, padding, gap). Only update background/border-radius/blur/gradient in the main mobile container (and handle) so both orientations get the new look.

---

## 4. Edge cases and safeguards

- **Desktop:** No new selectors without `body[data-viewport-mode="mobile"]`; no edits to shared desktop `.diagram-floating-toolbar` or `.diagram-toolbar-drag-handle` base rules.
- **Reduced motion:** Keep existing `prefers-reduced-motion` behaviour for transitions; do not add new animations that ignore it.
- **Accessibility:** Maintain sufficient contrast for icons and labels on the darker background; if needed, nudge border or icon colour so WCAG AA is preserved.
- **Railway:** CSS-only change; no new env, build, or dependencies.

---

## 5. Verification

- Manual: Mobile viewport — when **expanded**, toolbar and handle visible on the inside edge with darker blend, squircle corners, gradient, blur; when **collapsed**, handle may be hidden; collapse/expand and drag unchanged.
- Desktop: No visual or layout change.
- Run `npm test`; fix any E2E that depends on toolbar appearance only if assertions are too strict (prefer updating assertions over reverting the design).

---

## 6. Task list entry

- **Section:** 54 (Mobile app). Add as a new sub-task under the “Mobile-only diagram toolbar refinements” or “Diagram toolbar: Apple Freeform–style” area, e.g. **54.79.4** or next available number in section 54.
- **Title:** Mobile: Diagram toolbar thumbnail blend (darker background, Squircle, mesh gradient, ultraThinMaterial).
- **Acceptance:** Mobile diagram floating toolbar with darker blend, squircle, mesh gradient, blur; when **expanded**, drag handle visible on the inside edge with same styling; when **collapsed**, handle may be hidden; no function or desktop change; Railway-safe.
