# QA Audit Report – Apple HIG, Desktop/Mobile Separation, Railway Deployment

**Date:** 2026-02-20  
**Scope:** Regression & conflict check, Apple Human Interface Guidelines compliance, Railway deployment safety, logic gaps.  
**Codebase state:** Quote App frontend (HTML/CSS/JS) + backend (FastAPI); single codebase for desktop and mobile; viewport mode via `data-viewport-mode` and `layoutState.viewportMode`.  
**No code fixes included—findings and recommendations only.**

---

## 1. Regression & Conflict Check

### 1.1 Desktop vs. Mobile CSS Isolation

**Result: Pass (with one minor observation)**

**Evidence:**
- Mobile layout is gated by `body[data-viewport-mode="mobile"]` in CSS. Grep shows 100+ selectors in `frontend/styles.css` using this prefix for mobile-only rules (e.g. `.toolbar`, `.blueprint-wrap`, `.diagram-floating-toolbar`, bottom sheet, canvas placeholder, measurement deck).
- Desktop-specific hiding of mobile-only UI uses `body:not([data-viewport-mode="mobile"])` (e.g. `.diagrams-bottom-sheet-backdrop`, `.diagrams-bottom-sheet` at lines 2239–2241).
- Viewport mode is set in JS via `applyViewportMode()` which sets `document.body.setAttribute('data-viewport-mode', normalizedMode)` and `document.documentElement.setAttribute('data-viewport-mode', normalizedMode)` (app.js ~9016–9017). Initial application runs at init (~10155–10157) so mobile CSS applies on first paint when in mobile mode.

**Observation:** One media query applies without the `data-viewport-mode` prefix: `@media (max-width: 900px)` for `.accessibility-inspector` (styles.css 1599–1607) adjusts left/right/bottom and max-height. This is a width-based rule only; it does not check `data-viewport-mode`. The JS breakpoint for mobile layout is 980px (`MOBILE_LAYOUT_BREAKPOINT_PX`). So at 900–979px width the body will already be in mobile mode; the 900px rule only refines the inspector position. No desktop-only layout is overridden by this rule; at widths &lt; 900px the app is in mobile mode. **Conclusion:** No desktop layout bleed; minor breakpoint inconsistency (900 vs 980) for one component.

---

### 1.2 Interaction Pattern Separation

**Result: Pass**

**Evidence:**
- Desktop: pointer events (pointerdown/pointermove/pointerup), mouse button checks (`e.button !== 0`), hover state (`state.hoveredId`, `state.hoveredHandleId`). Canvas and diagram toolbar use the same pointer API for both desktop and mobile.
- Mobile-specific behaviour is guarded by `layoutState.viewportMode === 'mobile'` in JS (e.g. zoom clamp `MIN_VIEW_ZOOM_MOBILE`, fit/scale logic, panel expand/collapse behaviour, diagram toolbar default orientation). Pinch zoom enters when two pointers are active (`state.mode === 'pinch'`); it does not change desktop single-pointer behaviour.
- Diagram toolbar: `onPointerDown` / `onPointerMove` / `onPointerUp` and `updateOrientationFromPosition()` run for both; there is no separate mobile-only handler that could conflict with desktop. Plan 54.58/54.59 (snap-to-edge, mobile-only) is not yet implemented, so no extra mobile branch exists yet.
- Canvas has `touch-action: none` (styles.css 1673) and uses `preventDefault()` on pointer events during pinch/pan to control zoom; this is intentional so the app can handle two-finger pinch. No evidence of desktop drag-and-drop or hover being disabled by mobile logic.

---

### 1.3 Responsive Breakpoint Integrity

**Result: Pass**

**Evidence:**
- Primary breakpoint for layout mode is in JS: `MOBILE_LAYOUT_BREAKPOINT_PX = 980` (app.js 394). `detectViewportMode()` uses `matchMedia(\`(max-width: ${MOBILE_LAYOUT_BREAKPOINT_PX}px)\`)` and `(pointer: coarse)`; result is written to `layoutState.viewportMode` and reflected on `body` and `html` via `data-viewport-mode`.
- CSS does not rely on a different pixel breakpoint for mobile vs desktop layout; mobile rules are driven by `body[data-viewport-mode="mobile"]`, not by a standalone `@media (max-width: …)`. The only width-based rule in the audit scope is the `.accessibility-inspector` 900px media query, which does not switch layout mode.
- Optional override: `?viewport=desktop` or `?viewport=mobile` (app.js `getForcedViewportModeFromUrl`) forces mode regardless of width; this is documented in README for QA.

---

## 2. Apple HIG Compliance Audit

### 2.1 Touch Target Sizing

**Result: Pass for mobile; Low-severity note for desktop diagram toolbar**

**Evidence:**
- **Mobile:** Explicit 44×44 px (or min 44px) for interactive elements in mobile-scoped rules:
  - `body[data-viewport-mode="mobile"] .diagram-floating-toolbar .toolbar-pill-btn, .upload-zone, .blueprint-transparency-btn`: min-height/min-width 44px (styles.css 2212–2218).
  - Diagram toolbar drag handle (global): 44×44 (2162–2171); comment "54.35: 44×44 px touch target (Apple HIG)".
  - Bottom sheet list: min-height 44px for rows (2326–2328, 2341); delete button 44×44 (2360–2363).
  - Mobile undo/redo and other toolbar buttons: 44px (2400–2401, 2410–2415, 2422).
- **Desktop diagram toolbar:** Base rules (not under `body[data-viewport-mode="mobile"]`) use 36px for `.diagram-floating-toolbar .toolbar-pill-btn`, `.upload-zone` (1422–1426), and `.blueprint-transparency-btn` (1459–1464). On mobile, the 2212–2218 block overrides these to 44px. So desktop diagram toolbar buttons are 36px; mobile are 44px. HIG 44pt is most critical for touch; desktop is pointer-first. **Severity: Low**—document as known desktop choice; no change required for mobile-only scope unless product wants 44px on desktop as well.

---

### 2.2 Gesture Implementation

**Result: Pass**

**Evidence:**
- **Pinch-to-zoom:** Implemented on canvas (app.js). When two pointers are active and content exists, `state.mode` is set to `'pinch'`; `pointermove` uses two-finger distance and center to update `state.viewZoom` and pan (6057–6077). Min zoom on mobile is `MIN_VIEW_ZOOM_MOBILE = 1` (54.37); on desktop `MIN_VIEW_ZOOM = 0.15`.
- **Pan:** Single-pointer drag on empty canvas (pan) and two-pointer pinch both use the same canvas pointer listeners; mode distinguishes pan vs pinch.
- **Tap-based interactions:** Selection via pointerdown/pointerup; diagram toolbar collapse/expand via click; bottom sheet uses touchstart/touchend for drag-to-dismiss (9952–9969). Tap vs drag on diagram toolbar distinguished by movement threshold (e.g. `dx*dx + dy*dy > 25` for drag, 5722).
- **Element rotation:** Implemented via rotate handle on the canvas (not a two-finger rotate gesture). HIG does not require two-finger rotation; handle-based rotation is an acceptable alternative and is documented in the accessibility inspector (non-gesture controls).

---

### 2.3 System Gesture Conflicts

**Result: Pass (informational)**

**Evidence:**
- `touch-action: none` is applied to: `#canvas` (styles.css 1673), `.diagram-toolbar-drag-handle` (2176), and diagrams bottom sheet drag handle (2323). This is required so the app can handle pinch and drag without the browser consuming gestures.
- The app does not use full-screen takeover of system gesture areas (e.g. no full-screen canvas that would block iOS back-swipe); the canvas lives inside the normal layout with header and optional panel. No evidence of custom gestures that would conflict with iOS system back or home-indicator gestures.
- If the canvas were ever made full-bleed with no chrome, edge swipes could be ambiguous; current layout does not do that.

---

### 2.4 Accessibility Compliance

**Result: Pass**

**Evidence:**
- **Live region:** `#appAnnouncer` with `aria-live="polite"` and `aria-atomic="true"` (index.html 19); `announceCanvas()`, `announceViewportMode()`, and panel state announcements update it (app.js 8899–8922, 8985–8986). Used for canvas and viewport changes.
- **Focus:** View switching sets focus to primary targets; modal framework provides trap and restore (initModalAccessibilityFramework, getPrimaryViewFocusTarget, getReturnFocusTarget). Panel toggle and close buttons have `aria-expanded` and `aria-label` (8926–8937).
- **Non-gesture controls:** Inspector panel and open-inspector button (index.html 166) with `aria-label="Open inspector panel for non-gesture controls"`; selection actions hint (217) directs users to handles or Inspector. Rotation and resize are available via handles and Inspector inputs.
- **Skip link:** "Skip to canvas workspace" (index.html 17). Viewport and reduced-motion preferences are respected (e.g. `prefers-reduced-motion` in CSS 115, 1406; no `user-scalable=no` in viewport meta per 54.11).

---

## 3. Railway Deployment Safety

### 3.1 Environment Variable Configuration

**Result: Pass**

**Evidence:**
- Viewport mode is **client-side only**. `detectViewportMode()` uses `window.matchMedia` and optional `getForcedViewportModeFromUrl()`; no server-side env var or header is used to choose mobile vs desktop. Backend (`main.py`) does not read any variable for device or viewport; it serves the same static frontend.
- Railway env vars (README and RAILWAY_DEPLOYMENT.md) are: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, optional `SUPABASE_JWT_SECRET`, optional `PWA_ENABLED`. None control layout mode. No separate “mobile” or “desktop” environment.

---

### 3.2 Build Process Integrity

**Result: Pass**

**Evidence:**
- Single build: Nixpacks uses `backend/requirements.txt` (nixpacks.toml); Procfile runs `cd backend && python -m uvicorn main:app --host 0.0.0.0 --port $PORT`. No separate mobile vs desktop build; no conditional build steps for viewport. Same HTML/CSS/JS bundle for all clients.

---

### 3.3 Asset Loading Logic

**Result: Pass**

**Evidence:**
- Static assets (styles.css, app.js, images, favicons) are served by FastAPI from `frontend/`; no device or viewport check in backend for which files to serve. Frontend does not load different CSS/JS bundles based on viewport; it uses the same files and toggles behaviour and styling via `data-viewport-mode` and `layoutState.viewportMode`. No evidence of asset paths or CDN logic that would differ by device.

---

## 4. Logic Gaps & Missing Cleanup

| # | Item | Location | Expected vs actual | Severity |
|---|------|----------|--------------------|----------|
| 1 | **Mobile diagram toolbar: no snap-to-edge / middle placement allowed** | app.js: `updateOrientationFromPosition()` (approx. 5658–5694); ResizeObserver callback (5811–5815); onPointerUp (5746–5751). | Per plan docs/plans/2026-02-20-mobile-diagram-toolbar-always-thin-edge-only.md and TASK_LIST 54.58–54.59: on mobile, toolbar should snap to one of four edges (top/bottom/left/right) on pointer up, init, and ResizeObserver; no placement in the “middle” strip. **Actual:** `updateOrientationFromPosition()` has an `else` branch (5689–5692) that sets orientation to horizontal but does not change position, so the toolbar can remain in the middle on both desktop and mobile. No mobile-only snap-to-edge function or branch exists yet. | **Medium** (planned work not yet implemented; affects mobile UX only) |
| 2 | **Mobile diagram toolbar: not always thin (vertical single column / horizontal single row)** | styles.css: body[data-viewport-mode="mobile"] .diagram-floating-toolbar[data-orientation="horizontal"] (2150–2159). | Per plan and TASK_LIST 54.56–54.57: vertical should be single column (`flex-wrap: nowrap` on tools-wrap); horizontal should be single row with nowrap and optional compact sizes. **Actual:** Horizontal block uses `flex-wrap: wrap` (2152, 2157), so the toolbar can grow to multiple rows. Vertical tools-wrap is not explicitly set to nowrap in the mobile block (base has nowrap at 1302–1304 for vertical). So horizontal “always thin” and optional 40px/18px compact variant are not implemented. | **Medium** (planned work 54.56–54.57 not yet implemented) |
| 3 | **Breakpoint mismatch: accessibility inspector** | styles.css 1599: `@media (max-width: 900px)`; app.js 394: `MOBILE_LAYOUT_BREAKPOINT_PX = 980`. | Inspector layout changes at 900px; layout mode switches at 980px (or coarse pointer). So between 901–980px width the body is already “mobile” but the inspector media query does not yet apply. Expected: either align breakpoint (e.g. 980px) or document that 900px is intentional for this component. **Actual:** No documented reason for 900 vs 980. | **Low** |
| 4 | **Desktop diagram toolbar buttons &lt; 44pt** | styles.css: .diagram-floating-toolbar .toolbar-pill-btn, .upload-zone (1422–1426), .blueprint-transparency-btn (1459–1464): 36px. | If desktop were ever used with touch (e.g. hybrid device), these would be below HIG 44pt. Expected for desktop-only pointer: acceptable. **Actual:** 36px on desktop; 44px on mobile (2212–2218). No bug; documented as intentional for scope. | **Low** (informational) |

No further logic gaps, incomplete implementations, or technical debt items were identified in the audited areas. Cleanup for diagram toolbar (listeners, ResizeObserver) is present (diagramToolbarDragCleanup); re-init on viewport switch (9025–9027, 10122–10137) is in place.

---

## 5. Overall Verdict

**Summary: Production-Ready (with planned mobile toolbar work outstanding)**

- Desktop/mobile separation, interaction patterns, and breakpoint usage are correct; no regressions or conflicts identified that would block production.
- Apple HIG: Touch targets and gestures on mobile are compliant; accessibility (VoiceOver, live region, focus, non-gesture controls) is in place. One low-severity note for desktop diagram toolbar 36px and one breakpoint inconsistency.
- Railway: Single build, client-side viewport, no mobile/desktop env or asset branching; deployment safety is satisfied.
- Logic gaps: Two medium-severity items (54.56–54.59 not yet implemented—toolbar not always thin, no snap-to-edge on mobile); two low-severity items (breakpoint 900 vs 980, desktop 36px note). No critical or high-severity bugs found.

**Pass/Fail counts**

| Category | Pass | Fail |
|----------|------|------|
| 1. Regression & conflict | 3 | 0 |
| 2. Apple HIG | 4 | 0 |
| 3. Railway deployment | 3 | 0 |
| 4. Logic gaps (as “findings”) | — | 4 items (2 Medium, 2 Low) |

**Failure / finding remediation priority**

- **Logic gap 1 (snap-to-edge, no middle):** Medium. **Evidence:** `updateOrientationFromPosition()` else branch and no mobile-only snap in app.js. **Impact:** On mobile, toolbar can rest in the center strip; UX does not match plan. **Remediation priority:** Implement 54.58–54.59 per plan (mobile-only snap on pointer up, init, ResizeObserver).
- **Logic gap 2 (always thin):** Medium. **Evidence:** Horizontal mobile toolbar uses `flex-wrap: wrap` in styles.css 2150–2159. **Impact:** Mobile toolbar can be a multi-row block instead of a thin pill. **Remediation priority:** Implement 54.56–54.57 (nowrap, optional compact 40px/18px and a11y override).
- **Logic gap 3 (900 vs 980):** Low. **Evidence:** @media (max-width: 900px) vs MOBILE_LAYOUT_BREAKPOINT_PX 980. **Impact:** Small range (901–980px) where layout is mobile but inspector rule not applied. **Remediation priority:** Align to 980px or document 900px; low priority.
- **Logic gap 4 (desktop 36px):** Low (informational). **Evidence:** Base diagram toolbar buttons 36px; mobile override 44px. **Impact:** None for current mobile-only scope. **Remediation priority:** None unless product requires 44px on desktop.

---

*End of report. No code changes have been made; await approval before implementing corrections.*
