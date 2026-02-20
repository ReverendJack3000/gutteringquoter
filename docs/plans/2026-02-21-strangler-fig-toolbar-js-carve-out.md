# Strangler Fig: Carve out toolbar.js (ES module)

**Date:** 2026-02-21  
**Scope:** Mobile diagram toolbar logic only. Desktop behavior unchanged.  
**Constraint:** No build step; Railway deployment must remain valid (static frontend served by FastAPI).

---

## 1. Goal

Extract the diagram toolbar drag/snap/orientation logic from `frontend/app.js` into a new `frontend/toolbar.js` ES module. This reduces app.js size, isolates mobile toolbar code, and avoids circular dependencies by injecting the single external dependency (`viewportMode`) from app.js.

---

## 2. Code audit (verified against codebase)

### 2.1 Block to move (app.js lines 5678–6089)

| Item | Lines | Notes |
|------|-------|--------|
| Constants | 5678–5687 | `DIAGRAM_TOOLBAR_STORAGE_KEY_*`, `DIAGRAM_TOOLBAR_EDGE_*`, `DIAGRAM_TOOLBAR_COLLAPSE_TAP_SUPPRESS_MS` |
| Comment (54.56–54.60) | 5687 | Keep in toolbar.js |
| `diagramToolbarDragCleanup` | 5689–5690 | Module-level `let`; used only inside init |
| `getDiagramToolbarWrap` | 5692–5695 | Used only by toolbar code; no other references in app.js |
| `applyDiagramToolbarPosition` | 5697–5703 | Used only inside this block |
| `clampNumber` | 5705–5707 | Used only in applyMobileToolbarEdgeSnap and clampDiagramToolbarToWrap |
| `getDiagramToolbarTopPad` | 5709–5717 | Reads `layoutState.viewportMode` → must use injected getter |
| `computeMobileToolbarEdgeSnap` | 5719–5765 | Reads `layoutState.viewportMode` |
| `applyMobileToolbarEdgeSnap` | 5767–5804 | Reads `layoutState.viewportMode` |
| `clampDiagramToolbarToWrap` | 5806–5840 | Reads `layoutState.viewportMode` |
| `initDiagramToolbarDrag` | 5842–6089 | Contains inner `updateOrientationFromPosition` and `shouldSuppressExpandAfterDrag`; reads `layoutState.viewportMode` |

**No other file** references `getDiagramToolbarWrap`, `applyDiagramToolbarPosition`, `clampNumber`, or the toolbar constants. **Only** `initDiagramToolbarDrag` is called from app.js (at lines 6113, 9447, 10557).

### 2.2 External dependency: viewport mode

- **layoutState** is defined in app.js at line 430 (`const layoutState = { ... }`).
- Toolbar code reads **only** `layoutState.viewportMode` (in getDiagramToolbarTopPad, computeMobileToolbarEdgeSnap, applyMobileToolbarEdgeSnap, clampDiagramToolbarToWrap, and inside initDiagramToolbarDrag / updateOrientationFromPosition).
- **Decision:** Do **not** import app.js from toolbar.js (avoids circular dependency). Instead, **inject a getter** when calling `initDiagramToolbarDrag` from app.js, e.g. `initDiagramToolbarDrag({ getViewportMode: () => layoutState.viewportMode })`. Toolbar.js will use this getter everywhere it currently reads `layoutState.viewportMode`.

### 2.3 Call sites in app.js (after carve-out)

- **6113:** Inside `initCanvas()` → call `initDiagramToolbarDrag({ getViewportMode: () => layoutState.viewportMode })`.
- **9447:** Inside `applyViewportMode()` when switching to mobile → same signature.
- **10557:** Inside `switchView()` when showing `view-canvas` → same signature.

**Recommendation:** In app.js, define once:  
`const initDiagramToolbarDragWithApp = () => initDiagramToolbarDrag({ getViewportMode: () => layoutState.viewportMode });`  
and use `initDiagramToolbarDragWithApp` at all three call sites. Then only one place passes the dependency.

### 2.4 HTML and globals

- **index.html** (frontend): Scripts are `<script src="/app.js"></script>` and `<script src="/pwa.js"></script>`. **No** `onclick`, `onload`, or other inline handlers that call app.js functions. So the “global trap” (module scope hiding globals from HTML) **does not apply** for this project.
- **pwa.js** uses only `window.__quoteAppConfigurePwa` and `window.__quoteAppPendingPwaConfig`; it does not call any app.js function by name. No change needed for pwa.js.
- **Optional:** If any external script or devtools rely on app.js globals, attach them to `window` at the bottom of app.js. Not required for current HTML/pwa.js.

### 2.5 Deployment (Railway)

- Frontend is static; no build step (README, RAILWAY_DEPLOYMENT.md, Procfile). Adding `toolbar.js` and changing app.js to `type="module"` does not introduce a build; Railway will serve both files. Deployment remains valid.

### 2.6 Desktop vs mobile

- Toolbar logic already branches on `viewportMode === 'mobile'`. Moving it to toolbar.js and supplying `getViewportMode` from app.js preserves behavior. Desktop and mobile production behavior stay unchanged.

---

## 3. Implementation plan (no assumptions)

### Phase 1: Create toolbar.js and move code

1. **Create** `frontend/toolbar.js` (new file).
2. **Copy** from app.js the exact block **5678–6089** (constants through end of `initDiagramToolbarDrag`) into toolbar.js.
3. **Replace** every read of `layoutState.viewportMode` in toolbar.js with a call to an injected getter. To do that:
   - Add a single parameter to `initDiagramToolbarDrag`: `options = {}`, and define `const getViewportMode = options.getViewportMode || (() => 'desktop');`.
   - In toolbar.js, replace every `layoutState.viewportMode` with `getViewportMode()`.
   - **Caveat:** `getDiagramToolbarTopPad`, `computeMobileToolbarEdgeSnap`, `applyMobileToolbarEdgeSnap`, and `clampDiagramToolbarToWrap` are called from inside `initDiagramToolbarDrag` (and from each other). So they must receive `getViewportMode` as an argument, or have access to it (e.g. closure over the one passed into `initDiagramToolbarDrag`). **Recommended:** Pass `getViewportMode` into `initDiagramToolbarDrag`; inside it, pass `getViewportMode` into any helper that currently uses `layoutState.viewportMode` (e.g. `getDiagramToolbarTopPad(wrapRect, basePad, getViewportMode)`), and update those helpers to take and use the getter. That keeps toolbar.js free of app.js imports.
4. **Export** from toolbar.js only: `export function initDiagramToolbarDrag(options) { ... }`. All other functions and constants stay internal (no export).
5. **Delete** the same block (5678–6089) from app.js.
6. **Add** at the very top of app.js (line 1):  
   `import { initDiagramToolbarDrag } from './toolbar.js';`
7. **Wrap** the dependency in app.js: define  
   `const initDiagramToolbarDragWithApp = () => initDiagramToolbarDrag({ getViewportMode: () => layoutState.viewportMode });`  
   and replace every call to `initDiagramToolbarDrag()` with `initDiagramToolbarDragWithApp()` (at the three call sites: initCanvas, applyViewportMode, switchView).

### Phase 2: Wire ES module in HTML

8. **Update** `frontend/index.html`: change  
   `<script src="/app.js"></script>`  
   to  
   `<script type="module" src="/app.js"></script>`.
9. **Verify** no inline handlers in HTML depend on app.js globals (already verified: none). If any other code (e.g. tests or bookmarks) expects app.js globals, document or attach them to `window` at the end of app.js.

### Phase 3: Verify and deploy

10. **Manual check:** Load app at `http://127.0.0.1:8000/`. Test desktop: diagram toolbar drag, collapse, orientation zones. Test mobile (or `?viewport=mobile`): diagram toolbar drag, edge snap, collapse, expand. Confirm no console errors.
11. **E2E:** Run `npm test` (or `./scripts/run-e2e.sh`) and ensure existing tests pass, including mobile viewport / diagram toolbar behavior if covered.
12. **Railway:** Push and confirm deploy succeeds; no new build step; static files served as before.

---

## 4. Edge cases and mitigations

| Risk | Mitigation |
|------|------------|
| **Circular dependency** (toolbar.js ↔ app.js) | Toolbar does not import app.js; app.js imports toolbar.js and injects `getViewportMode`. |
| **Helper functions need viewport mode** | Pass `getViewportMode` from `initDiagramToolbarDrag` into helpers that currently read `layoutState.viewportMode` (e.g. add parameter to getDiagramToolbarTopPad, computeMobileToolbarEdgeSnap, applyMobileToolbarEdgeSnap, clampDiagramToolbarToWrap). |
| **Module script load order** | With `type="module"`, app.js is deferred; DOM ready and existing init flow (e.g. DOMContentLoaded) still apply. No change to init order required. |
| **Existing E2E / viewport tests** | No change to public behavior; only code layout changes. If E2E touches diagram toolbar, it should still pass. |
| **Desktop regression** | All toolbar branches use the same getter; desktop gets `'desktop'`; mobile gets `'mobile'`. Behavior unchanged. |

---

## 5. Task list update (for TASK_LIST.md)

Add **Section 56** and uncompleted tasks as in the next section of this doc. After implementation, mark 56.1–56.3 complete and update the “Uncompleted tasks” table at the top of TASK_LIST.md accordingly.

---

## 6. Summary

- **Move:** Lines 5678–6089 from app.js to toolbar.js; inject `getViewportMode`; export only `initDiagramToolbarDrag`.
- **Wire:** `import { initDiagramToolbarDrag } from './toolbar.js'` at top of app.js; wrapper `initDiagramToolbarDragWithApp` that passes `getViewportMode`; replace all call sites with the wrapper.
- **HTML:** `type="module"` on the app.js script tag only.
- **No** build step; **no** change to Railway deploy. **No** inline handlers to fix. Desktop and mobile behavior preserved.
