# Quote App – MVP Task List

**This file is the single authoritative task tracking document for this project.** All progress, scope, and completion status are tracked here. Do not maintain a separate or duplicate task list elsewhere (e.g. in other docs or issue trackers) for this project’s tasks.

Task list for the property photo → repair blueprint web app (desktop-first, 2/3 blueprint + collapsible Marley panel, Canva-style elements).

---

## 🔁 Current Working Branch

- Branch: feature/mobile-canvas-toolbars
- Based on: main
- Status: In Progress
- Related Tasks:
  - [x] 54.16 Mobile: pan instead of drag-select
  - [x] 54.17 Pinch zoom
  - [x] 54.18 Parts formatting (no overlap)
  - [x] 54.19 Global toolbar collapsible and movable
  - [x] 54.20 Element toolbars movable

**Uncompleted tasks (by section):**

| Section | Task | Description |
|---------|------|-------------|
| 7 | 7.10 | Revisit gutter rotation constraint (E2E Alt override, hysteresis; optional) |
| 13 | 13.4, 13.5 | (Optional) Uploaded images uniform sizing; min/max size guards |
| 15 | 15.5, 15.6 | (Optional) Live dimension/angle display during resize/rotate |
| 20 | 20.2 | E2E resize test passes or update if intentional |
| 22 | 22.20 | (Optional) Pricing edit permissions by role |
| 22 | 22.21 | Document ServiceM8 integration |
| 22 | 22.22–22.24 | Quote manual testing, error handling tests, optional E2E |
| 22 | 22.29 | ServiceM8 API response Success/Error wiring |
| 24 | 24.4 | (Optional) product_template_id for CSV diagram mapping |
| 26 | 26.2 | Manual guttering distance entry UI |
| 35 | 35.7, 35.8, 35.9 | Auth view switching; no regressions; manual/E2E check |
| 36 | 36.11 | localProducts migration (optional) |
| 41 | 41.1, 41.3 | 65/80 mm filter dropdown in Marley panel |
| 44 | 44.1, 44.2 | Transparency in pill; editable project name (superseded by 46?) |
| **48** | **48.0.1–48.0.23** | **Pre-deploy: local tests, features, troubleshooting** |
| 48 | 48.1–48.24 | Railway setup, build config, env vars, deploy, post-deploy |
| **50** | **50.1–50.9** | **Quote modal: Labour as table row, independent from materials** |
| **50** | **50.10–50.18** | **Labour as product (REP-LAB): remove rate dropdown, inline unit price, delete X, exclude from panel/Add item** |
| 51 | 51.7, 51.8 | Confirm Job popup UI refine; measured materials: any click away should commit length |
| 53 | 53.1, 53.2 | Login screen custom image; ServiceM8 with login (if needed) |
| 19 | 19.12 | SVG elements extremely blurry when colour changed until restored to original |
| 54 | 54.16–54.20 | (Complete) Mobile pan, pinch zoom, parts formatting, movable toolbars |
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

## 33. Save/Load project files

*Context: Allow users to persist and reload full diagram/blueprint state as project files.*

- [x] **33.1** Ability to save diagrams/blueprints as project files (e.g. export to .json or save to backend; load from file or backend to restore blueprint + elements + view state).
- [x] **33.2** When loading from a project (saved diagram), load the **blueprint image** as well; currently only elements are restored and the blueprint image is not. Enhance save/load so the blueprint image is persisted and restored.
- [x] **33.3** Fix blueprint not persisting on save: rollback diagram row when Storage upload fails (no half-saved diagram); send blueprintImageUrl when canvas export fails (CORS/tainted); surface upload error in 500 response; ensure SUPABASE_SERVICE_ROLE_KEY is set on Railway for Storage uploads (see TROUBLESHOOTING).

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
- [x] **19.12** Changing colour of SVG elements makes them extremely blurry until restored to original; fix tinting/rendering so coloured elements stay sharp.

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
- [x] **22.15** Quote modal Print button: implement `printQuote()` that opens a print window with the quote formatted as HTML (materials table, labour, totals), triggers browser print dialog, and closes the window after print.
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

*Section 22 status: In progress. 22.1–22.4, 22.5–22.14, 22.15 (Print), 22.16–22.19, 22.25–22.27 complete. Unit price and totals display when quote modal is opened. Empty invoice row at bottom of table: type-to-search or dropdown to add products; selecting converts row and appends new empty row; merge into existing line when same product. Remaining: 22.20–22.24 (optional/docs/testing).*

**Quote modal: Save to Database confirmation**

*Context: The "Save to Database" button in the quote modal (Edit Pricing mode) persists cost/markup to Supabase and affects ServiceM8. Require explicit confirmation before proceeding so the user (e.g. Jack) does not accidentally overwrite prices — only continue after they confirm, or Jack will be grumpy 😠.*

- [x] **22.28** When "Save to Database" is clicked, show a confirmation step before calling the API: display a warning with the message "Are you sure? This will change the price permanently in ServiceM8 and the app." and optional note "Only continue if you've confirmed — otherwise Jack will be grumpy 😠".
- [x] **22.29** Only proceed with the POST to `/api/products/update-pricing` if the user confirms (e.g. OK / Continue); if the user cancels or dismisses the confirmation, do nothing and leave the quote modal in Edit Pricing mode (no API call).
- [x] **22.30** Implement the confirmation UI: use either a native `confirm()` dialog for MVP or a styled modal matching the quote modal; ensure the Save to Database click handler runs the confirmation first, then the existing save logic only on confirm.

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
- [x] **26.6** Bin sorting logic for downpipes: implement length-based bin-pack or sort order for downpipes in quote/billing (e.g. standard lengths, grouping, or display order). Stock lengths 1.5m and 3m only; 6m archived.

*Section 26 status: 26.1, 26.3, 26.4, 26.5, 26.6 complete. 26.2 (manual guttering distance entry UI) pending.*

---

## 27. Digital Takeoff – Measurement Deck

*Context: "Digital Takeoff" bridges the visual blueprint and the data needed for a quote. Instead of a static form, a bottom "Measurement Deck" panel interacts with the canvas. Measurable items (Gutters, Downpipes) get sequence numbers and manual length entry; badges on canvas map 1:1 to input cards in the panel.*

**State and data structure**

- [x] **27.1** Add `nextSequenceId` to state (auto-incrementing counter). When dropping a measurable item (gutter or downpipe), assign `el.sequenceId = state.nextSequenceId++` and `el.measuredLength = 0`. Persist sequenceId in element object.
- [x] **27.2** Define measurable types: gutters (GUT-*-MAR-*M), main downpipes (DP-65-*, DP-80-*), droppers (dropper, DRP-*). Downpipe joiners (DPJ-*) are not measurable – priced each, no length (see 38.1).

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

## 35. App views: Login, Canvas, Products (navigation)

*Context: Restructure the app to support navigation between three distinct screens (Login, Canvas, Products) without breaking existing functionality. Implement in a feature branch; this section lists the tasks to be done there. The app should load to a Login screen when logged out, and upon logging in reveal the Canvas exactly as before.*

**Risk – Zero width canvas:** If `initCanvas()` runs while `#view-canvas` is `display: none`, the canvas dimensions become 0 and the app is broken until a window resize. The plan below avoids measuring the canvas while it is hidden by using a `switchView(viewId)` helper that makes the target view visible first, then (for the canvas view) calls `resizeCanvas()` and `draw()`.

**HTML structure (index.html)**

- [x] **35.1** Wrap the existing canvas view into a single container: create `<div id="view-canvas" class="app-view">` and move inside it (as direct children) the toolbar (`header.toolbar`), the workspace (`.workspace`: blueprint-wrap, resizer, panel), and the Measurement Deck (`#measurementDeck`). No change to the DOM order of those elements; only wrap them in the new div.
- [x] **35.2** Create two new sibling container divs (siblings to `#view-canvas`, not inside it): `<div id="view-login" class="app-view hidden">` and `<div id="view-products" class="app-view hidden">`. Add CSS rule for `.app-view.hidden { display: none; }` (e.g. in styles.css) so hidden views are not shown and take no layout space.

**Canvas container safety (avoid zero-size wrap)**

- [x] **35.3** Ensure `#blueprintWrap` (the canvas parent) has a defined CSS height so it fills the `#view-canvas` container as soon as that view becomes visible. For example: give `#view-canvas` a flex layout (e.g. `display: flex; flex-direction: column; flex: 1; min-height: 0`) and ensure the workspace / `#blueprintWrap` has `flex-grow: 1` (or `height: 100%` where the chain from `#view-canvas` down has explicit heights). This way, when `switchView('view-canvas')` makes the view visible, the wrap has non-zero dimensions before `resizeCanvas()` runs.

**switchView(viewId) – robust view transition (app.js)**

- [x] **35.4** Implement `switchView(viewId)` with the following logic: (1) Hide all `.app-view` elements (e.g. add `.hidden` class to each). (2) Remove `.hidden` from the element with id equal to `viewId` so only that view is visible. (3) **CRITICAL:** If `viewId === 'view-canvas'`, call `resizeCanvas()` immediately after making it visible so the canvas is never measured while its container is hidden. (4) Call `draw()` to repaint the canvas content. Expose `switchView` where needed (e.g. after auth check and on login/sign-out).

**init() and first render – auth-driven view (app.js)**

- [x] **35.5** On page load, do not rely on CSS or initial HTML classes for which view is shown. After all inits (including `initAuth()` and any async auth setup), check authentication (e.g. `authState.token` or session from `getSession()`). If **logged out:** call `switchView('view-login')`. If **logged in:** call `switchView('view-canvas')`. This ensures the correct view is set by JavaScript on first render and the canvas is never measured while hidden.

**Login migration**

- [x] **35.6** Move the existing login form into `#view-login`: relocate the auth form content from the current auth modal (`#authModal`: form, email/password inputs, Sign in / Create account / Cancel, and optionally the “Signed in as” / Sign out block) into `#view-login` so the login screen is a full-screen view, not a modal. Remove or repurpose `#authModal` so it is no longer the primary login UI (e.g. keep modal for “Sign in” button from toolbar if desired, or remove and use only view-login).
- [ ] **35.7** After successful login (from `#view-login`), call `switchView('view-canvas')` so the user sees the Canvas. On Sign out (from canvas), call `switchView('view-login')`. Wire these to the existing auth success/sign-out handlers.

**No regressions and deliverable**

- [ ] **35.8** Verify that when logged in and `#view-canvas` is visible, behaviour is unchanged: toolbar, panel, canvas, measurement deck, upload, export, quote, auth button, and saved diagrams work as today. No duplicate event listeners; no missing elements.
- [ ] **35.9** Manual and (if applicable) E2E check: app loads to Login screen when logged out; after logging in, Canvas view is shown and all existing functionality (upload, drag-drop, select, resize, rotate, export, quote, save/load diagrams) works without regression. Confirm no zero-width canvas (e.g. resize never needed to "fix" the canvas).

*Section 35 status: Not started. To be implemented in a feature branch; main branch remains stable. Refined plan: switchView() + resizeCanvas-on-show + auth-driven init prevent zero-width canvas bug.*

---

## 36. Product Management: Supabase persistence

*Context: The Product Library currently creates products that exist only in the browser’s localStorage. To make them permanent, available on other devices, and usable when loading products into the Canvas, the Add Product flow must use Supabase: upload the SVG to Storage, save the product row (including the SVG URL) in `public.products`, and load products from the database to populate the grid.*

**Supabase state (verified via MCP):**

- **Storage:** Bucket `product-diagrams` created (public, 1MB limit, `image/svg+xml` only). Policies: authenticated users can INSERT; public can SELECT. *Migration: `add_product_diagrams_storage_bucket`.*
- **Database:** `public.products` has RLS with SELECT (public read), INSERT (public), UPDATE (public). No backend change required for inserts from the client.
- **Retrieval:** Backend already exposes `GET /api/products` (from Supabase). Product Library grid currently uses `localProducts` from localStorage only.

**Three actions:**

**1. Storage – upload dropped SVG to Supabase**

- [x] **36.1** In the Add Product flow (on form submit or after file drop), use the Supabase client (`authState.supabase`) to upload the SVG file to the `product-diagrams` bucket. Use a deterministic path, e.g. `{productId}.svg` or `{userId}/{productId}.svg`, so the same product always maps to the same URL. Require the user to be authenticated (redirect to login or show error if not).
- [x] **36.2** After a successful upload, obtain the public URL for the object (e.g. via `getPublicUrl()` or the bucket’s public base URL + path). This URL will be stored in `public.products.diagram_url` (and optionally `thumbnail_url` if you derive a thumbnail later).

**2. Database – save product row to `public.products`**

- [x] **36.3** On “Create Product” submit, build the product payload from the form (id, name, category, cost_price, markup_percentage, unit, profile, active, item_number, servicem8_material_uuid, price_exc_gst, thumbnail_url, diagram_url). Set `diagram_url` (and optionally `thumbnail_url`) to the Storage URL from step 36.2. Do **not** store raw `svgContent` in the database; the canonical source is the file in Storage.
- [x] **36.4** Insert the row into `public.products` via the Supabase client (`authState.supabase.from('products').insert(...)`). Handle duplicate `id` (e.g. upsert on conflict or validate unique id) and surface errors to the user (e.g. “Product ID already exists” or “Upload failed”).
- [x] **36.5** After a successful insert, stop persisting that product to localStorage only. Optionally keep a local cache or merge strategy for offline/fallback, but the source of truth for “saved” products is Supabase.

**3. Retrieval – fetch products and populate the grid**

- [x] **36.6** When the Product Library view is shown (e.g. on `switchView('view-products')` or when `#view-products` becomes visible), fetch products from Supabase: either call existing `GET /api/products` (backend reads from Supabase) or use the Supabase client directly (`from('products').select(...)`). Ensure the response includes the columns needed for the grid (id, name, category, thumbnail_url, diagram_url, profile, etc.).
- [x] **36.7** Update `renderProductLibrary()` (or equivalent) so the grid is populated from the fetched list instead of (or merged with) `localProducts`. Display diagram via `diagram_url` (load the SVG from the URL, e.g. in an `<img>` or fetch and inject) and show name/category as today. Keep the “New Product” card first in the grid.
- [x] **36.8** Ensure products created in the Product Library and stored in Supabase are available to the Canvas panel (e.g. the existing product fetch used for the drag-drop panel includes or can include these products so they can be dragged onto the blueprint). If the panel currently only uses `GET /api/products`, confirm the backend returns Supabase rows including new inserts; no change needed if so.

**Deliverable and edge cases**

- [x] **36.9** User can add a product (SVG + details) when logged in; the SVG is stored in `product-diagrams`, the row in `public.products`, and the Product Library grid shows it from Supabase. Signing out and back in or opening the app on another device shows the same products.
- [x] **36.10** Handle “not logged in” in the Add Product flow: disable or hide “Create Product” and show “Sign in to add products,” or redirect to the login view and return to the modal after login.
- [ ] **36.11** Optional: migration path for existing `localProducts` (e.g. one-time “Upload my local products to Supabase” or leave localStorage as legacy and only show Supabase products in the grid).

*Section 36 status: Implementation complete. 36.1–36.10 done. 36.11: localStorage commented out; Supabase is source of truth.*

---

## 37. Product Library: archive UX, sorting, filters, search, and upload validation

*Context: Refine the Product Library so archive is controlled only by the Archive/Unarchive button (no separate Active checkbox), archived products sort to the bottom, and users can filter and search. Optionally add diagram upload validation if different product sizes break the app.*

**Archive button (edit modal):** The Archive/Unarchive button is the leftmost in the modal actions (Archive | Cancel | Create Product / Save Changes). Shown only in Edit mode; hidden in Create mode. Archive sets `active` to false (product hidden in Canvas sidebar); Unarchive sets `active` to true. Confirmation before change; on success, modal closes and Product Library grid and sidebar refresh.

**Tasks:**

- [x] **37.1** Consolidate archive control: Remove the "Active Product" checkbox from the edit product modal. Use only the existing Archive/Unarchive button to toggle active state. Style that button with a light red fill (sleek Apple light design); keep it in the same position (leftmost in modal actions). Ensure Create mode has no archive control; Edit mode shows Archive or Unarchive label and toggles `active` on confirm.
- [x] **37.2** Sort archived to bottom: When rendering the Product Library grid, sort products so active items appear first and archived items appear at the bottom of the page (e.g. order by `active` DESC then by `created_at` or name).
- [x] **37.3** Dropdown filters: Add dropdown filters to the Product Library in a sleek Apple light design. Filter by profile (e.g. Storm Cloud | Classic | Other | All) and by parts/category (e.g. by category or a suitable "parts" dimension). Filters apply to the grid without changing the source of truth (fetch remains full list; filter client-side or via API if available).
- [x] **37.4** Search bar: Add a search bar to the Product Library so users can search products by name. Style to match the Apple light design; filter the grid as the user types (client-side or via API).
- [x] **37.5** Product diagram upload validation (conditional): Determine whether different product diagram (SVG) sizes or formats can break the app (e.g. canvas placement, aspect ratio, or storage). If yes: add recommended image size and format in the UI, validate on upload, prevent invalid files from being accepted, and display a clear error message when an invalid upload is attempted. If no: document that no validation is required and skip implementation.

*Section 37 status: Complete. 37.1–37.5 implemented (archive UX, sort, profile filter, search, SVG validation: type, 2MB limit, large-dimension warning, Create Product disabled when invalid).*

---

## 38. Bug fixes: Measurement Deck, panel search, and panel profile filter

- [x] **38.1** Downpipe joiners (DPJ-65, DPJ-80) must not be measurable: exclude DPJ-* from measurable types so they do not receive sequence numbers, measurement badges, or Measurement Deck cards. Joiners are priced each, not by length.

*Section 38 status: 38.1 complete (DPJ excluded from isMeasurableElement).*

---

## 39. Gutter system header and screw grouping (downpipe-only / mixed repairs)

*Context: The "Gutter System" header appears even when there are no gutter parts on the canvas. This happens because screws (SCR-SS) are treated as gutter system items and, when they have no profile, are assigned to profile 'SC' by fallback, creating a gutter group. See `docs/ANALYSIS_GUTTER_HEADER_DOWNPIPE_ONLY.md` for investigation.*

- [x] **39.1** Confirm root cause: screws (SCR-SS) create a gutter group when gutterGroups is empty via fallback `Object.keys(gutterGroups)[0] || 'SC'` in `frontend/app.js` (approx lines 1644–1672). Key: `isGutterSystemItem` includes SCR-SS; `getProfileFromAssetId('SCR-SS')` returns null; fallback creates gutterGroups['SC'] with screws as sole child → header renders. See `docs/ANALYSIS_GUTTER_HEADER_DOWNPIPE_ONLY.md`.
- [x] **39.2** Only show "Gutter System" header when there are gutter or bracket parts. Do not create/render gutter groups for screws alone (e.g. when gutterGroups is empty, send SCR-SS to ungrouped or dedicated bucket; only add SCR-SS to gutterGroups when a group already exists).
- [x] **39.3** Downpipe-only: When there are downpipes but no gutters, show screws under a "Downpipe" sub-header (and optionally clips there; decide screws-only vs screws+clips under that header per `docs/PLAN_SECTION_39_GUTTER_HEADER_DOWNPIPE.md`).
- [x] **39.4** Mixed repair (gutters + downpipes): When there are both gutter and downpipe parts, show screws as a separate standalone row with product column label "(brackets & clips)" – not nested under either gutter or downpipe header.

*Section 39 status: Complete. Scenario detection from materials; SCR-SS to standaloneScrews when mixed or downpipe-only; gutter header only when group has GUT/BRK; Downpipe sub-header + screws for downpipe-only; "(brackets & clips)" row for mixed. Follow-up: Gutter/Downpipe headers renamed to "Gutter Length" / "Downpipe 65mm Length"; one filled header auto-populates that section (preserved headers).*

---

## 40. Quote modal: width, markup column, row remove (X)

*Context: Improve the quote modal so it is 50% wider; show and allow in-line editing of the Markup % column for parts; and allow removing a quote line from the table via a light red X on hover (removes row from quote only, does not affect the canvas).*

- [x] **40.1** Make the quote modal 50% wider: update `.quote-modal-content` width so the modal is half again as wide (e.g. min-width and max-width × 1.5). See `docs/PLAN_QUOTE_MODAL_40.md` for file/line references.
- [x] **40.2** Add the Markup column with in-line editing for parts: show the Markup % column (not only in Edit Pricing mode) and render an editable input (or editable span) per part row so users can change markup inline; recalc unit price and line total when markup changes. See plan for current markup/cost visibility and row build locations.
- [x] **40.3** Display a light red X on the far right of the Total cell when that row is hovered. The X is only visible on hover; it does not appear for section header rows (Gutter Length, Downpipe 65mm Length, etc.). See plan for Total cell and row structure.
- [x] **40.4** Wire the red X to be clickable: on click, remove that row from the quote table and recalc totals (and optionally trigger `calculateAndDisplayQuote()` or update materials subtotal from remaining rows). This removes the line from the quote only; it does not remove or change any element on the canvas.

*Section 40 status: Complete. Follow-up (bugfix): ensure modal width and Markup column are visible; X must be a standalone character (no button border/fill), visible only on row hover, black → red on X hover.*

---

## 41. Marley panel: 65/80 mm filter and placeholder cleanup

*Context: Add a second dropdown in the Marley panel to filter products by downpipe/clip size (65 mm or 80 mm). Remove legacy placeholder or original elements from the UI now that real diagram assets are in use.*

- [ ] **41.1** Add a second dropdown filter in the Marley panel with 65 mm or 80 mm filter options (alongside the existing profile filter); wire filtering so the product list shows only products matching the selected size where applicable.
- [x] **41.2** Remove the placeholder/original elements from the UI; they are no longer needed now that real Marley diagram assets are in place.
- [ ] **41.3** Secondary 65 mm / 80 mm dropdown: include any relevant part (e.g. downpipes, clips, joiners). Dropdown should be blank by default until a matching part is uploaded; once a matching part exists, the thumbnail should automatically reflect 65 mm or 80 mm (e.g. show the correct size variant in the panel).

---

## 42. Canvas view: header text, empty-state copy, and drop-zone UI

*Context: Reduce clutter in the canvas view and improve empty-state UX. Remove redundant header text; make the “upload or drop a photo” message hide when a blueprint is uploaded (not only when an element is dropped); and give the empty canvas a clear dashed drop-zone instead of plain grey.*

- [x] **42.1** Permanently remove the text “Whiteboard: drag photos and products — select to move, resize, rotate” from the head of the canvas view (currently top right); it is cluttering the UI.
- [x] **42.2** Make the “upload or drop a photo to add to the whiteboard” message disappear when the blueprint image is uploaded (in addition to when an element is dragged on); either action should hide it. Currently it only disappears when an element is placed.
- [x] **42.3** When the canvas is empty, change the UI to show a dashed border box around the upload/drop area (with the “upload or drop a photo” text inside) so it is clear where to drag or drop a file; replace the current large grey canvas with no visual drop target.

*Section 42 status: 42.1–42.3 complete (header text removed, placeholder hides on blueprint upload, dashed drop-zone when empty).*

---

## 43. Header colour wheel (re-colour whole diagram)

*Context: Add a colour control in the toolbar to the left of Export PNG that uses the same palette image and primary colours as the pop-up toolbar that opens when an element is selected. Choosing a colour from this header control applies it to all elements on the canvas at once (re-colour the whole diagram). Existing per-element colour (floating toolbar palette) and all existing header/toolbar behaviour must remain unchanged.*

*Section 43 status: 43.1–43.6 complete. Header colour wheel button and #headerColorPalettePopover added; apply-to-all with single undo; outside click and Escape close popover.*

**Plan (from project files):**

- **Placement:** In `index.html`, `.toolbar-left` currently has: upload, technical drawing toggle, zoom buttons, Export PNG, Save, diagrams dropdown, user profile. The new control goes immediately to the left of the Export PNG button (same row, same toolbar).
- **Existing palette reference:** `#colorPalettePopover` (in `.blueprint-wrap`) contains seven swatches: default (×, `data-color=""`), Red `#FF3B30`, Orange `#FF9500`, Yellow `#FFCC00`, Green `#34C759`, Blue `#007AFF`, Purple `#AF52DE`. Styled with `.color-swatch`; positioning is fixed and controlled by `updateColorPalettePositionAndVisibility`. Colour is applied in `initColorPalette` by setting `el.color`, invalidating tint cache on the selected element, then `draw()` (and undo is pushed elsewhere for other actions; single-element colour change does not push undo in the visible snippet — batch change should push one snapshot).
- **Apply-to-all logic:** Reuse the same tint pipeline: for each `state.elements` set `el.color`, clear `tintedCanvas` / `tintedCanvasColor` / `tintedCanvasWidth` / `tintedCanvasHeight` / `_tintedCanvasFailureKey`, then one `draw()` and one `pushUndoSnapshot()` so Cmd+Z reverts the whole diagram colour.
- **Isolation:** A separate header popover (e.g. `#headerColorPalettePopover`) and its own click handler so `#colorPalettePopover` and `initColorPalette` remain used only for the floating-toolbar colour button and selected-element colouring.

**Tasks:**

- [x] **43.1** HTML: Add a header “Colour diagram” (or colour wheel icon) button to the left of the Export PNG button in `.toolbar-left`. Use the same button style as existing toolbar controls (e.g. `btn btn-export` or icon button). Give it a unique id (e.g. `headerColorDiagramBtn`) and an accessible label/tooltip (e.g. “Colour all diagram elements”).
- [x] **43.2** HTML: Add a dedicated header colour popover element (e.g. `#headerColorPalettePopover`) containing the same seven swatches as `#colorPalettePopover`: default (no tint), Red, Orange, Yellow, Green, Blue, Purple — same `data-color` values and structure so existing `.color-swatch` CSS applies. Place it so it can be positioned under the header button (e.g. in the toolbar area or a fixed container); hidden by default.
- [x] **43.3** CSS: Style the header colour popover so it matches the existing colour palette popover (same swatch layout and appearance). Position it fixed below the header colour button when visible. Reuse `.color-swatch` and related classes; add a wrapper class/id for the header popover only if needed for positioning.
- [x] **43.4** JS – Open/close: On click of the header colour button, toggle visibility of `#headerColorPalettePopover` and position it under the button (e.g. via getBoundingClientRect). Close the popover on outside click (or Escape) so it does not affect canvas interaction. Do not open or control `#colorPalettePopover` or `state.colorPaletteOpen` from this button; keep floating-toolbar colour button and existing palette logic unchanged.
- [x] **43.5** JS – Apply to all: When the user selects a colour in `#headerColorPalettePopover`, apply that colour to every element in `state.elements`: set `el.color` (or null for default), invalidate each element’s tint cache (`tintedCanvas`, `tintedCanvasColor`, etc.), call `draw()`, then push a single undo snapshot so one Cmd+Z reverts the whole diagram colour. If there are no elements, close the popover and optionally show a short message; do not change selection or per-element colour behaviour.
- [x] **43.6** Regression check: Confirm Export PNG, Save, and all other toolbar items work as before; the existing element colour palette (floating toolbar) still opens only when an element is selected and the Colour button is clicked, and still applies only to the selected element. No changes to the `initColorPalette` handler for `#colorPalettePopover`; use a separate handler for the header popover.

---

## 44. Canvas UI: transparency in pill, editable project name for save

*Context: Further refine the canvas page UI by moving the blueprint transparency control into the center pill toolbar, and making the top-left project name editable so it drives the save name (with today’s date appended when saving).*

- [ ] **44.1** Move the transparency icon (`#blueprintTransparencyBtn`) into the pill toolbar at the top (center). Currently it is positioned outside the blueprint top-left; relocate it as a pill button (same style as upload, zoom, colour wheel) and keep the existing transparency popover behaviour (visibility when blueprint exists and technical drawing off; slider and number input unchanged).
- [ ] **44.2** Make the project name at the top left interactable: replace the read-only breadcrumb text with an editable control (e.g. inline editable span or input) that displays “Projects / [name]”. When the user saves the file, use the entered project name with today’s date appended (e.g. “Property HO3776 – 18 Feb 2026”) as the save name, and update the breadcrumb to that value after a successful save.

---

## 45. Floating diagram toolbar (Canva/Freeform style)

*Context: Consolidate diagram controls into a single floating toolbar that overlays the canvas, similar to Canva or Apple Freeform. Move the existing center pill (Source A) and the transparency button (Source B) into one container positioned over the blueprint area, leaving the white header for breadcrumbs and right-side actions only.*

**Sources:**
- **Source A:** The existing central "pill toolbar" in the white top header (`.toolbar-center .toolbar-pill`): upload, technical drawing toggle, recenter, zoom out, fit, zoom in, colour wheel.
- **Source B:** The transparency/background icon (`#blueprintTransparencyBtn`) anchored to the top-left of the blueprint image area (`.blueprint-wrap`).

**Destination:** A new single container acting as the floating diagram toolbar, overlaying the blueprint area, pill-shaped, with all controls from A and B inside it.

- [x] **45.1** Create the new floating diagram toolbar container: add a single DOM element (e.g. `#diagramFloatingToolbar`) inside the diagram container (e.g. `.blueprint-wrap`) so it can be positioned relative to the diagram. Style it as a pill (rounded corners, background colour that separates it from the map). Use flexbox with a consistent gap so icons are spaced evenly. Do not move any controls yet; ensure the container is present and styled.
- [x] **45.2** Move controls from Source A into the new toolbar: relocate upload zone, technical drawing toggle, recenter, zoom out, fit, zoom in, and colour wheel (and header colour popover positioning logic) from `.toolbar-center .toolbar-pill` into `#diagramFloatingToolbar`. Remove or empty the center pill from the header so the white header no longer contains the pill. Preserve all existing behaviour and event listeners (upload, toggle, zoom, recenter, header colour popover).
- [x] **45.3** Move the transparency control from Source B into the new toolbar: relocate `#blueprintTransparencyBtn` into `#diagramFloatingToolbar`. Keep `#transparencyPopover` behaviour (open/close from button; visibility when blueprint exists and technical drawing off; slider and number input). Update `updateBlueprintTransparencyButtonVisibility` and any popover positioning so the button lives in the new toolbar and the popover still opens correctly.
- [x] **45.4** Position the new toolbar over the diagram: position it so it overlays the blueprint area, horizontally centered, just below the main white header block. Use absolute positioning relative to the diagram container (e.g. `.blueprint-wrap` or a direct parent with `position: relative`); set an appropriate z-index so it floats above the canvas and placeholder. Ensure it does not overlap the header and remains visible when the canvas is scrolled or panned (position relative to viewport or diagram container as specified).
- [x] **45.5** Final styling and regression: ensure the merged toolbar maintains pill shape, rounded corners, and background; confirm flexbox gap gives even, consistent spacing between all icons (upload, technical drawing, recenter, zoom −/fit/+, colour wheel, transparency). Verify no existing functionality is broken: upload, technical drawing, zoom, recenter, colour-all, transparency popover, and selection floating toolbar all work as before.

**Post-45 refinements (done):** Recenter button removed from diagram toolbar (Fit view only for re-fit). Technical drawing toggle icon replaced with drafting compass (blueprint/drafting context). Upload wiring fixed (label only, no double file dialog). Toolbar click wiring fixed (diagram toolbar stops propagation; zoom/Fit handlers stopPropagation). Transparency button ::before fix (position: relative so checkerboard scoped to button). Toolbar padding and spacing tightened (10px 16px, min-width/height on buttons).

---

## 46. Editable project name, project history dropdown, and history clock fix

*Context: Make the "Projects / Untitled" text in the white header (top left) editable so users can name their project. When saving, the project name should auto-map into the save modal with today's date appended. Clicking the project name should show the user's project history (saved diagrams) as a dropdown, ordered by date, matching the style of the existing diagrams dropdown. The history clock button/icon has been affected during recent UI changes and should be fixed at the same time.*

**Editable project name**

- [x] **46.1** Make the project name editable: replace the read-only `#toolbarBreadcrumbs` span with an inline-editable control (e.g. contenteditable span or input that looks like text) so users can type a project name. Display format: "Projects / [name]" where [name] is editable; default "Untitled" when empty. Persist the current project name in state (e.g. `state.projectName`) so it survives operations and is available when opening the save modal.

- [x] **46.2** Wire the editable project name to the save flow: when the user opens the save modal (clicks Save), pre-fill `#saveDiagramName` with the current project name plus today's date (e.g. "Property HO3776 – 18 Feb 2026"). If project name is empty or "Untitled", use a sensible default such as "Project – [today's date]". After successful save, update the breadcrumb to the saved name (existing behaviour) and keep `state.projectName` in sync.

**Project history dropdown (click on project name)**

- [x] **46.3** Add click handler on the project name / breadcrumb area: when the user clicks on "Projects / [name]" (or the project name portion), show a dropdown listing the user's saved diagrams (project history). Use the same data as the clock icon dropdown (GET `/api/diagrams`), ordered by date (API already returns `order("created_at", desc=True)`). Style the dropdown to match the existing `.diagrams-dropdown` (header, list, empty state, item layout with thumbnail, name, date). Position the dropdown below the breadcrumb (left-aligned with toolbar-left).

- [x] **46.4** When the user selects a project from the breadcrumb dropdown: load that diagram (same flow as clock icon: fetch `/api/diagrams/{id}`, restore state, update breadcrumb). Close the dropdown on selection. Ensure both the breadcrumb dropdown and the clock icon dropdown share the same refresh logic (e.g. `refreshDiagramsList()`) so the lists stay in sync. When user is not signed in, clicking the project name can show a prompt to sign in (or show empty state) instead of the history list.

**History clock button/icon fix**

- [x] **46.5** Fix the history clock button/icon: investigate and correct any regressions introduced during recent UI changes (e.g. toolbar restructuring, floating diagram toolbar). Ensure the clock icon button (`#diagramsDropdownBtn`) displays correctly, is properly styled with `.toolbar-icon-btn` / `.btn-icon`, and its dropdown (`.diagrams-dropdown`) positions and displays correctly. Verify the clock icon SVG renders, the button is clickable, and the dropdown opens below the button with correct z-index and visibility. Fix any layout, alignment, or visual issues so it matches the Export and Save buttons in `.toolbar-actions-secondary`.

*Section 46 status: Complete. 46.1–46.5 implemented: editable project name, save modal auto-mapping, breadcrumb project history dropdown, history clock button fix.*

---

## 47. Header toolbar polish and UX refinements

*Context: Polish the header toolbar and project name UX based on feedback. Save button as text label with light blue styling; Generate Quote uses quote modal green; dropdowns constrained to viewport; breadcrumb styling; "Go back to previous" after loading a diagram.*

- [x] **47.1** Remove date from project name: save modal pre-fill uses project name only; date is shown in saved diagrams list.
- [x] **47.2** Dropdown viewport fix: diagrams dropdown max-height `calc(100vh - 140px)` so project history and clock dropdowns don’t go off screen.
- [x] **47.3** Breadcrumb styling: increased gap (10px), bold "Projects /", font size 15px; input placeholder "Untitled" instead of value when empty.
- [x] **47.4** Project name input UX: placeholder clears on focus; click anywhere blurs; Enter commits; mousedown outside triggers blur.
- [x] **47.5** Toolbar z-index: `.toolbar-floating` z-index 100 so dropdowns render above canvas.
- [x] **47.6** "Go back to previous": capture pre-load snapshot when loading a diagram; show "← Previous" button to restore previous state.
- [x] **47.7** Save button: replace icon with text "Save"; light blue fill, light shadow; hover: more vivid blue.
- [x] **47.8** Generate Quote button: use quote modal green `#71C43C` (hover `#65b035`) to match quote modal styling.

*Section 47 status: Complete. All refinements implemented.*

---

## 48. Railway deployment – pre-deployment checklist

*Context: Deploy the Quote App to Railway for production. Backend (FastAPI) serves the frontend; Supabase remains external. Tasks must be completed before first deploy and verified post-deploy.*

**Pre-deploy: local tests to run**

- [x] **48.0.1** Run `./scripts/run-server.sh` and confirm the app starts (no Supabase error); open http://127.0.0.1:8000/ and confirm the frontend loads.
- [x] **48.0.2** Create fixtures (once): `python3 scripts/create_fixtures.py` – creates `scripts/fixtures/tiny.png` for API tests.
- [x] **48.0.3** Run API verification: `./scripts/verify_api.sh` (or `./scripts/verify_api.sh http://127.0.0.1:8000`); all checks must pass.
- [x] **48.0.4** Verify health endpoint: `curl http://127.0.0.1:8000/api/health` returns `{"status":"ok"}`.
- [x] **48.0.5** Test blueprint pipeline: `curl -X POST "http://127.0.0.1:8000/api/process-blueprint?technical_drawing=true" -F "file=@scripts/fixtures/tiny.png" -o out.png && file out.png` – should output PNG.
- [x] **48.0.6** Run E2E tests: `./scripts/run-e2e.sh` or `npm test` (backend must be running); all tests must pass.
- [ ] **48.0.7** Manual desktop testing: resize browser to 1280×720 and 1920×1080; verify layout, panel collapse/expand, resizer drag.
- [ ] **48.0.8** Manual smoke test – upload: upload a photo (JPEG/PNG), toggle Technical drawing, confirm blueprint displays.
- [ ] **48.0.9** Manual smoke test – canvas: drag products onto blueprint, select/move/resize/rotate an element, export PNG.
- [ ] **48.0.10** Manual smoke test – auth: sign in, save a diagram, load from dropdown; sign out and back in.
- [ ] **48.0.11** Manual smoke test – quote: place products, open Generate Quote, add labour hours, verify totals; test Copy to Clipboard and Print.
- [ ] **48.0.12** Manual smoke test – image types: test clipboard paste (Cmd+V screenshot), HEIC (if available), and PDF upload; confirm each processes correctly.

**Pre-deploy: features to complete (blocking)**

- [ ] **48.0.13** Section 35.7: After successful login, call `switchView('view-canvas')`; on Sign out, call `switchView('view-login')` – wire auth success/sign-out to view switching.
- [ ] **48.0.14** Section 35.8: Verify no regressions when logged in – toolbar, panel, canvas, measurement deck, upload, export, quote, saved diagrams all work.
- [x] **48.0.15** Section 22.15: Quote modal Print button – implement or verify Print flow works (or defer and hide button if out of scope).
- [ ] **48.0.16** Ensure login/sign-up flow is reachable and functional (users can create accounts and sign in before using save/load).

**Pre-deploy: troubleshooting to resolve**

- [ ] **48.0.17** Confirm server starts without "Supabase is required" – `backend/.env` has `SUPABASE_URL` and at least one of `SUPABASE_ANON_KEY` or `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] **48.0.18** If port 8000 is in use: free it (`lsof -i :8000 -t | xargs kill`) or use another port and adjust verification scripts.
- [ ] **48.0.19** App opened at http://127.0.0.1:8000/ only – never via file:// or a separate static server; fix if upload/API calls fail.
- [ ] **48.0.20** Fix any failing E2E tests before deploy; check TROUBLESHOOTING.md for known issues (e.g. color swatch click, rotation/resize coords).
- [ ] **48.0.21** Verify products load in the panel (from Supabase); if missing, check RLS policies and env vars.
- [ ] **48.0.22** Verify blueprint image processing: no "Invalid image data" for valid uploads; HEIC needs `pillow-heif`; PDF uses frontend PDF.js.
- [ ] **48.0.23** Document any unresolved issues in TROUBLESHOOTING.md before deploy so they can be revisited post-deploy.

**Railway account and project setup**

- [x] **48.1** Create Railway account (https://railway.app) and install Railway CLI (optional, for local deploys).
- [x] **48.2** Create a new Railway project. Name it (e.g. `quote-app` or `jacks-quote-app`).
- [x] **48.3** Ensure the codebase is in a Git repo (GitHub, GitLab, or Bitbucket). Railway deploys via connected repo.

**Build and run configuration (monorepo: backend + frontend)**

- [x] **48.4** Add `nixpacks.toml` at project root: configure Nixpacks to install from `backend/requirements.txt` (Nixpacks expects `requirements.txt` at root by default; use `[phases.install]` with custom `cmd` to point at `backend/requirements.txt`).
- [x] **48.5** Add `Procfile` at project root: `web: cd backend && uvicorn main:app --host 0.0.0.0 --port $PORT` so Railway uses `$PORT` and binds to `0.0.0.0`.
- [x] **48.6** Add `runtime.txt` at project root (optional): specify Python version (e.g. `python-3.11` or `python-3.12`) to match local development.
- [x] **48.7** Verify backend reads `FRONTEND_DIR` relative to `main.py`; with repo root deployed, `../frontend` from `backend/` will resolve correctly.

**Environment variables**

- [x] **48.8** Document required env vars for Railway: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`; optional `SUPABASE_JWT_SECRET` (if using legacy HS256).
- [x] **48.9** Add all required Supabase env vars in Railway dashboard (Project → Variables) or via CLI. Never commit `.env` or secrets to the repo.
- [x] **48.10** Confirm `backend/.env` is in `.gitignore` and that no secrets are hardcoded in the codebase.

**Production behaviour**

- [x] **48.11** Ensure FastAPI/uvicorn binds to `0.0.0.0` (not `127.0.0.1`) so Railway can route traffic; `--host 0.0.0.0` in Procfile covers this.
- [x] **48.12** CORS: review `allow_origins=["*"]` in `main.py`; optionally restrict to the Railway app URL and known frontend origins for production.
- [x] **48.13** Verify `/api/health` returns `{"status":"ok"}` for Railway health checks; Railway can use this as a health check path if configured.

**Security and logging**

- [x] **48.14** Ensure no debug mode or verbose error traces are enabled in production (e.g. no `debug=True` or stack traces in responses).
- [x] **48.15** Add or verify logging configuration (e.g. log level INFO or WARNING for production); Railway captures stdout/stderr.

**Documentation and runbook**

- [x] **48.16** Add `docs/RAILWAY_DEPLOYMENT.md`: deployment steps, env vars, how to trigger a redeploy, and how to view logs.
- [x] **48.17** Update `README.md` with a "Deployment (Railway)" section: link to `docs/RAILWAY_DEPLOYMENT.md` and note the live URL once deployed.

**Connect repo and first deploy**

- [x] **48.18** Connect the Git repo to Railway (New Project → Deploy from GitHub/GitLab/Bitbucket); select the correct branch (e.g. `main`).
- [x] **48.19** Trigger first deploy; monitor build logs for Python install, Nixpacks phases, and start command.
- [x] **48.20** After deploy: open the Railway-generated URL, verify the app loads (frontend at `/`), health check (`/api/health`), and API (`/api/products`, `/api/config`).
- [x] **48.21** Test auth: sign in via Supabase; verify saved diagrams (save and load) work against production API and Supabase.
- [x] **48.22** Test blueprint upload: upload an image, verify processing and canvas display; confirm OpenCV and HEIC/PDF flows work in production.
- [ ] **48.23** (Optional) Add custom domain in Railway if required; update Supabase Auth redirect URLs if using custom domain.

**Post-deploy (ServiceM8 readiness)**

- [x] **48.24** Document the production base URL (e.g. `https://quote-app-production.up.railway.app`). This URL will be used for ServiceM8 OAuth redirect_uri and webhook callbacks in future integration.

*Section 48 status: Railway deployment complete (48.1–48.20, 48.24). Production URL: https://quote-app-production-7897.up.railway.app. Remaining: 48.21–48.23 (manual auth/blueprint tests, optional custom domain).*

---

## 49. ServiceM8 OAuth 2.0 Auth setup

*Context: Enable Quote App as a ServiceM8 Public Application so users can connect their ServiceM8 accounts and sync quotes/jobs. ServiceM8 uses OAuth 2.0 (authorization code grant) for public apps. See [developer.servicem8.com/docs/authentication](https://developer.servicem8.com/docs/authentication). Production base URL (Railway) will be used for OAuth redirect_uri. Deployments must remain compatible with Railway.*

**Partner and app registration**

- [x] **49.1** Register as a ServiceM8 Development Partner at [servicem8.com/developer-registration](https://www.servicem8.com/developer-registration).
- [x] **49.2** Create a Public Application in the ServiceM8 developer account (Store Connect).
- [x] **49.3** Obtain App ID and App Secret from Store Connect; document where they are shown (Store Connect page).

**Store Connect configuration**

- [x] **49.4** Configure Return URL in Store Connect: set to `https://{RAILWAY_APP_URL}/api/servicem8/oauth/callback` (or equivalent path) so it matches the OAuth redirect_uri host.
- [x] **49.5** Ensure Return URL host matches the Railway production URL exactly (e.g. `https://quote-app-production-7897.up.railway.app`).

**Backend OAuth flow – authorize**

- [x] **49.6** Add backend route (e.g. GET `/api/servicem8/oauth/authorize`) that redirects the user to `https://go.servicem8.com/oauth/authorize` with query params: `response_type=code`, `client_id` (App ID), `scope` (space-separated), `redirect_uri` (must match Store Connect Return URL).
- [x] **49.7** Add CSRF protection: generate and store a `state` value (e.g. in session or signed cookie); include `state` in the authorize redirect; validate on callback.
- [x] **49.8** Define required scopes (e.g. `read_jobs`, `manage_jobs`, `read_job_materials`, `manage_job_materials` for quote sync); document scope rationale in docs.

**Backend OAuth flow – token exchange**

- [x] **49.9** Add OAuth callback route (e.g. GET `/api/servicem8/oauth/callback`): receive `code` and `state` from ServiceM8; validate `state` (CSRF); exchange `code` for tokens.
- [x] **49.10** Implement token exchange: POST to `https://go.servicem8.com/oauth/access_token` with `grant_type=authorization_code`, `client_id`, `client_secret`, `code`, `redirect_uri`.
- [x] **49.11** Store access token and refresh token securely (e.g. per-user in Supabase; encrypted; never expose App Secret or refresh token to frontend).
- [x] **49.12** Handle token response: parse `access_token`, `expires_in` (3600 s), `refresh_token`, `scope`; handle errors (invalid code, revoked, etc.).

**Backend OAuth flow – token refresh**

- [x] **49.13** Implement refresh: before expiry, POST to `https://go.servicem8.com/oauth/access_token` with `grant_type=refresh_token`, `client_id`, `client_secret`, `refresh_token`.
- [x] **49.14** Update stored tokens on successful refresh; handle refresh failures (prompt user to re-authorize).

**Environment and Railway**

- [x] **49.15** Add `SERVICEM8_APP_ID` and `SERVICEM8_APP_SECRET` to backend `.env.example` (with placeholder values); document in `docs/RAILWAY_DEPLOYMENT.md`.
- [x] **49.16** Add `SERVICEM8_APP_ID` and `SERVICEM8_APP_SECRET` to Railway project variables; never commit secrets.
- [x] **49.17** Ensure OAuth callback URL uses `$PORT` and `0.0.0.0` binding (Procfile) so Railway routes correctly; verify HTTPS in production.

**Security**

- [x] **49.18** Keep App Secret server-side only; never send to frontend or log.
- [x] **49.19** Validate `redirect_uri` on callback matches the configured Return URL exactly.

**Integration with Quote flow**

- [x] **49.20** Link ServiceM8 OAuth connection to the authenticated user (e.g. Supabase user id → stored ServiceM8 tokens); provide UI for "Connect ServiceM8" and "Disconnect".
- [x] **49.20.1** Add to Job confirmation flow: Enter Job # → GET job by generated_job_id → show confirmation modal with job_address, total_invoice_amount, before→after amounts → "Add to current Job" / "Make new job" (no action yet). Extended ServiceM8 scopes for future manage_job_materials, create_jobs, etc.
- [x] **49.21** Use access token for API calls when user adds materials to a ServiceM8 job: POST jobmaterial and note via ServiceM8 API; wire Success/Error in Quote footer.
- [x] **49.22** Wire 22.29: Use real ServiceM8 API responses to toggle Success/Error states in the Quote footer after Add to Job.
- [ ] **49.23** Replace default material UUID (6129948b-4f79-4fc1-b611-23bbc4f9726b) with a more detailed bundle of per-product or per-profile ServiceM8 material UUIDs.
- [x] **49.24** Fix Add to Job material POST: ServiceM8 returns 400 "Provided displayed_amount is incorrect. Expected [X]". Need to send correct `displayed_amount` and/or `displayed_amount_is_tax_inclusive` per ServiceM8 jobmaterial API.
- [x] **49.24.1** Add TODO comment to material UUID line in `backend/app/servicem8.py`: "Remind us to come back to a more detailed bundle of uuids."
- [x] **49.24.2** Fix material name convention in `backend/main.py`: Change "Storm Cloud" to "Stormcloud" (lowercase 'c') so profile "stormcloud" maps to "Stormcloud repairs, labour & materials" (not "Storm Cloud repairs...").
- [x] **49.24.3** Update `add_job_material()` function signature in `backend/app/servicem8.py` to accept `displayed_amount` and `displayed_cost` parameters (both Optional[str]).
- [x] **49.24.4** Update jobmaterial payload in `add_job_material()` to include `displayed_amount` and `displayed_cost` fields when provided. Payload should include: job_uuid, material_uuid, quantity, name, price, displayed_amount, cost, displayed_cost.
- [x] **49.24.5** Update `api_servicem8_add_to_job()` in `backend/main.py` to pass `displayed_amount` (from `quote_total`) and `displayed_cost` (from `material_cost`) to `add_job_material()` call.
- [x] **49.25** Add Job Note formatting: Remove square brackets from element names; format quantities (whole numbers without decimal: 1 not 1.0); add blank line before totals; add dollar signs and "exc gst" to Total Price and Material Cost; format time used with singular/plural ("1 hour" vs "1.5 hours"). Format: `[appUserName]\n- Item Name x Qty\n- Item Name x Qty\n\nTotal Price = $[quotePrice] exc gst\n- Time used = [labourHours] hour(s)\n- Material Cost = $[materialCost] exc gst`.

**ServiceM8 job attachment full flow (2-step – required for file to appear in Job Diary)**

- [x] **49.26** Implement ServiceM8 attachment per official guide: two-step flow so the file appears in the Job Diary. Single multipart POST to attachment.json creates the record but does not attach file data; ServiceM8 requires a second request to upload the binary.
- [x] **49.26.1** Step 1 – Create attachment record: POST to `https://api.servicem8.com/api_1.0/Attachment.json` with JSON body only (no file): `related_object` (e.g. "job" or "JOB" per API), `related_object_uuid`, `attachment_name`, `file_type`, `active`. Read `x-record-uuid` from response headers to get the new attachment UUID.
- [x] **49.26.2** Step 2 – Submit file data: POST the binary to `https://api.servicem8.com/api_1.0/Attachment/{attachment_uuid}.file` with the file as multipart form field `file` (or raw body per API). This attaches the file to the record and makes it visible in the job diary.
- [x] **49.26.3** Wire `upload_job_attachment()` in `backend/app/servicem8.py` to perform step 1 then step 2; return success/error and optional response payload for logging. Keep frontend and `/api/servicem8/upload-job-attachment` contract unchanged.

*Implementation nuance (verified working):* Step 1 uses **JSON only** (no file): `Content-Type: application/json`, body `related_object: "job"` (lowercase per official “Attaching files to a Job Diary” guide), `active: true` (boolean). URL path is `Attachment.json` (capital A). Read **`x-record-uuid`** from response headers (check both `x-record-uuid` and `X-Record-Uuid`); if missing, fail with a clear error. Step 2: POST to `Attachment/{attachment_uuid}.file` with **multipart** form key `file`, value `(filename, image_bytes, "image/png")`; do not set Content-Type (let httpx set multipart boundary). The file must not be sent in step 1.

**Add New Job (Create new Job from confirm popup)**

*Pickup context:* Flow runs **after** the user has already matched a job by `generated_job_id` (job number) as we do today. The confirm job details popup shows “Add to Job #…” and “**Create New Job Instead**” (button id `jobConfirmCreateNew` in `frontend/index.html`; handler `handleCreateNew` in `frontend/app.js` in `initJobConfirmationOverlay()` — currently only hides overlay with a TODO). Backend: `backend/app/servicem8.py` has `add_job_material`, `add_job_note`, `upload_job_attachment` (2-step: create record then .file); `backend/main.py` has `POST /api/servicem8/add-to-job` and `POST /api/servicem8/upload-job-attachment`. Quote payload for add-to-job is built by `getAddToJobPayload(jobUuid)`; blueprint PNG by `getExportCanvasDataURL()`. New job flow must use **our generated UUID** for the new job (ServiceM8 often does not return the job UUID in the response header despite docs). All steps below assume we have the **original job** (from lookup) and will create one **new job** and apply materials/note/diagram to **both** where specified.

- [x] **49.27** Wire the “Create New Job Instead” button in the confirm job details popup to the new Add New Job flow: on click, run the 4 steps below (make job → add materials to new job → add note to both jobs → add diagram to both jobs) plus job contact (get contact from original job, create BILLING contact on new job). Show success/error feedback (e.g. re-use `servicem8Feedback` or similar). Frontend calls a new backend endpoint (e.g. `POST /api/servicem8/create-new-job`) that receives the same quote payload plus original job UUID and performs all steps server-side; or frontend orchestrates multiple existing/new endpoints. Ensure existing “Add to current Job” flow is unchanged.

- [x] **49.27.1** **Make Job.** POST `https://api.servicem8.com/api_1.0/job.json`. **Generate the new job UUID on our side** (e.g. UUID4) and send it as the `uuid` field so we can use it for all subsequent calls. Body: `uuid` = our generated UUID; `job_description` = dynamic string from quote form, e.g. “New job created via Jacks app for repairs …” plus full list of parts/elements used (same content as used for the job note); `status` = `"Quote"` (hard-coded). Populate from the **job already retrieved by job number** (the “original” job); if any field is missing, still proceed except **`company_uuid`** — if `company_uuid` is missing, do not create the job and display an “unmatched” or “company_uuid missing” error to the user. Fields to copy from original job into the POST body: `job_address`, `lat`, `lng`, `company_uuid`, `billing_address`, `geo_is_valid`, `category_uuid`, `badges` (and any other required fields per ServiceM8 job create API). Original job body may be provided by the frontend (from the lookup response) or re-fetched by the backend via GET job.json with `$filter=uuid eq 'ORIGINAL_JOB_UUID'`.

- [x] **49.27.2** **Add materials to new job.** Same format as the current add-to-job flow, populated from the quote table. POST `https://api.servicem8.com/api_1.0/jobmaterial.json`. **`job_uuid` must be the UUID we generated** in 49.27.1 (not from ServiceM8 response header). Payload shape and source identical to existing add-to-job (e.g. bundled line + displayed_amount/displayed_cost per 49.24).

- [x] **49.27.3** **Add note to original job and new job.** Two POSTs with **identical note content** (same format as current add-to-job note: user name, element list, totals, labour hours, material cost, etc.). One POST for the **original job’s `job_uuid`**, one for the **new job’s `job_uuid`**. Use existing `add_job_note(access_token, job_uuid, note_text)` or equivalent.

- [x] **49.27.4** **Add diagram image to original job and new job.** Two separate runs of the existing 2-step attachment flow (create attachment record, then POST file to `Attachment/{uuid}.file`), with **identical blueprint PNG** each time. First run: `related_object_uuid` = **original job UUID**. Second run: `related_object_uuid` = **new job UUID**. Re-use `upload_job_attachment()` or the same logic for both.

- [x] **49.27.5** **Job contact for new job.** (1) **Get** job contact info for the original job: `GET https://api.servicem8.com/api_1.0/jobcontact.json?$filter=job_uuid eq 'ORIGINAL_JOB_UUID'` (use the original job’s UUID in the filter). (2) **POST** to create a job contact for the new job: `POST https://api.servicem8.com/api_1.0/jobcontact.json`. Body: `job_uuid` = **new job’s UUID** (the one we generated); `type` = `"BILLING"`. Populate from the GET response and include in the POST: `first`, `last`, `phone`, `mobile`, `email` (copy from the retrieved job contact(s) as appropriate — e.g. primary or first BILLING contact). If no job contact is returned for the original job, skip creating a job contact for the new job (no POST).

*Section 49 status: Add to Job flow implemented (49.20.1, 49.21, 49.22). Job lookup and confirmation overlay working. POST jobmaterial fix complete (49.24, 49.24.1–49.24.5). Note formatting complete (49.25). Attachment: 49.26–49.26.3 two-step flow implemented and verified. Create New Job (49.27–49.27.5): create-new-job endpoint and frontend wired; create job, materials, note/diagram to both jobs, job contact. Docs: [developer.servicem8.com/docs/authentication](https://developer.servicem8.com/docs/authentication).*

---

## 50. Quote modal: Labour as table row and independent from materials

*Context: Adding Labour Hours currently changes or decreases the materials subtotal and total quote price. Labour and materials should be independent: adding labour must not affect materials price/cost. We will move labour from the dropdown section into the quote table as editable row(s), and ensure calculations keep materials and labour separate. All changes must preserve existing behaviour: labour hours must still appear in "Add note to existing job" (getAddToJobPayload, job note formatting). Deployments must continue to succeed on Railway.*

**Calculation independence**

- [x] **50.1** Ensure labour and materials are fully independent: materials subtotal is computed only from material rows (product lines); labour contributes only to labour subtotal and total. Adding or changing labour must never alter materials subtotal or material line totals. (Backend already separates them; verify and fix any frontend logic that causes materials to change when labour is updated.)

**Labour as table row(s)**

- [x] **50.2** Remove the current labour UI from below the table: the "Labour hours" input and "Labour rate" dropdown in `.quote-labour-section`. Keep labour rates available (e.g. for use in labour row rate selector).
- [x] **50.3** Add labour as a line in the quote parts table with inline editing like other rows. Position it always on the **2nd-bottom row** (immediately above the "Type or select product…" empty row). Columns: Product (bold label, e.g. "Labour"), Qty (hours), Cost/Markup/Unit Price/Total as appropriate for labour (inline editable where applicable).
- [x] **50.4** Style the labour row product cell text in **bold** font, unlike other product rows.
- [x] **50.5** Add a small clickable icon on the right of the labour row’s product column: **"+👷"** with a thin border, visible **only on hover**. On click, duplicate the labour row (insert another labour line above the empty row; new row has same structure, default hours/rate as needed).

**Preserve existing behaviour**

- [x] **50.6** Ensure **Add note to existing job** still shows labour hours: `getAddToJobPayload()` and job note formatting must derive **total labour hours** (sum of all labour row hours when 2+ labour lines) and **number of people** (number of labour rows). Job note format: "Total Time used = X hour(s)" and under it "    - People Req = N" (e.g. "People Req = 2"). Backend must accept and include `people_count` in the note.
- [x] **50.7** Update **Print** and **Copy to Clipboard** to use labour from the labour table row(s) instead of the removed `labourHoursInput` / `labourRateSelect` (hours and rate from labour row(s), labour subtotal from sum of labour row totals).

**Totals and API**

- [x] **50.8** Quote totals: materials subtotal = sum of material row totals only; labour subtotal = sum of labour row totals; total = materials subtotal + labour subtotal. Ensure `calculateAndDisplayQuote` (or equivalent) and any `/api/calculate-quote` usage send only material elements for materials; labour is applied from labour row(s) so materials response is never affected by labour.
- [ ] **50.9** After implementation: smoke-test quote modal (add materials, add/edit labour row(s), duplicate labour row, verify materials subtotal unchanged when labour changes; verify Add to Job note still shows labour hours; verify Print/Copy; confirm app still deploys to Railway).

**Labour as product (remove labour rate dropdown)** — *See docs/PLAN_LABOUR_AS_PRODUCT.md. Use product id REP-LAB, name "Technician Repair Labour", cost 35 / price 100 exc GST, servicem8_material_uuid per plan. Keep existing labour row CSS; add delete X and inline editable unit price.*

- [x] **50.10** Supabase: Migration to insert labour product into `public.products`: id=REP-LAB, item_number=REP-LAB, servicem8_material_uuid=6129948b-4f79-4fc1-b611-23bbc4f9726b, name=Technician Repair Labour, cost_price=35, price 100 exc GST (via markup_percentage or price_exc_gst per plan), unit=hour, category=labour, profile=other; thumbnail_url/diagram_url placeholder. Migration name e.g. `add_labour_product`.
- [x] **50.11** Backend: Change POST `/api/calculate-quote` to price labour from `public.products` (labour product id REP-LAB or category labour). Accept labour as elements (e.g. labour_elements or include in elements and split by id/category). Use `get_product_pricing` for labour; stop reading `labour_rates`. Response: keep labour_subtotal / labour_hours (and labour line details) for frontend compatibility.
- [x] **50.12** Backend: Remove or repurpose GET `/api/labour-rates` once frontend no longer uses it (frontend will use labour product from products).
- [x] **50.13** Frontend: Labour row — remove rate dropdown (`.quote-labour-rate-select`). Replace with inline editable unit price (input) with default value from labour product sell price (from state.products or calculate-quote response). Labour row total = hours × unit price; recalc on hours or unit price change.
- [x] **50.14** Frontend: Add delete X to labour row total cell (same `quote-row-remove-x` as material rows; keep existing labour row CSS). Ensure remove handler continues to call `ensureLabourRowsExist()` so at least one labour row remains after delete.
- [x] **50.15** Frontend: Exclude labour product from Marley panel: in `getPanelProducts()`, exclude id REP-LAB (or category === 'labour'). Use constant e.g. LABOUR_PRODUCT_IDS = ['REP-LAB'] and filter.
- [x] **50.16** Frontend: Exclude labour product from quote "Add item" search: in `filterProductsForQuoteSearch` (or equivalent), exclude products with id REP-LAB or category labour so labour cannot be added as a material line.
- [x] **50.17** Frontend: Quote modal open and calculate-quote — ensure labour product (REP-LAB) is loaded (in state.products or via API); labour rows use its sell price as default unit price; send labour_elements (assetId REP-LAB, quantity = hours) per labour row when calling calculate-quote.
- [ ] **50.18** After labour-as-product implementation: smoke-test (labour row unit price default, inline edit, delete X, multiple labour rows, calculate quote, Add to Job note, Print/Copy); confirm app still deploys to Railway. No new env vars or build steps.

*Section 50 status: Labour as table row(s) (50.1–50.8). Labour as product (50.10–50.17) implemented: REP-LAB in products, calculate-quote uses labour_elements, labour row has inline unit price and delete X, REP-LAB excluded from panel and Add item. Pending: 50.9 and 50.18 smoke-test and Railway deploy check.*

---

## 51. Quote modal: Measured materials and Confirm Job popup fixes

*Bugs and improvements: measured-materials header rows (totals, qty "m" suffix, styling, placeholders), measurement click-out behaviour, Confirm Job popup exc gst display.*

**Measured materials – header rows**

- [x] **51.1** Quote modal: Fix or clarify the total $ amount shown in **header rows** for measured materials (e.g. Gutter Length, Downpipe). Currently confusing; amount excludes screws — either make the label/calculation clear or adjust what is included so the total is understandable.
- [x] **51.2** Header row **Qty** field: In the inline editing field for metres, display **"m"** after the number (e.g. "3.5 m") so it is clear the value is quantity in metres.
- [x] **51.3** Header row (measured materials): When the Qty field is filled, apply **UI styling** so the row has internal vertical borders matching the row background, giving the appearance of **two cells** (product + qty | merged: markup%, Unit Price, Total). UI/visual only; no change to table structure or the inline qty field behaviour.
- [x] **51.4** Remove **"—"** placeholders from **header measured rows** only (leave placeholders in other row types if present).

**Measured materials – measurement behaviour**

- [x] **51.5** Measured materials measurement: When clicking into the length field from the canvas view, **clicking anywhere outside** (not only within the element borders) should commit the number and exit edit mode. Make it easier to click out after typing.
- [x] **51.8** Measured materials measurement: When editing the length from the canvas view, **any click away** (outside the popover) should commit the number and close; currently the user has to click within the element borders. Fix so any click away enters the number and exits edit mode.

**Confirm Job Details popup**

- [x] **51.6** Confirm Job Details popup: Display the job’s **total_invoice_amount** and also show that value **divided by 1.15** with an explicit **"exc gst"** label after both values (e.g. "X inc gst" and "Y exc gst").
- [ ] **51.7** Confirm Job Details popup: Further refine UI (spacing, alignment, typography, responsive behaviour) as needed.

---

## 52. Quote modal and ServiceM8 UI enhancements

*Context: Enhance quote modal and ServiceM8 UX without affecting existing functionality. Ensure all changes are non-breaking (e.g. loaders match existing add-to-job button behaviour; explanations only additive).*

**Quote modal – labour and header row**

- [x] **52.1** Add a **warning** when the user clicks Add to Job (or opens the Add to Job flow) if **no labour** is included on the quote (e.g. no labour row or zero labour hours). Display a clear warning so the user can add labour before sending to ServiceM8.
- [x] **52.2** Header row **qty** inline editing (Metres? / length field): change increment from **0.001** to **0.5** for increase/decrease (e.g. spinner, arrow keys, or stepper) so adjustments are practical; 0.001 is impractically small.

**Confirm Job overlay – loaders and tick**

- [x] **52.3** **Add to Job #...** button (in Confirm Job Details overlay): when clicked, show the **white spinning load wheel** and then the **centralised tick emoji** when done — same UI as the original Add to Job button in the quote footer (implemented before the popup existed).
- [x] **52.4** **Create New Job Instead** button (in Confirm Job Details overlay): when clicked, show the **blue spinning load wheel** and then the **centralised tick emoji** when done — same style as used for the original add-to-job button before the popup.

**ServiceM8 connection and greyed-out state**

- [x] **52.5** When the user is **not signed into ServiceM8**, display a **warning symbol** to the left of the **download (Export)** icon in the canvas view toolbar (top left area). Visible only when ServiceM8 is not connected.
- [x] **52.6** When the **Add to Job** section (Job # input and Add to Job button) is **greyed out**, display **small red text** explaining why: e.g. "Not signed in to ServiceM8" or "Complete manual entries (Metres?) first" / "Missing materials" as appropriate. Ensures users understand why the section is disabled.

**Refinements (Feb 2026) – behaviour/placement/UX fixes**

- [x] **52.7** **Labour hours warning placement (52.1):** Display the no-labour warning **inside the quote modal** (e.g. in the Add to Job section or a dedicated message block in the modal), not on the canvas/toolbar. When the user clicks Add to Job (or opens the Add to Job flow) with no labour row or zero labour hours, show the warning in-context in the modal; remove or replace the current `showMessage()` so the warning does not appear in the toolbar.
- [x] **52.8** **Confirm Job popup button UI (52.3, 52.4, 51.7):** (a) Centre-align the load wheel in both "Add to Job #…" and "Create New Job Instead" buttons (spinner in centre of button, replacing text until done). (b) Make button shape more rectangular: add min-height and sufficient top/bottom padding (match quote footer Add to Job button: e.g. min-height 40px, padding 10px 20px); avoid thin-pill appearance. (c) Add a blue border to "Create New Job Instead" matching the shape of the Add to Job # button (border-radius, border colour). (d) Use the same spinner pattern and spacing as the quote footer Add to Job button (`.quote-servicem8-btn`) for both overlay buttons.
- [x] **52.9** **ServiceM8 disconnection warning (52.5, 52.6):** (a) Ensure the toolbar warning symbol is visible **only when the user is not signed into ServiceM8** (fix any logic or initial state that causes it to always display). (b) Increase the symbol size so it is clearly visible. (c) Provide clear information/help: e.g. improved tooltip or short explanatory text (e.g. "Not connected to ServiceM8 — connect via profile menu"), so the user knows what to do. (d) When the Add to Job section is greyed out, ensure the small red explanation text (52.6) is visible and helpful (e.g. "Not signed in to ServiceM8" / "Complete manual entries (Metres?) first" / "Missing materials" as appropriate).

---

## 53. Login screen branding and ServiceM8 at login

*Context: Customise the login screen with a branded image (user will upload) and, if required, integrate ServiceM8 authentication with the login flow so users can connect or sign in with ServiceM8 where appropriate.*

- [ ] **53.1** **Login screen custom image:** Set up the login screen (`#view-login`) to use a custom branding/background image. User will upload the image asset; implement the UI/CSS to display it (e.g. as background, hero image, or logo area). Ensure layout remains usable and accessible; document recommended dimensions/format for the uploaded image.
- [ ] **53.2** **ServiceM8 and login (if needed):** If product or user research determines that ServiceM8 should be part of the login experience (e.g. “Connect ServiceM8” or sign-in-with-ServiceM8 on the login screen), implement the required flow. Otherwise document that ServiceM8 remains optional and is connected from the canvas profile menu after sign-in.

---

## 54. Mobile app

*Context: Same URL serves desktop and mobile; layout is adaptive via `data-viewport-mode`. Use this section to distinguish desktop-only, mobile-only, and universal changes.*

**Desktop-only (unchanged by mobile work)**

- Layout: left 2/3 blueprint, right 1/3 resizable panel; resizer drag; panel collapse = narrow strip with chevron.
- No change to existing desktop behaviour when viewport is wide or pointer is fine.

**Mobile-only (narrow viewport / coarse pointer)**

- Products panel: bottom sheet (54.5); close by button or tap outside or Escape.
- Toolbar and diagram toolbar: compact; touch targets increased (44px minimum).
- Focus management: opening panel focuses close button; closing focuses open tab; live region announces.
- Panel exposed as `role="dialog"` `aria-modal="true"` when expanded on mobile.

**Universal (both)**

- Skip link, app announcer, aria-labels, focus-visible styles, reduced-motion preferences where applied.

**Completed**

- [x] **54.1** Adaptive layout: mobile = slide-out products panel from right; desktop = resizable side panel.
- [x] **54.2** Mobile touch targets 44px minimum (toolbar, panel toggles, product thumbs, diagram toolbar).
- [x] **54.3** Focus management and live region when panel opens/closes on mobile.
- [x] **54.4** Panel as dialog (aria-modal) when expanded on mobile; reduced motion for panel and skip link.

**Accessibility improvements (laundry list)**

- [x] **54.5** **Move parts panel to bottom of screen on mobile** (instead of right slide-out): bottom sheet or bottom drawer so blueprint stays full-width and products are in a lower tray; improves one-handed use and thumb reach.
- [x] **54.6** Ensure all interactive elements have visible focus indicators (focus-visible) on mobile.
- [x] **54.7** Screen reader: announce canvas state changes (e.g. "Element selected", "Blueprint uploaded") via live region where useful.
- [x] **54.8** Colour contrast: verify all mobile UI text and controls meet WCAG AA (4.5:1 text, 3:1 large text and UI components).
- [x] **54.9** Form labels: ensure every form control has an associated visible or screen-reader-only label on mobile.
- [x] **54.10** Touch target spacing: maintain adequate spacing between adjacent 44px targets to reduce mis-taps.
- [x] **54.11** Zoom: ensure viewport allows pinch-zoom (no user-scalable=no); test that layout doesn't break at 200% zoom on mobile.
- [x] **54.12** Orientation: test and fix layout in both portrait and landscape on small phones.
- [x] **54.13** Modal and overlay focus trap: when products panel (or other modal) is open on mobile, trap focus inside until closed and restore focus on close (partially done; verify and extend).
- [x] **54.14** Error messages: ensure API/validation errors are announced (e.g. role="alert" or live region) and visible on mobile.
- [x] **54.15** Loading states: provide accessible loading indicators (aria-busy, aria-live, or visible text) for uploads and API calls on mobile.

**Canvas and toolbar UX (uncompleted)**

- [x] **54.16** **Mobile: no drag-to-select; pan instead.** On mobile, do not use marquee/drag-to-select on the canvas. Instead, allow the user to move around (pan) on the canvas so they can navigate the blueprint without accidentally starting a selection.
- [x] **54.17** **Pinch zoom:** Ensure pinch-to-zoom on the canvas is flawless and smooth (no jank, responsive to gesture, correct scale limits and inertia if applicable).
- [x] **54.18** **Parts formatting:** Ensure proper formatting of placed parts so they do not overlap (e.g. layout/positioning rules, spacing, or snap-to-grid so elements stay readable and non-overlapping).
- [x] **54.19** **Global toolbar: collapsible and movable.** Allow the global (top) toolbar to be collapsed and moved around the screen so the user can free up space; position is user-adjustable (e.g. drag to reposition).
- [x] **54.20** **Element toolbars: movable.** Allow the element-specific toolbars (e.g. floating toolbar for selection actions) to be moved around the screen for more space. No need to add collapse for element toolbars—movable only.

---

## 55. Mobile-native accessibility hardening (Apple HIG follow-up)

*Context: Section 54 established baseline mobile support and accessibility. This section closes remaining mobile-native and assistive-technology gaps across the full user journey while preserving Railway-safe deployment architecture.*

**Follow-up tasks**

- [x] **55.1** **Auth: passkey + password manager first-class support.** Add passkey/WebAuthn login (where supported) and ensure iOS password manager/autofill flows are smooth for sign in and sign up.
- [x] **55.2** **Auth/view switching focus management.** On every `switchView()` transition (`view-login`, `view-canvas`, `view-products`), set focus to a deterministic primary target and restore focus to the previous trigger when returning.
- [x] **55.3** **Shared modal accessibility framework.** Implement one reusable modal utility for all overlays/dialogs (quote, product, crop, save diagram, job confirmation, auth fallbacks) with trap, Escape close, inert background, and focus restore.
- [x] **55.4** **Replace browser `alert()` / `confirm()` flows.** Remove native blocking dialogs in favour of accessible in-app dialogs/alerts with correct semantics (`role="alertdialog"` / `role="alert"`) and keyboard support.
- [x] **55.5** **Canvas non-gesture alternatives for manipulation.** Add an accessible inspector panel for selected elements (position, size, rotation, lock, layer order) so transforms are fully operable without drag gestures.
- [x] **55.6** **VoiceOver/Voice Control discoverability for actions.** Ensure item manipulation actions have explicit labels/hints and that gesture-only operations have discoverable control alternatives.
- [x] **55.7** **Dynamic Type and 200% zoom resilience.** Refactor fixed mobile text/layout sizing to scale-friendly rules (`rem`/`clamp`) and verify no clipping/overlap at 200% zoom, including small phones.
- [x] **55.8** **Quote/product modal mobile layouts.** Make quote and product-management flows fully usable on iPhone SE class viewports (no horizontal clipping, reachable primary actions, stable scrolling).
- [x] **55.9** **Accessibility settings discoverability.** Add a settings/preferences surface exposing accessibility controls (reduced motion override, larger controls, high-contrast mode/help) with persisted user preferences.
- [x] **55.10** **Mobile accessibility regression coverage.** Add automated/manual test coverage for mobile viewport behavior, modal focus order, keyboard operability, live-region announcements, and zoom/orientation regressions.

---

**MVP status:** All tasks in sections 1–8 are complete. Section 9 items are deferred. Sections 10–12 are complete. Section 13.1–13.3 complete; 13.4–13.5 optional. Section 14 complete. Section 15.1–15.4 and 15.7–15.14 complete; 15.5–15.6 optional. Section 16 complete. Section 17 complete (drill-through with Alt, blueprint lock, lock picture to background). Section 18 complete (18.9–18.11: rotated handle hit test, rotation-aware cursors, rotate handle accessibility). Section 19 complete (blueprint disappearance fix). Section 20 added (anchor-based resize). Section 21 complete (transparency slider via dedicated checkerboard button at blueprint top-left; works when locked; slider blue, number input fixed; E2E tests). Section 22 in progress: 22.1–22.4, 22.5–22.14, 22.16–22.19 complete; 22.15, 22.20–22.24 remaining. Quote modal has Add item to add lines manually. Section 23 complete (CSV product import). Section 25 complete (all Marley diagram SVGs uploaded; downpipe joiner mapping fixed). Section 24 complete (profile filter dropdown implemented). Section 26 added (billing logic: manual guttering distance, dropper 4 screws, saddle/adjustable clip 2 screws). Section 27 complete (Digital Takeoff / Measurement Deck – badges, panel, two-way highlight, quote length→quantity). Section 28 added (Delete element only; badge double-click length entry). Section 29 complete (manual pop-up UI: metres, gutter/downpipe labels, red/green states). Section 30 complete (expand blueprint image types: clipboard paste, HEIC, PDF frontend conversion; BMP/TIFF/AVIF/GIF out of scope). Section 55 complete (55.1–55.10).

*Last updated: Feb 2026. Section 54: Mobile app (54.1–54.15 complete); 54.16–54.20 added (mobile pan vs drag-select, pinch zoom, parts overlap, movable/collapsible toolbars). Section 55 complete: mobile-native accessibility hardening follow-up (55.1–55.10). Section 49: Add to Job flow in place; jobmaterial POST returns 400 "displayed_amount incorrect" (49.24 to fix). Section 48: Railway deployment. See TROUBLESHOOTING.md for displayed_amount error.*
