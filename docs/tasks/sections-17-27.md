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

