# New canvas button + "Save?" popup (mobile + desktop)

**Goal:** Add a "New" canvas button that, when clicked/tapped, shows a "Save?" popup on both mobile and desktop if the canvas has content, with two actions: **Delete draft** (discard and start fresh) and **Save draft** (save current diagram then start fresh). If the canvas is already empty, New goes straight to empty state (no popup).

**Context:** Single codebase, adaptive layout (`data-viewport-mode`). Must work on mobile and desktop; popup must be tappable/clickable and accessible. Deployment must remain Railway-safe (frontend-only).

---

## 1. Scope and behaviour

| Scenario | Behaviour |
|----------|-----------|
| User taps/clicks **New** and canvas is **empty** (no blueprint, no elements) | Clear canvas to empty state immediately (no modal). Reset project name to "Untitled", clear undo/redo. |
| User taps/clicks **New** and canvas **has content** (blueprint and/or elements) | Show **"Save?"** popup with two buttons: **Save draft** and **Delete draft**. |
| User chooses **Delete draft** | Close popup; clear canvas to empty state; optionally clear autosave prompt/draft so "Restore autosaved draft?" does not immediately appear for the discarded content. |
| User chooses **Save draft** | Close popup; open existing **Save diagram** modal (same as Save button). User enters name and confirms. On **success**: close save modal, then clear canvas to empty state. On **cancel** (or backdrop): do not clear canvas; clear any "pending new after save" flag. |

**Desktop vs mobile:** Same behaviour and same UI. Button lives in global toolbar; popup uses existing `showAppConfirm` / `appAlertDialogModal` (already used for e.g. autosave restore). Mobile: 44px touch target for New button; no extra mobile-only logic unless placement requires it (see below).

---

## 2. Implementation plan (100% code-based, no assumptions)

### 2.1 Clear-canvas function (app.js)

Add a single function, e.g. `clearCanvasToEmpty()`, that:

- Resets **state**: `elements = []`, `groups = []`, `blueprintImage = null`, `blueprintTransform = null`, `blueprintImageSourceUrl = null`, `selectedBlueprint = false`, `selectedId = null`, `selectedIds = []`, `mode = null`, `resizeHandle = null`, `snapshotAtActionStart = null`, `projectName = ''`, `nextSequenceId = 1`.
- Clears **undo/redo**: `undoHistory = []`, `redoHistory = []`.
- Closes any open **element toolbar** / **badge length popover** if applicable (so no stale selection UI).
- Calls: `updateToolbarBreadcrumbs('')`, `updatePlaceholderVisibility()`, `renderMeasurementDeck()`, `draw()`, `updateUndoRedoButtons?.()`.

**Optional but recommended for "Delete draft":** When clearing after user chose "Delete draft", call `clearAutosaveLocalState({ clearPromptStamp: true })` so the app does not immediately show "Restore autosaved draft?" for the content they just discarded. When clearing after "Save draft" (save success), do **not** clear autosave state (or clear only if product wants a clean slate after New).

**Reference:** Existing state shape in `cloneStateForUndo` (6900–6924); `restoreStateFromSnapshot` (6926–6958) and empty blueprint path; `isCanvasEmptyForAutosavePrompt` (10161–10163).

### 2.2 "Has content" check

Use the same condition already used elsewhere: `state.blueprintImage || state.elements.length > 0` (e.g. as in 11847, 10294). No new helper required unless we want a named function like `hasCanvasContent()` for readability.

### 2.3 Save flow integration ("Save draft" → save then clear)

Current **Save** flow: `saveDiagramBtn` click → open `saveDiagramModal`; user enters name → `saveDiagramConfirmBtn` click → `getDiagramDataForSave()`, POST `/api/diagrams`, on success: close modal, update breadcrumb, showMessage, refreshDiagramsList.

To support "Save draft then new canvas":

- Introduce a **flag** (e.g. `pendingNewCanvasAfterSave`) set to `true` when the user chose "Save draft" from the Save? popup.
- When opening the save modal for this path, use the same modal and same POST flow. In the **success** branch of `saveDiagramConfirmBtn` (after close modal, update breadcrumb, showMessage, refreshDiagramsList), **if** `pendingNewCanvasAfterSave` is true: call `clearCanvasToEmpty()`, then set `pendingNewCanvasAfterSave = false`.
- When the save modal is **closed without saving** (Cancel button or backdrop): set `pendingNewCanvasAfterSave = false` so a later unrelated Save does not clear the canvas. Wire this in the cancel handler and in the modal’s backdrop/close handling for `saveDiagramModal`.

**Reference:** Save handler ~11858–11888; cancel ~11891; MODAL_REGISTRY/backdrop close for saveDiagramModal.

### 2.4 "Save?" popup (two buttons)

Use existing **showAppConfirm** (e.g. 15654–15662):

- **Title:** "Save?"
- **Message:** e.g. "Save current draft before starting a new canvas?" or shorter: "Save your current work before starting a new canvas?"
- **Confirm button label:** "Save draft" → resolve `true`.
- **Cancel button label:** "Delete draft" → resolve `false`.

On **true** (Save draft): set `pendingNewCanvasAfterSave = true`, then open save diagram modal (same as clicking Save: focus name, etc.). If user is not signed in, current Save flow shows "Sign in to save" and switches view—handle the same way (set `pendingNewCanvasAfterSave = false` if we never opened the modal).

On **false** (Delete draft): call `clearCanvasToEmpty()` and optionally `clearAutosaveLocalState({ clearPromptStamp: true })`.

**Accessibility:** `appAlertDialogModal` is already `role="alertdialog"`, focus trap, Escape and backdrop behaviour. For "Delete draft" being destructive, consider `destructive: true` for the Cancel button (so Delete draft is styled as destructive and focus order may put it second). Check `showAppDialog` (15622–15632): `cancelBtn` is the second button; if we map Confirm = "Save draft" and Cancel = "Delete draft", then Delete draft is the cancel button—can set `destructive: true` so Cancel (Delete draft) gets `.btn-destructive`.

### 2.5 New canvas button (HTML + JS)

- **HTML (index.html):** Add a button in the global toolbar, e.g. in `.toolbar-right`, before or after the existing Save button. Example: `<button type="button" class="toolbar-icon-btn btn-icon" id="newCanvasBtn" title="New canvas" aria-label="New canvas">...</button>` with an appropriate icon (e.g. document-plus or new-file style SVG). Ensure it is **not** inside the mobile-hidden block that hides Export / clock / Accessibility (54.82.3)—so New remains visible on mobile. Placement: e.g. before `#cameraUploadBtn` or between Save and Export so desktop and mobile both show it.
- **CSS (styles.css):** Ensure the new button has min 44×44px on mobile (`body[data-viewport-mode="mobile"]`); reuse existing `.toolbar-icon-btn` so it matches other toolbar icons.
- **JS (app.js):** In the same init that wires `saveDiagramBtn` (e.g. ~11745), get `#newCanvasBtn`, add click handler:
  - If `state.blueprintImage || state.elements.length > 0`: call `showAppConfirm(...)` with the text above, then on resolve:
    - if `true`: set `pendingNewCanvasAfterSave = true`, then open save diagram modal (same as Save: check auth, then open modal with `openAccessibleModal('saveDiagramModal', ...)`).
    - if `false`: call `clearCanvasToEmpty()` and optionally `clearAutosaveLocalState({ clearPromptStamp: true })`.
  - Else: call `clearCanvasToEmpty()` (no popup).

**Mobile:** No separate mobile branch for the New button logic; same handler. Diagram toolbar auto-collapse when modals open is already handled (54.80.2.x); opening Save? or Save modal will collapse diagram toolbar as needed. If we open save modal from "Save draft", call `collapseDiagramToolbarIfExpanded()` before opening it (same as Save button).

### 2.6 Edge cases and accessibility

- **Escape / backdrop on Save? popup:** Existing appAlertDialogModal behaviour: Escape and backdrop typically resolve the confirm as false (cancel). So Escape or backdrop = "Delete draft" (discard). Confirm with product: some UIs treat backdrop as "cancel action" (don’t new), not "delete draft". If product wants "backdrop = do nothing (keep current canvas)", we’d need a three-way outcome (Save draft / Delete draft / Dismiss). Plan assumes two actions only; Escape/backdrop = Delete draft.
- **Save modal cancelled:** When user opens Save modal from "Save draft" then clicks Cancel or backdrop, set `pendingNewCanvasAfterSave = false` so the next normal Save doesn’t clear the canvas.
- **Not signed in + "Save draft":** If we open Save? and user clicks "Save draft", we open save modal; current Save flow checks auth and shows "Sign in to save" and may switch view. In that path we should set `pendingNewCanvasAfterSave = false` so we don’t clear after a failed save or view switch.
- **Screen reader:** Use existing modal titles/labels; button aria-label "New canvas"; confirm dialog already has title and message.
- **Double-tap / rapid tap:** Single click/tap handler; no special throttle needed unless QA finds issues.

### 2.7 Railway and desktop

- **Railway:** No backend or env changes; frontend-only. No new build step; `./scripts/run-server.sh` unchanged.
- **Desktop:** Desktop layout and behaviour unchanged except for the new button and the new popup when New is used with content. No `data-viewport-mode`-specific logic for the New flow except optional 44px sizing for the button on mobile.

---

## 3. Task list update (draft)

- **Section file:** `docs/tasks/section-54.md` — add a new task block **54.108 New canvas button and Save? popup (mobile + desktop)** with sub-tasks:
  - 54.108.1 Clear-canvas function and optional autosave clear on Delete draft.
  - 54.108.2 Save? popup via showAppConfirm; Save draft opens save modal and sets pendingNewCanvasAfterSave; Delete draft clears canvas (and optional autosave clear).
  - 54.108.3 Save flow: on save success, if pendingNewCanvasAfterSave then clear canvas and reset flag; on save cancel/close reset flag.
  - 54.108.4 New button in toolbar (HTML + CSS 44px mobile); click handler: has content → popup, else clear.
  - 54.108.5 Verification: desktop + mobile, E2E or manual (New empty, New with content + Delete draft, New with content + Save draft), Railway-safe.
- **TASK_LIST.md:** Add a row in the uncompleted table for Section 54, 54.108.x (New canvas button and Save? popup).

---

## 4. Files to touch

| File | Changes |
|------|--------|
| `frontend/app.js` | Add `clearCanvasToEmpty()`; add `pendingNewCanvasAfterSave` and wire in save success/cancel; add New button click handler; optionally `hasCanvasContent()` helper. |
| `frontend/index.html` | Add `#newCanvasBtn` in `.toolbar-right` with icon and aria-label. |
| `frontend/styles.css` | If needed, ensure New button 44×44 on mobile (may already be satisfied by `.toolbar-icon-btn`). |
| `docs/tasks/section-54.md` | Add task block 54.108 and checkboxes. |
| `TASK_LIST.md` | Add uncompleted row for 54.108. |

No changes to `backend/`, `scripts/run-server.sh`, or deployment config.
