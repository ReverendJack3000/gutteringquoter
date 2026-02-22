# Audit Report: Task 33.11 – Save blueprint downscale (Supabase “Payload too large”)

**Date:** 2026-02-23  
**Scope:** Implementation and task completion for fixing mobile diagram save when blueprint PNG exceeds Supabase Storage object size limit.  
**Plan:** docs/plans/2026-02-23-mobile-photo-save-supabase-payload-too-large.md  
**Task:** 33.11 (section-33.md); index TASK_LIST.md.

---

## 1. Executive summary

| Item | Result |
|------|--------|
| **Plan alignment** | Implementation follows Plan §5 Option 1 (frontend downscale in `getDiagramDataForSave()`). No backend changes. |
| **Scope** | Only the save-diagram blueprint PNG path is changed. ServiceM8 attachment, crop modal, and Export PNG download are unchanged. |
| **Task list** | Task 33.11 marked complete in section-33.md; TASK_LIST.md uncompleted table correctly shows 33.4–33.10 (33.11 removed). |
| **Verdict** | **PASS** – Implementation and task updates are correct and consistent with the plan. |

---

## 2. Implementation verification

### 2.1 Constant and location

- **Constant:** `SAVE_BLUEPRINT_MAX_LONG_SIDE = 1600` (frontend/app.js, line 9531).
- **Placement:** Immediately before `getDiagramDataForSave()`; referenced only inside that function (lines 9565–9566).
- **Plan:** §5 suggests “max 1200 or 1600 on the long side”. 1600 is within the recommended range and keeps PNGs well under typical Supabase limits.

### 2.2 Downscale logic (lines 9559–9583)

| Check | Code / behaviour | Status |
|-------|-------------------|--------|
| Dimensions from transform | `w = Math.max(1, Math.round(bt.w))`, `h = Math.max(1, Math.round(bt.h))` | OK – avoids 0 or negative. |
| Long-side threshold | `longSide = Math.max(w, h)`; scale only when `longSide > SAVE_BLUEPRINT_MAX_LONG_SIDE` | OK – equality (e.g. 1600) is not downscaled. |
| Aspect ratio | `scale = SAVE_BLUEPRINT_MAX_LONG_SIDE / longSide`; `w = Math.max(1, Math.round(w * scale))`, same for `h` | OK – aspect ratio preserved. |
| Canvas size | `c.width = w`, `c.height = h` (possibly reduced) | OK. |
| Draw call | `ctx.drawImage(state.blueprintImage, 0, 0, bt.w, bt.h, 0, 0, w, h)` | OK – full source rect (0,0,bt.w,bt.h) drawn into (0,0,w,h); correct 9-arg form. |
| Output | `blueprintImageBase64 = c.toDataURL('image/png')` unchanged; only canvas dimensions vary. | OK. |
| Tainted / CORS fallback | Existing try/catch and `blueprintImageSourceUrl` behaviour unchanged. | OK. |

### 2.3 Data payload (saved diagram JSON)

- `data.blueprintTransform` is still `state.blueprintTransform` (original logical size). Only the **image** sent as `blueprintImageBase64` is downscaled when over threshold.
- Load path: `restoreStateFromApiSnapshot` sets `state.blueprintTransform = d.blueprintTransform` (logical size) and loads the image from `blueprintImageUrl` (downscaled PNG). The app draws that image scaled to `bt.w × bt.h`, so coordinates and display remain correct. No change required in load logic.

### 2.4 Call sites of getDiagramDataForSave()

All call sites use the same function; no extra branches.

| Call site | Location | Sends blueprintImageBase64 to |
|-----------|----------|-------------------------------|
| upsertAutosaveDraft() | ~9325 | POST /api/diagrams (9376) or PATCH (9351) |
| autoSaveDiagramWithJobNumber() | ~9651 | POST /api/diagrams (9661) |
| Manual save (clock dropdown) | ~11114 | POST /api/diagrams (11122) |

All three flows therefore send the same (possibly downscaled) blueprint PNG. PATCH (autosave update) is covered; backend `update_diagram()` uploads the same bytes to Storage.

---

## 3. “What not to change” (Plan §6)

| Item | Verification | Status |
|------|----------------------|--------|
| **ServiceM8 attachment** | Add to Job: `getExportCanvasDataURLCropped() ?? getExportCanvasDataURL()` (3381). Create New Job: same (3439). No use of `getDiagramDataForSave()` in ServiceM8 path. | Unchanged |
| **Crop modal** | No edits in crop preview or drawCropPreview; plan §6 says crop fix stays. | Unchanged |
| **Export PNG download** | Export button uses `exportCanvas.toDataURL('image/png')` (8877) from the full-canvas export path, not `getDiagramDataForSave()`. | Unchanged |

---

## 4. Thumbnail and other behaviour in getDiagramDataForSave()

- Thumbnail block (lines 9584–9645): uses `state.canvasWidth`, `state.canvasHeight`, fixed 200×150 canvas, and its own layer rendering. It does not use the `w`/`h` computed for the blueprint export. Thumbnail logic is unchanged.

---

## 5. Edge cases

| Case | Handling |
|------|----------|
| `bt.w` or `bt.h` 0 or negative | `Math.max(1, Math.round(...))` ensures minimum 1. |
| Exactly 1600px long side | `longSide > 1600` is false; no downscale; behaviour as before. |
| Very large dimensions (e.g. 10000×8000) | Downscaled to 1600×1280; PNG size reduced. |
| No blueprint / no transform | Existing guard `if (state.blueprintImage && state.blueprintTransform)` unchanged; no new branches. |

---

## 6. Task list and index

### 6.1 Section file (docs/tasks/section-33.md)

- **33.11** is marked complete: `- [x] **33.11** Fix mobile diagram save: …` (line 14).
- Checkbox is lowercase `x` per task-list-completion rule.

### 6.2 Index (TASK_LIST.md)

- Section 33 uncompleted row: “33.4–33.10” only; 33.11 is not listed as uncompleted.
- Description matches remaining work (autosave recovery, job-stamp auth, etc.); no mention of 33.11 in the uncompleted table (correct once completed).

---

## 7. Deployment and dependencies

- **Backend:** No code or config changes; no new dependencies.
- **Frontend:** One new constant and localised logic in `getDiagramDataForSave()`; vanilla JS, no new libs.
- **Railway:** No Procfile, nixpacks, or env changes; deploy path unchanged.

---

## 8. Conclusion

- Implementation matches the plan: frontend-only downscale in `getDiagramDataForSave()` with a 1600px long-side cap, aspect ratio preserved, all save paths (manual, autosave POST/PATCH, auto-save after Add to Job) covered.
- ServiceM8, crop modal, and Export PNG download are untouched.
- Load behaviour remains correct with existing `blueprintTransform` and downscaled image.
- Task 33.11 is correctly marked complete in section-33.md and reflected in TASK_LIST.md.

**Audit result: PASS.** No defects or follow-up code changes required for this task.
