
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
- [x] **35.10** Fix desktop profile menu navigation to Product Management and User Permissions: from profile dropdown, "Product Management" must switch to #view-products and "User Permissions" (admin) to #view-user-permissions. Implement per plan: docs/plans/2026-02-22-desktop-profile-menu-products-user-permissions-navigation-fix.md (menu item handlers: e.stopPropagation(); document handler: skip close if profileDropdown.contains(e.target); .profile-dropdown z-index 1000; initAuth: ensure profile/menu listeners attached even when authForm missing). Desktop-only; mobile unchanged; Railway-safe.

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

**Admin role-permissions management follow-up (desktop-only):**

- [x] **36.12** Backend: add admin-only endpoint to list users and roles for permissions management (merge `auth.users` + `public.profiles`; include email, user_id, role). Require Bearer + `require_role(["admin"])`; return clear error if service-role key is unavailable.
- [x] **36.13** Backend: add admin-only endpoint to update a user's role in `public.profiles` (`viewer` | `editor` | `admin`) with strict validation and clear API errors. Require Bearer + `require_role(["admin"])`.
- [x] **36.14** Frontend auth state: derive current role from JWT/user metadata and gate admin-only UI with desktop guard (`layoutState.viewportMode !== "mobile"`).
- [x] **36.15** Desktop UI: add an admin-only "User Permissions" option in the existing profile dropdown and open a new desktop-only management view styled to match Product Library patterns.
- [x] **36.16** Desktop permissions view: render searchable user rows with role selectors and explicit save/update action per row; wire load/refresh/error/empty states without impacting existing Product Library or canvas flows.
- [x] **36.17** Quote permissions parity: ensure desktop pricing-admin actions use Bearer auth and are shown only to admin role; non-admins remain read-only (mobile behavior unchanged).
- [x] **36.18** Regression and safety validation: verify desktop-only scope, no mobile UI regressions, and Railway-safe deploy behavior (required env vars, API responses, auth failures).

**Desktop user invite and remove (per plan 2026-02-22):**

- [x] **36.19** Invite user (desktop): UI "Invite user" button + modal (email, optional role); backend POST invite endpoint using `auth.admin.invite_user_by_email`; profile upsert for role; success/error handling; no mobile changes; Railway-safe.
- [x] **36.20** Remove user (desktop): per-row Remove button (hidden for self); confirm via `showAppConfirm`; backend DELETE endpoint with self-remove and optional last-admin guards; `auth.admin.delete_user`; remove from state and re-render; no mobile changes; Railway-safe.
- [x] **36.21** Regression and safety: checklist from plan (list/search/role/Save, Back/Refresh, profile menu navigation, desktop gate, no new env, E2E profile menu passes).

*Section 36 status: In progress. 36.1–36.10, 36.12–36.21 complete. 36.11 remains optional/open (localProducts migration).*

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
