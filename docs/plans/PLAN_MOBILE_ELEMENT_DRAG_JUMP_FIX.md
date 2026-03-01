# Plan: Mobile element-drag visual jump fix (57.7)

**Scope:** Mobile only. Desktop behavior and production must remain unchanged.  
**Context:** When dragging or moving an element on mobile, the canvas (or elements) can “jump” visually. Root causes identified in audit: (1) second-finger or stray touch overwriting an ongoing one-finger element drag with pan-resist; (2) residual `fitPanFeedback` from a previous pan-resist causing a shift when a new element drag starts.

---

## 1. Root cause (verified against code)

### 1.1 Second pointer overwrites mode to pan-resist

- **File:** `frontend/app.js`
- **Flow:** `canvas` `pointerdown` (lines 8878–9178).
  - At 8923 we set `state.activePointers[e.pointerId] = { clientX, clientY }`.
  - At 8924 we set `ptrIds = Object.keys(state.activePointers)`.
  - When a **second** finger touches, `ptrIds.length === 2`. We enter the two-finger block (8925–8949). If we do **not** take the pinch branch (e.g. `dist <= 5` at 8936 or `beginMobileElementTransformFromActivePointers()` returns false), we **fall through**.
  - At 8951 we set `canvasPos = clientToCanvas(e.clientX, e.clientY)` — this is the **current** (second) pointer’s position.
  - Hit-tests (bpHandle, handleHit, getSelectionAt) use that position. If the second finger is on empty canvas, `target` is null and we do not enter the element or blueprint branches.
  - We reach 9163: `setSelection([]);` then 9167–9173: on mobile we set `state.mode = isMobileFitZoomLevel() ? 'pan-resist' : 'pan'` and return. So we **overwrite** the existing `state.mode` (which was `'move'` or `'move-primed'` from the first finger) and clear selection.
- **Result:** The first finger’s element drag is replaced by pan-resist; subsequent `pointermove` applies `applyFitPanResistance` and `draw()` adds `fitPanFeedbackX/Y` to offset → visual jump.

### 1.2 Residual fitPanFeedback at drag start

- **File:** `frontend/app.js`
- **Flow:** `draw()` (7888–7890, 7927–7929) sets `state.offsetX = baseOffsetX + state.viewPanX + (isMobileFitZoomLevel() ? state.fitPanFeedbackX : 0)` (and Y). So any non-zero `fitPanFeedback` shifts the view.
- When the user **starts** an element drag after having previously triggered pan-resist, `fitPanFeedback` may still be non-zero (decay in draw() only runs each rAF). When we set `state.mode = 'move'` or `'move-primed'`, we do **not** clear `fitPanFeedback`. So the first few frames of the drag still apply the old feedback, then it decays → visible jump at drag start.
- `fitPanFeedback` is only cleared when: `resetMobileFitPanState()` (e.g. Fit button, upload, zoom-out to min), or when not at fit level (8501–8503), or in the draw() decay path when `state.mode !== 'pan-resist'` (8495–8499). Entering move/move-primed does not clear it.

---

## 2. Intended behavior (no assumptions)

- **One-finger element drag:** When the user has started a move or move-primed gesture (one pointer on an element), a **second** pointer down elsewhere must **not** change mode to pan/pan-resist or clear selection. The first pointer’s gesture continues until that pointer lifts.
- **New element drag:** When the user starts a new element drag (move or move-primed) on mobile, any residual `fitPanFeedback` from a previous pan-resist must be cleared so the view does not jump at drag start.
- **Desktop:** No change. Pan-resist and `fitPanFeedback` are only used when `layoutState.viewportMode === 'mobile'` (e.g. `isMobileFitZoomLevel()` and the empty-canvas pan branch at 9167). All new logic will be guarded by `layoutState.viewportMode === 'mobile'` where applicable.

---

## 3. Implementation plan (exact locations)

### 3.1 Prevent second pointer from overwriting mode (mobile only)

- **File:** `frontend/app.js`
- **Location:** In the `pointerdown` handler, in the block that runs when we have **no** element or blueprint target (i.e. after the closing of `if (target?.type === 'blueprint')` and before we run the empty-canvas logic). **Insert immediately before** `setSelection([]);` at line 9163.
- **Condition to add:** If we are on mobile **and** the current mode is already a one-finger element drag (`state.mode === 'move'` or `state.mode === 'move-primed'`) **and** there are at least two active pointers (`ptrIds.length >= 2`), then **return** without clearing selection or setting mode. This treats the current event as a second finger and leaves the first finger’s gesture intact.
- **Exact guard (conceptual):**  
  `if (layoutState.viewportMode === 'mobile' && (state.mode === 'move' || state.mode === 'move-primed') && ptrIds.length >= 2) return;`
- **Scope:** `ptrIds` is already in scope (defined at 8924 in the same handler). No other variables needed.
- **Desktop impact:** None. This branch is only taken when we would otherwise set pan/pan-resist, which only happens on mobile (9167). On desktop we set marquee (9175) and never set move-primed.

- **Pointer tracking (do not skip):** The guard must be placed **after** the new pointer has already been recorded. In the current flow, `state.activePointers[e.pointerId] = { clientX, clientY }` runs at line 8923 and `canvas.setPointerCapture(e.pointerId)` at 8919, both before any hit-testing or the empty-canvas block. So a `return` at the guard (immediately before 9163) does **not** skip pointer tracking: the second finger is already in `activePointers`. That ensures pinch-to-zoom (and two-finger element transform) still work if the user later uses two fingers—the next pointerdown or pointermove will see both pointers. When implementing, do **not** move the guard earlier (e.g. before 8923); it must stay immediately before `setSelection([]);` so we never skip adding the new touch to `activePointers`.

### 3.2 Clear residual fitPanFeedback when entering move or move-primed (mobile only)

- **File:** `frontend/app.js`
- **Places:** Three places where we set `state.mode` to `'move-primed'` or `'move'`. After each, add a mobile-only clear of `fitPanFeedback` so residual feedback from a previous pan-resist does not shift the view at drag start.
  1. **pointerdown, move-primed:** Immediately after `state.mode = 'move-primed';` (line 9123), before the following assignments. Add: when `layoutState.viewportMode === 'mobile'`, set `state.fitPanFeedbackX = 0` and `state.fitPanFeedbackY = 0`.
  2. **pointerdown, move:** Immediately after `state.mode = 'move';` (line 9133), before `if (primary)`. Same: when `layoutState.viewportMode === 'mobile'`, set `state.fitPanFeedbackX = 0` and `state.fitPanFeedbackY = 0`.
  3. **pointermove, transition from move-primed to move:** Immediately after `state.mode = 'move';` (line 9278), before setting `state.dragOffset.x`. Same: when `layoutState.viewportMode === 'mobile'`, set `state.fitPanFeedbackX = 0` and `state.fitPanFeedbackY = 0`.
- **Do not** call `resetMobileFitPanState()` here: that also sets `viewPanX` and `viewPanY` to 0, which would recenter the view. We only want to clear the transient feedback.
- **Desktop impact:** None. We only clear when `layoutState.viewportMode === 'mobile'`. On desktop `fitPanFeedback` is never set (isMobileFitZoomLevel is false), so clearing is a no-op if we ever called it there.

---

## 4. What we are not changing (verified)

- **Hit-test / coordinate space:** No change to `getSelectionAt`, `pointInRotatedRect`, or `clientToCanvas`. The audit confirmed element move uses canvas space correctly; the jump is from pan-resist/fitPanFeedback, not from double-scaling. Optional hit-test tolerance can be a separate follow-up if needed.
- **Pan / pan-resist logic:** No change to when we set pan or pan-resist for a **single** pointer on empty canvas; only to the case where a **second** pointer would overwrite an existing move/move-primed.
- **Desktop empty-canvas:** Still sets `state.mode = 'marquee'` (9175); no change.
- **Pinch / two-finger transform:** No change to the two-finger branch (8925–8949); we only add a guard in the **fall-through** path that leads to empty-canvas.

---

## 5. Verification

- Run full E2E: `npm test` (or `./scripts/run-e2e.sh`). Existing Section 57 tests (mobile fit inset, pan lock, pan resume, Fit reset) must still pass.
- Manual mobile: One-finger element drag (tap element, then drag; or tap selected element and drag) must not jump. Second finger touching empty space during drag must not change mode or clear selection. Pan on empty canvas at fit level must still show resistance; pan when zoomed in must still work.
- Manual desktop: Empty-canvas drag still starts marquee; element drag unchanged; no new behavior.

---

## 6. Task reference

- Section **57.7** (new): Mobile element-drag jump fix — prevent pan-resist hijacking and clear residual fitPanFeedback at drag start (mobile-only, desktop-safe).
