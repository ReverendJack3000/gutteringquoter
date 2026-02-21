# Plan: 54.80.2.9 – Mobile: auto-collapse diagram toolbar when products panel is opened

**Date:** 2026-02-21  
**Task:** 54.80.2.9 (section 54, docs/tasks/section-54.md)  
**Parent plan:** [2026-02-21-diagram-toolbar-auto-collapse-on-element-toolbar-and-dropdowns.md](2026-02-21-diagram-toolbar-auto-collapse-on-element-toolbar-and-dropdowns.md)

**Objective:** When the user opens the Products panel on mobile (e.g. tapping the Products pill so `#panel` gets class `expanded` and `#panelContent` is visible), call the existing `collapseDiagramToolbarIfExpanded()` so `#diagramFloatingToolbar` auto-collapses to the "+" pill. Mobile-only; desktop behaviour unchanged.

**Constraint:** Single codebase for desktop and mobile; all logic must be correct and based solely on the current codebase. No assumptions. Deployment must remain Railway-safe.

---

## 1. Current behaviour (verified in codebase)

- **Products panel open path:** The only place that expands the panel in response to user action is `#panelCollapsed` click in `initPanel()` (app.js ~9307–9309), which calls `setPanelExpanded(true)` with no viewport check. On mobile, the panel is the bottom sheet; on desktop it is the right resizable panel.
- **setPanelExpanded(expanded, options)** (app.js ~9437–9492) is the single function that:
  - Sets `layoutState.panelExpanded`
  - Toggles `#panel` classes `expanded` / `collapsed`
  - Sets mobile-only role/aria when `layoutState.viewportMode === 'mobile'`
  - Handles focus and announcer for mobile
  - Calls `resizeCanvas()` and `draw()` when `options.resizeCanvas !== false`
- **collapseDiagramToolbarIfExpanded()** (app.js ~6132–6135) already exists and is mobile-gated: it returns immediately when `layoutState.viewportMode !== 'mobile'`, then calls `diagramToolbarApi?.collapseIfExpanded?.()`. So calling it from a path that runs on both desktop and mobile is safe; it no-ops on desktop.
- **diagramToolbarApi** is set in app.js at ~6128 by `initDiagramToolbarDragWithApp()`. No changes to toolbar.js or the API are required.

---

## 2. Where to wire the collapse (single call site)

- **Call site:** Inside `setPanelExpanded(expanded, options)` in app.js, when the panel is being **expanded** (i.e. when `isExpanded` is true).
- **Reason:** This is the single code path through which the panel becomes expanded on user action (panelCollapsed click). It also covers any future code that opens the panel by calling `setPanelExpanded(true)`. No need to touch the `panelCollapsed` click handler.
- **Placement:** Call `collapseDiagramToolbarIfExpanded()` once, after the panel state and classes have been updated (e.g. after `panel.classList.toggle('expanded', isExpanded)` and the mobile role/aria block), and before or after the existing mobile announcer/focus block. Calling it when `isExpanded === true` is sufficient; the function itself enforces mobile-only, so desktop remains unchanged.

**Exact location (app.js):** In `setPanelExpanded`, after `layoutState.panelExpanded = isExpanded` and the class toggles (and optional mobile role/aria). For example, right after the block that sets `panel.setAttribute('role', 'dialog')` when `isMobileMode && isExpanded`, add:

```js
if (isExpanded) collapseDiagramToolbarIfExpanded();
```

Alternatively, after `updatePanelToggleAccessibility(isExpanded)` so all panel state is committed first. Either way, one line; no second call site needed.

---

## 3. Desktop vs mobile

- **Mobile:** User taps Products pill → `setPanelExpanded(true)` → `isExpanded === true` → `collapseDiagramToolbarIfExpanded()` runs → mobile guard passes → diagram toolbar collapses to "+".
- **Desktop:** User clicks panel collapsed strip → `setPanelExpanded(true)` → `collapseDiagramToolbarIfExpanded()` runs → `layoutState.viewportMode !== 'mobile'` → function returns immediately; diagram toolbar unchanged.
- **Resizer path:** The resizer `onMouseMove` that can add `expanded` to the panel (app.js ~9596–9602) is already gated with `if (layoutState.viewportMode === 'mobile') return;`, so that path never runs on mobile. No change needed there.

---

## 4. Edge cases

- **Double expand:** If `setPanelExpanded(true)` is called when the panel is already expanded, we still call `collapseDiagramToolbarIfExpanded()`. That is idempotent (toolbar already collapsed stays collapsed; expanded toolbar collapses once). No issue.
- **Viewport switch:** If the user switches to mobile with the panel already expanded, we do not call `setPanelExpanded(true)` (we call `setPanelExpanded(layoutState.panelExpanded, …)` or set default); so we don’t collapse the diagram toolbar on mode switch unless we’re actually opening the panel. Correct.
- **Re-init:** `diagramToolbarApi` is set by `initDiagramToolbarDragWithApp()` and is re-set on viewport re-init; no stale reference.

---

## 5. Files to change

| File        | Change |
|------------|--------|
| frontend/app.js | In `setPanelExpanded(expanded, options)`, when `isExpanded` is true, call `collapseDiagramToolbarIfExpanded()` once (after panel state/classes/aria are set). |
| frontend/toolbar.js | No change. |
| frontend/index.html | No change. |
| frontend/styles.css | No change. |

---

## 6. Task list update after implementation

- In **docs/tasks/section-54.md**, mark task **54.80.2.9** as completed: change `- [ ]` to `- [x]` for the line "**54.80.2.9** **Mobile: auto-collapse diagram toolbar when products panel is opened.**…"
- In **TASK_LIST.md**, the uncompleted row for section 54 already includes "54.80.2.9"; when 54.80.2.9 is done, leave the row as-is until the whole 54.80 block or section is complete (per task-list-completion rules).

---

## 7. Verification

- **Manual (mobile):** Open app in mobile viewport, expand diagram toolbar to show all tools, tap Products pill → panel opens and diagram toolbar should collapse to "+" only. Expand diagram toolbar again, close panel, tap Products again → same behaviour.
- **Manual (desktop):** Open app in desktop viewport, expand diagram toolbar, click panel collapsed strip to open panel → diagram toolbar must remain expanded (unchanged).
- **E2E:** Run existing suite (`npm test`); no new E2E required unless product requests it. Railway deploy must succeed.
