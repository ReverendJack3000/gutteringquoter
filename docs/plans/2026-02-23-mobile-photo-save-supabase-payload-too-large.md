# Plan: Mobile photo save – Supabase "Payload too large" (blueprint.png)

**Date:** 2026-02-23  
**Goal:** Allow mobile photos to be taken, uploaded, and properly flow through to ServiceM8. Currently **Save diagram** (and thus any flow that persists the diagram with blueprint) fails when the blueprint PNG exceeds Supabase Storage’s maximum object size. **Do not change code in this task – plan only.**

---

## 1. Error observed

- **User action:** Standard photo taken on mobile, then save (or autosave / Add to Job with auto-save after).
- **Backend error:**  
  `Upload blueprint/thumbnail failed, rolling back diagram …`  
  `Create diagram failed: Failed to store blueprint image: {'statusCode': 400, 'error': 'Payload too large', 'message': 'The object exceeded the maximum allowed size'}`  
  `storage3.utils.StorageException` on  
  `supabase.storage.from_(BUCKET).upload(path, blueprint_bytes, {"content-type": "image/png"})`
- **Meaning:** The `blueprint.png` payload (bytes) sent to Supabase Storage is larger than the bucket’s maximum allowed object size. The diagram row is created, then the upload fails, then the diagram is rolled back (deleted).

---

## 2. Two separate flows (don’t confuse)

| Flow | What gets stored | Current behaviour |
|------|-------------------|-------------------|
| **ServiceM8 job attachment** (Add to Job / Create New Job) | PNG sent to ServiceM8 API (job diary) | **Fixed in 49.33:** Uses cropped export (`getExportCanvasDataURLCropped()` then fallback). Small, content-only PNG. Works. |
| **Save diagram** (Save button, autosave, auto-save after Add to Job) | `blueprint.png` uploaded to **Supabase Storage** for the saved diagram | **Failing:** Blueprint PNG is full size (see below). Often exceeds Supabase limit for a standard phone photo. |

- **“Original state that allowed the upload from mobile but had a massive canvas size”:** That was the **ServiceM8 attachment** path – it used full canvas size (`getExportCanvasDataURL()` → full `state.canvasWidth` × `state.canvasHeight`), so the image had lots of white space but the upload to ServiceM8 **succeeded**. We then changed that path to use a **cropped** PNG (49.33), which is correct.
- **Current failure** is **not** ServiceM8; it is **Save diagram** → Supabase Storage. So the fix is about the **size of the blueprint PNG we send when saving the diagram**, not about the ServiceM8 attachment.

---

## 3. Where the oversized blueprint comes from (save path)

1. **Frontend – blueprint PNG for save**  
   **File:** `frontend/app.js`  
   **Function:** `getDiagramDataForSave()` (around **9531–9630**).  
   - It builds `blueprintImageBase64` by drawing the current blueprint onto a canvas sized by **blueprint transform dimensions**:  
     `c.width = Math.max(1, Math.round(bt.w));`  
     `c.height = Math.max(1, Math.round(bt.h));`  
     (around **9559–9560**), then `ctx.drawImage(state.blueprintImage, 0, 0, c.width, c.height)` and `c.toDataURL('image/png')`.  
   - So the PNG dimensions are **bt.w × bt.h** (logical blueprint size). For a mobile photo, after `/api/process-blueprint`, the image (and hence `state.blueprintTransform.w` / `.h`) can be large (e.g. 2000×1500 or more), so the PNG is multi‑megapixel and can be several MB.

2. **Who calls getDiagramDataForSave and sends to backend**  
   - **Manual Save:** e.g. save diagram flow that POSTs to `/api/diagrams` (search for `getDiagramDataForSave` and `POST /api/diagrams` or `fetch('/api/diagrams'` in `app.js` – around **9651**, **11114**, **9370+** for autosave).  
   - **Auto-save after Add to Job:** `autoSaveDiagramWithJobNumber()` (around **9635–9665**) calls `getDiagramDataForSave()` and POSTs to `/api/diagrams` with `blueprintImageBase64`.

3. **Backend – upload to Supabase**  
   - **File:** `backend/main.py`  
   - **Endpoint:** `api_create_diagram` (around **860–876**).  
   - Decodes `body.blueprintImageBase64` to `blueprint_bytes` (**862**) and passes it to `create_diagram(..., blueprint_bytes=blueprint_bytes, ...)` (**865–869**).  
   - **File:** `backend/app/diagrams.py`  
   - **Function:** `create_diagram()` (**100–156**).  
   - Upload: **131–133** – `supabase.storage.from_(BUCKET).upload(path, blueprint_bytes, {"content-type": "image/png"})`.  
   - Supabase returns 400 "Payload too large" when `blueprint_bytes` exceeds the bucket’s max object size.

4. **Where blueprint size is set**  
   After the user selects/crops and the image is processed:  
   - **File:** `frontend/app.js`  
   - **Function:** `processFileAsBlueprint()` (around **8508–8568**).  
   - On success it sets `state.blueprintTransform = { x: 0, y: 0, w: img.width, h: img.height, ... }` (around **8548**).  
   - `img` is the `Image()` that loaded the blob returned by `/api/process-blueprint`. So **bt.w / bt.h** are the dimensions of the **processed** blueprint image (whatever the backend returns). Backend: **`backend/main.py`** `api_process_blueprint` (around **815–834**), **`backend/app/blueprint_processor.py`** `process_blueprint()` – returns PNG bytes; dimensions depend on input and OpenCV/processing.

---

## 4. Key file and line references (for a new chat)

- **Frontend – export blueprint for save (source of size):**  
  `frontend/app.js` – `getDiagramDataForSave()` – **9556–9571** (canvas `c.width`/`c.height` = `bt.w`/`bt.h`, draw and `toDataURL`).
- **Frontend – where save payload is built and sent:**  
  `frontend/app.js` – calls to `getDiagramDataForSave()` and `fetch('/api/diagrams', …)` – e.g. **9651**, **11114**, **9370+** (autosave), **9635–9665** (`autoSaveDiagramWithJobNumber`).
- **Frontend – blueprint dimensions set after upload:**  
  `frontend/app.js` – `processFileAsBlueprint()` – **8546–8554** (`state.blueprintTransform = { …, w: img.width, h: img.height, … }`).
- **Backend – create diagram and upload:**  
  `backend/main.py` – **860–876** (`api_create_diagram`, decode `blueprintImageBase64` → `blueprint_bytes`).  
  `backend/app/diagrams.py` – **100–143** (`create_diagram`, upload at **131–133**; rollback and raise at **138–142**).
- **ServiceM8 attachment (already fixed, for context):**  
  `frontend/app.js` – `getExportCanvasDataURLCropped()` (around **8987**), used at **3375** (Add to Job) and **3424** (Create New Job). Do **not** change this for the save flow; keep using cropped export only for ServiceM8.

---

## 5. Fix directions (for implementation in a new chat)

- **Constraint:** Supabase Storage has a per-object size limit. The blueprint PNG sent for **saved diagrams** must stay under that limit (check Supabase project → Storage → bucket limits).
- **Options (pick one or combine):**
  1. **Frontend – downscale blueprint when generating `blueprintImageBase64` in `getDiagramDataForSave()`:** If `bt.w` or `bt.h` (or estimated PNG size) exceeds a threshold, draw the blueprint into a smaller canvas (e.g. max 1200 or 1600 on the long side) before `toDataURL('image/png')`. Keep aspect ratio. That reduces payload size for Save without changing ServiceM8 behaviour.
  2. **Backend – resize before upload:** In `create_diagram()` (or a helper), if `len(blueprint_bytes)` (or image dimensions after decode) exceeds a threshold, resize the image (e.g. with PIL/Pillow) to a max dimension and re-encode as PNG, then upload. Keeps frontend unchanged but adds backend work and dependency.
  3. **Supabase – increase bucket limit:** If the project can allow larger objects, increase the limit in Supabase. Does not fix very large photos; only helps near the current limit.

Recommendation: **Option 1** (frontend downscale in `getDiagramDataForSave()`) so one code path controls size, no backend change, and mobile saves stay under the limit. Option 2 is valid if you prefer to enforce size only at the backend.

---

## 6. What not to change

- **ServiceM8 attachment:** Keep using `getExportCanvasDataURLCropped() ?? getExportCanvasDataURL()` for Add to Job and Create New Job. Do not use the save blueprint for ServiceM8.
- **Crop modal (mobile):** The crop preview fix (defer draw + capped fallback canvas) stays; it prevents the **crop** UI from glitching. It does not change the size of the image sent to `/api/process-blueprint` or the size of the blueprint stored on the diagram.
- **Export PNG download:** Can remain full canvas; no need to tie it to this fix unless you want consistent behaviour.

---

## 7. Summary

| Item | Detail |
|------|--------|
| **Error** | Supabase Storage 400 "Payload too large" when uploading `blueprint.png` in `create_diagram`. |
| **Cause** | Save diagram sends a full-size blueprint PNG (bt.w × bt.h from `getDiagramDataForSave()`), which for a standard mobile photo can exceed the bucket limit. |
| **Scope** | **Save diagram** path (manual Save, autosave, auto-save after Add to Job). ServiceM8 attachment path is already fixed (cropped) and is separate. |
| **Fix** | Ensure the blueprint PNG sent to the backend for save (and thus to Supabase) is under the limit – e.g. downscale in `getDiagramDataForSave()` when dimensions (or size) exceed a threshold. |
| **Key references** | `frontend/app.js`: `getDiagramDataForSave()` 9531–9630 (esp. 9556–9571), `processFileAsBlueprint()` 8546–8554, save/autosave call sites 9651, 11114, 9370+, 9635–9665. `backend/main.py`: 860–876. `backend/app/diagrams.py`: 100–143, upload 131–133. |

Use this plan in a **new chat** to implement the fix so mobile photos can be saved and still flow correctly to ServiceM8 (attachment remains cropped; save succeeds).
