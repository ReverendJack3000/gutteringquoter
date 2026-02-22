# ServiceM8 job attachment PNG: crop to content (task 49.33)

**Date:** 2026-02-23  
**Section:** 49  
**Goal:** Remove extra white space from the PNG sent to ServiceM8 so the blueprint is easy to view in Job Diary without excessive zooming.

---

## Investigation summary

- **API usage:** PNG is sent in two flows:
  1. **Add to Job:** `initJobConfirmationOverlay()` → `getExportCanvasDataURL()` → base64 → `POST /api/servicem8/upload-job-attachment` (frontend `app.js` ~3375–3390).
  2. **Create New Job:** `handleCreateNew()` → `getExportCanvasDataURL()` → `image_base64` in body → `POST /api/servicem8/create-new-job` (frontend ~3424–3437); backend attaches same PNG to both original and new job.

- **Backend:** No change needed. `upload_job_attachment()` in `backend/app/servicem8.py` and `api_servicem8_upload_job_attachment` / `api_servicem8_create_new_job` in `backend/main.py` accept raw image bytes; they do not crop or resize.

- **Root cause:** `getExportCanvasDataURL()` uses `state.canvasWidth` and `state.canvasHeight` (set in `resizeCanvas()` from `blueprintWrap.clientWidth/Height * devicePixelRatio`). So the export is the **full canvas element size**. The visible diagram (blueprint + elements) only occupies a subset of that (with scale/offset), so the PNG has large empty margins and appears tiny in ServiceM8.

---

## Proposed implementation (100% aligned with codebase)

1. **Content bounds (logical coords)**  
   Reuse the same logic as in `draw()` (`app.js` ~6641–6696):
   - If blueprint + elements: blueprint bbox via `rotatedRectBbox(bt.x, bt.y, bt.w, bt.h, bt.rotation)`, then extend with each element’s `rotatedRectBbox(el.x, el.y, el.width, el.height, el.rotation)` to get `minX`, `minY`, `bboxW`, `bboxH`.
   - If elements only: same element bbox aggregation; no blueprint.
   - If no content: return null (already handled).

2. **Cropped export for ServiceM8 only**  
   - Add a helper that returns content bounds: `getExportContentBounds()` → `{ minX, minY, bboxW, bboxH }` or null.
   - Add `getExportCanvasDataURLCropped(options?)` (or an option on `getExportCanvasDataURL`, e.g. `{ cropped: true }`) that:
     - Uses `getExportContentBounds()` to get logical bounds.
     - Chooses an export scale (e.g. 2) and padding (e.g. 20 logical units).
     - Creates a canvas of size `(bboxW + 2*pad) * scale` × `(bboxH + 2*pad) * scale`.
     - Draws blueprint and elements at that scale with origin at `(-minX + pad, -minY + pad)` in logical space (so content is centered in the padded canvas).
   - **Call sites:** Use the cropped export only for ServiceM8:
     - Add to Job: pass cropped data URL (or base64) to `upload-job-attachment`.
     - Create New Job: pass cropped base64 in `image_base64` to `create-new-job`.

3. **Export PNG download**  
   Leave as-is (full canvas) unless we decide to use cropped export for download too; task 49.33 is scoped to ServiceM8 attachment viewability.

4. **Desktop vs mobile**  
   Same code path for both; no viewport-specific logic. Both benefit from smaller, content-focused PNGs in ServiceM8. No mobile-only UI change.

5. **Railway**  
   Frontend-only change; no new env, build, or backend; deploy remains valid.

---

## Edge cases

- **Empty canvas:** Already handled (no content → null).
- **Single layer:** Bounds from blueprint-only or elements-only (both paths exist in `draw()`).
- **Rotation:** `rotatedRectBbox` already used for fit-to-content; use same for export bounds.
- **Max size:** ServiceM8 backend already enforces 10MB; cropped PNG will typically be smaller.

---

## Files to touch

- `frontend/app.js`: `getExportContentBounds()`, cropped export helper, and use it in Add to Job + Create New Job flows only.

No changes to `backend/main.py`, `backend/app/servicem8.py`, `index.html`, or `styles.css`.
