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
- [ ] **54.51** **Mobile: Tap-to-expand reliability.** Ensure tap on collapsed "+" consistently expands (no accidental drag); hit target 44×44; consider touch-action or small movement threshold so tap vs drag is unambiguous.
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

- [ ] **54.84.3** **Auto collapse global toolbar when products panel opened.** When the user opens the Products panel (bottom sheet) on mobile, automatically collapse the global header (#globalToolbar) to free vertical space for the canvas and products. Restore or keep expand on panel close. Mobile-only; desktop unchanged.

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
- [ ] **54.87.5** **Future: extrapolate popup edit pattern from labour to other quote elements/items.** Track as follow-up task only; no non-labour popup editing changes in this phase.

---

## 55. Mobile-native accessibility hardening (Apple HIG follow-up)
