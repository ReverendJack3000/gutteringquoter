# Troubleshooting – recurring issues

When we hit an issue that might come up again, add an entry here so the project can recover quickly. Keep entries short: symptom, cause, and fix.

---

## Quote: Downpipe section hierarchy and mixed screw label – 2026-02

- **Symptom:** Downpipe section showed screws first, then downpipes/clips in a flat order; no metres input or incomplete state like Gutter System; mixed quote showed "(brackets & clips)" without "Screws" and screws nested under gutter.
- **Cause:** Section 39 implemented a simple "Downpipe" header + screws only; downpipes and clips stayed in ungrouped; no per-size header with metres or bin-sort; mixed screw label was abbreviated.
- **Fix:** (1) Group DP-*, SCL-*, ACL-* by size into `downpipeGroups`; sort children downpipes first then clips. (2) Render per-size "Downpipe 65mm (Metres?)" header with `.quote-header-metres-input` and `quote-row-incomplete-measurement` when empty (same as Gutter). (3) `getElementsFromQuoteTable` reads `data-section-header="downpipe-65"` / `downpipe-80`, emits bin-packed downpipes, skips child DP rows when header has length. (4) Mixed screw row label: "Screws (brackets & clips)". (5) Downpipe-only: screws nested after downpipes and clips under Downpipe section.

---

## Bracket/screw lines not showing in quote – 2026-02

- **Symptom:** Quote modal shows gutters and totals, but 1 bracket per 400 mm gutter and 3 screws per bracket are not listed as line items (even though backend applies the rule).
- **Cause:** Backend `expand_elements_with_gutter_accessories` correctly adds BRK-SC-MAR/BRK-CL-MAR and SCR-SS to the materials list; the frontend only **updated** existing table rows and never **created** rows for those IDs, so inferred lines were missing from the table (totals could still be correct).
- **Fix:** In `calculateAndDisplayQuote()`, for each `quote.materials` line: if no row exists with that `data-asset-id`, create a new row (insert before the empty row) and set `data-inferred="true"`. In `getElementsFromQuoteTable()`, skip rows with `data-inferred="true"` so we never re-send inferred items and avoid double-counting. Manually added brackets/screws (from the empty row) have no `data-inferred` and are still sent and merged by the backend.

---

## Server won't start: "Supabase is required" – 2025-02

- **Symptom:** Running `uvicorn main:app ...` fails with `ValueError: Supabase is required. Set SUPABASE_URL and ...`.
- **Cause:** The app always uses Supabase for data; `backend/.env` is missing or has no key set.
- **Fix:** Ensure `backend/.env` exists with at least:
  - `SUPABASE_URL=https://rlptjmkejfykisaefkeh.supabase.co`
  - `SUPABASE_ANON_KEY=<anon key>` **or** `SUPABASE_SERVICE_ROLE_KEY=<service_role key>`
  Get keys from: [Supabase → Jacks Quote App → Settings → API](https://supabase.com/dashboard/project/rlptjmkejfykisaefkeh/settings/api). The **anon** key is enough for reading products (no need to reveal the service_role secret).

---

## Port 8000 already in use – 2025-02

- **Symptom:** `uvicorn main:app ...` fails with `[Errno 48] Address already in use`.
- **Cause:** Another process (often a previous uvicorn run) is already bound to port 8000.
- **Fix:** Free the port and restart. Example: `lsof -i :8000 -t | xargs kill` then run uvicorn again. On macOS/Linux you can also use `kill $(lsof -t -i :8000)`.

---

## Cannot upload photos or open side panel when testing locally – 2025-02

- **Symptom:** Locally, photo upload does nothing or fails; the right “Marley products” panel won’t open when clicking the chevron strip.
- **Cause:** The app is being opened via **file://** (double‑clicking `frontend/index.html`) or from a **different server** (e.g. Live Server on another port). With file://, the browser resolves `/app.js` and `/styles.css` from the filesystem root, so the script often doesn’t load and the page has no behaviour. With a separate static server, `/api/...` requests go to that server instead of the FastAPI backend, so uploads fail.
- **Fix:** Run the backend from the **backend** directory and open the app only at the URL it prints:
  ```bash
  cd backend
  uvicorn main:app --reload --host 127.0.0.1 --port 8000
  ```
  Then in the browser open **http://127.0.0.1:8000/** (or http://localhost:8000/). Do not open the HTML file directly (file://) and do not use another static server for the frontend.

---

## Duplicate variable in draw() broke entire app (E2E found) – 2025-02

- **Symptom:** When testing with Puppeteer, the right panel never expanded and the app appeared to have no JavaScript (upload/panel not working). Same could affect real users if the script failed to parse.
- **Cause:** In `frontend/app.js`, the `draw()` function destructured `scale`, `offsetX`, `offsetY` from `state` and then redeclared them with `let`, causing a `SyntaxError`. The script failed to parse so nothing ran.
- **Fix:** Remove `scale`, `offsetX`, `offsetY` from the destructuring in `draw()` and keep only the `let` declarations.

---

## normalize_linear_assets.py: "no library called cairo" – 2026-02

- **Symptom:** Running `python3 backend/scripts/normalize_linear_assets.py` fails with `OSError: no library called "cairo-2" was found` (or similar).
- **Cause:** cairosvg depends on the system Cairo library; it is not installed or not on the library path.
- **Fix:** Install Cairo for your OS, then re-run the script. On macOS: `brew install cairo`. On Ubuntu/Debian: `sudo apt-get install libcairo2`. On Windows: install GTK/Cairo or use a conda environment that includes cairo. Then from project root: `cd backend && python3 scripts/normalize_linear_assets.py` (optional: pass path to assets, e.g. `../frontend/assets/marley`).

---

## OpenCV rejects very small PNG (e.g. 1×1) – 2025-02

- **Symptom:** `POST /api/process-blueprint` returns 400 `{"detail":"Invalid image data"}` when sending a minimal 1×1 PNG fixture.
- **Cause:** `cv2.imdecode()` can return `None` for very small or minimal PNGs; backend then raises "Invalid image data".
- **Fix:** Use a small but valid image (e.g. 10×10 PNG) for tests. `scripts/create_fixtures.py` and `scripts/fixtures/tiny.png` use a 10×10 PNG for this reason.

---

## Changing element colour makes other elements and blueprint disappear – 2026-02

- **Symptom:** After picking a colour for an element from the colour palette, other elements and the blueprint diagram vanish from the canvas; only the coloured element (or nothing else) remains visible.
- **Cause:** The colour tint is applied with `ctx.globalCompositeOperation = 'source-in'`. If this is not reset to `'source-over'` after the fill, the canvas context stays in `source-in` mode, so all later draws in that frame (other elements, blueprint) are composited with source-in and only appear where they overlap existing pixels, making the rest of the canvas look blank.
- **Fix:** After every use of `globalCompositeOperation = 'source-in'` for the colour fill, set `ctx.globalCompositeOperation = 'source-over'` (and in export, `ex.globalCompositeOperation = 'source-over'`) before the next drawing. Also call `draw()` from the colour palette click handler so the canvas redraws immediately when the user changes colour.

---

## Element appears as solid block of colour instead of tinted lines – 2026-02

- **Symptom:** When a colour is applied to a Marley part, the whole element renders as a solid rectangle of that colour instead of only the lines/strokes changing colour.
- **Cause:** Using `source-in` after drawing the image tints every pixel the image drew. If the image (e.g. SVG loaded as `Image`) is rendered with an opaque background in the browser, the whole bounding box gets the colour.
- **Fix:** Use the image as an alpha mask: fill the element rect with the tint colour, set `globalCompositeOperation = 'destination-in'`, then draw the image. That keeps the colour only where the image has non-transparent pixels (the lines). Reset to `source-over` after. Apply the same approach for the ghost (drag) and for export.

---

## Cursor misaligned in Chrome (have to click right of element to select) – 2026-02

- **Symptom:** In Chrome, the pointer has to be positioned to the right of an element’s box to select it; hit-testing feels offset.
- **Cause:** Converting client coordinates to canvas space with `(clientX - rect.left) / scale` assumes the canvas’s `getBoundingClientRect()` is in the same coordinate system as the drawing. With device pixel ratio or layout differences, `rect.width`/`rect.height` can differ from the logical canvas size (`state.canvasWidth/dpr`, `state.canvasHeight/dpr`), so pointer and drawn content don’t line up.
- **Fix:** Map client → canvas via a single “display” space: `displayX = (clientX - rect.left) * (logicalW / rect.width)` (and same for Y). Use this in `clientToCanvas`, handle hit tests (`hitTestHandle`, `hitTestBlueprintHandle`), zoom-to-cursor, and E2E screen-center helper so all pointer math uses the same mapping.

---

## E2E rotation/resize fails (angle or size did not change) – 2026-02

- **Symptom:** Puppeteer reports "Rotate: angle did not change" or "Resize: size did not change" even though the handle is found.
- **Cause:** `__quoteAppGetSelectionBoxInCanvasCoords` returns handle positions in **display coordinates** (logical canvas space). The E2E script added these to `getBoundingClientRect().left/top` and used the result as screen coordinates. Display coords are not 1:1 with CSS pixels when canvas rect size differs from logical size (e.g. DPR), so the mouse was sent to the wrong place.
- **Fix:** Convert display to client: `clientX = rect.left + displayX * (rect.width / logicalW)`. Added `__quoteAppGetSelectionBoxInScreenCoords()` returning box/handles in client coords. E2E uses this for rotation and resize so `page.mouse.move(x, y)` hits the real handle.

---

## Element diagram disappears when color is applied – 2026-02

- **Symptom:** When a color is applied to a Marley part, the element diagram (lines/strokes) disappears, leaving only a solid colored block or nothing visible.
- **Cause:** The tinting logic was overwriting the source image or failing to preserve the alpha channel. Using `destination-in` directly on the main canvas context can cause issues if the original image isn't preserved separately.
- **Fix:** 
  1. **Preserve source:** Store `element.originalImage` (the B&W diagram) separately from `element.image`. Never overwrite `originalImage`.
  2. **Cached tinted canvas:** Create `element.tintedCanvas` (offscreen canvas) when color is set. Use `createTintedCanvas()` which: fills with color, sets `globalCompositeOperation = 'destination-in'`, draws the original image (uses it as an alpha mask), resets composite operation. This preserves transparency.
  3. **Render helper:** Use `getElementRenderImage(el)` which returns `tintedCanvas` if color exists, otherwise `originalImage`. Also migrates old elements (sets `originalImage = image` if missing).
  4. **Cache invalidation:** When color changes, set `el.tintedCanvas = null` to regenerate. When size changes (resize), invalidate cache if dimensions don't match.
  5. **Fallback:** If `color` is null, always use `originalImage` (never tintedCanvas).

---

## CSV product import fails with "row-level security policy" – 2026-02

- **Symptom:** `POST /api/products/import-csv` returns errors like `new row violates row-level security policy for table "products"`; all rows fail.
- **Cause:** `public.products` had RLS enabled with only a SELECT policy; no INSERT or UPDATE policies.
- **Fix:** Add RLS policies for INSERT and UPDATE on `public.products` (e.g. via migration `add_products_insert_update_rls_policies`). The backend uses anon or service_role key; both need policies when RLS is enabled (service_role normally bypasses RLS, but anon key requires policies).

---

## E2E: "Node is either not clickable or not an Element" on color swatch – 2026-02

- **Symptom:** Puppeteer E2E fails when clicking `.color-swatch` elements (e.g. blue/red swatches) with "Node is either not clickable or not an Element".
- **Cause:** The color palette UI may use `pointer-events` or layering that makes `elementHandle.click()` fail even when the element exists.
- **Fix:** Use `page.evaluate((el) => el && el.click(), swatchHandle)` instead of `swatchHandle.click()` so the click runs in the page context and bypasses Puppeteer’s clickability checks.

---

## Gutter (or normalized asset) cannot be dragged onto canvas – 2026-02

- **Symptom:** Dragging a gutter (or other Marley product that uses a “normalized” diagram) onto the canvas does nothing: no element appears; drop seems to be ignored.
- **Cause:** The backend returns `.png` diagram URLs for normalized assets (e.g. `gutter-storm-cloud.png`, `gutter-classic.png`) so the frontend requests those. If the normalize script has not been run (or PNGs were not committed), those files are missing → `loadImage` fails → the drop handler catches the error and does not add an element.
- **Fix:**  
  1. **Immediate:** The frontend now uses `loadDiagramImage(url)`, which tries the given URL and, if it ends in `.png` and loading fails, falls back to the same path with `.svg`. So gutters (and other normalized products) work again even when PNGs are absent.  
  2. **Optional (sharper assets):** Run the normalize script so PNGs exist: from project root, `cd backend && python3 scripts/normalize_linear_assets.py` (or pass `../frontend/assets/marley`). Then the app will use the 4× PNGs for better quality when zoomed.

---

## Flipped element jumps out of bounding box – 2026-02

- **Symptom:** After using Flip Horizontal or Flip Vertical, the element’s image appears shifted (e.g. to the left) and no longer inside its blue selection box; the box stays in place but the drawn content moves.
- **Cause:** Flip was implemented by translating to the element’s top-left, then `scale(-1, 1)` (or similar), then a “compensating” translate. With the origin at the top-left, scaling by -1 draws the image in the opposite direction, which effectively moves it by its full width/height and breaks alignment with the bounding box.
- **Fix:** Use a strict local transform order with **origin at the element center**: (1) `ctx.save()`, (2) `ctx.translate(centerX, centerY)`, (3) `ctx.rotate(rotation)`, (4) `ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1)`, (5) `ctx.drawImage(img, -width/2, -height/2, width, height)`, (6) `ctx.restore()`. No extra translate before or after the scale; flip is purely a visual transform around the center so the box stays correct. Apply the same order in draw, ghost, export, and thumbnail.

---

<!-- Example entry format:

## Short title (optional: date)

- **Symptom:** What happened (error message or behaviour).
- **Cause:** Why (e.g. Python 3.9 vs 3.10, path, env).
- **Fix:** Steps or code that fixed it.

-->
