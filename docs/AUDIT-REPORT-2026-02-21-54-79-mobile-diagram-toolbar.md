# Audit Report: 54.79 Mobile diagram toolbar (hide handle, grip bar, hide Inspector)

**Date:** 2026-02-21  
**Scope:** Implementation of tasks 54.79.1–54.79.3 (mobile-only CSS).  
**Auditor role:** Strict Senior QA Engineer (UI/UX and constraint compliance).  
**No fixes applied;** findings only. Fixes require approval.

---

## 1. Regression & conflict check

### 1.1 Desktop viewport: mobile CSS bleeding into desktop

**Requirement:** All new/edited rules must apply only when `body[data-viewport-mode="mobile"]`. Desktop must be unchanged.

| Check | Result | Evidence |
|-------|--------|----------|
| Every 54.79 selector is scoped with `body[data-viewport-mode="mobile"]` | **Pass** | All five rules (lines 2266, 2280, 2287, 2291, 2296) use that prefix. No global or desktop-only selector was added or changed. |
| No existing desktop rule was overridden or removed | **Pass** | Only new blocks were added. Base `.diagram-toolbar-drag-handle` (2302+) and desktop toolbar rules are unchanged and come after the mobile block. |
| Viewport mode is set correctly so desktop never gets mobile rules | **Pass** | app.js sets `data-viewport-mode` on `document.body` (and `document.documentElement`) to `'desktop'` or `'mobile'`. When layout is desktop, body has `data-viewport-mode="desktop"`, so `body[data-viewport-mode="mobile"]` never matches. |

**Category result: Pass** — No desktop bleed from the 54.79 changes.

---

### 1.2 Specificity and source order (mobile handle vs 44px rule)

**Requirement:** On mobile, the drag handle must be fully hidden (zero size). A pre-existing rule gives the handle 44×44 in horizontal orientation; the new hide rule must win.

| Check | Result | Evidence |
|-------|--------|----------|
| 54.79.1 hide rule overrides the 44px handle rule on mobile | **Pass** | 44px rule: `body[data-viewport-mode="mobile"] .diagram-floating-toolbar[data-orientation="horizontal"] .diagram-toolbar-drag-handle` (2258). Hide rule: `body[data-viewport-mode="mobile"] .diagram-floating-toolbar .diagram-toolbar-drag-handle` (2266), same or lower specificity but **later in source order**. For the same element, the later rule wins for conflicting properties (width, height, min-*, max-*, etc.). Handle is zero-size on mobile in all orientations. |
| No other rule restores handle size on mobile | **Pass** | No other rule in the 54.79 block or immediately after re-applies size to the handle. Base `.diagram-toolbar-drag-handle` applies when the mobile block does not (desktop), or is overridden by the mobile hide rule (mobile). |

**Category result: Pass** — No conflict; hide rule correctly wins on mobile.

---

### 1.3 Collapsed state and grip visibility

**Requirement:** Collapsed toolbar remains a 48px circle; grip must not show when collapsed.

| Check | Result | Evidence |
|-------|--------|----------|
| Grip hidden when toolbar is collapsed | **Pass** | Rule at 2291–2293: `body[data-viewport-mode="mobile"] .diagram-floating-toolbar.diagram-floating-toolbar--collapsed::before { display: none; }`. |
| Collapsed circle layout unchanged | **Pass** | Existing mobile collapsed rules (2162–2205) are untouched. 48px circle is from container + collapse button; handle is already zeroed by 54.79.1. |

**Category result: Pass** — Collapsed state intact.

---

### 1.4 Open Inspector button scope

**Requirement:** Only the Inspector button **inside the diagram toolbar** is hidden on mobile. Desktop and any other Inspector entry points unchanged.

| Check | Result | Evidence |
|-------|--------|----------|
| Selector targets only diagram toolbar instance | **Pass** | Selector is `body[data-viewport-mode="mobile"] .diagram-floating-toolbar #openInspectorBtn`. `#openInspectorBtn` appears only once in the app (inside `.diagram-toolbar-tools-wrap` inside `#diagramFloatingToolbar`). |
| No JS or other references changed | **Pass** | app.js still uses `getElementById('openInspectorBtn')`; no code paths removed. Button is only visually hidden on mobile via CSS. |

**Category result: Pass** — No over-scoping or regression.

---

## 2. Railway deployment safety

**Requirement:** No new build step, env vars, or deploy config; static frontend must still be served as before.

| Check | Result | Evidence |
|-------|--------|----------|
| No new dependencies or build step | **Pass** | Changes are CSS only in `frontend/styles.css`. No change to package.json, nixpacks.toml, Procfile, or backend. |
| No new env vars or deploy config | **Pass** | None introduced. |
| Static assets still valid | **Pass** | One existing file edited (styles.css). No new files required for deploy. |

**Category result: Pass** — Railway deployment safety preserved.

---

## 3. UI/UX and accessibility

**Requirement:** Follow best UI/UX and a11y practice (Apple HIG, WCAG, project a11y settings).

### 3.1 Drag affordance and hit area

| Check | Result | Evidence |
|-------|--------|----------|
| Grip is visible and indicates draggable area | **Pass** | Grip pill (32×4 or 4×32) uses `background: rgba(0,0,0,0.22)` and is present in expanded mobile toolbar only. |
| Drag still starts from toolbar chrome / grip | **Pass** | toolbar.js: `toolbarPointerDownHandler` starts drag when target is not the handle, not inside tools-wrap, and not a button/label/input. With handle `pointer-events: none`, taps on the grip/chrome hit the toolbar (or pass through); handler calls `onPointerDown(e)`. No logic gap. |
| Effective touch target for drag | **Pass** | The draggable area is the whole toolbar chrome (including the grip). No requirement that only the grip pixel area be 44pt; the chrome region is the control. |

**Category result: Pass** — Drag behavior and affordance are correct.

### 3.2 High-contrast mode (a11y)

| Check | Result | Evidence |
|-------|--------|----------|
| Grip visibility in high-contrast | **Conditional / Minor gap** | `body.a11y-high-contrast` has rules for `.diagram-floating-toolbar` (border/box-shadow) but **no** rule for `.diagram-floating-toolbar::before`. The grip keeps `rgba(0,0,0,0.22)` and may be low contrast on some backgrounds. **Finding:** Consider adding a high-contrast override for the mobile grip (e.g. stronger border or background) so the drag affordance remains clear. Not a functional regression; improvement only. |

**Category result: Pass with recommendation** — No fail; optional improvement for a11y-high-contrast.

### 3.3 Screen reader and hidden handle (mobile)

| Check | Result | Evidence |
|-------|--------|----------|
| Hidden handle still in DOM and possibly in a11y tree | **Potential gap** | `#diagramToolbarDragHandle` remains in the DOM with `aria-label="Drag to move toolbar"`. It is visually hidden and has `pointer-events: none` but has **no** `aria-hidden="true"`. Screen readers may still expose it (e.g. as a focusable or announced control), which can be redundant or confusing when the visible affordance is the grip. **Finding:** For strict a11y alignment, consider setting `aria-hidden="true"` on the handle when in mobile viewport (e.g. via JS in the same code path that sets `data-viewport-mode`), so only the toolbar’s drag region is announced. Task 54.79 explicitly required no HTML/JS removal; adding one attribute set in JS is an optional follow-up, not a fix to the current scope. |

**Category result: Pass with recommendation** — No functional fail; optional improvement for a11y.

### 3.4 Reduced motion

| Check | Result | Evidence |
|-------|--------|----------|
| No new animations on the grip | **Pass** | Grip has no transition/animation. `body.a11y-reduce-motion` and `body.a11y-force-motion` are not affected by the new rules. |

**Category result: Pass** — No regression.

---

## 4. Logic and cleanup

**Requirement:** No missing cleanup, duplicate logic, or unintended side effects.

| Check | Result | Evidence |
|-------|--------|----------|
| toolbar.js unchanged; no dead code or new listeners | **Pass** | No edits to toolbar.js or app.js. Drag still starts from toolbar chrome; handle listener remains (handle still in DOM; on mobile it never receives events due to `pointer-events: none`). |
| No duplicate or conflicting ::before on toolbar | **Pass** | Only one rule set adds `.diagram-floating-toolbar::before`, and it is under `body[data-viewport-mode="mobile"]`. Desktop toolbar has no ::before from this implementation. |
| E2E coverage still valid | **Pass** | Full E2E run (npm test) passed post-implementation, including diagram toolbar collapse/expand (desktop and mobile), mobile drag/snap, and horizontal scroll. |

**Category result: Pass** — No logic gap or missing cleanup.

---

## 5. Summary: strict Pass/Fail by category

| Category | Result | Notes |
|----------|--------|------|
| **1. Regression & conflict: desktop vs mobile** | **Pass** | No mobile-only rules apply on desktop; no desktop rules changed. |
| **2. Specificity / source order (handle hide vs 44px)** | **Pass** | Hide rule wins on mobile; handle is zero-size. |
| **3. Collapsed state & grip** | **Pass** | Grip hidden when collapsed; 48px circle unchanged. |
| **4. Open Inspector scope** | **Pass** | Only diagram-toolbar instance hidden on mobile. |
| **5. Railway deployment safety** | **Pass** | CSS-only; no build/config/env change. |
| **6. UI/UX: drag affordance & hit area** | **Pass** | Grip visible; drag works from chrome. |
| **7. UI/UX: high-contrast** | **Pass (with recommendation)** | Grip not explicitly styled for a11y-high-contrast; optional improvement. |
| **8. UI/UX: screen reader / hidden handle** | **Pass (with recommendation)** | Handle may still be exposed to a11y tree; optional aria-hidden on mobile. |
| **9. UI/UX: reduced motion** | **Pass** | No new motion. |
| **10. Logic & cleanup** | **Pass** | No JS change; no conflict; E2E passes. |

---

## 6. Bugs, missing cleanup, logic gaps

- **Bugs:** None identified.  
- **Missing cleanup:** None.  
- **Logic gaps:** None.

---

## 7. Optional improvements — **APPLIED (2026-02-21)**

1. **High-contrast:** **Done.** Added in `frontend/styles.css` (see rule in code). So the mobile grip is clearly visible in high-contrast mode. Original suggestion: add a rule such as  
   `body.a11y-high-contrast[data-viewport-mode="mobile"] .diagram-floating-toolbar::before { background: #111; }`  
   (or equivalent) so the grip is clearly visible in high-contrast mode.

2. **Screen reader:** **Done.** In `applyViewportMode()` (app.js), after setting `data-viewport-mode`, the diagram toolbar drag handle gets `aria-hidden="true"` when mobile and `aria-hidden="false"` when desktop. When applying viewport mode (e.g. in `applyViewportMode` or equivalent), set `#diagramToolbarDragHandle.setAttribute('aria-hidden', isMobile ? 'true' : 'false')` so the hidden handle is not announced on mobile while the toolbar’s drag region remains the single drag affordance.

---

**Audit complete.** All categories Pass. Recommendations applied; E2E suite passes.
