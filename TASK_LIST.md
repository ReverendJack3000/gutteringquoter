# Quote App – MVP Task List

**This file is the single authoritative task tracking document for this project.** All progress, scope, and completion status are tracked here. Do not maintain a separate or duplicate task list elsewhere (e.g. in other docs or issue trackers) for this project’s tasks.

Task list for the property photo → repair blueprint web app (desktop-first, 2/3 blueprint + collapsible Marley panel, Canva-style elements).

---

## 🔁 Current Working Branch

- Branch: main
- Status: Stable

---

## Locked decisions

| Area | Choice | Notes |
|------|--------|------|
| **Backend** | Python (FastAPI) | Scalable, maintainable; API-ready for future integrations |
| **Blueprint style** | Technical drawing | Clean lines; toggle filter on/off in UI |
| **Marley products (MVP)** | 6 types: gutter, downpipe, bracket, stopend, outlet, dropper | User will upload real diagram images when ready; use placeholders until then |
| **Panel collapsed** | Small Apple-style strip with left-facing chevron icon only | Click to expand; minimalist, no thumbnails when collapsed |
| **Divider** | Resizable | User can drag to change width between blueprint area and panel |
| **Search** | Search bar visible when panel is open | Filter/search ready for later enhancement |
| **Export** | PNG only for MVP | |
| **Port** | Default (e.g. 8000 for FastAPI) | |
| **Codebase** | From scratch | |
| **Data / products** | Supabase (Jacks Quote App) | `public.products`; backend requires `.env` with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY |

---

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
- [ ] **7.11** Element transform: add horizontal and vertical flip (flip controls) while preserving the element’s rotation and size.

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

## 33. Save/Load project files

*Context: Allow users to persist and reload full diagram/blueprint state as project files.*

- [x] **33.1** Ability to save diagrams/blueprints as project files (e.g. export to .json or save to backend; load from file or backend to restore blueprint + elements + view state).

---

## 10. Infrastructure and tooling

- [x] **10.1** Document backend/database requirements and Supabase project (docs/BACKEND_DATABASE.md, SUPABASE_SETUP.md)
- [x] **10.2** Create Supabase project (Jacks Quote App) and `public.products` table with RLS and seed data
- [x] **10.3** Add Supabase client to backend (env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY); products always from Supabase
- [x] **10.4** Add E2E tests (Puppeteer): npm test, scripts/run-e2e.sh; verify app shell, panel, products
- [x] **10.5** Add Cursor rule to use Supabase MCP when working on database-related code or schema
- [x] **10.6** Troubleshooting and README: Supabase required for server start, local testing, E2E setup
- [x] **10.7** Add E2E test for drag-and-drop Marley product onto blueprint (simulate drop, assert element added)
- [x] **10.8** Local server: Ensure the app can be run as a local server with a single command and clear documentation (run from backend, serve frontend, optional health check).

---

## 11. Photo upload and Marley product enhancements

- [x] **11.1** Photo upload: add ability to crop the image before processing (e.g. crop UI or predefined aspect ratio)
- [x] **11.2** Photo upload: ensure uploaded/processed image does not lose details (e.g. preserve resolution, avoid over-compression, or offer quality options)
- [x] **11.3** Marley products: allow user to change the colour of placed products on the blueprint (per-element colour picker or palette)
- [x] **11.4** Blueprint image: make the uploaded/blueprint image selectable like elements — click to select, then resize (e.g. smaller), rotate, and optionally reposition (same interaction model as Marley product elements)

---

## 12. Whiteboard and colour UX refinements

- [x] **12.1** Replace toolbar colour picker with contextual colour palette: 5–6 primary colours in a slick Apple-style palette, shown only when an element is selected (e.g. popover near the selection or below it); remove the colour picker from the top toolbar.
- [x] **12.2** Frame the canvas as a Canva-style whiteboard: treat the grey area as a whiteboard where users can drag multiple images and elements, rotating, resizing, and dragging them; ensure UX and any instructional copy reflect this whiteboard metaphor.
- [x] **12.3** Canvas zoom and pan: add zoom in/out (e.g. wheel + toolbar buttons) and pan (drag empty area) so the full uploaded image is viewable and not severely cut off; optional “Fit” to reset view.
- [x] **12.4** Smooth Canva/Freeform-style whiteboard: scroll moves canvas only (elements stay put); pan bounded so content cannot be panned out of view (padding from edge); Ctrl/Cmd+wheel zooms toward cursor, wheel pans; grab/grabbing/move cursor feedback; user-select/touch-action to avoid accidental text selection; E2E coverage for zoom and cursor with content.

---

## 13. Canvas element sizing and isolation (sleek, error-proof UI)

- [x] **13.1** Ensure dropped elements do not affect other elements (add-only; no repositioning or resizing of existing elements).
- [x] **13.2** Uniform placed-element size: use a single reference pixel size (e.g. 400px) and place all new elements at ~1/5 of that (e.g. 80px max dimension) for a consistent, smooth UI.
- [x] **13.3** Size dropped elements from asset aspect ratio (support portrait and landscape, including 9:16); max dimension = reference/5, preserve aspect ratio.
- [ ] **13.4** (Optional) If supporting uploaded images as canvas elements (not just blueprint): apply same uniform sizing when adding image elements to the whiteboard.
- [ ] **13.5** (Optional) Add minimum size guard so very small assets remain visible; add maximum size guard so one large drop doesn’t dominate the view.

---

## 14. Interaction polish and undo

- [x] **14.1** Fix jumpy/clunky behaviour when moving, resizing, or rotating elements or the uploaded blueprint: freeze the view transform (base scale and offset) during any interaction so the canvas does not re-fit every frame; re-fit only when the user releases (mode becomes null).
- [x] **14.2** Undo most recent action: Ctrl+Z (Windows/Linux) / Cmd+Z (Mac) restores the canvas and elements to the state before the last action (element or blueprint move, resize, rotate, or new element drop); ignore when focus is in an input or textarea; cap history (e.g. 50 steps).
- [x] **14.3** Ensure Cmd+Z / Ctrl+Z undoes blueprint diagram uploads (revert to no blueprint) and element movement/placement; maintain history cap and consistent undo stack.

---

## 15. Visual feedback, accessibility, and placeholder (from UI_REFINEMENTS_ANALYSIS)

- [x] **15.1** Hover feedback: when not dragging, set cursor to `move` over an element or the blueprint, and `grab` over empty canvas when content exists.
- [x] **15.2** Subtle hover outline on elements before selection (e.g. light blue stroke when pointer is over element, not selected).
- [x] **15.3** Smooth transitions: cursor transition and fade-in for selection/colour palette popover (CSS).
- [x] **15.4** Handle cursors: show resize cursors (nw-resize, ne-resize, etc.) when hovering over selection handles.
- [ ] **15.5** (Optional) Live dimension display during resize (e.g. "120 × 80").
- [ ] **15.6** (Optional) Live angle display during rotate and Shift for 15° snap.
- [x] **15.7** Remove placeholder text once either an element is dropped or a file is uploaded to the whiteboard; show placeholder again only when canvas has no blueprint and no elements.
- [x] **15.8** Delete/Backspace: remove selected element from canvas; ignore when focus is in input/textarea.
- [x] **15.9** Arrow key nudging: move selected element by 1px; Shift+Arrow by 10px; ignore when focus is in input/textarea.
- [x] **15.10** Duplicate: Ctrl/Cmd+D duplicates the selected element and selects the copy; ignore when focus is in input/textarea.
- [x] **15.11** Marquee selection (click-and-drag on empty canvas): Window (left-to-right) = select only elements fully enclosed; Crossing (right-to-left) = select any element touched; marquee fill `rgba(24, 160, 251, 0.1)` and blue border.

**Interaction Polish (Visual Friction)**

- [x] **15.12** Smart Snapping (The "Magnetic" Feel): Implement a 5px snapping threshold. When dragging an element, if its edge or center-line aligns with another element, "snap" the position and show a thin #FF00FF (magenta) guide line.
- [x] **15.13** Proximity-Based Handles: Handles should scale up (e.g., 1.0x → 1.2x) when the mouse gets within 10px of them. This makes small hitboxes feel much easier to click.
- [x] **15.14** Rotation "Haptic" Snapping: If Shift is held, snap rotation to 15° increments. Without Shift, provide a subtle "magnetic" pull toward 0°, 90°, 180°, and 270°.

---

## 16. Stable viewport and Canvas Porter

- [x] **16.1** Stable viewport (Option A): Remove auto-refit after resize, move, or rotate. Keep baseScale and baseOffset static; do not call `scheduleBboxRecalcDebounce()` on pointerup for these modes so the canvas does not zoom/pan ~100ms after release.
- [x] **16.2** Add “Recenter View” button to toolbar; on click, force full view re-fit (recompute baseScale/baseOffset from content and redraw).
- [x] **16.3** Trigger full view re-fit when a new blueprint is uploaded (call `draw()` after setting blueprint image and transform in `img.onload`).
- [x] **16.4** Canvas Porter – Auto-Scale: Normalize imported parts with scale = min(MaxUnit/width, MaxUnit/height); MaxUnit = 150px; apply on element drop and center-drop.
- [x] **16.5** Canvas Porter – Aspect lock: Default to lock aspect ratio during resize; user must hold **Alt** to warp (flip from previous Shift-to-lock behaviour).
- [x] **16.6** Canvas Porter – Handle padding: Add 10px “Safe Zone” transparent padding around the part inside its selection box so handles don’t overlap the part edges; use padded box for drawing and hit-testing.
- [x] **16.7** Canvas Porter – Center-Drop: When a product is **clicked** (not dragged) in the sidebar, place it at the centre of the current viewport at normalized size.
- [x] **16.8** E2E: Add tests for Recenter View button, stable viewport (no refit within 250ms after interaction), import normalization (max dimension ≤ 150px after drop), center-drop (click adds one element), and resize/rotate using real mouse and selection-box handle positions (`__quoteAppGetSelectionBoxInCanvasCoords`); document manual checks in README (aspect lock, handle padding, viewport behaviour).
- [x] **16.9** Add E2E/test hooks: `__quoteAppGetViewport`, `__quoteAppGetElements`, `__quoteAppGetSelectionBoxInCanvasCoords`; add `aria-label` on canvas and product thumbs for accessibility and automation.

---

## 17. Layering and Target Selection (The "Stacking" Fix)

*Context: The blueprint (Task 11.4) is selectable and has a large bounding box, so it can "steal" clicks from smaller Marley parts. Treat the blueprint as the **bottom** layer and parts as **top**; allow the blueprint to be moved only when explicitly targeted.*

- [x] **17.1** Z-Index Sorting: Ensure the elements array is always sorted by a `zIndex` property before drawing. New products are assigned `max(existing zIndex) + 1`. The blueprint image should be initialized with `zIndex = -1` (or equivalent) so it is drawn and hit-tested as the back layer.
- [x] **17.2** Top-Down Hit Testing: On canvas click, iterate through drawable items in **reverse order** (top-most first). The first item that hits (element or blueprint) becomes the selection. This prevents the large blueprint from blocking small parts when the user clicks on a part.
- [x] **17.3** "Drill-Through" Selection: If an element (or the blueprint) is already selected and the user clicks again in the **same spot**, select the next item down in the stack (next in reverse-z order). Repeat on further clicks to cycle through overlapping items. Matches Canva-style overlapping selection. (Implemented with Alt/Option key gating: only cycle when Alt held; otherwise keep selection for immediate drag.)
- [x] **17.4** Explicit Blueprint Lock: When the blueprint is selected, show a "Lock" control (e.g. small padlock icon). While locked, exclude the blueprint from hit-testing so it cannot be selected or moved; users can drag and select parts over it without accidentally moving the background. Unlock to move/resize the blueprint again.
- [x] **17.7** Lock uploaded picture to background: Allow the user to lock the position of the uploaded picture (blueprint) so it stays fixed as the background, making it easier to place and manipulate elements without accidentally moving or selecting the photo.
- [x] **17.5** Non-destructive Color Tinting: Implement offscreen canvas masking for color changes; ensure the original B&W asset is preserved in memory so colors can be changed multiple times without "losing" the diagram.
- [x] **17.6** Alpha Masking Logic: Use globalCompositeOperation: 'destination-in' to ensure only the lines of the diagram are colored, preserving the transparent background of the product.

---

## 18. Advanced Transform Handles (The "Canva" Look)

- [x] **18.1** Refined Handles: Implement "stem" rotation handle and constant-pixel-width bounding box lines.
- [x] **18.4** Context-Aware Cursors: Map cursor icons to handle types; rotation-specific cursor (grab) when hovering the "tail" (stem or handle).
- [x] **18.5** Forgiving Hit-Boxes: Separate draw (4px pill) from hit-test (15px thick) for pill handles to improve clickability (Fitts's Law).
- [x] **18.6** Visual Layering: White fill on handles; 50% opacity rotation stem; rotate handle has subtle 1px border so it pops off the blueprint.
- [x] **18.7** Local Space Resizing: Inverse-rotation mouse mapping so resizing rotated elements is stable (no jump).
- [x] **18.8** Dynamic Rotation Cursor: Double-sided curved-arrow SVG cursor (via `getRotationCursor(angle)`) that follows element.rotation + 90° on hover and during rotate; fluid Canva feel.
- [x] **18.9** Rotated Handle Hit Test: Fix `hitTestHandle` to use `displayToHandleLocal` so the correct handle is selected at any rotation (no inversion at 180°); update `__quoteAppGetSelectionBoxInCanvasCoords` to return rotated handle positions for E2E.
- [x] **18.10** Rotation-Aware Resize Cursors: Implement `getCursorForHandle(handleId, rotation)` so resize cursors (n-resize, e-resize, etc.) match the visual direction of handles when the element is rotated.
- [x] **18.11** Rotate Handle Accessibility: Longer tail (ROTATE_HANDLE_OFFSET 40px); larger hit area (ROTATE_HANDLE_PROXIMITY_PX 20, stem 16px); floating toolbar uses `pointer-events: none` so clicks pass through to canvas; resize handles checked before rotate in `hitTestHandle` so North pill takes priority over overlapping rotate tail.

---

## 19. Blueprint Disappearance Fix (Color Tinting Diagnostics and Fixes)

*Context: After coloring an element, the blueprint and other elements can disappear. This section adds diagnostic tools and fixes to identify and resolve the root cause.*

**Phase 1: Diagnostic Instrumentation**

- [x] **19.1** Enhance `__quoteAppGetElementColorInfo` helper: add `originalImageSrc`, `originalImageWidth`, `originalImageHeight`, `tintedCanvasValid` (checks dimension match), `tintedCanvasNullWhenColored` (detects missing tint when color exists).
- [x] **19.2** Add blueprint/element image comparison helper: `__quoteAppDumpImageInstances(elementId)` logs blueprint and element image sources/instances to detect shared Image objects.
- [x] **19.3** Add asset transparency checker: `__quoteAppCheckAssetTransparency(image)` samples corner pixels and returns transparency report.
- [x] **19.4** Instrument layer sorting: add `__quoteAppGetLayerOrder()` helper and logging before/after `layers.sort` in `draw()` to track blueprint layer presence.
- [x] **19.5** Wrap `createTintedCanvas` in error handling: try/catch around entire function, assert `ctx !== state.ctx`, log errors with context (element ID, color, dimensions).

**Phase 2: Palette Handler Instrumentation**

- [x] **19.6** Add logging in `initColorPalette`: before/after color change, log `state.blueprintTransform`, layers array, element color info to capture state changes.

**Phase 3: Root Cause Fixes**

- [x] **19.7** Fix cache invalidation: ensure `tintedCanvasWidth/Height` are set correctly and invalidate cache when dimensions change during resize.
- [x] **19.8** Fix image instance sharing: ensure blueprint and elements use separate Image instances; clone images if sharing detected.
- [x] **19.9** Fix layer ordering: ensure blueprint layer always added to layers array; prevent `state.blueprintTransform` mutation during color changes.
- [x] **19.10** Handle opaque assets: detect fully opaque assets in `createTintedCanvas`, warn user or switch to luminance-based tinting.
- [x] **19.11** Improve error recovery: fallback to `originalImage` if `createTintedCanvas` fails; show user-friendly error message.

---

## 20. Fix the "Jumpy" Resize (Anchor-Based Math)

*Context: Resize can feel jumpy because the element expands from the center. The fix is to use an anchor point so the opposite corner stays fixed.*

**Logic change:** Instead of expanding from the center, identify the **anchor point** (the corner opposite the dragged handle), lock it in place, and calculate the new size and position relative to that locked point. The dragged handle moves with the mouse; the opposite corner does not move.

- [x] **20.1** Implement anchor-based resize: for each resize handle, define the opposite corner as the anchor; keep anchor fixed in canvas space; compute new width, height, and element position from the anchor and the current mouse position (in local space for rotated elements, per 18.7).
- [ ] **20.2** Ensure E2E "Resize: size did not change as expected" passes (or update test if behaviour change is intentional).

---

## 21. Transparency Slider for Background Image

*Context: Add a transparency slider for the blueprint (background image). A dedicated checkerboard button (#blueprintTransparencyBtn) at the blueprint top-left is the only way to open the slider; it works even when the blueprint is locked. Visible when blueprint exists AND Technical Drawing mode is OFF. Implementation is additive and safe: state.blueprintTransform is extended with `opacity`; existing undo/restore logic uses spread and will preserve it; draw/export apply `bt.opacity ?? 1` so older snapshots without opacity default to 1.*

**Safety analysis (do not implement yet):**

- **State & Undo:** `cloneStateForUndo` uses `{ ...state.blueprintTransform }` — opacity is copied. `restoreStateFromSnapshot` uses `{ ...snapshot.blueprintTransform }` — opacity is restored. Old snapshots lack opacity; use `bt.opacity ?? 1` when reading. Safe.
- **Blueprint creation:** Two sites create blueprintTransform: `processFileAsBlueprint` and technical-drawing toggle. Both recreate the object; add `opacity: 1`. Safe.
- **Draw loop:** Blueprint layer already uses `ctx.globalAlpha` for element-selected dim (0.7). Combine: `ctx.globalAlpha = (bt.opacity ?? 1) * (state.selectedId ? 0.7 : 1)`. Safe.
- **Export:** Apply `ex.globalAlpha = bt.opacity ?? 1` before drawing the blueprint so exported PNG matches on-screen transparency. Safe.
- **Technical Drawing:** Slider hidden when `technicalDrawing === true`. When toggle runs, blueprint is reprocessed and blueprintTransform is recreated with default `opacity: 1`. Safe.
- **Color handler:** Does not touch blueprintTransform; no conflict. Safe.

**Tasks (implement in order):**

- [x] **21.1** State & Undo: Add `opacity: 1` to blueprintTransform in `processFileAsBlueprint` and technical-drawing toggle handlers. Confirm `cloneStateForUndo` / `restoreStateFromSnapshot` preserve opacity via spread (no code change needed; verify). Use `bt.opacity ?? 1` wherever opacity is read.
- [x] **21.2** HTML: Add `#blueprintTransparencyBtn` and `#transparencyPopover` in `index.html` (inside blueprint-wrap). Popover: label "Transparency", range input (0–100), number input. Both `hidden` initially.
- [x] **21.3** CSS: Style `#transparencyPopover` and `#blueprintTransparencyBtn` (checkerboard pattern). Slider track/thumb blue (#18A0FB). Use `pointer-events: none` on container, `pointer-events: auto` on controls so canvas receives clicks outside.
- [x] **21.4** Draw loop: In the blueprint layer branch, apply `ctx.globalAlpha = (bt.opacity ?? 1) * (state.selectedId ? 0.7 : 1)` before drawing; reset via `ctx.restore()`. Export: apply `ex.globalAlpha = bt.opacity ?? 1` before drawing blueprint and reset after.
- [x] **21.5** Dedicated transparency button: Add `#blueprintTransparencyBtn` (checkerboard icon) positioned outside blueprint top-left; visibility when blueprint exists and !technicalDrawing; click toggles `#transparencyPopover`; stopPropagation so it never triggers canvas drag/selection; works when blueprint is locked.
- [x] **21.6** Event listeners: Slider `input` → update `state.blueprintTransform.opacity` (0–1), sync number input, call `draw()`, do NOT push undo. Slider `change` → push undo snapshot. Number input: sync with slider; on change, update opacity and push undo. Ensure both stay in range 0–100 (display) / 0–1 (state).
- [x] **21.7** UX refinements: Button positioned outside blueprint (bottom-right of button touches top-left of blueprint, 4px gap); clamped below header bar when blueprint pans up; checkerboard 16px squares (#a8a8a8); slider blue (#18A0FB); number input width/fit for "100".

---

## 22. Quote Generation and Costing System

*Context: Add ability to generate quotes from placed elements on canvas. Count products automatically, fetch pricing from Supabase, apply markup, add manual labour hours, and produce a formatted quote. Database stores cost price, markup %, and labour rates; backend calculates totals; frontend displays quote modal with breakdown and export options.*

**Database Schema (Supabase)**

- [x] **22.1** Extend `public.products` table: add columns `cost_price` DECIMAL(10,2), `markup_percentage` DECIMAL(5,2) DEFAULT 30.00, `unit` VARCHAR(10) DEFAULT 'each', `active` BOOLEAN DEFAULT true.
- [x] **22.2** Create `public.labour_rates` table: columns id UUID PRIMARY KEY, rate_name VARCHAR(100), hourly_rate DECIMAL(10,2), active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW(); insert default rate (e.g. "Standard Labour" @ $65.00/hr).
- [x] **22.3** Create `public.quotes` table (optional for Phase 1, required for quote history): columns id UUID PRIMARY KEY, quote_number VARCHAR(50) UNIQUE, customer_name VARCHAR(255), property_address TEXT, labour_hours DECIMAL(5,2), labour_rate_id UUID REFERENCES labour_rates(id), materials_subtotal DECIMAL(10,2), labour_subtotal DECIMAL(10,2), total DECIMAL(10,2), blueprint_image_url TEXT, items JSONB, status VARCHAR(50) DEFAULT 'draft', servicem8_job_id VARCHAR(100) (future use), created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ.
- [x] **22.4** Populate pricing data: add cost_price and markup_percentage to existing 6 products in Supabase (use realistic guttering prices for testing, e.g. gutter $12.50 cost, 30% markup).

**Backend API Endpoints**

- [x] **22.5** Create `backend/app/pricing.py`: add function `get_product_pricing(product_ids: list[str]) -> dict` that queries Supabase products table for id, name, cost_price, markup_percentage, unit; return dict mapping product_id → pricing data; handle missing products gracefully.
- [x] **22.6** Add GET `/api/labour-rates` endpoint in main.py: query `public.labour_rates` WHERE active = true; return JSON array [{id, rate_name, hourly_rate}].
- [x] **22.7** Add POST `/api/calculate-quote` endpoint in main.py: accept request body {elements: [{assetId, quantity}], labour_hours, labour_rate_id}; fetch product pricing via get_product_pricing; calculate per-item sell price (cost_price * (1 + markup_percentage/100)), line totals, materials subtotal; fetch labour rate; calculate labour subtotal (labour_hours * hourly_rate); return structured JSON with materials array, materials_subtotal, labour_hours, labour_rate, labour_subtotal, total.
- [x] **22.8** Error handling: return 400 if product not found or pricing missing; return 404 if labour_rate_id invalid; log errors for debugging.

**Frontend Quote UI**

- [x] **22.9** Add "Generate Quote" button in toolbar-right (after Export PNG button); ID `generateQuoteBtn`; styled like existing toolbar buttons; tooltip "Generate quote from canvas elements".
- [x] **22.10** Create quote modal in index.html: similar structure to crop modal; ID `quoteModal`; sections: header ("Quote"), parts breakdown table (auto-populated), labour hours input (number, step 0.5, default 0), labour rate dropdown, calculated totals (materials subtotal, labour subtotal, total – read-only), action buttons (Print, Copy to Clipboard, Close); hidden by default.
- [x] **22.11** Quote modal CSS in styles.css: overlay + centered content box; table columns (Product, Qty, Unit Price, Total); blue primary button for Print; totals section with bold total line; responsive on desktop (min-width 600px).
- [x] **22.12** Add `countCanvasElements()` in app.js: iterate state.elements, group by assetId, return object {assetId: count}; exclude blueprint from count (check assetId and not blueprint).
- [x] **22.13** Wire Generate Quote button: on click, call countCanvasElements(), open quote modal, fetch products from state.products to map assetId → name, populate parts table with product name + quantity (no pricing yet), fetch labour rates from `/api/labour-rates` and populate dropdown, set focus to labour hours input.
- [x] **22.14** Add Calculate Quote flow: when user enters labour hours and selects labour rate, send POST `/api/calculate-quote` with elements array (convert counts to [{assetId, quantity}]), labour_hours, labour_rate_id; on response, update modal with pricing breakdown (cost+markup % or sell price per line), materials subtotal, labour calculation, total; handle errors (show message if product pricing missing or API fails).
- [x] **22.16** Copy to Clipboard: create `copyQuoteToClipboard()` that formats quote as plain text (MATERIALS with line items, Materials Subtotal, LABOUR hours × rate, TOTAL); wire Copy button and show success message (e.g. "Quote copied to clipboard").

**Manual Price Editing**

- [x] **22.17** Add "Edit Pricing" button in quote modal (next to Generate Quote or in header); opens pricing edit mode where materials table becomes editable (inline or separate modal).
- [x] **22.18** Editable pricing UI: materials table shows editable columns for Cost Price, Markup %, Unit Price (calculated or manual override); changes update in real-time and recalculate subtotals and total; validation: cost_price ≥ 0, markup_percentage 0–1000, unit_price ≥ cost_price.
- [x] **22.19** Save pricing changes: add "Save to Database" button in edit mode; on click, send POST `/api/products/update-pricing` with array [{id, cost_price, markup_percentage}]; backend updates Supabase products table; show success message; pricing persists for future quotes.
- [ ] **22.20** (Optional) Pricing edit permissions: consider read-only vs edit by user role (defer auth for post-MVP; for now, all users can edit pricing).

**Future Considerations (ServiceM8 Integration)**

- [ ] **22.21** Document ServiceM8 integration: add section to README or docs/SERVICEM8_INTEGRATION.md noting `public.quotes` includes `servicem8_job_id` for future use; quote JSONB items designed to map to ServiceM8 material line items API; future endpoint POST `/api/sync-to-servicem8` accepting {quote_id, servicem8_job_id}.
- [x] **22.28** ServiceM8 job number field: Add a UI field to the quote form that appears once any missing manual entries are confirmed (if applicable), for later ServiceM8 integration – ability to add materials to an existing job. Field: 1–5 digit "generated_job_id" (job number); number entry box with green fill (RGB 113, 196, 60 / #71C43C) and slight shadow.
- [ ] **22.29** Integrate ServiceM8 API response logic to toggle the Success/Error message states in the Quote footer. Visibility logic is implemented (message hidden by default, revealed after Add to Job sequence); API wiring (Success/Error from real response) is still pending.

**Testing and Polish**

- [ ] **22.22** Manual testing: place 6 different Marley products with varying quantities, generate quote, verify counts, add labour hours, verify pricing (cost → markup → sell price → line totals → subtotals → total), test Print and Copy to Clipboard.
- [ ] **22.23** Error handling tests: missing product pricing, invalid labour rate, empty canvas ("No products on canvas to quote"), API failures (user-friendly error, no crash).
- [ ] **22.24** (Optional) Add E2E test: simulate placing products, click Generate Quote, verify modal opens with correct counts, enter labour hours, verify total calculation.

**Quote modal: empty invoice line (add item UX)**

*Context: Replace the separate "Add item" dropdown section with an empty invoice line in the quote table. The user can add a line by typing in the product cell (to refine search) or by clicking a dropdown on the right of the product column in that row.*

- [x] **22.25** Replace "Add item" section (dropdown + Qty + Add button) with a single empty invoice row at the bottom of the quote parts table: Product (editable cell), Qty, Unit Price, Total; no separate form below the table.
- [x] **22.26** Product cell in the empty row: allow typing to refine search (filter products by name/item number as user types); show a dropdown trigger (e.g. chevron or combobox) on the right side of the product cell to open a list of products.
- [x] **22.27** When a product is selected from the empty row (via dropdown or search selection), convert that row to a normal quote line (set assetId, qty default 1), append a new empty invoice row below, trigger quote recalculation so unit price and totals update.

*Section 22 status: In progress. 22.1–22.4, 22.5–22.14, 22.16–22.19, 22.25–22.27 complete. Unit price and totals display when quote modal is opened. Empty invoice row at bottom of table: type-to-search or dropdown to add products; selecting converts row and appends new empty row; merge into existing line when same product. Remaining: 22.15 (Print), 22.20–22.24 (optional/docs/testing).*

**Consumables (billing only, not on canvas):** SCR-SS (screws), GL-MAR (glue), MS-GRY (sealant) are excluded from the Marley products panel; they remain in the quote Add item dropdown and are used for backend billing (e.g. screws auto-added from gutters).

**Diagram SVG mapping (CSV import):** Non-consumable products map to unique SVGs under `/assets/marley/` – see `backend/app/csv_import.py` DIAGRAM_MAP. All required diagram SVGs are uploaded (gutters, corners, joiners, stopends, outlets, brackets, downpipes, elbows, clips). Source assets organised in `marley-assets/`. Re-import CSV to apply mapping to existing products.

**Domain rule – Gutter bracket and screw spacing (implemented):**
- Default bracket spacing: **1 bracket per 400 mm** of gutter
- Screws per bracket: **3 Stainless Steel Screws** (SCR-SS)
- Implemented in `backend/app/gutter_accessories.py`: when generating a quote, gutter elements (GUT-SC-MAR-1.5M, GUT-CL-MAR-3M, etc.) auto-expand to include inferred brackets (BRK-SC-MAR / BRK-CL-MAR) and screws (SCR-SS). Manually placed brackets/screws are summed with inferred quantities.

---

## 23. CSV product import

*Context: Process a CSV file uploaded into the project with 5 columns (Item Number, Servicem8 Material_uuid, Item Name, Purchase Cost, Price) and import into `public.products`. The products table will need new columns to support this; implementation deferred.*

- [x] **23.1** Extend `public.products` table: add columns required for CSV import (e.g. `item_number`, `servicem8_material_uuid`, and any mapping for Price; align with existing `cost_price`, `name`, etc.).
- [x] **23.2** CSV upload and parse: accept uploaded CSV with columns Item Number, Servicem8 Material_uuid, Item Name, Purchase Cost, Price; validate headers and parse rows.
- [x] **23.3** Import into Supabase: map CSV rows to products (upsert or insert); store Item Number, Servicem8 Material_uuid, Item Name, Purchase Cost, Price in `public.products`; handle errors and report success/failure counts.

*Section 23 status: Complete. CSV import via POST /api/products/import-csv.*

---

## 24. Profile-based product filtering (backend plan)

*Context: The cost/price CSV (Technician Upsells and Commission + Stock List) contains products in three profile groups: **Storm Cloud**, **Classic**, and **Other**. Same logical product (e.g. Gutter 1.5m) exists as separate SKUs per profile with different item numbers, ServiceM8 UUIDs, and prices. We need Supabase schema and API to filter products by profile.*

**CSV structure (observed):**
- Columns: Item Number, Servicem8 Material_uuid, Item Name, Purchase Cost, Price (all exc GST)
- Storm Cloud: item numbers contain `SC` (e.g. GUT-SC-MAR-1.5M, BRK-SC-MAR); names contain "Storm Cloud"
- Classic: item numbers contain `CL` (e.g. GUT-CL-MAR-1.5M, BRK-CL-MAR); names contain "Classic"
- Other: generic items (screws, glue, sealant, downpipes, clips, elbows) – no SC/CL in codes

**Backend plan (no implementation yet):**

1. **Schema: add `profile` column to `public.products`**
   - `profile` VARCHAR(20) NULL: `'storm_cloud' | 'classic' | 'other'`
   - Each product row gets one profile; filter via `WHERE profile = ?`
   - Nullable to allow existing placeholder products to remain; default `'other'` for CSV import

2. **Profile derivation (during CSV import)**
   - If item_number contains `SC` (case-insensitive) or name contains "Storm Cloud" → `storm_cloud`
   - Else if item_number contains `CL` or name contains "Classic" → `classic`
   - Else → `other`

3. **API**
   - Extend GET `/api/products`: add optional query param `?profile=storm_cloud|classic|other`
   - Backend filters products by profile when param present; omit param = all products (current behaviour)

4. **Product identity and diagram mapping**
   - CSV rows use `item_number` as business key; `id` can remain UUID/text (or use item_number for CSV-sourced rows)
   - Existing placeholders (gutter, downpipe, bracket, etc.) have diagram_url; CSV products do not
   - Add optional `product_template_id` or `base_product_id` (FK to products) to map "Gutter 1.5m Storm Cloud" → same diagram as "Gutter 1.5m Classic" (reuse gutter.svg), or
   - Alternatively: add `diagram_url` during import by matching product type from name (e.g. "Gutter" → gutter diagram)

5. **Frontend (future)**
   - Profile selector: Storm Cloud | Classic | All (or Other)
   - Fetch products with `?profile=...`; filter Marley panel by selected profile

**Tasks (planned, not started):**
- [x] **24.1** Add `profile` column to `public.products` (VARCHAR(20) NULL, check constraint for allowed values).
- [x] **24.2** Update CSV import (23.2–23.3): derive and set `profile` per row during parse/upsert.
- [x] **24.3** Extend GET `/api/products`: add optional `profile` query param; filter when present.
- [ ] **24.4** (Optional) Add `product_template_id` or diagram mapping for CSV products to reuse existing diagram assets.
- [x] **24.5** Frontend profile selector: add UI to filter Marley panel by profile (Storm Cloud | Classic | Other | All); wire to GET `/api/products?profile=storm_cloud|classic|other` so users can switch between Storm Cloud products, Classic products, Other (downpipes, clips, screws, etc.), or view all.

*Section 24 status: Complete. 24.5 implemented – profile dropdown (Storm Cloud | Classic | Other | All) filters Marley panel client-side; state.products remains full list for quote modal.*

---

## 25. Marley diagram SVG assets

*Context: Product diagrams live in `frontend/assets/marley/` and are mapped via `backend/app/csv_import.py` DIAGRAM_MAP. Source SVGs are organised in `marley-assets/` by part type (gutters, corners, joiners, stopends, outlets, brackets, downpipes, elbows, clips).*

- [x] **25.1** Downpipe joiner mapping: DPJ-65 and DPJ-80 were in CSV; added DIAGRAM_MAP entries for downpipe-joiner-65.svg and downpipe-joiner-80.svg.
- [x] **25.2** All required Marley diagram SVGs uploaded: gutters, corners (external + internal), joiners, stopends, outlets, brackets, downpipes, elbows, clips (Storm Cloud + Classic variants where applicable).

*Section 25 status: Complete. All DIAGRAM_MAP assets present in frontend/assets/marley/.*

---

## 26. Billing logic – accessory auto-calculation extensions

*Context: Extend `backend/app/gutter_accessories.py` (and quote generation) to apply additional screw/clip rules. Currently: 1 bracket per 400mm gutter, 3 screws per bracket. These rules must be added or augmented.*

- [x] **26.1** Confirm and document: every bracket used includes 3 screws (SCR-SS). *May already be implemented in gutter_accessories.py.*
- [ ] **26.2** Manual guttering distance entry: add UI field (e.g. in quote flow or blueprint tools) for user to enter total guttering length (mm or m) when diagram is insufficient; use this to calculate required brackets (1 per 400mm) and screws (3 per bracket) when gutter elements alone cannot determine total length.
- [x] **26.3** Every dropper used requires 4 screws (SCR-SS): extend accessory logic to infer 4 × dropper quantity and add to screw total.
- [x] **26.4** Every saddle clip (SCL-65, SCL-80) requires 2 screws: extend accessory logic to infer 2 × saddle clip quantity and add to screw total.
- [x] **26.5** Every adjustable clip (ACL-65, ACL-80) requires 2 screws: extend accessory logic to infer 2 × adjustable clip quantity and add to screw total.
- [ ] **26.6** Bin sorting logic for downpipes: implement length-based bin-pack or sort order for downpipes in quote/billing (e.g. standard lengths, grouping, or display order).

*Section 26 status: 26.1, 26.3, 26.4, 26.5 complete. 26.2 (manual guttering distance entry UI) and 26.6 (downpipe bin sorting) pending.*

---

## 27. Digital Takeoff – Measurement Deck

*Context: "Digital Takeoff" bridges the visual blueprint and the data needed for a quote. Instead of a static form, a bottom "Measurement Deck" panel interacts with the canvas. Measurable items (Gutters, Downpipes) get sequence numbers and manual length entry; badges on canvas map 1:1 to input cards in the panel.*

**State and data structure**

- [x] **27.1** Add `nextSequenceId` to state (auto-incrementing counter). When dropping a measurable item (gutter or downpipe), assign `el.sequenceId = state.nextSequenceId++` and `el.measuredLength = 0`. Persist sequenceId in element object.
- [x] **27.2** Define measurable types: gutters (GUT-*-MAR-*M) and downpipes (DP-*-*, DPJ-*, dropper). Only these types receive sequence numbers and measurement badges.

**Canvas visuals (badges)**

- [x] **27.3** In `draw()`, after drawing each element image: if `el.sequenceId`, draw a Measurement Badge at element center (`el.x + el.width/2`, `el.y + el.height/2`).
- [x] **27.4** Badge style: small circle, radius ~12px, background `#18A0FB`, white bold number. Badge stays upright (reset transform) even when element is rotated.
- [x] **27.5** Ensure badges render above elements but below selection/hover outlines; do not interfere with hit-testing for selection.
- [x] **27.14** Badge length label: Display measurement (e.g. "3.5m") outside the circular badge, fractionally smaller, red/green by state. Superseded by Section 29 (metres, outside circle, colour states).

**Bottom panel (Measurement Deck)**

- [x] **27.6** Add fixed bottom panel (z-index above canvas). Content: horizontal scrolling list or grid of measurement cards.
- [x] **27.7** Each card: label "Run #N" (matches badge), input "Length (mm)", status indicator (e.g. green border when length entered). Use `renderMeasurementPanel()` or equivalent, called when elements change.
- [x] **27.8** Filter elements with `el.sequenceId > 0`; sort by `sequenceId`. Generate one card per measurable element.

**Two-way highlighting (UX)**

- [x] **27.9** Hover panel card: set `state.hoveredId = el.id` and trigger `draw()` so corresponding canvas element shows hover outline/glow.
- [x] **27.10** Click element on canvas: bottom panel scrolls to that element's card and focuses the Length (mm) input field.

**Quote integration**

- [x] **27.11** Update `countCanvasElements()` or equivalent: for gutters and downpipes with `measuredLength > 0`, use `measuredLength` instead of simple quantity count.
- [x] **27.12** Sum total length (mm) from measurable elements. Option A: send `total_length` to backend for linear items; Option B: frontend calculates quantity from standard lengths (e.g. Marley gutter 2.9m or 4m): `Ceiling(total_mm / 2900)` before sending.
- [x] **27.13** Ensure backend `calculate-quote` (or accessory expansion) can accept length-based quantities for gutters/downpipes when applicable; maintain compatibility with quantity-based flow.

*Section 27 status: Complete. Digital Takeoff / Measurement Deck – badges, panel, two-way highlight, quote integration.*

---

## 28. Delete key and badge double-click length entry

- [x] **28.1** Delete key: Ensure Delete/Backspace removes only selected **elements**, never the blueprint image. When only the blueprint is selected, pressing Delete does nothing.
- [x] **28.2** Badge double-click: Double-clicking the number on a gutter or downpipe measurement badge (on canvas) opens an inline length entry (e.g. input) beside the number. Once the user enters the length and confirms (Enter or blur), the module closes and the value is saved (update `el.measuredLength`); wire to the same logic as the Measurement Deck at the bottom of the screen so the deck stays in sync.
- [x] **28.3** Ensure the Delete key works for all elements to remove them from the canvas (no edge cases; every element type removable via Delete/Backspace).

*Section 28 status: Complete. Delete removes elements only; toolbar and keyboard use same logic for all element types.*

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

**MVP status:** All tasks in sections 1–8 are complete. Section 9 items are deferred. Sections 10–12 are complete. Section 13.1–13.3 complete; 13.4–13.5 optional. Section 14 complete. Section 15.1–15.4 and 15.7–15.14 complete; 15.5–15.6 optional. Section 16 complete. Section 17 complete (drill-through with Alt, blueprint lock, lock picture to background). Section 18 complete (18.9–18.11: rotated handle hit test, rotation-aware cursors, rotate handle accessibility). Section 19 complete (blueprint disappearance fix). Section 20 added (anchor-based resize). Section 21 complete (transparency slider via dedicated checkerboard button at blueprint top-left; works when locked; slider blue, number input fixed; E2E tests). Section 22 in progress: 22.1–22.4, 22.5–22.14, 22.16–22.19 complete; 22.15, 22.20–22.24 remaining. Quote modal has Add item to add lines manually. Section 23 complete (CSV product import). Section 25 complete (all Marley diagram SVGs uploaded; downpipe joiner mapping fixed). Section 24 complete (profile filter dropdown implemented). Section 26 added (billing logic: manual guttering distance, dropper 4 screws, saddle/adjustable clip 2 screws). Section 27 complete (Digital Takeoff / Measurement Deck – badges, panel, two-way highlight, quote length→quantity). Section 28 added (Delete element only; badge double-click length entry). Section 29 complete (manual pop-up UI: metres, gutter/downpipe labels, red/green states). Section 30 complete (expand blueprint image types: clipboard paste, HEIC, PDF frontend conversion; BMP/TIFF/AVIF/GIF out of scope).

*Last updated: Feb 2026. Added: 7.11 (flip H/V), 14.3 (undo blueprint upload + element move), 28.3 (Delete all elements), 26.6 (downpipe bin sort), 10.8 (local server), 22.28 (ServiceM8 job number field), Section 33 (save/load project files), Section 34 (auth, multi-tenancy, per-user saved files).*
