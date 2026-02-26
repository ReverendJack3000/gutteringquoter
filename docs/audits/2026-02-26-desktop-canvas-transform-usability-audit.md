# 2026-02-26 Desktop Canvas Transform Usability Audit

## Scope
- Desktop canvas interaction audit focused on element transforms, blueprint transforms, and diagram toolbar behavior.
- Shared-path checks were run in forced mobile mode for bugs that use the same interaction code.
- No backend/API/schema changes; frontend-only behavior.

## Environment
- App: `http://127.0.0.1:8000/`
- Desktop run + forced mobile run: `?viewport=desktop` and `?viewport=mobile`
- Validation method: manual repro + automated regression updates in `e2e/run.js`

## Findings

### B1: Tiny selected element center drag rotates instead of moving
- Repro:
1. Add/select an element.
2. Resize it to a tiny footprint.
3. Drag from element center.
- Expected: center/body drag starts move.
- Actual (before fix): rotate mode could trigger and change rotation.
- Root cause: rotate stem hit-testing was too permissive and evaluated before body move path (`frontend/app.js:8508`).
- Shared path: Yes (desktop/mobile element-handle logic).
- Fix: stem hit now requires pointer intent above top edge (`frontend/app.js:8514`).

### B2: Blueprint move undo removes blueprint instead of undoing transform
- Repro:
1. Upload blueprint.
2. Move blueprint.
3. Press `Ctrl/Cmd+Z`.
- Expected: blueprint transform reverts to prior position.
- Actual (before fix): blueprint could be removed (`null` transform state).
- Root cause: blueprint interactions wrote to a split history that undo never consumed (`frontend/app.js:9260` pre-fix path).
- Shared path: Yes (desktop/mobile blueprint transform interactions).
- Fix: unified interaction snapshots into `undoHistory` via shared snapshot push (`frontend/app.js:7193`, `frontend/app.js:9260`).

### B3: Desktop diagram toolbar can overflow bottom after right-edge orientation switch
- Repro:
1. Drag toolbar toward right-middle/lower region.
2. Release so toolbar switches vertical orientation.
- Expected: toolbar remains clamped within blueprint wrap.
- Actual (before fix): toolbar bottom could overflow outside wrap.
- Root cause: clamp used dimension-swapped desktop math and ran before orientation change without a post-orientation clamp (`frontend/toolbar.js:162`, `frontend/toolbar.js:424`).
- Shared path: No (desktop orientation flow).
- Fix: desktop clamp now uses real rendered dimensions and re-clamps after orientation update (`frontend/toolbar.js:190`, `frontend/toolbar.js:425`).

### B4: Arrow-key nudge changed state without redraw and without reliable undo snapshot sequencing
- Repro:
1. Select element.
2. Press arrow key nudge.
3. Observe draw diagnostics and undo behavior.
- Expected: immediate redraw and undo of that nudge step.
- Actual (before fix): no redraw request and undo sequencing could jump to older snapshots.
- Root cause: nudge handler mutated positions without redraw request and without sequence-aware snapshot capture (`frontend/app.js:9439` pre-fix path).
- Shared path: Practically desktop usage (handler is shared).
- Fix: nudge now captures one snapshot per held key sequence and requests redraw (`frontend/app.js:9441`, `frontend/app.js:9456`, `frontend/app.js:9501`).

## Regression Coverage
- Added/updated in `e2e/run.js`:
- Desktop tiny-element center drag moves (not rotate): `e2e/run.js:998`
- Desktop blueprint move undo restores transform (not remove blueprint): `e2e/run.js:857`
- Desktop toolbar right-edge orientation remains clamped: `e2e/run.js:1645`
- Desktop keyboard nudge redraw + single-step undo: `e2e/run.js:1036`
- Mobile shared-path checks:
- Blueprint move undo restores transform: `e2e/run.js:2765`
- Tiny-element center drag moves (not rotate): `e2e/run.js:2999`

## Verification Checklist
- [x] B1 repro fixed on desktop.
- [x] B2 repro fixed on desktop.
- [x] B3 repro fixed on desktop.
- [x] B4 repro fixed on desktop.
- [x] Shared-path checks for B1/B2 validated in forced mobile mode.
- [ ] Manual real-device mobile QA sign-off.
- [ ] Railway production sign-off.

## Railway Safety
- No env/config/build/deployment contract changes.
- No backend/public API schema changes.
