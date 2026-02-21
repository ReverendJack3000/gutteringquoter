# Audit Report: Mobile Diagram Toolbar Edge-Snap, CSS Hardening, E2E, and 54.74 Token Consistency

**Date:** 2026-02-21  
**Scope:** Verify reported changes in `app.js`, `styles.css`, `e2e/run.js`, and `TASK_LIST.md`; confirm no assumptions or oversights; desktop vs mobile scoping; Railway deployment safety.  
**Intent:** No code changes in this audit; add/update uncompleted tasks in `TASK_LIST.md` if needed.

---

## 1. Project context (cursor rules, TASK_LIST, README)

- **Single source of truth:** All task tracking in `TASK_LIST.md`; completion = `[x]` on the task line.
- **Desktop vs mobile:** One codebase; `body[data-viewport-mode="mobile"]` (CSS) and `layoutState.viewportMode === 'mobile'` (JS). Mobile-only changes must not alter desktop production behaviour.
- **Deployment:** Railway uses Procfile / nixpacks.toml; backend runs `uvicorn` from `backend/`; frontend is static. No new build steps or dependencies.
- **Recurring issues:** Document in `TROUBLESHOOTING.md`. Brainstorming rule: plan before implementation; get approval before code.

---

## 2. What was changed (verified against codebase)

### 2.1 Mobile edge-snap / orientation reliability in app.js

| Location | Verified implementation |
|----------|-------------------------|
| **~5720** | `computeMobileToolbarEdgeSnap(toolbar, wrap, options)` — mobile-only (`layoutState.viewportMode !== 'mobile'` → return null). Uses wrap rect, pad, top safe offset via `getDiagramToolbarTopPad`, distance-to-edges, optional `dragDelta` for intent (INTENT_MIN_DELTA 18, INTENT_DOMINANCE_RATIO 1.25). Returns `{ edge, orientation, pad }`. |
| **~5768** | `applyMobileToolbarEdgeSnap(toolbar, wrap, snap)` — sets `data-orientation`, computes left/top by edge (top/bottom/left/right), clamps with `clampNumber`, calls `applyDiagramToolbarPosition`, persists X, Y, orientation to localStorage. |
| **~5901** | `updateOrientationFromPosition(options)`: when `layoutState.viewportMode === 'mobile'`, calls `applyMobileToolbarEdgeSnap(toolbar, wrap, computeMobileToolbarEdgeSnap(toolbar, wrap, options))` and returns; desktop path unchanged (zone logic top/bottom 20% → horizontal, left/right 20% → vertical). |
| **~6001** | `onPointerUp`: after `clampDiagramToolbarToWrap`, calls `updateOrientationFromPosition({ dragDelta })`; sets `suppressNextExpandTap = !!didDragThisSession` (bounded expand suppression). |
| **~6035** | `onCollapseClick`: uses `shouldSuppressExpandAfterDrag()` to suppress synthetic click after drag; double rAF then `clampDiagramToolbarToWrap` and on mobile `applyMobileToolbarEdgeSnap(..., computeMobileToolbarEdgeSnap(...))` (collapse/expand reflow). |

**Snap invocation points (all verified):**

- **Init:** After `applyDiagramToolbarPosition`, when viewport is mobile: `clampDiagramToolbarToWrap` then `applyMobileToolbarEdgeSnap(toolbar, wrap, computeMobileToolbarEdgeSnap(toolbar, wrap))` (app.js ~5870–5872).
- **Pointer-up:** `onPointerUp` → `updateOrientationFromPosition({ dragDelta })` (~6010–6012).
- **Collapse/expand reflow:** Inside `onCollapseClick`, double rAF then clamp + mobile snap (~6049–6056).
- **Resize path:** `ResizeObserver` on wrap (~6082–6086) calls `clampDiagramToolbarToWrap` then `updateOrientationFromPosition()` (no args); on mobile, `updateOrientationFromPosition` uses mobile snap.

**Storage keys:** Only the existing keys are used: `quoteApp_diagramToolbarX`, `quoteApp_diagramToolbarY`, `quoteApp_diagramToolbarOrientation` (and `quoteApp_diagramToolbarCollapsed` for collapse state). Constants at 5678–5680.

**Desktop:** `updateOrientationFromPosition` desktop branch (5903–5945) unchanged; no mobile logic in that path.

**Bounded expand suppression:** `shouldSuppressExpandAfterDrag(now)` (5948–5952) uses `suppressNextExpandTap` and `lastDragEndAt` with `DIAGRAM_TOOLBAR_COLLAPSE_TAP_SUPPRESS_MS`; used in `onCollapseClick` to avoid expanding on the synthetic click that immediately follows a drag.

**Mobile-safe clamp:** In `clampDiagramToolbarToWrap` (~5814–5818), when `ww < 20 || wh < 20` a safe fallback position is applied. In `onPointerMove` (~5985–5996), when `layoutState.viewportMode === 'mobile'` the code uses `useRealDimensions = true` so `tw`/`th` come from `toolRect.width`/`toolRect.height` (not swapped by orientation), and `minTop` uses `getDiagramToolbarTopPad` for header-occlusion safety.

---

### 2.2 Mobile CSS hardening in styles.css

| Location | Verified implementation |
|----------|-------------------------|
| **~2136** | `body[data-viewport-mode="mobile"] .diagram-floating-toolbar` — position absolute, **z-index: 160** (above fixed header), margin 0, max-width/max-height, flex, flex-direction column, **gap: 0.5rem**, padding, **overflow: hidden**, border-radius, backdrop blur, etc. Mobile-only; no desktop rules changed. |
| **~2138** | z-index: 160 comment: "Keep toolbar interactive above fixed global header in mobile layouts." |
| **~2211** | 44px strict touch targets: `body[data-viewport-mode="mobile"] .diagram-floating-toolbar[data-orientation="horizontal"]` selectors for `.toolbar-pill-btn`, `.upload-zone`, `.blueprint-transparency-btn`, `.diagram-toolbar-drag-handle`, `.diagram-toolbar-collapse-btn` — **min-width: 44px; min-height: 44px**. |
| **~2161–2202** | `.diagram-toolbar-tools-wrap`: `flex-wrap: nowrap`, `overflow: hidden` (no internal toolbar scroll). At **~2218–2228** `@media (max-width: 430px)` controlled wrap fallback: horizontal toolbar and tools-wrap get `flex-wrap: wrap` and `justify-content: center` only on narrow portrait. |

So: mobile-only toolbar behaviour is under `body[data-viewport-mode="mobile"]`; 44px targets preserved; internal scrolling removed with controlled wrap only in the 430px media query; z-layer 160 keeps drag interactions above the fixed header.

---

### 2.3 E2E updates in run.js

| Location | Verified implementation |
|----------|-------------------------|
| **~21** | `clickSelectorViaDom(page, selector)` — evaluates `document.querySelector(sel)` and calls `el.click()`; throws if element missing. Used for reliable DOM click where ElementHandle click was flaky. |
| **~39** | Launch args include `'--disable-dev-shm-usage'` (with `--no-sandbox`, `--disable-setuid-sandbox`) for browser stability. |
| **~1455–1577** | Mobile diagram toolbar block: collapse/expand via `diagramToolbarCollapseBtn` click; `getToolbarScreenState` helper; **expanded drag-right** → assert orientation `'vertical'` and right gap ≤ 24px; **expanded drag-top** → assert orientation `'horizontal'` and top-safe gap and edge gap (no middle resting) ≤ 24px; **no internal scrollbars** (toolbar and tools-wrap scroll width/height vs client); **post-drag first-tap expand** (collapse, simulate drag, then `clickSelectorViaDom(mobilePage, '#diagramToolbarCollapseBtn')`, assert expanded). |

All described E2E additions/assertions are present and consistent with the described behaviour.

---

### 2.4 Task list and QA docs

- **TASK_LIST.md** (uncompleted table ~39): Section 54 row lists 54.49–54.53, 54.56–54.60 with wording that expanded edge-snap is "now covered by automated checks, final QA sign-off pending." No stale note claiming "expanded drag/orientation broken" remains; the in-section note at ~1318 says "Expanded edge snap and orientation transitions are implemented; keep desktop-regression and manual mobile QA sign-off in this section."
- **54.68:** Marked complete; wording confirms mobile blue chrome, desktop green, resize/orientation and viewport switching correct.
- **54.74:** Marked complete; wording: consistent spacing tokens and primary/secondary hierarchy for mobile-only screens.
- **QA-CHECKLIST-2026-02-20-mobile-freeform-interaction-parity.md:** Contains explicit manual checks for expanded toolbar drag-to-right and drag-to-top transitions, edge-only resting state, and toolbar top-edge/header safety (lines 25–29), matching the reported manual QA scope.

---

## 3. 54.74 token consistency (overwrites)

54.74 defines mobile spacing tokens in `body[data-viewport-mode="mobile"]` (styles.css ~1834–1838): `--mobile-space-sm`, `--mobile-space-md`, `--mobile-space-lg`, `--mobile-space-xl`. Token-based rules are then set in an earlier block (~1840–1854) for `.toolbar`, `.toolbar-right`, `.toolbar-actions-secondary`, `.diagrams-bottom-sheet-title`, and `.diagrams-bottom-sheet .diagram-item`. Later blocks override some of these with hardcoded values.

### 3.1 Toolbar gap overwrite

- **First block (~1843–1845):** `body[data-viewport-mode="mobile"] .toolbar-right` and `.toolbar-actions-secondary` both have `gap: var(--mobile-space-md);`.
- **Second block (~1894–1898):** `body[data-viewport-mode="mobile"] .toolbar-right` sets **gap: 0.5rem** (and flex-wrap, min-width). This overrides the token; 54.74 intent would be one source of truth (e.g. remove this gap or set `gap: var(--mobile-space-md)` here and remove duplicate gap from the first block if desired).

**Finding:** The second `.toolbar-right` block at line 1894 uses `gap: 0.5rem`, which overwrites the 54.74 `var(--mobile-space-md)` from the first block. Recommendation: use `gap: var(--mobile-space-md)` in this block (or remove the declaration so the earlier rule applies).

### 3.2 Toolbar-actions-secondary gap overwrite

- **First block (~1844–1845):** Same selector has `gap: var(--mobile-space-md)`.
- **Second block (~1900–1904):** `body[data-viewport-mode="mobile"] .toolbar-actions-secondary` sets **gap: 0.5rem** (and flex-wrap, min-width).

**Finding:** Same overwrite; 54.74 tokens are not used consistently. Recommendation: set `gap: var(--mobile-space-md)` (or remove so it inherits from the combined rule).

### 3.3 Bottom sheet title padding

- **First block (~1847–1848):** `body[data-viewport-mode="mobile"] .diagrams-bottom-sheet-title` has `padding: 0 var(--mobile-space-lg) var(--mobile-space-md);`.
- **Later block (~2390–2396):** Same selector has **padding: 0 20px 12px** (and margin, font-size, border-bottom, etc.).

**Finding:** The later block overrides with hardcoded 20px/12px; 54.74 intended token-based padding. Recommendation: replace with e.g. `padding: 0 var(--mobile-space-lg) var(--mobile-space-md);` so 54.74 is the single source of truth.

### 3.4 Bottom sheet diagram item padding

- **First block (~1853–1854):** `body[data-viewport-mode="mobile"] .diagrams-bottom-sheet .diagram-item` has `padding: var(--mobile-space-md) 52px var(--mobile-space-md) var(--mobile-space-lg);`.
- **Later block (~2436–2441):** Same selector has **padding: 12px 52px 12px 16px** (and font-size, font-weight, min-height).

**Finding:** Later block uses 12px/16px instead of tokens. Recommendation: use `padding: var(--mobile-space-md) 52px var(--mobile-space-md) var(--mobile-space-lg);` so 54.74 tokens apply consistently.

### 3.5 Optional cleanup

There are two separate `body[data-viewport-mode="mobile"] .toolbar-right` blocks (1843–1845 combined with .toolbar-actions-secondary, and 1894–1898) and two `.toolbar-actions-secondary` blocks (1843–1845 and 1900–1904). Consolidating so each selector has one block would make token usage obvious and reduce the chance of future overwrites.

---

## 4. Desktop vs mobile impact

- **app.js:** All new/edited logic is gated by `layoutState.viewportMode === 'mobile'` or by functions that return early when not mobile (`computeMobileToolbarEdgeSnap`, `applyMobileToolbarEdgeSnap`, `getDiagramToolbarTopPad`). Desktop orientation and placement logic unchanged.
- **styles.css:** All verified changes are under `body[data-viewport-mode="mobile"]`; no desktop selectors modified.
- **run.js:** Mobile assertions run only in the mobile viewport block (`?viewport=mobile`); desktop tests unchanged.
- **Railway:** No new dependencies or build steps; static frontend and existing backend. Deployment remains valid.

---

## 5. Summary and task list update

- **Reported changes:** Confirmed in code at the cited locations. Snap runs on init, pointer-up, collapse/expand reflow, and resize; storage keys unchanged; desktop unchanged; E2E and QA checklist align with the described behaviour.
- **54.74 overwrites:** Four places in styles.css use hardcoded values that override the 54.74 token-based rules; recommendations above. Optional: consolidate duplicate mobile blocks for `.toolbar-right` and `.toolbar-actions-secondary`.

**Uncompleted task added to TASK_LIST.md:** A single follow-up task (54.75) was added to capture the 54.74 token consistency fixes and optional consolidation, so the audit findings are tracked without making code changes in this audit.

---

*Audit performed by reading the repository files at the stated paths and line ranges. No assumptions beyond the code and existing docs.*
