# Section 54 Plan & Task List Verification

**Date:** 2026-02-20  
**Purpose:** Single reference plan that is 100% aligned with the project’s code, cursor rules, README, and existing design docs. No code changes; task list updates only if needed.  
**Scope:** Mobile diagram toolbar (54.49–54.53, 54.56–54.60); desktop must remain unchanged; Railway deployment must remain valid.

---

## 1. Project understanding (from cursor rules, TASK_LIST, README)

### 1.1 How the project works

- **Stack:** FastAPI backend, vanilla HTML/CSS/JS frontend, no build step. Supabase for data; optional PWA behind `PWA_ENABLED`.
- **Layout:** One codebase; desktop vs mobile via `data-viewport-mode` on `body` (set in JS from `layoutState.viewportMode`). All mobile-only behaviour is gated by `layoutState.viewportMode === 'mobile'` in JS and `body[data-viewport-mode="mobile"]` in CSS.
- **Deployment:** Railway runs `cd backend && uvicorn main:app --host 0.0.0.0 --port $PORT`. No new dependencies or build steps; frontend is static under `frontend/`. Any change must remain deployable with the existing Procfile / nixpacks.toml / run-server.sh.
- **Task discipline:** `TASK_LIST.md` is the single source of truth; completion = `[x]` on the relevant line. One active `feature/*` branch at a time; merge to main when complete.
- **Brainstorming rule:** Before new features/UI work, produce a plan (goal, desktop vs mobile impact, implementation steps, edge cases, task list draft) and get approval; no code until then.
- **Recurring issues:** Document in `TROUBLESHOOTING.md` with symptom, cause, fix, optional title/date.

### 1.2 Section 54 context

- **54.49–54.53, 54.50.1:** Mobile-only diagram toolbar refinements (collapsed “+” visibility, tap-to-expand, orientation/no-scroll QA, regression coverage; 54.50.1 = remove dead diagram-toolbar-hidden code — done).
- **54.56–54.60:** Mobile “always thin, edge-only” (plan: `docs/plans/2026-02-20-mobile-diagram-toolbar-always-thin-edge-only.md`). Tasks: thin vertical pill (54.56), thin horizontal pill + compact (54.57), snap to nearest edge (54.58), no middle placement (54.59), QA and regression (54.60).

### 1.3 Documented current limitation

- **Uncompleted tasks table (Section 54 row):** Description must end with:  
  *"Note: pill bar cannot be dragged horizontally when expanded; does not detect edges to reformat horizontal/vertical."*
- **Subsection “Mobile: diagram toolbar always thin, edge-only”:** A note must appear directly under the plan link and before 54.56–54.60:  
  *"Note (current behaviour): The pill bar cannot be dragged horizontally when expanded, and it does not detect edges to reformat to horizontal/vertical."*

---

## 2. Implementation plan (54.56–54.60) — code-aligned

This plan is derived from the codebase and `docs/plans/2026-02-20-mobile-diagram-toolbar-always-thin-edge-only.md`. No assumptions beyond those documents.

### 2.1 Code anchors (verified)

- **app.js**
  - `initDiagramToolbarDrag()` ~5605; `clampDiagramToolbarToWrap()` ~5581; `updateOrientationFromPosition()` ~5654.
  - Orientation: top/bottom 20% → horizontal (with Y snap); left/right 20% → vertical (with X snap); else horizontal, no position snap (lines 5666–5692).
  - Drag: `onPointerDown` / `onPointerMove` / `onPointerUp`; position clamped to wrap; orientation and snap run on pointer up only.
  - Mobile: default orientation `'vertical'`, default x = 12, collapsed forced false on mobile (5618, 5622, 5638).
  - Comment at 5563 references 54.56–54.60 and the always-thin-edge-only plan.
- **styles.css**
  - Mobile diagram toolbar rules under `body[data-viewport-mode="mobile"]` (e.g. ~2126–2159); vertical stack and horizontal overrides; 44px targets.
- **Railway**
  - No frontend build; backend only. Changes must stay within static frontend + existing backend.

### 2.2 CSS (mobile only)

- **Vertical (54.56):** Under `body[data-viewport-mode="mobile"] .diagram-floating-toolbar[data-orientation="vertical"] .diagram-toolbar-tools-wrap`: set `flex-wrap: nowrap` so the toolbar is a single column; do not remove existing vertical or desktop rules.
- **Horizontal (54.57):** Under `body[data-viewport-mode="mobile"] .diagram-floating-toolbar[data-orientation="horizontal"]` and its `.diagram-toolbar-tools-wrap`: set `flex-wrap: nowrap`; add compact sizes (e.g. 40px targets, ~18px icons) so one row fits; optionally `body.a11y-large-controls` override for 44px and two-row wrap; reduce padding/gap for a thin pill. Do not remove existing horizontal or desktop behaviour.
- Add rules after existing mobile diagram toolbar blocks; only add or narrow with more specific selectors.

### 2.3 JS (mobile only)

- **Snap-to-edge (54.58, 54.59):** Add a mobile-only path (e.g. `snapDiagramToolbarToEdgeForMobile(toolbar, wrap)` or extend `updateOrientationFromPosition()` with an early desktop branch and new mobile logic). Call from:
  - `onPointerUp` (after drag),
  - ResizeObserver callback (after `clampDiagramToolbarToWrap`),
  - Init when `viewportMode === 'mobile'` (normalize saved position so it’s never “middle”).
- **Logic:** Use same 20% thresholds as current orientation (reuse or mirror `DIAGRAM_TOOLBAR_EDGE_THRESHOLD*`). Compute nearest edge (top/bottom/left/right), set position (centered on that edge with pad), set `data-orientation` (horizontal for top/bottom, vertical for left/right), persist same localStorage keys (X, Y, orientation). Do not change desktop `updateOrientationFromPosition` or clamp behaviour.
- **Desktop:** All new logic gated by `layoutState.viewportMode === 'mobile'`; desktop keeps free placement and current orientation/snap behaviour.

### 2.4 QA and regression (54.60)

- Manual: toolbar only on four edges; vertical = slim single column; horizontal = thin single row; collapse/expand and all tools unchanged; desktop free placement and layout unchanged. Document a11y tradeoff if compact horizontal uses &lt;44px.

### 2.5 Desktop vs mobile

- **Desktop:** No code or CSS changes. No new desktop-only overrides. Existing `updateOrientationFromPosition`, clamp, drag, and persistence unchanged.
- **Mobile:** Additive only: new CSS under `body[data-viewport-mode="mobile"]`, new JS behind `layoutState.viewportMode === 'mobile'`. Existing mobile defaults (vertical, x=12, collapsed=false) and toolbar content unchanged.

### 2.6 Railway

- No new dependencies, no new build steps, no change to backend or deploy config.

---

## 3. Edge cases and assumptions (none left implicit)

- **Narrow phones (e.g. 320px):** Single row + 40px may still overflow; plan allows flex-shrink / min-width: 0 or a11y override to 44px + two rows; document in 54.60.
- **Resize / rotation:** ResizeObserver already runs; snap-to-edge on resize keeps toolbar on same edge and re-centered.
- **Collapse/expand:** Unchanged; when expanded again, toolbar remains on same edge (position already set by snap).
- **Init with saved “middle” position on mobile:** First run of snap-to-edge on init forces toolbar to an edge so it never starts in the middle.
- **Overlap of zones:** Plan uses same 20% zone logic as current code; priority top/bottom then left/right is already defined in `updateOrientationFromPosition`.

---

## 4. Task list verification

### 4.1 Uncompleted tasks table (Section 54 row)

- **Required:** One row for 54.49–54.53, 54.50.1, 54.56–54.60 with description ending in:  
  *"Note: pill bar cannot be dragged horizontally when expanded; does not detect edges to reformat horizontal/vertical."*
- **Current state (TASK_LIST.md line 44):** Present and correct. No update needed.

### 4.2 Subsection “Mobile: diagram toolbar always thin, edge-only”

- **Required:** After the plan link, before 54.56–54.60, a line:  
  *"Note (current behaviour): The pill bar cannot be dragged horizontally when expanded, and it does not detect edges to reformat to horizontal/vertical."*
- **Current state (TASK_LIST.md lines 1320–1323):** Plan link and note are present and correct. No update needed.

### 4.3 Conclusion

- Both the uncompleted-tasks table row and the subsection note are already in `TASK_LIST.md` with the correct wording. **No task file changes are required** for the two notes. Any future work on 54.49, 54.51–54.53, 54.56–54.60 should mark those checkboxes when done, per the task-list-completion rule.

---

## 5. Summary

- **Plan:** Implementation for 54.56–54.60 (and related 54.49, 54.51–54.53) is fully specified above and matches the codebase and `docs/plans/2026-02-20-mobile-diagram-toolbar-always-thin-edge-only.md`. Desktop and Railway constraints are respected; no assumptions beyond existing docs and code.
- **Task list:** The Section 54 uncompleted row and the “Mobile: diagram toolbar always thin, edge-only” note are already correctly recorded in `TASK_LIST.md`. No add/update needed for those two items.
