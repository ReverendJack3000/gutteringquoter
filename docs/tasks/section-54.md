## 54. Mobile app

*Context: Same URL serves desktop and mobile; layout is adaptive via `data-viewport-mode`. Use this section to distinguish desktop-only, mobile-only, and universal changes.*

**Desktop-only (unchanged by mobile work)**

- Layout: left 2/3 blueprint, right 1/3 resizable panel; resizer drag; panel collapse = narrow strip with chevron.
- No change to existing desktop behaviour when viewport is wide or pointer is fine.

**Mobile-only (narrow viewport / coarse pointer)**

- Products panel: bottom sheet (54.5); close by button or tap outside or Escape.
- Toolbar and diagram toolbar: compact; touch targets increased (44px minimum).
- Focus management: opening panel focuses close button; closing focuses open tab; live region announces.
- Panel exposed as `role="dialog"` `aria-modal="true"` when expanded on mobile.

**Universal (both)**

- Skip link, app announcer, aria-labels, focus-visible styles, reduced-motion preferences where applied.

**Completed**

- [x] **54.1** Adaptive layout: mobile = slide-out products panel from right; desktop = resizable side panel.
- [x] **54.2** Mobile touch targets 44px minimum (toolbar, panel toggles, product thumbs, diagram toolbar).
- [x] **54.3** Focus management and live region when panel opens/closes on mobile.
- [x] **54.4** Panel as dialog (aria-modal) when expanded on mobile; reduced motion for panel and skip link.

**Accessibility improvements (laundry list)**

- [x] **54.5** **Move parts panel to bottom of screen on mobile** (instead of right slide-out): bottom sheet or bottom drawer so blueprint stays full-width and products are in a lower tray; improves one-handed use and thumb reach.
- [x] **54.6** Ensure all interactive elements have visible focus indicators (focus-visible) on mobile.
- [x] **54.7** Screen reader: announce canvas state changes (e.g. "Element selected", "Blueprint uploaded") via live region where useful.
- [x] **54.8** Colour contrast: verify all mobile UI text and controls meet WCAG AA (4.5:1 text, 3:1 large text and UI components).
- [x] **54.9** Form labels: ensure every form control has an associated visible or screen-reader-only label on mobile.
- [x] **54.10** Touch target spacing: maintain adequate spacing between adjacent 44px targets to reduce mis-taps.
- [x] **54.11** Zoom: ensure viewport allows pinch-zoom (no user-scalable=no); test that layout doesn't break at 200% zoom on mobile.
- [x] **54.12** Orientation: test and fix layout in both portrait and landscape on small phones.
- [x] **54.13** Modal and overlay focus trap: when products panel (or other modal) is open on mobile, trap focus inside until closed and restore focus on close (partially done; verify and extend).
- [x] **54.14** Error messages: ensure API/validation errors are announced (e.g. role="alert" or live region) and visible on mobile.
- [x] **54.15** Loading states: provide accessible loading indicators (aria-busy, aria-live, or visible text) for uploads and API calls on mobile.

**Canvas and toolbar UX (uncompleted)**

- [x] **54.16** **Mobile: no drag-to-select; pan instead.** On mobile, do not use marquee/drag-to-select on the canvas. Instead, allow the user to move around (pan) on the canvas so they can navigate the blueprint without accidentally starting a selection.
- [x] **54.17** **Pinch zoom:** Ensure pinch-to-zoom on the canvas is flawless and smooth (no jank, responsive to gesture, correct scale limits and inertia if applicable).
- [x] **54.18** **Parts formatting:** Ensure proper formatting of placed parts so they do not overlap (e.g. layout/positioning rules, spacing, or snap-to-grid so elements stay readable and non-overlapping).
- [x] **54.19** **Global toolbar: collapsible and movable.** Allow the global (top) toolbar to be collapsed and moved around the screen so the user can free up space; position is user-adjustable (e.g. drag to reposition).
- [x] **54.20** **Element toolbars: movable.** Allow the element-specific toolbars (e.g. floating toolbar for selection actions) to be moved around the screen for more space. No need to add collapse for element toolbars—movable only.

**Projects header and diagram menu (mobile-only, Apple HIG)**

- [x] **54.21** **Unhide and position "Projects / Untitled" on mobile.** Ensure the header is visible in the top-left of the mobile toolbar; style as a clean tappable area (system font, semi-bold project name, downward chevron); min 44px touch target. No desktop changes.
- [x] **54.22** **Add mobile-only bottom sheet container and backdrop.** New DOM (e.g. diagrams bottom sheet + backdrop) and CSS: translucent backdrop (bg-black/40, backdrop-blur), sheet with white/system background, 24px top rounded corners, gray pill drag handle. All styling under `body[data-viewport-mode="mobile"]`; desktop never uses this.
- [x] **54.23** **Wire mobile to open/close bottom sheet; desktop unchanged.** On mobile, tapping the Projects header (and optionally clock icon) opens the bottom sheet and populates it with the same diagram list; close on backdrop tap and Escape; focus trap and restore. Desktop keeps current dropdown behaviour.
- [x] **54.24** **Format bottom sheet list and delete (Apple style, mobile only).** Rows: min 44px height, flex layout, diagram name left (16px, high-contrast), 1px bottom border between rows. Trash icon trailing, Apple red (#FF3B30); keep iOS-style confirmation or smooth fade-out on delete. Desktop list styling unchanged.
- [x] **54.25** **Accessibility and regression.** Bottom sheet: role="dialog", aria-modal, focus trap, Escape close, focus restore; delete buttons labelled. Verify no desktop regression; mobile 200% zoom and orientation.

**Freeform-style UI refinements (mobile + desktop)**

- [x] **54.26** **Header static.** Remove all drag functionality from the top header; header is fixed at top. Drag handle hidden; collapse button retained.
- [x] **54.27** **Diagram toolbar: Freeform-style draggable + edge snapping.** Main action pill (zoom, technical drawing, etc.) is freely draggable on desktop and mobile. When dragged to left or right edge of canvas area, reorient into vertical pill; otherwise horizontal. Position and orientation persisted in localStorage.
- [x] **54.28** **Pencil icon for technical drawing.** Replace blueprint icon with pencil (SF Symbol–style SVG) on the technical drawing toggle for clearer iconography on desktop and mobile.
- [x] **54.29** **Mobile Undo/Redo.** Add redo stack and Cmd+Shift+Z / Ctrl+Shift+Z. Add visible Undo and Redo buttons in mobile header (curved-arrow icons) with 44×44px touch targets; disabled when stack empty.
- [x] **54.30** **Mobile header title top-left.** "Projects / Untitled" strictly anchored to top-left on mobile; hide toolbar-center on mobile so title is not centered.
- [x] **54.31** **Saved diagrams backdrop tap.** Backdrop tap (and pointerdown for instant close on touch) closes the bottom sheet alongside swipe/drag handle and Escape.
- [x] **54.31.1** **Mobile: tap outside Saved diagrams sheet (e.g. on canvas) closes sheet.** When the Saved diagrams bottom sheet is open, a tap outside the sheet onto the canvas (or any area in `#view-canvas` that is not the sheet) collapses the sheet. Mobile-only; use pointerdown on `#view-canvas` (capture), gate by `layoutState.viewportMode === 'mobile'` and `!sheet.contains(e.target)`; call `closeAccessibleModal('diagramsBottomSheet')` and preventDefault/stopPropagation. Plan: docs/plans/2026-02-22-saved-diagrams-tap-outside-canvas-close.md.
- [x] **54.32** **Mobile Products auto-close.** When user taps a product in the bottom Products menu, add element to canvas and immediately close the Products panel for maximum canvas visibility.

**Audit remediation (Mobile Freeform UI refinements)**

- [x] **54.33** **Diagram toolbar & global toolbar: teardown.** Diagram toolbar: disconnect ResizeObserver and remove document pointer listeners (and drag-handle/toolbar listeners) so re-initialization (e.g. on viewport switch to mobile) does not duplicate listeners; make initDiagramToolbarDrag idempotent (run cleanup before re-init). Global toolbar: store MutationObserver reference and add disconnect path (idempotent init or future teardown) so Undo/Redo aria-hidden observer is not leaked.
- [x] **54.34** **Diagram toolbar: orientation on resize.** In the diagram toolbar ResizeObserver callback, after clampDiagramToolbarToWrap, call updateOrientationFromPosition() (when not dragging) so device rotation or window resize recalculates horizontal/vertical orientation.
- [x] **54.35** **Diagram toolbar drag handle: 44×44 touch target and HTML label.** Increase drag handle hit area to at least 44×44 px (Apple HIG / WCAG 2.5.5) via padding or min-size while keeping the visible pill; fix stale copy in index.html (aria-label and title to "Drag to move toolbar").

**Mobile canvas page size and toolbars (no-scroll) – plan: docs/plans/2026-02-20-mobile-canvas-page-size-and-toolbars.md**

- [x] **54.36** **Mobile: defined page size for canvas.** Add mobile-only logical page size (e.g. 800×600 px); in `draw()` when viewportMode is mobile, fit content into this page so everything fits by default; optional subtle page boundary; zoom in/out still available; desktop unchanged.
- [x] **54.37** **Mobile: optional zoom-out limit.** Clamp viewZoom on mobile so zoom-out does not go below the “full page” scale (no infinite tiny view).
- [x] **54.38** **Mobile: diagram toolbar – all tools visible, no horizontal scroll.** Force vertical layout on mobile for `#diagramFloatingToolbar`; remove `overflow-x: auto`; use `flex-direction: column`, allow vertical scroll of toolbar only if taller than wrap; 44px targets preserved; desktop drag and edge-snap unchanged.
- [x] **54.39** **Mobile: diagram toolbar – JS default vertical.** In `initDiagramToolbarDrag` / orientation logic, when viewportMode is mobile, force `data-orientation="vertical"` and default position; do not switch to horizontal on mobile.
- [x] **54.40** **Mobile: global toolbar – no scroll.** Ensure global toolbar never shows horizontal scroll on mobile (wrap only); audit and fix overflow/min-width so all actions remain visible.

**Diagram toolbar: Freeform-style behavior (plan: docs/plans/2026-02-20-global-toolbar-freeform-behavior-design.md)**

- [x] **54.41** **Diagram toolbar: Freeform-style orientation (top/bottom → horizontal).** When the diagram floating toolbar is dragged to the top or bottom edge zone of the canvas area, set orientation to horizontal and optionally snap Y; when dragged to left/right zones, keep vertical. Persist orientation and position; update only on pointer up. Desktop and mobile (allow horizontal at top/bottom on mobile). When horizontal on mobile, verify screen width accommodates all tools in one row; if not, use flex-wrap: wrap or smooth horizontal scroll within the pill.
- [x] **54.42** **Diagram toolbar: Fully free-floating drag.** Ensure the toolbar can be dragged to any position within the blueprint-wrap with no extra constraints beyond keeping it on-screen (current clamp). Orientation and snap apply on pointer up.
- [x] **54.43** **Diagram toolbar: Collapsible state.** Add a collapse/expand control (button with aria-label and aria-expanded); when collapsed, show only drag handle and expand button with smooth transition. Persist collapsed state in localStorage. Drag remains possible when collapsed.
- [x] **54.44** **Diagram toolbar: Smooth transitions.** Ensure orientation change (vertical ↔ horizontal) and collapse ↔ expand use CSS transitions (0.2–0.25s); respect reduced-motion preference. Animate collapsed state with max-width, max-height, opacity, or CSS Grid—not width/height—to avoid repaints and frame drops.
- [x] **54.45** **Diagram toolbar: Regression and a11y.** Verify no desktop or mobile regression; 44px targets and no horizontal scroll on mobile; focus order and screen reader labels for new collapse button; ResizeObserver and teardown (54.33) unchanged. Ensure .diagram-floating-toolbar z-index is high enough so it never slips behind other interactive elements or panels when dragged.

**Diagram toolbar: collapsed circular "+", no scroll, mobile = desktop orientation (plan: docs/plans/2026-02-20-diagram-toolbar-freeform-collapsed-no-scroll.md)**

- [x] **54.46** **Diagram toolbar: Minimized = circular "+" only.** When collapsed, diagram toolbar is exactly a 44×44 circular expand button with no extra padding/ring (CSS: padding 0, size 44×44; mobile override for collapsed).
- [x] **54.47** **Diagram toolbar + global toolbar: No scroll.** Diagram toolbar (desktop and mobile, vertical and horizontal) and global toolbar never show scrollbars; use flex-wrap so all tools visible without scrolling (overflow hidden + wrap).
- [x] **54.48** **Diagram toolbar: Mobile orientation = desktop.** Confirm mobile uses same horizontal/vertical-by-position logic as desktop (verification only; no forced vertical on mobile).

**Mobile-only diagram toolbar refinements** *(desktop behaviour unchanged)*

- [ ] **54.49** **Mobile: Collapsed "+" icon always visible.** Verify on real device that the expand control is never a blank white circle; SVG stroke explicit (#333), button background and opacity/visibility set for mobile collapsed; document in TROUBLESHOOTING if still hit-and-miss.
- [x] **54.50** **Mobile: Toolbar never disappears after collapse or at top.** Verify clamp runs after collapsed layout (double rAF). When wrap dimensions are invalid (ww < 20 || wh < 20), apply safe fallback position or retry clamp so toolbar never stays off-screen; toolbar remains on-screen after collapse, on resize, and when in top zone. Plan: docs/plans/2026-02-20-mobile-diagram-toolbar-disappearing-fix.md.
- [x] **54.50.1** **Mobile: Remove dead diagram-toolbar-hidden (swipe-away) code.** Remove mobile-only CSS rule `body[data-viewport-mode="mobile"] .diagram-floating-toolbar.diagram-toolbar-hidden` (styles.css ~2126–2130) and the redundant `toolbar.classList.remove('diagram-toolbar-hidden')` in initDiagramToolbarDrag (app.js line 5626). No add-path exists; removal prevents any future/latent hide. Plan: docs/plans/2026-02-20-mobile-diagram-toolbar-disappearing-fix.md.
- [x] **54.51** **Mobile: Tap-to-expand reliability.** Ensure tap on collapsed "+" consistently expands (no accidental drag); hit target 44×44; consider touch-action or small movement threshold so tap vs drag is unambiguous.
- [ ] **54.52** **Mobile: Orientation and no-scroll QA.** Manual check: drag to top/bottom → horizontal, to left/right → vertical; no scrollbars inside toolbar in any orientation; tools wrap correctly.
- [ ] **54.53** **Mobile: Diagram toolbar regression coverage.** Add manual or E2E checklist for mobile: open app (toolbar expanded), collapse to "+", expand, drag to two zones; confirm no disappear and no scroll; confirm toolbar at top (horizontal) stays visible.

**Diagram toolbar: Apple Freeform–style morphing and CSS-only icon** *(desktop + mobile)*

- [x] **54.54** **Diagram toolbar: Container-first morphing.** Animate the parent container's width, height, and border-radius between expanded pill and collapsed circle using `transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1)`. Remove `position: absolute` from collapsed tools-wrap so content stays in flow and the container shrinks smoothly. Replace explicit `width: 44px; height: 44px` with flow-driven sizing. No ghost space or layout shift.
- [x] **54.55** **Diagram toolbar: CSS-only Plus↔Minus icon and layout.** Replace the SVG/text collapse icons with a single `.toggle-icon` element using `::before` (horizontal bar) and `::after` (vertical bar) for a CSS-only morph. Use `display: grid; place-items: center` on the collapse button. Move collapse button to trailing edge when expanded (`order`), centered when collapsed. Ensure vertical mode = slim pill (`flex-direction: column`), horizontal mode = wide bar (`flex-direction: row`).

**Mobile: diagram toolbar always thin, edge-only** *(additive; do not remove current behaviour)*  
*Plan: docs/plans/2026-02-20-mobile-diagram-toolbar-always-thin-edge-only.md*

*Note (current behaviour): Expanded edge snap and orientation transitions are implemented; keep desktop-regression and manual mobile QA sign-off in this section.*

- [ ] **54.56** **Mobile: Thin vertical pill – single column.** Ensure `body[data-viewport-mode="mobile"] .diagram-floating-toolbar[data-orientation="vertical"] .diagram-toolbar-tools-wrap` uses `flex-wrap: nowrap` so the toolbar stays a single column (slim pill) on left/right. Do not remove existing vertical layout or desktop rules.
- [ ] **54.57** **Mobile: Thin horizontal pill – single row with 44px strict targets.** For `data-orientation="horizontal"` on mobile: default to `flex-wrap: nowrap` on toolbar and tools-wrap, preserve 44px minimum targets (Apple HIG), remove internal toolbar scroll, and use a controlled wrap fallback only when width is insufficient. Tighten spacing/padding for thin pill. Do not remove existing horizontal or desktop behaviour.
- [ ] **54.58** **Mobile: Snap toolbar to nearest edge (expanded and collapsed).** In app.js, add mobile-only snap-to-edge logic that works while toolbar is expanded or collapsed: on pointer up, init, and ResizeObserver, compute nearest edge (top/bottom/left/right), set position on that edge, set orientation (horizontal for top/bottom, vertical for left/right), and persist X, Y, orientation. No collapse-first workaround. Gate all new logic with `layoutState.viewportMode === 'mobile'`; desktop keeps current free placement and existing `updateOrientationFromPosition` behaviour.
- [ ] **54.59** **Mobile: No middle placement.** When on mobile, ensure the toolbar never remains in the “middle” strip after drag or on load: run snap-to-edge so it always lands on one of the four edges. Desktop unchanged.
- [ ] **54.60** **Mobile: Always-thin QA and regression.** Manual check: toolbar only on edges (top/bottom/left/right); vertical = slim single column; horizontal = thin row with 44px strict touch targets and controlled wrap fallback only when needed; collapse/expand and all tools unchanged; desktop free placement and layout unchanged.

**Mobile Freeform interaction parity (reference implementation plan)**  
*Reference: 2026-02-20 mobile UI investigation (code + viewport audit). Additive planning items only; desktop behaviour unchanged unless explicitly stated.*

- [x] **54.61** **Selected-element two-finger transform (mobile).** When an element is selected on mobile, support two-finger gesture to resize + rotate the selected element directly (Freeform-style). Keep existing viewport pinch-zoom/pan when no element is selected.
- [x] **54.62** **Tap-first move gating (mobile).** Require explicit selection before one-finger move; add small movement threshold so tap-to-select does not accidentally start drag. Empty-space drag should continue to pan the canvas.
- [x] **54.63** **Tap-first copy and labels (mobile).** Replace drag-centric mobile helper text/announcements with tap-first guidance (e.g., “Tap Products to place, then manipulate selected parts”). Keep desktop copy unchanged.
- [x] **54.64** **Diagram toolbar safe-area and header-occlusion hardening (mobile).** Ensure floating diagram toolbar never renders clipped under the top header/notch; clamp with safe top offset, preserve z-index ordering, and keep collapse/expand fully visible.
- [ ] **54.65** **Gesture arbitration and reliability QA (mobile).** Verify no conflicts between element gestures, canvas pan, and viewport pinch; include edge cases for quick taps, slight finger drift, and two-finger transitions.
- [x] **54.66** **Regression coverage for mobile interaction parity.** Add manual/E2E checklist for: select→transform with two fingers, tap-first move gating, panel tap-to-add auto-close, toolbar visibility near top edge, and 200% zoom/orientation checks. Checklist: `docs/QA-CHECKLIST-2026-02-20-mobile-freeform-interaction-parity.md`.

**Mobile: header (theme) colour green → blue** *(plan: docs/plans/2026-02-20-mobile-header-green-to-blue.md)*

- [x] **54.67** **Mobile: theme-color blue.** In `applyViewportMode`, update `<meta name="theme-color">`: when `normalizedMode === 'mobile'` set content to `#54B3D9`, when desktop set to `#71C43C`. Create meta if missing. Ensure no desktop behaviour or layout change.
- [x] **54.68** **Mobile: verify header blue and desktop unchanged.** Verified: mobile viewport (`?viewport=mobile`) keeps blue chrome `#54B3D9`; desktop viewport (`?viewport=desktop`) keeps green chrome `#71C43C`; resize/orientation and forced viewport switching remain correct with no deploy-config changes.
- [ ] **54.69** **(Optional) Manifest theme_color blue.** Change `manifest.webmanifest` `theme_color` to `#007aff` and document that desktop PWA will also show blue chrome (only if product wants PWA-on-mobile chrome blue).

**Mobile: Login and global UX polish (Apple HIG)**

- [x] **54.70** **Mobile: Login screen safe area and touch targets.** Add `body[data-viewport-mode="mobile"]` overrides for `#view-login` and `.view-login-inner`: safe-area-inset padding, min 44px height for form buttons and links, 44px min-height for email/password inputs; optional reduced horizontal padding on narrow viewports. Desktop unchanged.
- [x] **54.71** **Mobile: Login form typography and spacing.** Use clamp/rem for labels and button text on mobile so login scales with Dynamic Type/200% zoom; ensure adequate spacing between Sign in, Create account, and Forgot password. Desktop unchanged.
- [x] **54.72** **Mobile: Bottom sheet and placeholder touch targets.** Confirm diagrams bottom sheet drag handle and list rows meet 44px; ensure canvas placeholder "Camera" and "Products" entry points are at least 44px or clearly tappable. Fix only if audit finds gaps.
- [x] **54.73** **Mobile: Global toolbar overflow and primary actions.** Audit global toolbar on narrow mobile (e.g. 320px); ensure no horizontal scroll and Save/Generate Quote remain visible and primary; fix overflow or wrap if needed.
- [x] **54.74** **Mobile: Visual polish and spacing consistency.** Apply consistent spacing tokens and clear primary/secondary hierarchy for mobile-only screens (login, toolbar, bottom sheet); no desktop or build changes.
- [x] **54.75** **Mobile: 54.74 token consistency + horizontal toolbar scroll (UI fix).** CSS: consolidated `.toolbar-right`/`.toolbar-actions-secondary` with tokens; restored tokens for toolbar gap, bottom-sheet title and diagram-item padding. Horizontal diagram toolbar: `gap: var(--mobile-space-sm)`, overflow-x: auto with hidden scrollbar, flex-shrink: 0 on 44px children. E2E: Option B orientation-aware scroll (vertical = no scroll, horizontal = tools-wrap may scroll). Plan: docs/plans/2026-02-21-54-75-mobile-toolbar-tokens-and-horizontal-scroll.md.
- [x] **54.76** **Mobile: Diagram toolbar collapsed circle at top/bottom.** When toolbar is at top/bottom (`data-orientation="horizontal"`), the horizontal rule was overriding collapsed padding/gap (source order), breaking the 48px circle. Added override `body[data-viewport-mode="mobile"] .diagram-floating-toolbar.diagram-floating-toolbar--collapsed[data-orientation="horizontal"] { padding: 0; gap: 0; }` so collapsed circle stays correct. See docs/INVESTIGATION-2026-02-21-diagram-toolbar-top-bottom-odd-look.md.
- [x] **54.77** **Mobile: Horizontal diagram toolbar scroll at ≤430px.** Remove or relax `@media (max-width: 430px)` override so horizontal toolbar keeps single row + `overflow-x: auto` on all mobile widths (currently the 430px block forces `flex-wrap: wrap` and prevents horizontal scroll on typical phones). Optional: add narrow fallback (e.g. ≤360px) for wrap only. Plan: docs/plans/2026-02-21-mobile-toolbar-collapsed-expanded-and-horizontal-scroll-fix.md. Desktop unchanged; Railway-safe. Implemented: removed 430px media block; toolbar.js ignores pointerdown inside .diagram-toolbar-tools-wrap so horizontal scroll works.

**54.78 Mobile: Vertical diagram toolbar tighter fit (and optional drag handle span cleanup)**  
Plan: docs/plans/2026-02-21-mobile-vertical-toolbar-tighter-fit.md. Scope: mobile only for layout; optional span removal is global. Desktop and Railway unchanged.

- [x] **54.78.1** **Mobile vertical toolbar: height fit-content.** In `frontend/styles.css`, under `body[data-viewport-mode="mobile"]`, add a rule for `.diagram-floating-toolbar[data-orientation="vertical"]` with `height: fit-content` (and retain a safe `max-height` cap if desired) so the pill’s height is the sum of its content instead of stretching to e.g. 428px.
- [x] **54.78.2** **Mobile vertical tools-wrap: cap max-height.** In the same file, add `body[data-viewport-mode="mobile"] .diagram-floating-toolbar[data-orientation="vertical"] .diagram-toolbar-tools-wrap` with `max-height: min(50vh, 280px)` (or similar) so the tools column is capped and the overall toolbar is a tighter fit.
- [x] **54.78.3** **Mobile vertical tools-wrap: overflow-y auto.** In the same rule as 54.78.2 (or adjacent), set `overflow-y: auto` so when the toolbar has many items and content exceeds the cap, the user can scroll within the pill. Keep `overflow-x` unchanged (no horizontal scroll in vertical pill).
- [x] **54.78.4** **Mobile vertical tools-wrap: optional scrollbar hidden.** Optionally add `scrollbar-width: none` and `::-webkit-scrollbar { display: none; }` for the vertical tools-wrap (mobile only) to match the horizontal toolbar’s clean look; ensure touch scroll still works.
- [x] **54.78.5** **Verify: E2E and desktop.** Run `npm test`; confirm mobile diagram toolbar tests pass. Manually confirm desktop vertical toolbar unchanged; manual mobile check that vertical pill is shorter and scrolls when many tools.
- [x] **54.78.6** **(Optional) Remove empty drag handle span.** In `frontend/index.html`, remove the inner `<span aria-hidden="true"></span>` from `#diagramToolbarDragHandle`. In `frontend/styles.css`, remove the rule `.diagram-toolbar-drag-handle span { display: block; width: 100%; height: 100%; }`. No JS changes; 44×44 and `::before` grip unchanged.

**54.79 Mobile: diagram toolbar – hide handle visually, grip bar, hide Inspector (mobile-only; no HTML/JS removal)**  
*Strategy: do not remove the drag-handle HTML or JS references (desktop keeps current behaviour). On mobile only: (1) hide the 44×44 handle visually so it no longer expands the container; (2) add a thin, subtle central “grip” pill to claim the non-tool space as the drag area (safe-to-drag visual); (3) hide the Open Inspector button in the diagram toolbar on mobile for a tidier, smaller toolbar. Container-drag logic in toolbar.js already starts drag from toolbar chrome when pointerdown is not on the handle or tools-wrap.*

- [x] **54.79.1** **Mobile: hide diagram toolbar drag handle visually.** In `frontend/styles.css`, under `body[data-viewport-mode="mobile"]`, add a rule so `#diagramToolbarDragHandle` (or `.diagram-floating-toolbar .diagram-toolbar-drag-handle`) is visually hidden and does not take layout space on mobile: e.g. `width: 0; height: 0; min-width: 0; min-height: 0; padding: 0; margin: 0; overflow: hidden; opacity: 0; pointer-events: none;` (and ensure it doesn’t break collapsed state if the handle is still in DOM). Do not remove the HTML element or any JS references; desktop unchanged.
- [x] **54.79.2** **Mobile: central grip bar for drag area.** In `frontend/styles.css` (and if needed one small DOM addition), under `body[data-viewport-mode="mobile"]`, add a thin, subtle “grip handle” pill in the non-tool space of the diagram toolbar (e.g. between collapse button and `.diagram-toolbar-tools-wrap`, or as a pseudo-element on the toolbar) so the drag area is visually claimed. Match vertical vs horizontal orientation (short bar in vertical mode, horizontal bar in horizontal mode). Desktop unchanged; no removal of the existing drag-handle button.
- [x] **54.79.3** **Mobile: hide Open Inspector in diagram toolbar.** In `frontend/styles.css`, under `body[data-viewport-mode="mobile"]`, hide `#openInspectorBtn` when it is inside the diagram floating toolbar (e.g. `body[data-viewport-mode="mobile"] .diagram-floating-toolbar #openInspectorBtn { display: none; }` or equivalent) so the mobile diagram toolbar is tidier and smaller. Inspector remains available elsewhere (e.g. accessibility settings or desktop) as per product; desktop toolbar unchanged.
- [x] **54.79.4** **Mobile: Diagram toolbar thumbnail blend (darker background, Squircle, mesh gradient, ultraThinMaterial).** Under `body[data-viewport-mode="mobile"]`, restyle the diagram floating toolbar container and drag handle so the “thumbnail” look uses a darker blended background, Squircle-style continuous corners (fixed border-radius expanded, 50% collapsed), subtle mesh gradient, and strong backdrop blur (ultraThinMaterial). When the toolbar is **expanded**, the drag handle must be visible on the **inside** edge (toward canvas center); when **collapsed**, the handle may be hidden. Restore handle visibility when expanded if currently hidden and apply the same thumbnail styling. No function, HTML, or JS changes; desktop unchanged; Railway-safe. Plan: docs/plans/2026-02-21-mobile-diagram-toolbar-thumbnail-blend.md.

**54.80 Diagram toolbar auto-collapse when element toolbar or dropdowns open**  
*When the user opens the element (selection) toolbar or any canvas/header dropdown or product modal, the diagram floating toolbar should auto-collapse. Plan: docs/plans/2026-02-21-diagram-toolbar-auto-collapse-on-element-toolbar-and-dropdowns.md.*

- [x] **54.80.1** **toolbar.js: return collapseIfExpanded from init.** In `frontend/toolbar.js`, implement `collapseIfExpanded()` inside `initDiagramToolbarDrag` (same class/localStorage/aria/two-rAF clamp as current collapse, only when not already collapsed). Return `{ collapseIfExpanded }` from `initDiagramToolbarDrag`.
- [x] **54.80.2** **app.js: store API and define collapseDiagramToolbarIfExpanded.** In `frontend/app.js`, store the return value of `initDiagramToolbarDrag` (e.g. `diagramToolbarApi`), define `collapseDiagramToolbarIfExpanded()`, and wire it to each trigger below. *Call sites (app.js): draw() ~5414 when element toolbar was hidden; moreBtn click ~3302 when submenu opens; profileDropdown toggle ~7388 and set false ~7709; diagramsDropdown hidden=false ~8644; openProjectHistoryDropdown() ~8557; openAccessibleModal('productModal') ~8081, ~8117; openAccessibleModal('diagramsBottomSheet') ~8633, ~8674; openAccessibleModal('saveDiagramModal') ~8580.*
- [x] **54.80.2.1** **Mobile: auto-minimise when element (selection) toolbar is first shown.** Call collapse when `#floatingToolbar` transitions from hidden to visible in `draw()` (single element or blueprint selected).
- [x] **54.80.2.2** **Mobile: auto-minimise when More submenu is opened.** Call collapse when user opens the More layer-actions submenu (`#floatingToolbarSubmenu`).
- [x] **54.80.2.3** **Mobile: auto-minimise when profile dropdown is opened.** Call collapse when user opens the profile menu from the header (`#profileDropdown`), including the path that sets `profileDropdown.hidden = false` from the products menu.
- [x] **54.80.2.4** **Mobile: auto-minimise when Saved diagrams bottom sheet is opened.** Call collapse when user opens the diagrams bottom sheet (`openAccessibleModal('diagramsBottomSheet', ...)` from clock icon or breadcrumb).
- [x] **54.80.2.5** **Mobile: auto-minimise when project history dropdown is opened.** Call collapse when `openProjectHistoryDropdown()` runs (e.g. breadcrumb on desktop; mobile may use bottom sheet — ensure the dropdown open path still triggers collapse where used).
- [x] **54.80.2.6** **Mobile: auto-minimise when Product modal is opened.** Call collapse before `openAccessibleModal('productModal', ...)` (add new product and edit product flows).
- [x] **54.80.2.7** **Desktop: auto-minimise when Saved diagrams dropdown is opened.** Call collapse when `#diagramsDropdown` is shown (desktop header); mobile uses bottom sheet (54.80.2.4).
- [x] **54.80.2.8** **Mobile: auto-minimise when Save diagram modal is opened.** Call collapse before `openAccessibleModal('saveDiagramModal', ...)`.
- [x] **54.80.2.9** **Mobile: auto-collapse diagram toolbar when products panel is opened.** When the user opens the Products panel (bottom sheet) on mobile—i.e. `#panel` gets class `expanded` and `#panelContent` is visible—call `collapseDiagramToolbarIfExpanded()` so `#diagramFloatingToolbar` collapses to the "+" pill. Wire to the same path that expands the panel (e.g. `#panelCollapsed` click or any open-products-panel entry). Mobile-only; desktop unchanged.
- [x] **54.80.3** **Verify.** Manual check desktop + mobile for all auto-collapse triggers; run existing E2E; confirm no regressions. (E2E may fail on unrelated product thumbnail assertion if backend has no products; diagram toolbar collapse/expand behaviour is unchanged.)
- [x] **54.80.4.1** **Position Flip dropdown so it does not overlap expanded diagram toolbar.** Add positioning logic using the diagram toolbar (`#diagramFloatingToolbar`) as anchor; place `#flipDropdown` so no part of it overlaps the expanded toolbar (e.g. open away from toolbar).
- [x] **54.80.4.2** **Position element colour palette so it does not overlap expanded diagram toolbar.** Add positioning logic using the diagram toolbar as anchor; place `#colorPalettePopover` so no part of it overlaps the expanded toolbar.
- [x] **54.80.4.3** **Position header colour diagram popover so it does not overlap expanded diagram toolbar.** Add positioning logic using the diagram toolbar as anchor; place `#headerColorPalettePopover` so no part of it overlaps the expanded toolbar.
- [x] **54.80.4.4** **Position transparency popover so it does not overlap expanded diagram toolbar.** Add positioning logic using the diagram toolbar as anchor; place `#transparencyPopover` so no part of it overlaps the expanded toolbar (e.g. open away from toolbar).
- [ ] **54.81.1** **Mobile products: disable drag-start in mobile mode and preserve tap-add flow.** Keep desktop drag behavior unchanged while mobile tap adds exactly one element with existing undo/snap/nudge/selection/measurement/announcement flow.
- [ ] **54.81.2** **Mobile add sizing with blueprint: 25% long side.** For mobile add paths, set new element max dimension to 25% of `max(blueprintTransform.w, blueprintTransform.h)`.
- [ ] **54.81.3** **Mobile add sizing fallback without blueprint: 25% canvas long side.** When no blueprint exists, set mobile add max dimension to 25% of current canvas long side (display-based fallback).
- [ ] **54.81.4** **Regression + docs.** Update E2E for mobile tap-add auto-close and sizing assertions (with and without blueprint), keep desktop 150px guard, and document mobile-vs-desktop add sizing behavior in README.

**54.82 Mobile: tools within global header only (Projects top-left, collapse after, declutter)**  
*Plan: docs/plans/2026-02-21-mobile-global-toolbar-reorder-and-declutter.md. We are only changing the tools inside `#globalToolbar` (div.app > div#view-canvas > div#globalToolbarWrap > header#globalToolbar). We are not changing the diagram toolbar or any other toolbar. Scope: mobile-only CSS; desktop and Railway unchanged.*

- [x] **54.82.1** **Mobile global header: Projects/Untitled top-left, collapse after.** In `frontend/styles.css`, under `body[data-viewport-mode="mobile"]`, set `.toolbar-left { order: -1; }` and `.toolbar-collapse-btn { order: 0; }` so breadcrumb is first, collapse second (within `#globalToolbar` only).
- [x] **54.82.2** **Mobile breadcrumb: chevron left of "Projects".** Under `body[data-viewport-mode="mobile"]`, set `.breadcrumb-chevron { order: -1; }` so the dropdown indicator appears to the left of "Projects /" (within the header only).
- [x] **54.82.3** **Mobile: hide Export, Saved diagrams (clock), Accessibility in global header.** Under `body[data-viewport-mode="mobile"]`, add `#exportBtn`, `.toolbar-diagrams-wrap`, `#openAccessibilitySettingsBtn` with `display: none !important`. Desktop unchanged; diagrams still open via breadcrumb tap.
- [x] **54.82.4** **Verify spacing and regression.** Confirm mobile header padding/gap and 44px targets; run `npm test`; manual desktop + mobile check; Railway deploy.

**54.83 Mobile: measurement entry via ruler tool (no auto keyboard on tap)**  
*Scope: mobile-only interaction change for measurable elements. Desktop behaviour, backend APIs, and Railway deployment remain unchanged.*

- [x] **54.83.1** **Mobile measurable selection: no auto-focus on tap.** In `frontend/app.js`, gate the existing `scrollToMeasurementCardAndFocus(...)` selection path so mobile tap-select does not auto-focus the measurement input (avoids keypad opening/cropped viewport while placing elements).
- [x] **54.83.2** **Floating toolbar ruler action (mobile-only visibility).** Add `#floatingToolbarMeasure` in `frontend/index.html` and wire it in `initFloatingToolbar()` so tapping the ruler focuses the selected measurable element’s measurement input. Show only for mobile + single selected measurable element; hide for desktop, blueprint, multi-select, and non-measurable.
- [x] **54.83.3** **Measurement focus hardening + iOS zoom mitigation.** Harden `scrollToMeasurementCardAndFocus(...)` with safe asynchronous focus (`preventScroll` fallback) and set mobile font-size 16px for `.measurement-deck-card input` and `#badgeLengthInput` to prevent iOS input zoom/cropping.
- [x] **54.83.4** **Regression coverage + docs.** Extend `e2e/run.js` to assert mobile tap-select does not auto-focus measurement input, ruler button appears for measurable selection, and ruler tap focuses the matching input; add desktop guard that ruler button stays hidden. Update README E2E coverage and usage note.
- [x] **54.83.5** **Icon affordance clarity for ruler tool.** Replace the measurement button glyph with a clear ruler icon (body + tick marks) so the action is visually explicit and not confused with edit/pencil semantics.

**54.84 Mobile: wire camera upload to canvas placeholder, then remove from header**  
*Wire the global header camera button to the canvas placeholder camera so the placeholder triggers upload; then remove the camera from the header (mobile) to declutter. Desktop unchanged unless specified.*  
*Plan: docs/plans/2026-02-21-54-84-camera-placeholder-wire-and-mobile-declutter.md*

- [x] **54.84.1** **Wire #cameraUploadBtn to canvas placeholder camera.** Connect the toolbar camera button (`#cameraUploadBtn` in `#globalToolbar` > `.toolbar-right` > `.toolbar-actions-secondary`) to the canvas placeholder camera entry point (`#canvasPlaceholder` > `.placeholder-card` > `.placeholder-icon` and its SVG). Ensure tapping the placeholder camera icon triggers the same upload flow (e.g. programmatic click on file input or shared handler). Preserve existing placeholder and toolbar behavior; desktop and mobile both use the same entry point logic once wired.
- [x] **54.84.2** **Remove camera from global header (mobile) after 54.84.1.** Once the placeholder camera is wired, hide or remove `#cameraUploadBtn` from `#globalToolbar` on mobile only (e.g. `body[data-viewport-mode="mobile"] #cameraUploadBtn { display: none }`) to declutter the header. Desktop keeps the camera in the header. Verify upload remains possible via the canvas placeholder on mobile.

**Mobile: Auto collapse global toolbar when products opened**

- [x] **54.84.3** **Auto collapse global toolbar when products panel opened.** When the user opens the Products panel (bottom sheet) on mobile, automatically collapse the global header (#globalToolbar) to free vertical space for the canvas and products. Restore or keep expand on panel close. Mobile-only; desktop unchanged.

**54.85 Mobile: product panel compact thumbs (less vertical space)**  
*Plan: docs/plans/2026-02-21-mobile-product-panel-compact-thumbs.md. Goal: see as much as possible of the canvas image; avoid very tall product thumbs wasting vertical space. Scope: mobile-only CSS; desktop and Railway unchanged.*

- [x] **54.85.1** **Mobile product grid: cap thumb height and align row.** In `frontend/styles.css`, under `body[data-viewport-mode="mobile"]`, constrain `.product-grid .product-thumb` height (e.g. max-height ~96–100px) and set `align-items: flex-start` on `.product-grid` so the row does not stretch to the tallest thumb.
- [x] **54.85.2** **Mobile product thumb: compact height and image/label.** Override aspect-ratio and image/label so the products strip uses less vertical space; keep whole-card touch target ≥44px; ensure img fits (object-fit: contain, max-height) and label remains readable.
- [x] **54.85.3** **(Optional) Responsive thumb width at narrow mobile.** At very narrow viewports (e.g. ≤400px), optionally reduce thumb width so more items fit in one row; keep 44px min touch target.
- [x] **54.85.4** **Verify desktop unchanged, E2E, manual mobile QA.** Confirm desktop product grid and thumbs unchanged; run `npm test`; manual check at 360px/390px portrait and landscape, tap-to-add and panel close.
- [x] **54.85.5** **Mobile panel filters: two dropdowns side-by-side.** In `frontend/styles.css`, under `body[data-viewport-mode="mobile"]`, style `.panel-filters` as a single row (`display: flex; flex-direction: row; gap`); override `select + select` margin so the two selects sit side-by-side; keep 44px min height for touch targets; desktop unchanged.
- [x] **54.85.6** **Mobile search focus: product grid in view above keyboard.** When `#productSearch` is focused on mobile, ensure the scrollable thumbnail strip (`#productGrid`) is in full view above the virtual keyboard (e.g. flex order so grid is above search, and/or scroll panel/grid into view on focus); gate with viewport mode; desktop unchanged.
- [x] **54.85.7** **Mobile search: verify refine-as-you-type.** Confirm existing `input` → `applyProductFilters()` works when search is focused and keyboard is open; results update as user types; document or fix if testing finds gaps.

**54.85 (follow-up) Mobile: search bar below filters and thumbnail display**  
*Plan: docs/plans/2026-02-21-mobile-panel-search-position-and-thumbnail-display.md. Scope: mobile-only; desktop and Railway unchanged.*

- [x] **54.85.8** **Move search bar into .panel-filters.** In `frontend/index.html`, move `<div class="panel-search">…</div>` inside `.panel-filters`, just below the two selects. In `frontend/styles.css`, remove mobile flex-order rules that put grid above search; add mobile rule so `.panel-filters .panel-search` wraps to full-width row below the dropdowns.
- [x] **54.85.9** **Mobile search focus: remove grid scroll-into-view.** In `frontend/app.js`, remove the mobile-only `#productSearch` focus handler that scrolls `#productGrid` into view (search is now above grid); keep refine-as-you-type (`input` → `applyProductFilters()`).
- [x] **54.85.10** **Mobile thumbnails: uniform size, full text ~10px, fewer at once.** In `frontend/styles.css`, under `body[data-viewport-mode="mobile"]`: reduce product-grid gap and thumb padding; set thumb span font-size ~10px; allow 2-line wrap/line-clamp so full text shows; increase thumb width (e.g. 140–150px) so fewer thumbs in view and image + label fit; keep uniform height and touch target ≥44px.
- [x] **54.85.11** **Verify desktop unchanged and E2E.** Confirm desktop panel layout (filters → search → grid) unchanged; run `npm test` and fix any assertions that depend on panel DOM or search position.
- [ ] **54.85.12** **Manual mobile QA.** Confirm search bar directly below dropdowns, thumbnails uniform and readable with full text, tap-to-add and panel close; portrait and landscape.

**54.86 Mobile: full-screen quote modal (mobile-only, desktop unchanged, Railway-safe)**  
*Context: Convert the quote modal into a full-screen mobile sheet matching the iOS-style reference (`‹ Diagram`, centered `QUOTE`) while preserving quote + ServiceM8 functionality and desktop behavior.*

- [x] **54.86.1** **Mobile full-screen quote shell + iOS header.** Add mobile-only full-screen quote modal layout (`100dvh`, safe-area aware) and iOS-style top bar with `#quoteModalBackBtn` and centered `QUOTE`.
- [x] **54.86.2** **Mobile quote summary-core-edit layout.** Hide pricing-admin controls (`Edit Pricing`, `Save to Database`) and cost/markup/unit-price columns on mobile while preserving core quote interactions (qty/metres/labour/add-remove rows, totals, Add to Job flow).
- [x] **54.86.3** **Mobile actions policy.** Hide mobile Print/Copy/footer-close actions while keeping quote logic and ServiceM8 API workflow intact.
- [x] **54.86.4** **Mobile GST simplification.** Hide GST toggle/labels on mobile quote + confirmation overlay while preserving existing calculation/API payload semantics.
- [x] **54.86.5** **QA/E2E and deploy-safety verification.** Add mobile quote regression assertions in `e2e/run.js` (fullscreen bounds, hidden controls, back close, no labour auto-focus), confirm desktop quote flow remains unchanged, and verify Railway-safe deployment assumptions.

**54.87 Mobile labour popup editing (line item tap, desktop unchanged, Railway-safe)**  
*Scope: labour remains a normal quote table line item; mobile labour row is summary-only and tap-to-edit via dedicated popup with vertical stacked fields; backend/API and desktop flows unchanged.*

- [x] **54.87.1** **Add mobile labour line-item tap target + summary-only in-table labour row.** On mobile, keep labour as table row, hide inline labour row inputs/dup/remove in-table, show summary text, and open editor on labour row tap/keyboard activation.
- [x] **54.87.2** **Add labour editor popup (vertical stacked fields, multi-row support).** Add `#labourEditorModal` with list rendering, add-row/remove-row controls, and touch-friendly vertical hours/rate inputs.
- [x] **54.87.3** **Wire popup edits to existing labour row model/totals/Add-to-Job logic.** Reuse existing labour row inputs as source of truth; popup edits update row inputs and existing totals/warning/ServiceM8 gating logic without API contract changes.
- [x] **54.87.4** **Add mobile labour popup E2E + desktop regression + deploy-safety checks.** Extend mobile quote regression in `e2e/run.js` to assert tap-open, vertical popup fields, edit propagation, add/remove row behavior, and close flow while preserving existing desktop assertions.
- [x] **54.87.5** **Extrapolate popup edit pattern from labour to other quote elements/items.** Extend mobile tap-to-edit popup behavior from labour to material/billing line rows while preserving quote totals and ServiceM8 flow.

**54.88 Mobile panel UI polish (labels, heading, chevrons)**

- [x] **54.88.1** **Mobile filter labels.** Profile filter first option "All" → "All Profiles"; size filter first option "mm" → "All mm". Via `updateProfileFilterLabelForViewport` / `updateSizeFilterLabelForViewport` in applyViewportMode; desktop unchanged.
- [x] **54.88.2** **Panel header heading.** "Marley products" → "Parts" in `.panel-header h2` (desktop and mobile).
- [x] **54.88.3** **Mobile chevron direction.** `#panelCollapsed .chevron-icon` rotate(90deg) so it points to top of screen; `#panelClose svg` rotate(90deg) so it points down. CSS under `body[data-viewport-mode="mobile"]` only.

**54.89 Mobile: residual blue focus ring on tap (fix)**

*Plan: docs/plans/2026-02-21-mobile-residual-blue-focus-ring-fix.md. Goal: remove the impression of residual blue borders when tapping many buttons on mobile (viewport=mobile). Keep 54.6 focus ring for accessibility; suppress browser tap highlight and blur when tapping canvas/non-focusable. Mobile-only; desktop and Railway unchanged.*

- [x] **54.89.1** **Mobile: suppress browser tap highlight.** In `frontend/styles.css`, under `body[data-viewport-mode="mobile"]`, add `-webkit-tap-highlight-color: transparent` (and `tap-highlight-color: transparent`) for button, a, input, select, textarea, [tabindex], .product-thumb so only the 54.6 focus ring is visible.
- [x] **54.89.2** **Mobile: blur on canvas/non-focusable tap.** In `frontend/app.js`, in the canvas pointerdown path (or equivalent), when viewport is mobile and the tap target is non-focusable (canvas/workspace), blur `document.activeElement` if it is a non-input control and no focus-trapping modal is open. Do not blur when activeElement is input/textarea; do not run on desktop.
- [x] **54.89.3** **Mobile: sleeker tap ring.** Polish the tap ring: softer blue (rgba), 1px outline-offset, 0.12s transition for smooth flick, and `prefers-reduced-motion: reduce` to disable transition. Mobile-only.

**54.90 Mobile quote popup regression: duplicate labour helper + qty inflation (`111`)**

*Reference: `docs/plans/2026-02-21-mobile-quote-popup-regression-handoff.md`. Scope: mobile quote modal UI/logic only; preserve desktop behavior and Railway deploy safety.*

- [x] **54.90.1** **Remove duplicate labour helper rendering on mobile rows.** Ensure labour rows render exactly one helper summary line in the product cell (no parallel `.quote-mobile-line-summary` + `.quote-labour-mobile-summary` duplication visible at the same time).
- [x] **54.90.2** **Harden quantity source-of-truth for editable rows.** For mobile-editable material rows, read/write qty from explicit input/data state only; do not rely on `qtyCell.textContent` parsing when summaries are present.
- [x] **54.90.3** **Stop summary text from contaminating qty parsing.** Ensure mobile summary spans do not mutate numeric qty parsing paths (including modal init and recalc paths that run before/after `calculateAndDisplayQuote()`).
- [x] **54.90.4** **Eliminate double-sync side effects in quote modal bootstrapping.** Remove redundant summary sync calls that can run twice during labour-row initialization and inflate displayed/parsing qty from `1` to `111`.
- [x] **54.90.5** **Add regression coverage and QA guardrails.** Extend E2E/manual checks for mobile quote modal to assert: single labour helper line, stable qty after opening quote/editing/adding one item, no desktop regression, and Railway-safe behavior.

**54.91 Mobile: remove white space under scroll bar when parts popup open**

*Plan: docs/plans/2026-02-21-mobile-parts-popup-white-space-under-scrollbar.md. When the mobile screen width is shortened with the parts (products) popup open, white space can appear under the scroll bar. Goal: remove this so it never displays. Mobile-only; desktop and Railway unchanged.*

- [x] **54.91.1** **Reproduce and confirm.** Resize mobile viewport with products panel open; take screenshots when white space appears; confirm whether page-level scroll or panel-internal scroll (or both).
- [x] **54.91.2** **Body scroll lock when products panel open (mobile).** In `setPanelExpanded`, when viewport is mobile, add `document.body.classList.add('products-panel-open')` on expand and remove on close; in `applyViewportMode`, remove `products-panel-open` when switching to desktop.
- [x] **54.91.3** **CSS: prevent page scroll and viewport overflow.** In `frontend/styles.css`, add `body[data-viewport-mode="mobile"].products-panel-open { overflow: hidden; }` and optionally `height: 100%; min-height: 100dvh; max-height: 100dvh;` so no white space below viewport.
- [x] **54.91.4** **Panel-internal (if needed).** If screenshots show white inside the panel below the product strip, ensure `.panel-content` has no extra bottom gap (e.g. justify-content: flex-start, no stray margin/padding).
- [x] **54.91.5** **Verify.** Manual mobile QA at narrow widths (e.g. 320px, 360px, 390px) with panel open; confirm no white under scroll bar; confirm desktop unchanged; run `npm test`; Railway-safe.
- [x] **54.91.6** **Mobile: panel height content-sized when expanded.** So no whitespace under product grid; keep max-height cap and inner scroll when content exceeds cap.

**54.92 Mobile: Quote modal UX tidy (grid → dividers, hierarchy, labour, footer, error state)**  
*Plan: docs/plans/2026-02-21-mobile-quote-modal-ux-tidy.md. Scope: mobile-only full-screen Quote modal; desktop quote modal and all calculation/API unchanged; Railway-safe.*

- [x] **54.92.1** **Mobile quote: remove grid lines; horizontal dividers only.** Under `body[data-viewport-mode="mobile"] #quoteModal`, replace full table grid with horizontal dividers between rows only; keep thead distinct.
- [x] **54.92.2** **Mobile quote: visual nesting for indented items.** Light background tint or vertical connector for rows with `.quote-product-indent-level-1` / `.quote-product-indent-level-2`; lighter font weight for sub-items.
- [x] **54.92.3** **Mobile quote: line item alignment.** Left-align product name and unit price × qty subtitle; right-align total (no box); compact, consistent qty column.
- [x] **54.92.4** **Mobile quote: Labour row distinct.** Make Labour row visually distinct (icon or bold header/separator) as service not material.
- [x] **54.92.5** **Mobile quote: footer emphasis.** Materials subtotal stands out; Add to Job button full-width primary at bottom.
- [x] **54.92.6** **Mobile quote: labour warning integrated.** Warning icon next to labour row when 0 hrs; footer labour message as dedicated alert box (not floating text).
- [x] **54.92.7** **Verify desktop + regression.** Desktop quote unchanged; E2E/manual; Railway-safe.

*Post-implementation:* Audit fix applied (Total column keeps horizontal divider on mobile); Add to existing job (ServiceM8) section no longer sticky—scrolls with modal content on mobile.

**54.93 Mobile: Quote table – hide Total, Qty stepper, red minus / green plus (reference UI)**  
*Plan: docs/plans/2026-02-21-mobile-quote-table-stepper-and-delete.md. Scope: mobile-only; desktop quote modal and all calculation/API unchanged; Railway-safe.*

- [x] **54.93.1** **Mobile quote: hide Total column.** Under `body[data-viewport-mode="mobile"] #quoteModal .quote-parts-table`, hide `th:nth-child(6)` and `td:nth-child(6)`; adjust column widths for Product and Qty only (e.g. ~70% / ~30%).
- [x] **54.93.2** **Mobile quote: red minus (delete) and green plus (Add row).** In `syncMobileQuoteLineSummaries`, when mobile: prepend red circular remove button to cell 0 for editable rows; prepend green circular plus to cell 0 for empty row. Style as 44px circles (red #FF3B30 minus, green plus). In `initQuoteModal` tableBody click handler, allow remove to delete row on mobile (remove early return for `.quote-row-remove-x`). When desktop, remove cell-0 remove/plus from DOM in sync.
- [x] **54.93.3** **Mobile quote: Qty column as stepper.** In `syncMobileQuoteLineSummaries`, when mobile, for material rows (non-labour, non-empty): replace qty cell content with stepper (minus, value, plus); wire to `setQuoteRowStoredQty` and `calculateAndDisplayQuote`; 44px touch targets. Labour rows keep tap-to-edit; empty row keeps input or optional stepper.
- [x] **54.93.4** **Verify desktop + viewport switch + regression.** Desktop quote unchanged; viewport switch removes cell-0 controls and stepper; E2E/manual; Railway-safe.
- [x] **54.93.5** **Mobile quote: reduce remove/add control size to 33%.** Under `body[data-viewport-mode="mobile"]`, in the first-cell rules for `.quote-row-remove-x` and `.quote-row-add-plus`, change dimensions from 44px to 15px (33% of 44) and font-size from 22px to 7px. Mobile-only; desktop unchanged. Plan: docs/plans/2026-02-21-mobile-quote-remove-add-control-size.md.
- [x] **54.93.6** **Mobile quote: stepper for measurable products (metres rows).** On mobile, add qty stepper for rows with `.quote-qty-metres-input` (gutter/downpipe length in metres). Use decimal step (e.g. 0.1 or 0.01); wire to `setQuoteRowStoredQty` and `calculateAndDisplayQuote`; preserve in `manualOverrides` on rebuild. **Context:** `frontend/app.js`: `syncMobileQuoteLineSummaries` ~1296, `useQtyStepper` condition 1368, `getQuoteLineQuantityMeta` 1242–1260, `commitMetresInput` 2358, manualOverrides loop 3529–3541; `frontend/styles.css`: `.quote-mobile-qty-stepper*` ~5749–5784.
- [x] **54.93.7** **Mobile quote: stepper for labour rows.** On mobile, add qty stepper for labour rows (hours) alongside or instead of tap-to-edit summary; step 0.5; wire to labour row model and `calculateAndDisplayQuote`; preserve in `manualOverrides` if labour qty is stored per row. **Context:** `frontend/app.js`: `syncMobileQuoteLineSummaries` ~1296, `useQtyStepper` 1368 (currently excludes labour), `getQuoteLineQuantityMeta` labour branch 1244–1246, labour editor `#labourEditorModal` / tap-to-edit; `frontend/styles.css`: `.quote-mobile-qty-stepper*` ~5749–5784.

**54.93.8 Mobile quote: stepper for section-header metres (Gutter / Downpipe length)**  
*Plan: docs/plans/2026-02-21-mobile-quote-section-header-metres-stepper.md. Scope: mobile-only; section header rows (`tr.quote-section-header`) currently show `.quote-header-metres-input` in cell 1; replace with `.quote-mobile-qty-stepper` on mobile, keep input in DOM (hidden) for rebuild/override. Desktop and Railway unchanged.*

- [x] **54.93.8.1** **Mobile: section-header stepper in sync.** In `frontend/app.js` `syncMobileQuoteLineSummaries` (entry ~1366), after desktop cleanup block (after ~1351), before `const rows = ... filter(isEditableQuoteLineRow)` (~1353): when `isMobile`, loop `Array.from(tableBody.rows)`; for each `row.dataset.sectionHeader`, get `qtyCell = row.cells[1]`, `wrap = qtyCell.querySelector('.quote-header-metres-wrap')`, `input = wrap?.querySelector('.quote-header-metres-input')`. If stepper already present, update value span from input; else build stepper (minus/value/plus), step 0.5, keep input in DOM with class `quote-header-metres-input--hidden-mobile`, wire +/- to `input.value` and `calculateAndDisplayQuote().then(() => syncMobileQuoteLineSummaries())`. Reuse `.quote-mobile-qty-stepper` DOM/styles (app.js ~1408–1426; styles.css 5749–5784).
- [x] **54.93.8.2** **Desktop cleanup: restore section-header input.** In `frontend/app.js` desktop cleanup block (~1377–1351), in the loop over `tableBody.rows`, add branch: if `row.dataset.sectionHeader` and `qtyCell?.querySelector('.quote-mobile-qty-stepper')`, remove stepper, restore visible `.quote-header-metres-wrap` with `.quote-header-metres-input` (value from hidden input or current value), remove `quote-header-metres-input--hidden-mobile`.
- [x] **54.93.8.3** **CSS: hide header input when stepper shown.** In `frontend/styles.css` under `body[data-viewport-mode="mobile"] #quoteModal`, add `.quote-header-metres-input--hidden-mobile { display: none !important; }` (e.g. after ~5825 near `.quote-labour-hours-input--hidden-mobile`).
- [x] **54.93.8.4** **Verify.** Desktop section headers unchanged (input only); mobile section headers show stepper; rebuild and profileLengthOverride/downpipeLengthOverride (app.js 3654–3670, 3002–3022) still work; E2E/manual; Railway-safe.

**54.93.9 Mobile quote modal: tidy visual separation between Product and Qty columns**  
*Scope: mobile-only; improve the clear visual separation between the Product column (left) and Qty column (right) in the full-screen quote modal—e.g. vertical divider, spacing, or column edge treatment; desktop quote table and layout unchanged; Railway-safe.*

- [x] **54.93.9.1** **Mobile quote: Product vs Qty column visual separation.** Under `body[data-viewport-mode="mobile"] #quoteModal`, refine the separation between the Product column (td:nth-child(1), 70%) and Qty column (td:nth-child(2), 30%)—e.g. add a subtle vertical divider, adjust padding/border, or column edge so the two columns read clearly without relying only on whitespace. Preserve 44px touch targets and existing stepper/remove/plus layout; desktop unchanged.

**54.94 Mobile navigation + popover smoothing (toolbar/header/panel coherence)**  
*Scope: mobile-only interaction polish; desktop unchanged; Railway-safe.*

- [x] **54.94.1** **Mobile floating selection toolbar safe-top clamp under global header.** Keep floating selection toolbar below `#globalToolbarWrap` bottom + 8px in both auto-position and user-drag paths.
- [x] **54.94.2** **Mobile popover close coherence (color/transparency).** Close per-element color/transparency popovers on outside interactions and when opening Products panel to prevent stale overlays.
- [x] **54.94.3** **Regression coverage for mobile navigation smoothing.** Extend E2E to cover `54.51`, `54.84.3`, `54.94.1`, and `54.94.2` with mobile interaction assertions.

**54.95 Mobile orientation policy (landscape diagrams only, portrait elsewhere; desktop unchanged, Railway-safe)**

- [ ] **54.95.1** **Add orientation policy manager in `frontend/app.js`.**
- [ ] **54.95.2** **Wire sync across viewport/view/modal transitions.**
- [ ] **54.95.3** **Add diagnostics hook + data attribute for QA/E2E.**
- [ ] **54.95.4** **Confirm mobile diagram landscape target and non-diagram portrait target with no desktop regression.**
- [ ] **54.95.5** **Add E2E orientation-policy transition checks.**
- [ ] **54.95.6** **Update README/troubleshooting + deploy-safety verification.**
- [ ] **54.95.7** **Mobile canvas orientation transition follow-up (landscape → portrait zoom drift).** When rotating from landscape to portrait while on `view-canvas`, prevent viewport drift/zoom into the header area that forces manual zoom-out. Keep fit/framing stable across orientation changes on mobile; desktop unchanged; Railway-safe.

**54.96 Mobile: ruler keypad reliability + hide measurement pills (mobile-only, desktop unchanged, Railway-safe)**

- [ ] **54.96.1** **Mobile ruler: open badge length popover + focus input in direct gesture.** In `frontend/app.js`, wire `#floatingToolbarMeasure` to open `#badgeLengthPopover` for the selected measurable element and focus `#badgeLengthInput` synchronously (with safe fallback) so phone keypad opens reliably.
- [ ] **54.96.2** **Shared measurement popover helper.** Refactor badge-length editing into shared helper(s) used by both badge double-click and mobile ruler action, with centralized close/commit/cleanup (blur, Enter, Escape, outside tap).
- [ ] **54.96.3** **Hide measurement deck pills on mobile.** In `frontend/styles.css`, under `body[data-viewport-mode="mobile"]`, hide `.measurement-deck`; keep desktop measurement deck unchanged.
- [ ] **54.96.4** **E2E regression coverage.** Update `e2e/run.js` mobile ruler flow to assert: measurable tap does not auto-open/focus input, ruler opens visible `#badgeLengthPopover`, `document.activeElement.id === 'badgeLengthInput'`, and mobile `#measurementDeck` is hidden; keep desktop ruler-hidden guard.
- [ ] **54.96.5** **README updates.** Update usage + E2E coverage wording to reflect popover-based mobile ruler entry (`#badgeLengthInput`) and hidden mobile measurement deck.
- [ ] **54.96.6** **Manual mobile QA + deploy safety.** Verify Safari/Chrome mobile keypad behavior and no desktop regression; run `npm test`; confirm no Railway infra/config changes.

**54.97 Labour editor button: Apply when dirty, untoggled by default**  
*Plan: docs/plans/2026-02-21-labour-editor-button-apply-and-untoggled.md. Scope: mobile-only (labour editor opens only on mobile); desktop and Railway unchanged.*

- [x] **54.97.1** **Dirty tracking and initial snapshot.** In `quoteLineEditorState` add `initialQty`, `initialUnitPrice`, `initialTaxApplicable`. Set them in `openLabourEditorModal` from the row and in the Add Row click handler to the new row’s draft values so new row is not dirty.
- [x] **54.97.2** **Update button state helper and wiring.** Add `updateLabourEditorAddButtonState()` (text "Apply" vs "Add Labour Line", class for green vs default). Call it from `openLabourEditorModal` after render, at end of `renderLabourEditorRows` for labour, and from `setQtyDraft` / `setRateDraft` / tax toggle in `renderLabourEditorRows`.
- [x] **54.97.3** **Add-button click: Apply when dirty, add row when not.** In `#labourEditorAddRowBtn` click handler, if dirty call `applyQuoteLineEditorChanges()`; else keep current add-row behaviour.
- [x] **54.97.4** **CSS: default untoggled + green Apply.** Default `.labour-editor-actions .btn` to outline/secondary (untoggled); add modifier class for Apply state (green background, white text). Preserve 44px min-height and contrast.
- [x] **54.97.5** **Verify.** Manual mobile: open labour editor → untoggled "Add Labour Line"; change qty/rate/tax → green "Apply"; click Apply applies and closes; click when not dirty adds row. Desktop unchanged; Railway-safe.

**54.99 Labour editor: editable Markup % (mobile popup only, no backend change)**  
*Plan: docs/plans/2026-02-21-labour-editor-markup-enable.md. Cost from REP-LAB; unit price = cost × (1+markup/100); persist only unit price on row.*

- [x] **54.99.1** **getLabourCostPrice()** from state.products REP-LAB (fallback 35).
- [x] **54.99.2** **draftMarkup/initialMarkup** in quoteLineEditorState; set in openLabourEditorModal and Add Row handler.
- [x] **54.99.3** **Markup input for labour** in renderLabourEditorRows; Purchase Cost = labour cost; markup change → draftUnitPrice; rate change → draftMarkup derived.
- [x] **54.99.4** **Dirty and revert** include markup (draftMarkup vs initialMarkup); revert still only restores unit price/hours on row.
- [x] **54.99.5** **Verify** material rows unchanged; labour markup editable; Railway-safe.

**54.98 Mobile quote: non-labour line editor popup parity + no cut-off (mobile-only, desktop unchanged, Railway-safe)**  
*Context: Tapping non-labour rows currently opens the shared `#labourEditorModal` (`openLabourEditorModal`, `rowType: material`) but can appear vertically offset/cut off and reveal the quote ServiceM8 section behind it. Keep one shared popup for labour/material with full-screen mobile behavior.*

- [x] **54.98.1** **Root-cause fix: editor overlay anchoring independent of quote scroll.** In `frontend/styles.css`, make the mobile quote editor overlay viewport-anchored (`#quoteModal #labourEditorModal` with fixed full-screen inset) so it no longer depends on `.quote-modal-content` scroll position.
- [x] **54.98.2** **Prevent background quote scroll while editor open.** In `frontend/app.js` modal registration/hooks, lock `#quoteModal .quote-modal-content` scroll on `labourEditorModal` open and restore on close so table/ServiceM8 content cannot shift behind the editor.
- [x] **54.98.3** **Material-row editor layout parity with labour popup shell.** Keep shared editor structure for material rows and remove dead-space footer chrome. *(Superseded by 54.100 for explicit material `Apply Changes` action policy.)*
- [x] **54.98.4** **Desktop and labour-row guardrails.** Ensure desktop quote modal remains unchanged and labour-row editor behavior (add/apply/remove, totals, Add-to-Job gating) is preserved; only mobile popup presentation/scroll behavior changes.
- [x] **54.98.5** **E2E regression coverage for material popup viewport fit.** Extend `e2e/run.js` mobile quote assertions so material-row tap opens editor fully in viewport (no top cut-off, no ServiceM8 footer bleed-through) while existing labour/material edit assertions still pass.
- [ ] **54.98.6** **Manual mobile QA + Railway safety.** Validate iOS Safari + Android Chrome (portrait/landscape, 200% zoom) for no clipping/footer bleed and reachable actions; run `npm test`; confirm no Railway build/env/config changes.

**54.100 Mobile quote: material footer Apply action parity (mobile-only, desktop unchanged, Railway-safe)**  
*Note: numbered 54.100 because 54.99 is already allocated in this section.*

- [x] **54.100.1** **Show footer action for material rows in shared editor.** Keep `.labour-editor-actions` visible for editable material rows in `#labourEditorModal`; do not hide footer chrome for non-labour rows.
- [x] **54.100.2** **Dirty-gated `Apply Changes` behavior + a11y labels.** In `frontend/app.js`, make editor dirty-state row-type aware (labour + material). For materials: footer label `Apply Changes`, disabled when clean, enabled + apply style when qty changes; update aria-label accordingly.
- [x] **54.100.3** **Preserve labour add/apply behavior with row-type click routing.** Keep labour flow unchanged (`Add Labour Line` when clean, `Apply` when dirty), while material footer click applies only when dirty and closes modal through existing apply path.
- [x] **54.100.4** **E2E updates for material apply + labour regression guard.** Update `e2e/run.js` mobile quote checks so material popup asserts visible footer action, disabled-before-edit, enabled-after-edit, and apply-via-footer behavior; retain labour add/apply/remove assertions.
- [ ] **54.100.5** **Manual mobile QA + Railway safety verification.** Validate iOS Safari + Android Chrome (portrait/landscape, 200% zoom), run `npm test`, and confirm no Railway infra/env/build changes.

**54.101 Canvas element bold control (line weight 1–4, desktop + mobile; Railway-safe)**  
*Scope: frontend-only canvas element rendering and selection toolbar UX. No backend/API contract changes. Blueprint processing (OpenCV) unchanged.*

- [x] **54.101.1** **Add floating toolbar Bold control (desktop/mobile) with a11y labels.** In `frontend/index.html`, add `#floatingToolbarBold` to `#floatingToolbar` as `floating-toolbar-element-only`; include icon-style affordance and dynamic `title`/`aria-label` with current level context. Add matching styles in `frontend/styles.css`.
- [x] **54.101.2** **Add per-element `lineWeight` model (default 1) and persist paths.** In `frontend/app.js`, add normalization/clamp helper for 1–4; set default on new elements (drop + tap-add), preserve in duplicate flows, include in undo snapshots and save/load payloads (`cloneStateForUndo`, `restoreStateFromSnapshot`, `getDiagramDataForSave`, `restoreStateFromApiSnapshot`), with backward-compatible default `1` when missing.
- [x] **54.101.3** **Add line-weight render pipeline + cache invalidation.** In `frontend/app.js`, extend element rendering so level `1` is unchanged and levels `2–4` produce cached bold render canvases (multi-offset stamping with deterministic kernel) on top of existing color pipeline. Cache key must include `color`, `width`, `height`, and `lineWeight`. Add centralized render-cache invalidation and use it on color/size/weight changes.
- [x] **54.101.4** **Wire Bold cycle interaction with undo + announcer.** In `initFloatingToolbar()`, bind `#floatingToolbarBold` to cycle `1→2→3→4→1` for single selected element, push undo snapshot, update element `lineWeight`, announce change via live region, and redraw. In `draw()`, show control only for single selected element (not blueprint) on both desktop and mobile.
- [x] **54.101.5** **Add E2E regression coverage + hook updates.** Update `e2e/run.js` for desktop/mobile assertions (visibility, cycle, wrap, persistence after reselect), add color+lineWeight interop check, and keep existing desktop/mobile ruler guard assertions unchanged. Extend `window.__quoteAppGetElements()` to include `lineWeight` for deterministic checks.
- [ ] **54.101.6** **Manual QA + Railway safety verification.** Validate desktop/mobile behavior (selection toolbar, undo/redo, save/load, export thumbnail/PNG parity), run `npm test`, and confirm no Railway env/build/deploy changes are required.

**54.102 Mobile: double-tap zoom and graceful zoom-out**  
*Plan: docs/plans/2026-02-22-mobile-double-tap-zoom-and-graceful-zoom-out.md. Scope: mobile-only; prevent browser double-tap zoom on canvas view, ensure user can always zoom out (Fit) without restarting. Desktop and 54.11 (pinch allowed) unchanged; Railway-safe.*

- [x] **54.102.1** **Prevent double-tap zoom on mobile canvas view.** Under `body[data-viewport-mode="mobile"]`, set `touch-action: none` on `#view-canvas` and `.blueprint-wrap` (or `#blueprintWrap`) so the canvas view area suppresses browser double-tap zoom. Do not change viewport meta (no maximum-scale/user-scalable=no).
- [x] **54.102.2** **Mobile-only Fit view in global toolbar.** Add a "Fit view" control (same behavior as diagram toolbar Fit) to the global toolbar, visible only when mobile; 44px min touch target, aria-label; desktop hidden/unchanged.
- [x] **54.102.3** **Mobile double-tap on empty canvas → Fit.** On mobile, detect double-tap on canvas when no badge under tap; trigger Fit (viewZoom = 1, resetMobileFitPanState, draw) and prevent default. Preserve dblclick-on-badge → length popover. Gate by viewportMode === 'mobile'.
- [ ] **54.102.4** **QA: double-tap and zoom-out.** Manual mobile (iOS Safari, Android Chrome), portrait/landscape, 200% zoom; confirm no double-tap page zoom on canvas, Fit always reachable, double-tap empty canvas fits; no desktop regression; Railway deploy unchanged.

**54.103 Mobile selection handles: corners only (mobile-only, desktop unchanged, Railway-safe)**  
*Scope: selected-element resize affordances on canvas. Mobile should hide side pills while keeping corners + rotate; desktop keeps current full handle set.*

- [ ] **54.103.1** **Mobile render: corner-only handles.** In `frontend/app.js` draw path, when `layoutState.viewportMode === 'mobile'`, render only `nw/ne/se/sw` resize handles plus rotate handle; hide side handles (`n/e/s/w`) visually.
- [ ] **54.103.2** **Mobile hit-testing: disable side-handle interactions.** In `frontend/app.js` handle hit-test path, gate side-handle hit targets off on mobile so hidden handles cannot be activated by touch/cursor.
- [ ] **54.103.3** **E2E/debug parity for handle map.** Ensure mobile `window.__quoteAppGetSelectionBoxInCanvasCoords()` / `window.__quoteAppGetSelectionBoxInScreenCoords()` handle payload matches visible handles (corners + rotate only), while desktop still includes side handles.
- [ ] **54.103.4** **Regression + QA sign-off.** Verify mobile corner-only behavior and desktop unchanged resize/rotate behavior; keep Railway deploy assumptions unchanged.

**54.104 Mobile two-finger transform smoothing reliability (mobile-only, desktop unchanged, Railway-safe)**  
*Scope: selected-element two-finger transform (`translate + scale + rotate`) quality improvements in `frontend/app.js`; no backend/API/deploy changes.*

- [ ] **54.104.1** **Frame-coalesced two-finger transform updates (RAF).** Replace raw per-pointermove application with RAF-coalesced updates to reduce jitter and overdraw during active two-finger transform.
- [ ] **54.104.2** **Rotation continuity across wrap boundary.** Apply shortest-angle delta handling so two-finger rotation remains continuous across ±180° without sudden flips.
- [ ] **54.104.3** **No-jump one-finger → two-finger transition.** When second finger joins during selected-element one-finger move, initialize transform from current visual position to avoid snap-back/jump.
- [ ] **54.104.4** **Diagnostics hook for QA verification.** Add a read-only frontend debug hook exposing two-finger transform frame/sample state for manual/E2E diagnostics.
- [ ] **54.104.5** **Automated regression coverage updates.** Extend `e2e/run.js` to assert mobile side-handle absence and desktop side-handle presence; keep existing desktop resize/rotate assertions intact.
- [ ] **54.104.6** **Manual mobile QA + Railway safety verification.** Real-device check (iOS Safari + Android Chrome): smooth two-finger behavior, no gesture conflicts, no desktop regressions; run `npm test`; confirm no Railway env/build/config changes.

**54.105 Mobile selection element toolbar: top-docked default (canvas-only, keep drag; desktop unchanged; Railway-safe)**  
*Scope: `#floatingToolbar` auto-position in `frontend/app.js` for mobile canvas view only. Keep toolbar out of white header while preserving existing user drag behavior.*

- [x] **54.105.1** **Mobile top-docked default placement in canvas safe area.** In `draw()` auto-position path for `#floatingToolbar`, when mobile and `!state.floatingToolbarUserMoved`, place toolbar at `topSafe = max(getFloatingToolbarMinTopPx(), canvasRect.top + 8)` and horizontal center of canvas; clamp to canvas bounds with viewport fallback.
- [x] **54.105.2** **Preserve existing drag/manual-position semantics.** Do not change `initFloatingToolbar` drag handlers; user drag still sets `floatingToolbarUserMoved` and keeps manual position until selection change.
- [x] **54.105.3** **Mobile anti-overlap nudge for rotate handle.** On mobile top-docked auto-placement, detect selected element rotate-handle X overlap and nudge toolbar left/right within clamps when possible; fallback to centered top if no non-overlap placement fits.
- [ ] **54.105.4** **E2E + manual QA + Railway safety verification.** Extend mobile E2E assertion to check top-docked open position near safe top before manual drag; run `npm test`; manual QA on iOS Safari + Android Chrome (portrait/landscape, 200% zoom); confirm no Railway env/build/config changes.

---

## 55. Mobile-native accessibility hardening (Apple HIG follow-up)
