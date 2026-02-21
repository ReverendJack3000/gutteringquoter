## Mobile Reliability + Apple HIG Plan (Railway-safe, Desktop-isolated)

### Summary
This plan is based on repository docs/rules, current code, a real mobile Playwright walkthrough (including sign-in), and current test baselines.  
Primary goal: fix high-impact mobile toolbar usability/reliability issues first, while keeping desktop behavior unchanged and preserving Railway deploy safety.

### Grounded Baseline
1. Verified architecture and deploy constraints:
- FastAPI + static frontend, no frontend build step (`README.md`, `Dockerfile`, `railway.json`, `Procfile`, `nixpacks.toml`).
- Mobile/desktop split is runtime-gated via `data-viewport-mode` (`frontend/app.js:9292`, `frontend/styles.css:2136`).
2. Verified runtime behavior on mobile (`?viewport=mobile`) with provided login:
- Sign-in works.
- Products panel open/close and tap-to-add auto-close work.
- Accessibility settings modal and saved-diagrams bottom sheet work.
3. Reproduced toolbar orientation defect in expanded mode:
- In expanded horizontal mode, center-X cannot reach left/right orientation zones at 390px viewport, so vertical reorientation is unreachable unless collapsed first.
- This matches the existing task note in `TASK_LIST.md:1324`.
4. Baseline checks currently pass:
- `npm test` passed.
- `./scripts/verify_api.sh` passed.
- Theme-color behavior for forced mobile/desktop verified (`54.68` criteria) via viewport-mode checks.

### Function List (Mobile UX/Responsiveness/Visual Reliability)
Implementation will focus on these functions and add small internal helpers:

| Function | File | Planned change |
|---|---|---|
| `initDiagramToolbarDrag` | `frontend/app.js:5741` | Add mobile-only edge-snap flow that works while expanded and collapsed. |
| `updateOrientationFromPosition` (inner) | `frontend/app.js:5793` | Keep desktop logic; replace mobile branch with nearest-edge snap behavior. |
| `clampDiagramToolbarToWrap` | `frontend/app.js:5714` | Harden mobile clamp to keep full toolbar visible with real rendered dimensions. |
| `onCollapseClick` (inner) | `frontend/app.js:5915` | Fix tap-to-expand reliability so first tap expands unless it is an immediate post-drag suppression window. |
| `getDiagramToolbarTopPad` | `frontend/app.js:5704` | Reuse for safe-area/header-safe top snapping in mobile edge logic. |
| `applyViewportMode` | `frontend/app.js:9292` | No behavior change; keep mode-gating and theme-color logic intact. |
| `setPanelExpanded` | `frontend/app.js:9215` | No functional change planned; regression guard only. |
| `renderProducts` | `frontend/app.js:9510` | No functional change planned; regression guard only. |
| (New internal helper) `computeMobileToolbarEdgeSnap` | `frontend/app.js` | Return `{edge, orientation, left, top}` from wrap/toolbar rect + safe top pad. |
| (New internal helper) `applyMobileToolbarEdgeSnap` | `frontend/app.js` | Apply snapped position/orientation + persist existing localStorage keys. |
| (New internal helper) `shouldSuppressExpandAfterDrag` | `frontend/app.js` | Replace boolean-only suppression with time/distance bounded suppression. |

### Implementation Spec (Decision-complete)

#### 1) Mobile toolbar edge/orientation reliability
1. Add mobile-only nearest-edge snap logic in `initDiagramToolbarDrag` flow.
2. Trigger snap in three places:
- pointer up (after drag),
- initialization (normalize stale middle positions),
- ResizeObserver callback.
3. Keep desktop orientation logic exactly as-is.
4. Persist only existing keys:
- `quoteApp_diagramToolbarX`,
- `quoteApp_diagramToolbarY`,
- `quoteApp_diagramToolbarOrientation`.
5. Do not introduce new storage keys.

#### 2) Mobile clamp hardening
1. In mobile clamp path, calculate max bounds from actual `getBoundingClientRect()` width/height.
2. Preserve safe top offset behavior from `getDiagramToolbarTopPad`.
3. Ensure toolbar cannot end partially off-screen after collapse/expand or resize.

#### 3) Tap-to-expand reliability
1. Replace `didDragThisSession`-only suppression with bounded suppression:
- suppress expand only if click happens immediately after a real drag threshold breach.
2. Keep drag-vs-tap disambiguation threshold.
3. Preserve 44x44 control target and no accidental expansion during drag.

#### 4) CSS updates (mobile-only, 44px strict policy)
1. Keep 44px minimum targets; do not introduce 40px/36px controls.
2. Vertical orientation:
- enforce single-column behavior (`nowrap`) in tools wrap.
3. Horizontal orientation:
- remove internal scrolling,
- allow controlled wrap fallback when necessary (accessibility-first, no <44 targets),
- tighten spacing/padding for cleaner visual density without reducing targets.
4. Keep all selectors strictly under `body[data-viewport-mode="mobile"]` to avoid desktop impact.

#### 5) E2E + QA coverage
1. Extend mobile section in `e2e/run.js` around current mobile block (`e2e/run.js:1378`):
- expanded toolbar drag to right edge -> vertical,
- expanded toolbar drag to top edge -> horizontal,
- no middle resting position after release,
- no toolbar internal scrollbars in mobile orientations,
- collapse/expand first-tap reliability after drag.
2. Keep existing desktop toolbar and interaction tests unchanged.
3. Update manual QA checklist artifact with explicit expanded-mode orientation transitions.

### Public APIs / Interfaces / Types
1. Backend API: no changes.
2. DB/Supabase schema: no changes.
3. Env vars / Railway config: no changes.
4. Frontend public contracts: no changes.
5. Internal-only JS helpers may be added; no new external endpoints.

### Test Cases and Acceptance Criteria
1. Mobile expanded-orientation transition:
- Start expanded horizontal, drag to right edge, expect vertical without collapsing.
- Start expanded vertical, drag to top edge, expect horizontal without collapsing.
2. Mobile edge-only placement:
- After pointer up, toolbar is snapped to one of four edges; no middle resting state.
3. Mobile accessibility/tap reliability:
- Collapsed `+` expands on first deliberate tap.
- No accidental expand during drag.
- 44px targets preserved.
4. No-scroll constraint:
- No horizontal/vertical internal scrollbars inside mobile toolbar controls.
5. Regression:
- Desktop toolbar/panel behavior unchanged.
- Existing E2E suite remains green.
- `./scripts/verify_api.sh` remains green.
6. Theme-color verification:
- `?viewport=mobile` stays blue (`#54B3D9`), `?viewport=desktop` stays green (`#71C43C`) across portrait/landscape resize.

### TASK_LIST.md Updates To Apply (when exiting Plan Mode)
1. Update uncompleted summary table at top:
- Remove rows labeled `(Complete)` from the “Uncompleted tasks” table.
- Keep only genuinely incomplete items.
2. Mark `54.68` complete:
- Change to `[x]` with note that mobile/desktop forced viewport checks passed.
3. Update wording of `54.57` to match approved policy:
- 44px accessibility-first targets; no compact 40/36 target reduction.
4. Update wording of `54.58`:
- Explicitly require orientation snap behavior to work while expanded (no collapse-first workaround).
5. Update wording of `54.60`:
- Remove “<44px tradeoff” language; keep accessibility-first QA expectation.
6. Update top Section-54 uncompleted row to remove completed `54.50.1` from incomplete grouping.

### Assumptions and Defaults Locked
1. Scope: reliability first.
2. Touch targets: 44px strict.
3. Desktop isolation: mobile-only behavior changes.
4. Baseline: current local file state is intentional baseline.
5. Railway safety: no dependency/build/deploy-config changes.
