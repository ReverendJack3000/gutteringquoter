# Mobile Freeform Interaction Parity QA Checklist (54.65-54.66)

**Date:** 2026-02-20  
**Scope:** Section 54 mobile interaction parity items for selected-element transforms, tap-first move behavior, and toolbar/header safety.

---

## Automated baseline (E2E)

- [x] Run `npm test` (`node e2e/run.js`) and confirm full suite passes.
- [x] Confirm existing mobile viewport/orientation regression checks pass (`?viewport=mobile`, portrait/landscape).
- [x] Confirm mobile diagram toolbar collapse/expand still passes in E2E.

---

## Manual interaction checklist (54.65 sign-off)

- [ ] **Two-finger selected-element transform:** On mobile, place a part, select it, then use two fingers to resize + rotate. Expected: selected part transforms directly (translate/scale/rotate), no unintended viewport pinch.
- [ ] **Mobile selection handles are corner-only:** On mobile selection box, verify only `nw/ne/se/sw` corner handles plus rotate are available; side handles (`n/e/s/w`) are hidden and non-interactive.
- [ ] **Viewport pinch fallback:** With no element selected, two-finger gesture should pan/zoom viewport (existing pinch behavior), not transform an element.
- [ ] **Tap-first move gating:** First tap on an unselected part only selects it. Expected: no movement on quick tap.
- [ ] **Slight drift tolerance:** Tap with minor finger drift below threshold should still be treated as select-only, not drag.
- [ ] **Explicit move after selection:** After a part is already selected, one-finger drag should move it (with threshold), and empty-space drag should pan the canvas.
- [ ] **Two-finger transition reliability:** Start one-finger interaction on a selected part, then add second finger. Expected: no stuck mode; transitions cleanly into two-finger element transform.
- [ ] **No jump on one-finger → two-finger transition:** While selected part is being moved one-finger, add a second finger. Expected: transform continues from current visual position (no snap-back/jump).
- [ ] **Rotation continuity across wrap boundary:** During two-finger rotate, pass through opposite-angle boundary (near +/-180). Expected: continuous rotation direction with no sudden flip.
- [ ] **Panel tap-to-add auto-close:** Open Products panel on mobile, tap an item to place it. Expected: part is added and panel auto-closes.
- [ ] **Expanded toolbar drag-to-right transition:** With toolbar expanded, drag it to the right edge. Expected: orientation snaps to vertical without requiring collapse-first workaround.
- [ ] **Expanded toolbar drag-to-top transition:** With toolbar expanded (including after vertical state), drag it to the top edge. Expected: orientation snaps back to horizontal and remains fully visible under safe top offset.
- [ ] **Toolbar top-edge/header safety:** Drag toolbar near top edge, collapse/expand, rotate device. Expected: toolbar remains fully visible and not clipped under header/notch.
- [ ] **Edge-only resting state:** After releasing drag from any position, toolbar rests on one of the four edges (left/right/top/bottom), not in middle strip.
- [ ] **200% zoom + orientation:** At browser zoom 200% (or equivalent accessibility zoom), verify portrait and landscape layout remains usable, with controls reachable and no blocked interactions.
- [ ] **Desktop regression guard:** Re-check desktop move/resize/rotate/pinch-adjacent behavior to confirm no mobile logic bleed.

---

## Notes

- This file is the required checklist artifact for task **54.66**.
- Task **54.65** remains a manual sign-off activity; keep it open until the checklist above is executed on target mobile hardware.
