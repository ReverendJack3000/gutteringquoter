---

## 29. Manual pop-up UI: metres, gutter/downpipe labels, colour states

*Context: Refine the manual length entry (badge popover + Measurement Deck) for clarity: use metres (not mm), distinguish element type in labels, and use colour to indicate completion.*

- [x] **29.1** Metres everywhere: Input and display lengths in metres. Badge popover label "Length (m)", placeholder "m", step 0.001. Measurement Deck cards show value in metres. Store internally in mm for backend compatibility; convert on input (m→mm) and display (mm→m).
- [x] **29.2** Unit suffix: When a value is entered, show a lowercase "m" after the number (e.g. "3.5m") on the badge and in the Measurement Deck so users know the unit is metres.
- [x] **29.3** Element-type labels: Replace "Run #N" with "Gutter #N" or "Downpipe #N" depending on element type (gutters vs downpipes/droppers). Use `isGutterElement` and downpipe patterns (DP-*, DPJ-*, dropper, DRP-*).
- [x] **29.4** Empty state (red): When no value is entered, badge number and deck card number/label use red (instead of blue) to indicate missing input.
- [x] **29.5** Filled state (green): When a value is entered, badge and Measurement Deck use an easy-to-read green for the number and accompanying measurement text to show completion.

*Section 29 status: Complete. Metres display, gutter/downpipe labels, and red/green colour states implemented.*

---

## 30. Expand image types for blueprint upload

*Context: Blueprint upload currently accepts JPEG, PNG, GIF, WebP. Expand to support clipboard pastes (desktop screenshots), HEIC (iPhone), and PDF (document format – requires conversion). The crop flow already outputs PNG; /api/process-blueprint should continue returning PNG so the canvas pipeline stays unchanged.*

**In scope:** JPEG, PNG, WebP (already supported); HEIC (iPhone photos); clipboard paste (Cmd+V/Ctrl+V for screenshots); PDF (first page only, via conversion).

**Out of scope:** BMP (obsolete for web; huge uncompressed files); TIFF (high-end printing, rarely used for web uploads); AVIF (too new/niche for construction); GIF (blueprints don't need animation).

**PDF is not an image format.** You cannot relax validation to support PDF. You must add a dedicated conversion step (frontend pdf.js or backend pdf2image/poppler) to convert the first page of the PDF into PNG/JPG so the canvas can draw it.

---

**Phased Implementation Strategy**

This feature touches frontend input, data processing, and backend decoding. Do **not** implement it all at once. Split into three isolated phases so that if one part breaks, the cause is clear and the core JPEG/PNG upload flow remains untouched.

| Phase | Scope | Risk | Rationale |
|-------|-------|------|-----------|
| **1** | Clipboard paste (frontend only) | Low | New way to enter existing flow; no changes to file input or drag-drop. |
| **2** | HEIC support (backend) | Medium | New library (pillow-heif); gate new logic behind file-type check so JPEG/PNG skip it. |
| **3** | PDF support (frontend conversion) | Medium | Convert PDF to image in browser; backend never sees PDF, receives only images. |

**Phase 1: Clipboard Paste (Frontend Only)** — maps to 30.3

- Add global `document.addEventListener('paste', ...)`.
- In handler: iterate `event.clipboardData.items`, find item where `type` starts with `image/`, call `.getAsFile()`.
- Pass the file directly to `showCropModal(file)`.
- **Constraint:** Do not modify file input or drag-and-drop logic yet. Just add this listener.

  *Prompt for Cursor:* "I need to implement Task 30.3 (Clipboard Paste). Please update app.js to add a global 'paste' event listener. Listen for the paste event on the document. Check event.clipboardData.items for an item where type starts with 'image/'. If found, extract the file using .getAsFile(). Pass this file directly to the existing showCropModal(file) function. Constraint: Do not modify the existing file input or drag-and-drop logic yet. Just add this new listener."

**Phase 2: HEIC Support (Backend Handling)** — maps to 30.2, 30.4

- Add `pillow-heif` to `requirements.txt`.
- In `blueprint_processor.py`: import `pillow_heif`; if input is HEIC, open with pillow-heif, convert to PIL Image, then to numpy array for OpenCV; else use existing `cv2.imdecode` path.
- Frontend: add `image/heic` to `ACCEPTED_IMAGE_TYPES` in app.js.
- **Verify:** Standard PNG uploads still work after changes.

  *Prompt for Cursor:* "I am moving to Task 30.2 and 30.4 (HEIC Support). Backend Changes: Add pillow-heif to requirements.txt. Modify blueprint_processor.py: Import pillow_heif. In process_blueprint, check if the file format is HEIC. If it is HEIC, use pillow_heif to open it, convert it to a standard PIL Image, and then convert that to the numpy array OpenCV expects. Ensure standard image formats (PNG, JPEG) continue to use the existing cv2.imdecode path to avoid regressions. Frontend Changes: Update ACCEPTED_IMAGE_TYPES in app.js to include 'image/heic'. Please verify that standard PNG uploads still work after these changes."

**Phase 3: PDF Support (Frontend Conversion)** — maps to 30.5

- Add pdf.js (pdfjs-dist) via CDN in `index.html`.
- In app.js file input change handler and drop handler: if `file.type === 'application/pdf'`, use PDF.js to render first page to canvas, convert canvas to PNG Blob/File, pass that to `showCropModal()`.
- Add `application/pdf` to `ACCEPTED_IMAGE_TYPES` (or equivalent allowlist).
- **Constraint:** PDF conversion must complete before crop modal opens; crop modal receives a valid image file, never a PDF.

  *Prompt for Cursor:* "Now I need to implement Task 30.5 (PDF Support) using a Frontend-only approach. Goal: Detect a PDF upload, convert the first page to an image (PNG), and pass that image to showCropModal. The backend should never see a PDF. Plan: Add pdfjs-dist (PDF.js) via CDN in index.html. In app.js, modify the file input change handler and drop handler: Check if the file type is 'application/pdf'. If it is, use PDF.js to render the first page of the PDF to an HTML Canvas. Convert that canvas to a Blob/File (PNG format). Pass the new PNG file to showCropModal(). Update ACCEPTED_IMAGE_TYPES to include 'application/pdf'. Constraint: Ensure the PDF conversion happens before the crop modal opens. The crop modal should receive a valid image file, not a PDF."

**Why this order:** Phase 1 validates that `showCropModal` handles files from different sources. Phase 2 touches the backend but protects existing flows with a file-type gate. Phase 3 acts as a frontend adaptor so the core app never changes its logic for documents.

---

**Tasks (reference; implement in phase order above):**

- [x] **30.1** Relax frontend MIME validation: Expand `ACCEPTED_IMAGE_TYPES` (app.js) to accept `image/jpeg`, `image/jpg`, `image/png`, `image/webp`, `image/heic`. Update file input `accept` attribute. Keep GIF allowed if already present. *(Done as part of Phase 2.)*
- [x] **30.2** Relax backend validation: Extend backend `file.content_type` check (main.py) to accept any `image/*` type. Pipeline and response format unchanged. *(Already accepts image/*; no change needed.)*
- [x] **30.3** Clipboard paste listener: Phase 1 — add paste listener, route image files to `showCropModal(file)`. Do not modify file input or drag-drop.
- [x] **30.4** HEIC and OpenCV-incompatible formats: Phase 2 — add pillow-heif fallback in `blueprint_processor.py` when cv2.imdecode returns None; standard formats use existing `cv2.imdecode` path.
- [x] **30.5** PDF support: Phase 3 — frontend-only; PDF.js (dynamic import) renders first page to canvas → PNG → `showCropModal()`. Backend never sees PDF.
- [x] **30.6** Update docs and UX: Error messages, file input `accept` attribute, and README to reflect supported types (JPEG, PNG, WebP, HEIC, PDF via conversion).

*Section 30 status: Complete. Phases 1–3 implemented; PDF.js version pin, HEIC module-level registration, and PDF error handling verified. BMP, TIFF, AVIF, GIF excluded from scope.*

---

## 31. Quote table inline quantity editing and indentation

*Context: Allow users to manually edit quantities of inferred items (brackets, screws, clips) in the quote table. When a user changes a quantity, the API call must include that new value. Also add visual indentation for Brackets and Screws under Gutters.*

**Logic updates (app.js)**

- [x] **31.1** Update `getElementsFromQuoteTable`: For quantity extraction, look for an `<input>` (`.quote-line-qty-input`) in the qty cell first; if present, use `parseFloat(input.value)`; otherwise fallback to `qtyCell.textContent` (or existing metresInput logic). Ensures manually typed quantities are sent to the backend.
- [x] **31.2** Update `calculateAndDisplayQuote`: In the `materialsToProcess.forEach` loop: (a) Render an `<input type="number">` with class `quote-line-qty-input` for the Quantity cell instead of plain text (for non-metres rows); (b) Apply indentation classes: `quote-product-indent-level-1` for BRK-/SCL-/ACL-, `quote-product-indent-level-2` for SCR-; (c) Attach `change` listener on the input: when user edits, remove `data-inferred` from the row (so it is sent as manual override) and call `calculateAndDisplayQuote()` to recalc totals.
- [x] **31.3** Update `copyQuoteToClipboard`: When building quote text, if qty cell contains `.quote-line-qty-input`, use `input.value` instead of `qtyCell.textContent`.

**CSS updates (styles.css)**

- [x] **31.4** Add `.quote-product-indent-level-1` and `.quote-product-indent-level-2` styles (padding, ↳ symbol); add `.quote-line-qty-input` styling (width, border, focus state).

**Integration notes**

- Preserve existing behaviour: gutter/downpipe rows with `.quote-qty-metres-input` (Metres?) remain unchanged; only non-metres quantity rows use the new input.
- Inferred items (brackets, screws, clips) currently have `data-inferred="true"` and are skipped by `getElementsFromQuoteTable`. When user edits the quantity input, removing `data-inferred` makes the row a manual override and it is sent to the backend.

*Section 31 status: Complete. All subtasks implemented.*

---

## 32. System-based quote (gutter system grouping)

*Context: Convert flat parts list to "System-Based" quote. Group gutter system items by profile (Storm Cloud, Classic). Header row shows total length and sum of children; child items (gutters, brackets, screws) indented underneath. Editing header length or child quantity updates totals.*

- [x] **32.1** Grouping logic: Group `quote.materials` by profile (SC/CL); identify header item (total measured length) and child items (stock lengths, brackets, screws).
- [x] **32.2** Section header: Render "Gutter System: [Profile] (X.XX m)" with editable metres input in Qty column; Total = sum of children.
- [x] **32.3** Child items: Sort gutters longest first, then brackets, then screws; apply indent level 1 (gutters, brackets), level 2 (screws).
- [x] **32.4** Wire header length: `getElementsFromQuoteTable` reads `.quote-header-metres-input` from section headers; bin-packs and sends gutter elements with `length_mm`; skips child gutter rows when header length present.
- [x] **32.5** Preserve manual entry: Capture `profileLengthOverride` from header inputs and `manualOverrides` from child inputs before rebuild; apply when rendering.
- [x] **32.6** Reactivity: Header metres input change/blur and child qty input change trigger `calculateAndDisplayQuote()`.

**Bug fixes (Feb 2026):**

- [x] **32.7** Fix incomplete state persistence: Track incomplete profiles before table rebuild; when profile has empty/invalid header input or incomplete measurement rows, render header with empty "Metres?" input and `quote-row-incomplete-measurement` class instead of defaulting to backend's "3m" value. Prevents incomplete gutter profiles from showing default quantities.
- [x] **32.8** Fix child gutter quantity display: When header length changes and bin-packing recalculates, ignore old `manualOverrides` for gutter rows and use backend's `line.qty` values. Ensures child gutter row quantities display correctly when header length is updated multiple times (quantities now match bin-packed results from backend).

*Section 32 status: Complete. Header length input wired; manual overrides preserved. Bug fixes: incomplete state persistence and child gutter quantity display.*

---

## 34. Auth, multi-tenancy, and per-user data

*Context: Password protection, tenant isolation, and per-user saved files for multi-user use.*

- [x] **34.1** Password protection and multi-tenancy: implement auth (e.g. login) and tenant isolation so each tenant’s data is separated.
- [x] **34.2** Allow each user to have their own saved files (per-user storage for project files; depends on auth and save/load project files).

---

## 35. App views: Login, Canvas, Products (navigation)
