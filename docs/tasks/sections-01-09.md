## 1. Project setup and environment

- [x] **1.1** Create project folder structure (e.g. `frontend/`, `backend/`, `assets/` or `public/`)
- [x] **1.2** Initialise backend (Node + Express **or** Python + Flask/FastAPI); add `package.json` / `requirements.txt`
- [x] **1.3** Configure backend to serve static frontend and CORS for local dev
- [x] **1.4** Add a single HTML entry point (or SPA entry) and confirm app loads on `localhost`
- [x] **1.5** Add a basic script or route to verify backend and frontend communicate (e.g. health check or test API call)

---

## 2. Page layout (desktop)

- [x] **2.1** Implement CSS layout: left 2/3 (blueprint workspace), right 1/3 (Marley panel)
- [x] **2.2** Make right panel collapsible (collapsed = narrow strip with left-facing chevron icon only; click to expand)
- [x] **2.3** Ensure blueprint area and panel are responsive to window resize (layout reflows correctly)
- [x] **2.4** Add canvas element in left area that fills the 2/3 column (correct dimensions and scaling)
- [x] **2.5** Add resizable divider between blueprint area and right panel (drag to change width)

---

## 3. Backend: blueprint image processing

- [x] **3.1** Add image upload route (e.g. `POST /api/process-blueprint` or `/api/upload`)
- [x] **3.2** Implement pipeline: receive file → grayscale → blur → edge detection (e.g. Canny) → optional invert/cleanup
- [x] **3.3** Return processed image as PNG (or base64) with correct headers
- [x] **3.4** Add basic validation (file type, size limit) and error responses
- [x] **3.5** (Optional) Add a simple test script or curl example to verify pipeline with a sample image

---

## 4. Photo upload and blueprint display (frontend)

- [x] **4.1** Add file input (accept images) and upload trigger (button or drop zone)
- [x] **4.2** Send selected file to backend process endpoint and handle response (image or base64)
- [x] **4.3** Draw returned blueprint image onto canvas as base layer; scale to fit 2/3 area
- [x] **4.4** Store blueprint image and scale/offset for coordinate mapping (screen ↔ canvas)
- [x] **4.5** Handle loading and error states (spinner, error message)
- [x] **4.6** Drag-and-drop: allow dropping image files onto the blueprint area (same validation as upload; visual feedback when dragging over)

---

## 5. Marley products panel (right column)

- [x] **5.1** Define product data shape (id, name, category, thumbnailUrl, diagramUrl) and create initial list/JSON
- [x] **5.2** Add or placeholder Marley guttering diagram assets (B&W line style) and serve them (static or via API)
- [x] **5.3** Build panel header: title “Marley products” + collapse toggle
- [x] **5.4** Build scrollable thumbnail grid/list; each thumbnail shows product image and is draggable (drag source)
- [x] **5.5** Implement collapse behaviour: narrow width; collapsed = only left-facing chevron icon (Apple-style minimal button)
- [x] **5.6** Add search bar in panel header when open (wire for future filter/search)

---

## 6. Drag-and-drop: panel → blueprint

- [x] **6.1** Implement drag start on thumbnail (set drag data: product id or diagram URL)
- [x] **6.2** Implement drop on canvas: convert drop (x, y) to canvas coordinates
- [x] **6.3** Create new element object (id, assetId, x, y, width, height, rotation, zIndex) and add to elements array
- [x] **6.4** Draw all elements on top of blueprint (translate → rotate → draw image → restore); maintain draw order (zIndex)
- [x] **6.5** Ensure new elements appear at correct position and scale (default size) and are visible

---

## 7. Canva-style element interaction (selection, move, resize, rotate)

- [x] **7.1** Implement hit testing: map mouse (x, y) to canvas coords; test against each element’s bounds (reverse z-order); set selected element
- [x] **7.2** When one element selected: draw bounding box (e.g. dashed) and handles (4 corners + 1 rotate handle at top-center)
- [x] **7.3** Deselect: click on empty canvas or Escape key
- [x] **7.4** Move: on mousedown on selected element, set “dragging”; mousemove updates x,y; mouseup clears dragging
- [x] **7.5** Resize: mousedown on corner handle → “resizing” + which handle; mousemove updates width/height (aspect ratio locked for MVP)
- [x] **7.6** Rotate: mousedown on rotate handle → “rotating”; mousemove computes angle from element center to cursor, updates element.rotation
- [x] **7.7** Ensure handles and bounding box use same transform (rotation) as element for correct positioning
- [x] **7.8** Prevent canvas drag/scroll from triggering element drag when intended (e.g. only move when drag starts on element)
- [x] **7.9** Gutter rotation constraint: gutter elements cannot be rotated into the band 60°–80° (config in ROTATION_CONSTRAINTS.gutter); clamp to nearest boundary with hysteresis; Alt key overrides; visual feedback when at limit (cursor not-allowed, tooltip "Max angle")
- [ ] **7.10** Revisit gutter rotation constraint: consider E2E for Alt override, hysteresis tuning, or other UX polish; feature implemented in app.js + Puppeteer tests (programmatic clamp and drag-forbidden-band).
- [x] **7.11** Element transform: add horizontal and vertical flip (flip controls) while preserving the element’s rotation and size.

---

## 8. Export and basic polish

- [x] **8.1** Add “Export” or “Save blueprint” button; draw full scene (blueprint + all elements) and export as PNG (e.g. download)
- [x] **8.2** Desktop testing at 1280×720 and 1920×1080; verify layout, collapse, and interactions
- [x] **8.3** Basic error handling: invalid file type, upload/process failure, empty selection where relevant
- [x] **8.4** (Optional) Simple instructions or labels for first-time use (e.g. “Upload a photo”, “Drag products onto blueprint”)

---

## 9. Deferred (post-MVP)

- Search and filter in Marley panel
- Save/load project (e.g. localStorage or backend)
- Undo/redo
- Snap to grid or angle
- Measurement tools
- Mobile layout
- User accounts / auth

---

