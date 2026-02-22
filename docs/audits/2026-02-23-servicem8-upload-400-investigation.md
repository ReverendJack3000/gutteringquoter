# Investigation: ServiceM8 upload-job-attachment 400 Bad Request

**Date:** 2026-02-23  
**Reported:** `POST /api/servicem8/upload-job-attachment` returns 400 (Railway logs).  
**Scope:** Investigate what changed in how the request is sent; no code changes.

---

## 1. Where the 400 comes from

The 400 is returned by **our backend** (FastAPI), not by the ServiceM8 API. The handler is `api_servicem8_upload_job_attachment` in `backend/main.py` (lines 1114–1150).

There are **exactly two** code paths that raise `HTTPException(400, ...)` in that handler:

| Line | Condition | Message |
|------|-----------|--------|
| 1129–1132 | `base64.b64decode(body.image_base64, validate=True)` raises | `"Invalid image_base64"` |
| 1133–1134 | `len(image_bytes) > 10 * 1024 * 1024` | `"Image too large (max 10MB)"` |

So the 400 is either **invalid base64** or **image larger than 10MB**. The log snippet you have does not include the response body; the actual message would be in the API response body or in backend logs (e.g. the `logger.warning` on invalid base64).

---

## 2. What was changed recently (task 33.11)

In the last implementation we **did not change** anything related to ServiceM8 or the upload-job-attachment request:

- We only changed **`getDiagramDataForSave()`** in `frontend/app.js` (downscale for **Supabase** diagram save).
- The ServiceM8 attachment path uses **`getExportCanvasDataURLCropped() ?? getExportCanvasDataURL()`** and sends the result to `POST /api/servicem8/upload-job-attachment`. That path was not modified.

So the 400 is **not** caused by the 33.11 change. If something “changed” from the user’s perspective, it is either:

- A regression from an **earlier** change (e.g. task 49.33 – cropped export), or  
- Environment/usage (e.g. larger diagrams, different browser), or  
- A pre-existing edge case that only shows up in some cases.

---

## 3. How the request is sent (unchanged)

**Add to Job** (relevant branch in `frontend/app.js` ~3378–3400):

1. `payload` comes from `getAddToJobPayload(jobUuid)`; `jobUuidForAttachment = payload.job_uuid`.
2. `dataUrl = getExportCanvasDataURLCropped() ?? getExportCanvasDataURL()` (with try/catch fallback to `getExportCanvasDataURL()` only).
3. If `dataUrl && jobUuidForAttachment`:
   - `base64 = dataUrl.replace(/^data:image\/png;base64,/, '')`  
     (removes the **exact** prefix `data:image/png;base64,`; **case-sensitive**).
   - Request body: `JSON.stringify({ job_uuid: jobUuidForAttachment, image_base64: base64 })`.
   - `POST /api/servicem8/upload-job-attachment` with `Content-Type: application/json` and `Authorization: Bearer <token>`.

**Backend contract** (`UploadJobAttachmentRequest` in `backend/main.py` 343–346):

- `job_uuid`: `str`, required, `min_length=1`.
- `image_base64`: `str`, required, `min_length=1`.
- `attachment_name`: optional.

So the backend expects non-empty, valid base64 in `image_base64`. If the frontend sends something that passes Pydantic but fails `b64decode(..., validate=True)` or is longer than 10MB after decode, we get one of the two 400s above.

---

## 4. Possible causes of 400

### A. Image too large (max 10MB)

- **Backend:** `len(image_bytes) > 10 * 1024 * 1024` → 400 with message `"Image too large (max 10MB)"`.
- **Cropped export (49.33):**  
  `getExportCanvasDataURLCropped()` builds a canvas of size  
  `outW = Math.round((bboxW + 2 * EXPORT_CROP_PAD) * EXPORT_CROP_SCALE)`  
  and same for `outH` (with `EXPORT_CROP_PAD = 20`, `EXPORT_CROP_SCALE = 2`).  
  So output dimensions are `(bboxW + 40) * 2` and `(bboxH + 40) * 2`. There is **no cap** on `outW`/`outH`.
- For a large content bounds (e.g. blueprint 3000×2000 + padding), we get e.g. 6080×4080 pixels. A PNG of that size can easily exceed 10MB, so the backend would reject it with 400.

So **cropped export can produce a PNG &gt; 10MB** and trigger this 400, even though we did not change this path in 33.11.

### B. Invalid image_base64

- **Backend:** Any exception in `base64.b64decode(body.image_base64, validate=True)` → 400 with message `"Invalid image_base64"`.
- **Possible frontend causes:**
  1. **Data URL prefix not stripped:**  
     The strip is **case-sensitive**: `dataUrl.replace(/^data:image\/png;base64,/, '')`.  
     If the browser ever returned a different prefix (e.g. `data:image/PNG;base64,` or a space), the replace would not match and the frontend would send the full string (including `data:...`) as `image_base64`, which is not valid base64 → decode fails → 400.
  2. **Canvas too big or zero-size:**  
     Per MDN, if the canvas has zero dimensions or exceeds the implementation’s maximum size, `toDataURL('image/png')` can return `"data:,"`. Then:
     - Replace doesn’t match → `base64` would be the full string `"data:,"`.
     - Backend receives `image_base64: "data:,"` → decode fails or decodes to empty/wrong data → 400.
  3. **Tainted canvas:**  
     If the canvas is tainted (e.g. CORS), `toDataURL()` may throw; the code then falls back to `getExportCanvasDataURL()`. So we’d only send if one of the two exports succeeds. If in some edge case the returned string were malformed, we could still get invalid base64.

So **invalid base64** can come from prefix not stripped, or from `toDataURL` returning `"data:,"` when the canvas is invalid/oversized.

---

## 5. What was *not* changed

- **Request URL:** Still `POST /api/servicem8/upload-job-attachment`.
- **Headers:** Still `Content-Type: application/json`, `Authorization: Bearer <token>`.
- **Body shape:** Still `{ job_uuid, image_base64 }` (and optional `attachment_name`).
- **Source of image:** Still `getExportCanvasDataURLCropped() ?? getExportCanvasDataURL()`; **no** use of `getDiagramDataForSave()` or the downscaled Supabase path.
- **Backend validation:** Same `UploadJobAttachmentRequest`, same decode and 10MB check.

So “what was changed in how the request was sent” in **our** code: **nothing** in the last (33.11) change. The only way the request “changed” is if the **content** of the image (or its encoding) changed due to:

- Cropped export (49.33) producing a different (possibly larger or edge-case) PNG, or  
- Environment (browser, canvas limits, CORS/tainting) leading to a different or malformed data URL.

---

## 6. Recommended next steps (no code changes in this report)

1. **Identify the exact 400 message**  
   - In Railway (or local) logs: look for `"Upload job attachment: invalid base64"` (then the 400 is “Invalid image_base64”) or for the 400 response body.  
   - If the body says `"Image too large (max 10MB)"`, the cause is size.

2. **If it’s “Image too large”:**  
   - Consider capping the cropped export dimensions in `getExportCanvasDataURLCropped()` (e.g. max long side) so the PNG stays under 10MB, and/or consider a higher backend limit if acceptable.

3. **If it’s “Invalid image_base64”:**  
   - Log (or inspect) the first/last 50 chars and length of `body.image_base64` before decode to see if it’s still prefixed (`data:image/...`) or is `"data:,"`.  
   - Consider a more robust strip (e.g. case-insensitive or regex that accepts `data:image/png;base64,` with optional spaces) and/or handling of `"data:,"` (treat as error and don’t send, or fallback to full canvas export).

4. **Optional:** Add a short backend log line when returning 400 (e.g. “Invalid image_base64” vs “Image too large”) so future logs make the cause obvious without reading the response body.

---

## 7. Summary

| Question | Answer |
|----------|--------|
| Was the request *format* or *endpoint* changed in 33.11? | **No.** Only `getDiagramDataForSave()` was changed; ServiceM8 path untouched. |
| Where does the 400 come from? | Our backend; either **Invalid image_base64** or **Image too large (max 10MB)**. |
| Plausible causes? | (1) Cropped export PNG &gt; 10MB. (2) Data URL prefix not stripped (casing/format). (3) `toDataURL` returning `"data:,"` (oversized/zero canvas). |
| Next step? | Check logs/response for the exact 400 message, then apply fix for size and/or base64 handling as above. |
