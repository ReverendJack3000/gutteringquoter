
*Context: Section 54 established baseline mobile support and accessibility. This section closes remaining mobile-native and assistive-technology gaps across the full user journey while preserving Railway-safe deployment architecture.*

**Follow-up tasks**

- [x] **55.1** **Auth: passkey + password manager first-class support.** Add passkey/WebAuthn login (where supported) and ensure iOS password manager/autofill flows are smooth for sign in and sign up.
- [x] **55.2** **Auth/view switching focus management.** On every `switchView()` transition (`view-login`, `view-canvas`, `view-products`), set focus to a deterministic primary target and restore focus to the previous trigger when returning.
- [x] **55.3** **Shared modal accessibility framework.** Implement one reusable modal utility for all overlays/dialogs (quote, product, crop, save diagram, job confirmation, auth fallbacks) with trap, Escape close, inert background, and focus restore.
- [x] **55.4** **Replace browser `alert()` / `confirm()` flows.** Remove native blocking dialogs in favour of accessible in-app dialogs/alerts with correct semantics (`role="alertdialog"` / `role="alert"`) and keyboard support.
- [x] **55.5** **Canvas non-gesture alternatives for manipulation.** Add an accessible inspector panel for selected elements (position, size, rotation, lock, layer order) so transforms are fully operable without drag gestures.
- [x] **55.6** **VoiceOver/Voice Control discoverability for actions.** Ensure item manipulation actions have explicit labels/hints and that gesture-only operations have discoverable control alternatives.
- [x] **55.7** **Dynamic Type and 200% zoom resilience.** Refactor fixed mobile text/layout sizing to scale-friendly rules (`rem`/`clamp`) and verify no clipping/overlap at 200% zoom, including small phones.
- [x] **55.8** **Quote/product modal mobile layouts.** Make quote and product-management flows fully usable on iPhone SE class viewports (no horizontal clipping, reachable primary actions, stable scrolling).
- [x] **55.9** **Accessibility settings discoverability.** Add a settings/preferences surface exposing accessibility controls (reduced motion override, larger controls, high-contrast mode/help) with persisted user preferences.
- [x] **55.10** **Mobile accessibility regression coverage.** Add automated/manual test coverage for mobile viewport behavior, modal focus order, keyboard operability, live-region announcements, and zoom/orientation regressions.

---

## 56. Strangler Fig: Carve out toolbar.js (ES module)

*Context: Reduce app.js size and isolate mobile diagram toolbar logic by moving it to a dedicated ES module. No build step; Railway deployment unchanged. Desktop and mobile behavior preserved. Plan: docs/plans/2026-02-21-strangler-fig-toolbar-js-carve-out.md.*

- [x] **56.1** **Phase 1 – Create toolbar.js and move code.** Create `frontend/toolbar.js`; move from app.js lines 5678–6089 (constants, diagramToolbarDragCleanup, getDiagramToolbarWrap, applyDiagramToolbarPosition, clampNumber, getDiagramToolbarTopPad, computeMobileToolbarEdgeSnap, applyMobileToolbarEdgeSnap, clampDiagramToolbarToWrap, initDiagramToolbarDrag). Inject getViewportMode via initDiagramToolbarDrag(options); replace all layoutState.viewportMode reads with the getter; pass getter into helpers that need it. Export only initDiagramToolbarDrag. Remove the same block from app.js; add at top of app.js: import { initDiagramToolbarDrag } from './toolbar.js'; define initDiagramToolbarDragWithApp that passes getViewportMode; replace all three call sites with initDiagramToolbarDragWithApp().
- [x] **56.2** **Phase 2 – Wire ES module in HTML.** In index.html change script to `<script type="module" src="/app.js"></script>`. Confirm no inline handlers depend on app.js globals (none found); attach to window any app.js symbols if external refs exist.
- [x] **56.3** **Phase 3 – Verify and deploy.** Manual check: desktop and mobile diagram toolbar drag/collapse/snap; run E2E (npm test or ./scripts/run-e2e.sh); confirm Railway deploy succeeds with no new build step.

---

## 57. Mobile canvas fit + pan lock refinement (desktop-safe, Railway-safe)
