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

