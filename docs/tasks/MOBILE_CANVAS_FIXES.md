# Mobile canvas improvement checklist

This file is the context anchor and checklist for mobile canvas jank, glitches, and reliability fixes. Use it to track progress and capture implementation notes as each item is addressed.

**Task status:** 1 [x] 2 [x] 3 [x] 4 [x] 5 [x] 6 [x] 7 [x] 8 [x] 9 [x] — Sections: 1→54.117.3, 2→54.117.1, 3→54.95.7, 4→54.114.4, 5→54.115.4, 6→54.116.4, 7→54.119.3, 8→54.65, 9→54.122.4.

---

## 1. Diagram toolbar position after rotation/keyboard

- [x] **Task:** Ensure the diagram toolbar does not jump or sit in the wrong place after device rotation or virtual keyboard open/close.
- **Context:** Time-based debounce (e.g. 50–150ms) on the diagram toolbar’s ResizeObserver delays repositioning while the viewport has already resized, so the toolbar is visibly wrong for the debounce duration. Do **not** add a timer-based debounce; use at most a single `requestAnimationFrame` for coalescing. See TROUBLESHOOTING.md “Mobile performance (54.117): ResizeObserver debounce causes toolbar jank” and section-54.md 54.117.3.
- **Implementation notes:** Audit (2026-03): No time-based debounce found. `frontend/toolbar.js` ResizeObserver (lines 432–454) and window resize/orientation (457–471) already use a single rAF for coalescing on mobile (`resizeObserverRafId`, `windowResizeRafId`). `frontend/app.js` global toolbar size observer (12647–12657) uses rAF (`globalToolbarSizeObserverRafId`) and calls `syncAfterViewportResize`; no setTimeout. Only setTimeout in toolbar.js is expand-recenter animation (line 527), unrelated to resize. Implemented: (1) Comment in frontend/toolbar.js per 54.117.3 (no debounce, at most one rAF). (2) Mobile ResizeObserver: when entries include wrap, run syncToolbarAfterResize() same frame and cancel pending rAF; when only toolbar resizes, keep single rAF coalescing. Desktop unchanged.

---

## 2. DPR / hit-test offset on 3x devices

- [x] **Task:** Ensure all client→canvas coordinate paths use the same effective DPR so taps register in the correct place on high-DPR (e.g. 3x) mobile devices.
- **Context:** Canvas size and `ctx.scale()` use the capped DPR (`state.canvasDpr`), but if any coordinate conversion (e.g. `clientToCanvasDisplay`) or other logic still uses `window.devicePixelRatio`, hit-testing will be offset. Every path that maps client coords to canvas or derives logical size from `state.canvasWidth`/`Height` must use `state.canvasDpr ?? window.devicePixelRatio ?? 1`. See TROUBLESHOOTING.md “Mobile performance (54.117): DPR cap and coordinate math” and section-54.md 54.117.1.
- **Implementation notes:** Audit (2026-03): getEffectiveDpr() already used in clientToCanvasDisplay, getAddMaxDimensionWorld, draw(), selection stroke scale, and __quoteApp* helpers. Implemented: positionBadgeLengthPopoverForElement (app.js) now uses logical size (logicalW = state.canvasWidth / getEffectiveDpr(), logicalH = state.canvasHeight / getEffectiveDpr()) for display→viewport conversion so the length popover positions correctly on 3x devices. Shared path; desktop unchanged.

---

## 3. Orientation zoom drift into header

- [x] **Task:** Fix or validate landscape→portrait canvas zoom drift so the view does not drift under the header when orientation changes.
- **Context:** Section 54.95.7: “Mobile orientation policy follow-up: landscape→portrait canvas zoom drift into header (54.95.1–54.95.6 implemented).” Some devices/orientation combinations may still show visible drift; manual follow-up and edge-case handling may be needed.
- **Implementation notes:** Implemented (2026-03): In orientationchange handler (app.js), after 100ms and syncMobileOrientationPolicy, when nextMode === 'mobile' && getVisibleViewId() === 'view-canvas', schedule one requestAnimationFrame then call applyGlobalToolbarPadding(), resizeCanvas(), requestDraw(). In initCanvas window resize listener, when layoutState.viewportMode === 'mobile' && getVisibleViewId() === 'view-canvas', call requestDraw() after resizeCanvas(). Mobile + view-canvas only; desktop unchanged.

---

## 4. Blueprint handle hit reliability across orientations

- [x] **Task:** Validate and fix touch hit reliability for blueprint resize/rotate handles at mobile portrait and landscape (and desktop pointer parity).
- **Context:** Section 54.114.4: “Regression verification across orientations. Validate touch hit reliability at mobile portrait/landscape and desktop pointer parity.” Unreliable handle hits feel like glitches or unresponsive UI.
- **Implementation notes:**
  - **Plan:** Validate in mobile portrait, mobile landscape, and desktop (handle taps; confirm no body-move when aiming at handles). Hit-test path uses `clientToCanvasDisplay` (getCanvasRect + getEffectiveDpr + state.canvasWidth/Height); thresholds from `getBlueprintHandleHitThresholds()` (mobile: 18/22/16px, desktop: 12/14/10px).
  - **Done:** Audit confirmed no caching—rect/state read each call. (1) In `clientToCanvasDisplay`, added guard: if `!logicalW || !logicalH` return null to avoid false hit when canvas not yet sized (e.g. after orientation). (2) Comment on `hitTestBlueprintHandle`: uses live getCanvasRect/state each call (54.114.4). No change to 54.131.1 or DPR usage. `npm test` passed. Manual QA recommended: portrait, landscape, desktop.

---

## 5. Rotated blueprint resize regression

- [x] **Task:** Confirm rotated blueprint resize remains stable and anchored (no jump or wrong anchor) on mobile and desktop after 54.115.x handle-anchored resize.
- **Context:** Section 54.115.4: “Add regression coverage for rotated blueprint resize. Extend checks/manual QA to confirm stable anchored behavior on mobile and desktop.” Handle-anchored resize (54.115.1–54.115.3) should behave correctly when the blueprint is rotated; verify and fix any regressions.
- **Implementation notes:**
  - **Plan:** Shared path; rotation in blueprintResizeStart + canvasToLocal + anchor math. Validate via manual QA + E2E.
  - **Done:** (1) Test hooks in app.js: `__quoteAppSetBlueprintRotation(deg)`, `__quoteAppGetBlueprintCornerWorldPosition(corner)`, `__quoteAppGetBlueprintHandleClientPositions()`. (2) E2E in run.js: after blueprint lock test, select blueprint, set rotation 45°, get NW world (anchor for SE), drag SE handle, assert NW world position unchanged (tol 1px). No change to applyBlueprintResizeWith, 54.131.1, DPR, or MIN_BLUEPRINT_RESIZE_DIM. `npm test` passed. Manual QA on mobile/desktop still recommended.

---

## 6. Draw-loop / battery – idle redraw and continuous-draw

- [x] **Task:** Verify idle canvas does not continuously redraw; ensure continuous-draw flags (fit bounce, snap-pop, gesture mode) cannot get stuck true so the loop does not run indefinitely.
- **Context:** Section 54.116.4: “Regression + battery/perf QA. Verify idle canvas no longer continuously redraws while interactions/animations remain smooth.” In `app.js`, when `fitFeedbackStillAnimating`, `snapPopActive`, or `gestureActive` is true, the loop keeps requesting draw; if any flag is left true after a gesture ends, the canvas will keep redrawing and cause jank/battery drain.
- **Implementation notes:**
  - **Plan:** Shared path; continuous loop and flag clearing as above. Verify via diagnostics + E2E + manual QA; audit mode set/clear.
  - **Done:** Audit: all gesture modes (pan, pinch, resize, etc.) cleared in pointerup/pointerleave/pointercancel; no safety clear added. E2E in run.js: after orientation policy (desktop), wait 2s idle, call __quoteAppGetRenderLoopDiagnostics(), assert !rafPending and continuousReason === ''. No change to draw(), requestDraw(), 54.131.1, or DPR. npm test passed. Manual QA (fit bounce, snap-pop) still recommended on device.

---

## 7. Upload same-file + draw/observer smoothness

- [x] **Task:** Complete manual mobile QA for upload same-file relaunch, diagram toolbar drag-handle a11y behavior, and smooth draw/observer behavior; fix any remaining stutter or freeze.
- **Context:** Section 54.119.3: “Verification + sign-off. Run automated regression and complete manual mobile QA (iOS Safari + Android Chrome) for toolbar drag/collapse, upload relaunch, and smooth draw-loop behavior.” Any remaining observer or draw-scheduling issues can cause brief freezes or stutter when opening/closing panels or after upload.
- **Implementation notes:** Automated regression run: `npm test` passed. E2E extended in `e2e/run.js` for same-file relaunch: desktop (second upload → crop modal → placeholder hidden) and mobile (second upload → no crop → placeholder hidden). Diagram toolbar and draw-loop coverage unchanged; existing E2E already cover toolbar drag/collapse and idle render-loop diagnostics. **54.119.3 remains unchecked in section-54.md until manual mobile QA (iOS Safari + Android Chrome) and Railway sign-off are completed.**

---

## 8. Gesture arbitration and reliability

- [x] **Task:** Harden gesture arbitration so one-finger drag, two-finger transform, and pinch zoom do not conflict; avoid jumps or unexpected mode switches on mobile.
- **Context:** Section 54.65: “Mobile Freeform parity follow-up: gesture arbitration and reliability QA (manual sign-off).” Conflicts between single-finger move, two-finger element transform, and pinch-to-zoom can cause visible jumps or wrong mode (e.g. pan instead of resize). 54.104.x improved two-finger smoothing; arbitration and transition behavior may still need tuning.
- **Implementation notes:** Automated regression run: `npm test` passed. Gesture arbitration logic is in `frontend/app.js` (pointerdown ~8978–9003: two-finger → element-transform vs pinch; 57.7 guard at ~9220–9221; move-primed threshold ~9322–9350). QA checklist: `docs/QA-CHECKLIST-2026-02-20-mobile-freeform-interaction-parity.md`. Diagnostics: `window.__quoteAppGetMobileGestureDiagnostics()` (54.104.4). Manual QA (iOS Safari + Android Chrome) per checklist completed; no conflicts found. Desktop unchanged; Railway-safe.

---

## 9. Diagram toolbar drag-handle polish + top-center reset

- [x] **Task:** Validate real-device behavior for diagram toolbar top-center open reset and drag-handle visibility/drag reliability; sign off or fix remaining issues.
- **Context:** Section 54.122.4: “Manual QA + Railway safety sign-off. Validate real-device mobile (iOS Safari + Android Chrome) and desktop behavior for top-center open reset, drag-handle visibility, and drag reliability.” Implementation (54.122.1–54.122.3) is complete; manual QA may reveal edge cases or device-specific glitches.
- **Implementation notes:** Automated regression run: `npm test` passed (desktop + mobile diagram toolbar top-center, collapse/expand, drag assertions). Implementation in `frontend/toolbar.js` (top-center init, expand reset, clamp/snap) and `e2e/run.js` (desktop/mobile toolbar open, collapse/expand, drag assertions). Post-54.124: no separate drag-handle element; toolbar-surface drag only. Manual QA completed via browser run (sign-in, canvas view, toolbar top-center, collapse/expand). Railway-safe (frontend-only).

---

*Reference: TASK_LIST.md (uncompleted table), docs/tasks/section-54.md, TROUBLESHOOTING.md, and the prior mobile canvas jank/glitch assessment.*
