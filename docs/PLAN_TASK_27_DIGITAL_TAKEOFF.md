# Implementation Plan: Task 27 – Digital Takeoff (Measurement Deck)

**Purpose:** Plan only. No code changes until implementation. Ensures we can implement Section 27 without unwinding current functionality.

**References:** `TASK_LIST.md` Section 27 (27.1–27.13), README.md, `.cursor/rules` (task-list-completion, recurring-issues-documentation).

---

## 1. Project context (current behaviour)

- **Stack:** FastAPI backend, vanilla HTML/CSS/JS frontend, Supabase (products, labour_rates). No build step.
- **Canvas:** Single `state` object in `frontend/app.js`; `state.elements[]` holds placed Marley parts (id, assetId, x, y, width, height, rotation, zIndex, image, originalImage, color, baseScale, locked). Blueprint is separate (`state.blueprintImage`, `state.blueprintTransform`).
- **Element creation:** Two paths—**drop** on canvas (`canvas.addEventListener('drop', …)`) and **center-drop** (product thumb click in `renderProducts()`). Both create an element with the same shape and push to `state.elements`; both use `getNextElementZIndex()` and `elementIdCounter`.
- **Draw loop:** `draw()` in app.js builds a `layers` array (blueprint + elements), sorts by zIndex, then draws each layer. After elements it draws hover outlines (`state.hoveredId`), then selection box and handles. Badges must render **above elements** but **below** selection/hover so they don’t steal hit-testing.
- **Undo:** `cloneStateForUndo()` serialises elements (id, assetId, x, y, width, height, rotation, zIndex, color, baseScale, locked). `restoreStateFromSnapshot()` restores elements and re-loads images. Any new fields (e.g. `sequenceId`, `measuredLength`) must be included in clone/restore so undo doesn’t drop them.
- **Quote flow:** “Generate Quote” uses `countCanvasElements()` (counts by assetId, one count per element). Table is built from that; “Calculate” uses `getElementsFromQuoteTable()` which reads table rows → `[{ assetId, quantity }]`. Backend `POST /api/calculate-quote` expects `elements: [{ assetId, quantity }]`; `gutter_accessories.expand_elements_with_gutter_accessories()` then expands gutters (1 bracket/400mm, 3 screws/bracket), droppers (4 screws), saddle/adjustable clips (2 screws). So changing how **quantity** is derived for gutters/downpipes (e.g. from length) must still produce a single `quantity` per assetId (or per line) for the existing API.
- **Measurable product types (from task + backend):**
  - **Gutters:** `GUT-*-MAR-*M` (e.g. GUT-SC-MAR-1.5M, GUT-CL-MAR-3M). Backend already has `GUTTER_PATTERN` and length in metres.
  - **Downpipes / droppers:** Downpipes (e.g. DP-65-*, DP-80-*), downpipe joiners (DPJ-*), droppers (id `dropper` or `DRP-*`). Backend treats droppers and “other” (e.g. downpipes) by quantity; gutter uses length_m from asset_id to compute brackets/screws.

---

## 2. Task 27 subtasks – implementation order and touchpoints

Implement in dependency order below. Each item notes **where** to change and **what to preserve**.

### 27.1 – State: `nextSequenceId` and assign on drop

- **Add to `state` (app.js):** `nextSequenceId: 1` (or 0 and use pre-increment when assigning).
- **When to assign:** In both **drop** and **center-drop** paths, **after** creating `el` and **before** `state.elements.push(el)`:
  - If the product is **measurable** (see 27.2): set `el.sequenceId = state.nextSequenceId++`, `el.measuredLength = 0`.
  - If not measurable: do not set `sequenceId` (element stays as today).
- **Undo:** Include `sequenceId` and `measuredLength` in `cloneStateForUndo()` and in `restoreStateFromSnapshot()`. When restoring, do **not** reset `state.nextSequenceId` from snapshot (optional: we could store max sequence id in snapshot and restore it to avoid reuse; for MVP, leaving nextSequenceId as-is is acceptable so new drops keep unique ids).
- **Risk:** None if we only add fields and branch on “is measurable” in the two creation paths.

### 27.2 – Define measurable types (gutters + downpipes/droppers)

- **Add a helper** (e.g. `isMeasurableElement(assetId)` or `getMeasurableType(assetId)`):
  - Gutters: match `GUT-*-MAR-*M` (same idea as backend `GUTTER_PATTERN`; can use regex or prefix/suffix).
  - Downpipes/droppers: match `DP-`, `DPJ-`, or dropper (e.g. `dropper` or `DRP-`).
- **Use this helper** in 27.1 when deciding whether to set `sequenceId` / `measuredLength`, and in 27.8 when filtering elements for the Measurement Deck cards.
- **Placement:** Same file (app.js); keep one source of truth for “measurable” so badge and panel stay in sync.
- **Risk:** None; additive.

### 27.3 – Draw measurement badge on canvas

- **Where:** Inside `draw()`, after the `layers.forEach` that draws element images (and ghost), and **before** the `elements.forEach` that draws hover outlines (so badges are above elements, below hover/selection).
- **Logic:** For each element in `state.elements` that has `el.sequenceId` (truthy), draw a badge at element **center** in canvas coords: `(el.x + el.width/2, el.y + el.height/2)`. Transform to screen: `(offsetX + cx * scale, offsetY + cy * scale)`. Badge must stay **upright**: use `ctx.save()`, translate to badge center, draw (no rotation), `ctx.restore()`.
- **Risk:** None if we only draw when `el.sequenceId` is set and don’t change existing layer/hover/selection drawing order.

### 27.4 – Badge style

- **Style:** Small circle, radius ~12px (in screen space so it scales with zoom), background `#18A0FB`, white bold number (the `sequenceId`). Ensure text is centered in the circle.
- **Risk:** None.

### 27.5 – Badges and hit-testing

- **Rule:** Badges are draw-only. Do **not** add hit-test logic for the badge circle. Selection/hover remain on the **element** bounds (existing hit-test). So no change to `hitTest()` or pointer handlers.
- **Risk:** None.

### 27.6 – Bottom panel (Measurement Deck) – structure and layout

- **HTML:** Add a fixed bottom panel (e.g. `<div id="measurementDeck" class="measurement-deck">`) that contains a horizontal scroll list or grid of cards. Place it so it doesn’t overlap the right Marley panel (e.g. above the bottom of the viewport, full width or only under the blueprint area). Structure: `.app` > existing content; add panel as sibling to `.workspace` or inside `.app` so it sits at bottom with higher z-index than canvas.
- **CSS:** Fixed (or sticky) at bottom, z-index above canvas/blueprint-wrap, background and border so it’s visible. Horizontal scroll for cards; minimal height so it doesn’t dominate. Ensure it doesn’t break existing layout (toolbar top, workspace with blueprint + resizer + panel).
- **Risk:** Low if we use a new container and don’t change existing `.workspace` / `.blueprint-wrap` structure. Check at 1280×720 and 1920×1080.

### 27.7 – Measurement cards content and render

- **Content per card:** Label “Run #N” (N = `el.sequenceId`), input “Length (mm)”, optional status (e.g. green border when length &gt; 0). Data: filter elements with `el.sequenceId &gt; 0`, sort by `sequenceId`, one card per element.
- **Render:** Add a function e.g. `renderMeasurementDeck()` that:
  - Builds list of measurable elements (with sequenceId), sorted by sequenceId.
  - Clears and re-fills the deck container with one card per run; each card has `data-element-id` (and optionally `data-sequence-id`) for 27.9 and 27.10.
- **When to call:** On elements change (after drop, center-drop, delete, undo). Call from same places that call `draw()` after element list changes; optionally debounce if many rapid updates.
- **Input:** Number input, min 0, step 1 (or 0.1 if we allow decimals). On input/change, update `el.measuredLength` for the corresponding element (find by element id), then `draw()` to refresh badge if we show length on canvas later; for MVP, updating state is enough. Optionally push undo on blur/change so length edits are undoable.
- **Risk:** Low. Keep quote modal and other modals unchanged.

### 27.8 – Filter and sort for cards

- **Already covered in 27.7:** Filter `state.elements` where `el.sequenceId` is truthy; sort by `el.sequenceId`. Generate one card per run.
- **Risk:** None.

### 27.9 – Hover panel card → highlight canvas element

- **State:** Reuse or extend: e.g. set `state.hoveredId = el.id` when the pointer is over a measurement card (so the same hover outline used for canvas hover applies). Alternatively introduce `state.hoveredMeasurementElementId` and in `draw()` treat it like hover for outline; using existing `hoveredId` is simpler and consistent.
- **Implementation:** On card `mouseenter`, set `state.hoveredId = card’s element id` and call `draw()`. On card `mouseleave`, clear `state.hoveredId` and call `draw()`.
- **Risk:** Low. Ensure clearing on mouseleave so canvas hover still works when pointer moves to canvas.

### 27.10 – Click canvas element → scroll to card and focus Length input

- **When:** On canvas click that selects an element (existing click handler). If the selected element has `sequenceId`, find the Measurement Deck card for that element (e.g. `[data-element-id="..."]`), scroll it into view (e.g. `card.scrollIntoView({ behavior: 'smooth', block: 'nearest' })`), and focus the Length (mm) input inside that card.
- **Where:** In the same pointerup/click path where we call `setSelection([...])` for the hit element. After setting selection, if single selection and element has `sequenceId`, run the scroll + focus.
- **Risk:** Low. Only adds behaviour when an element with a card is selected.

### 27.11 – Quote: use measured length for gutters/downpipes

- **Current:** `countCanvasElements()` returns `{ assetId: count }` (one count per placed element). Quote table is built from that; `getElementsFromQuoteTable()` reads table and returns `[{ assetId, quantity }]`.
- **Change:** For **measurable** elements (gutters + downpipes/droppers per 27.2), quantity sent to the quote should be derived from **length** when the user has entered it:
  - Option A (recommended for MVP): When building the **initial** quote table from canvas (Generate Quote), for measurable elements use `measuredLength` when &gt; 0: convert to quantity (see 27.12) and show that in the table; when `measuredLength` is 0, treat as quantity 1 (or 0 and show “— mm” to prompt user to fill in deck). So the table rows still have “Qty”; that qty is length-derived for measurable items when available.
  - Option B: Keep table as “Qty” but have a separate data path that sends length to backend; that would require backend changes (27.13). For MVP, Option A keeps backend unchanged if we send quantity.
- **Concrete:** Extend the logic that builds the quote table from canvas (in Generate Quote click handler). Instead of only `countCanvasElements()`, either:
  - Extend `countCanvasElements()` to return for measurable elements something like `{ assetId, quantity, measuredLength }` or per-element list, then when building rows: if measurable and measuredLength &gt; 0, set row qty from length→quantity (27.12); else use count or 1.
  - Or add a helper that returns “elements for quote”: list of { assetId, quantity } where quantity for measurable is from measuredLength→quantity when measuredLength &gt; 0, else count (or 1). Then build table from that list.
- **Undo:** Length is stored on element; undo already restores elements (27.1 clone/restore), so length edits can be undone if we push undo on length change.
- **Risk:** Medium. Must not break existing quote when no measurable elements or when measuredLength is 0; fallback to current count behaviour.

### 27.12 – Total length and quantity conversion

- **Sum total length:** For measurable elements with `measuredLength &gt; 0`, sum `measuredLength` per assetId (or per run). So we have total mm per product type (e.g. total gutter mm for GUT-SC-MAR-1.5M).
- **Convert to quantity for API:** Backend today expects **quantity** (number of units). For linear products (gutters, downpipes), one “unit” is a standard length (e.g. Marley gutter 2.9 m or 4 m; downpipe 3 m or 4 m). So: `quantity = ceil(total_mm / (standard_length_mm))` and send that in `elements[].quantity`. Document or config: standard lengths per assetId (or per product type). Option B in 27.11: send `total_length_mm` and backend does the conversion; then 27.13 is required.
- **MVP recommendation:** Frontend converts length → quantity using a small map (e.g. gutter 2900 mm, downpipe 3000 mm) or product metadata if available; send quantity so backend and `expand_elements_with_gutter_accessories` stay unchanged.
- **Risk:** Low if we only affect the payload for measurable items; backend already gets quantity.

### 27.13 – Backend compatibility (length-based quantities)

- **Current:** Backend accepts `elements: [{ assetId, quantity }]` and `expand_elements_with_gutter_accessories` uses quantity (and for gutters, parses length from asset_id for bracket calc). So if frontend sends **quantity** (derived from length as in 27.12), no backend change is needed.
- **If we later send length:** Would need a new request shape (e.g. `elements: [{ assetId, quantity?, length_mm? }]`) and backend logic to compute quantity from length_mm when present. Defer to post-MVP unless we explicitly choose Option B in 27.11.
- **Risk:** None for MVP if we stick to quantity-only API.

---

## 3. Files to touch (summary)

| Area | File(s) | Changes |
|------|--------|--------|
| State & drop/center-drop | `frontend/app.js` | Add `nextSequenceId`; in drop and center-drop, if measurable set `sequenceId`, `measuredLength`; add `isMeasurableElement(assetId)`. |
| Undo | `frontend/app.js` | In `cloneStateForUndo` and `restoreStateFromSnapshot`, include `sequenceId` and `measuredLength`. |
| Draw | `frontend/app.js` | After drawing element layers, before hover loop: for each element with `sequenceId`, draw badge (upright, circle + number). |
| Measurement Deck UI | `frontend/index.html` | Add container for measurement deck (e.g. `#measurementDeck`). |
| Measurement Deck styles | `frontend/styles.css` | Style deck and cards (fixed bottom, horizontal scroll, card layout). |
| Measurement Deck logic | `frontend/app.js` | `renderMeasurementDeck()`: filter/sort by sequenceId, one card per run; input updates `el.measuredLength`; call on element changes. |
| Two-way highlight | `frontend/app.js` | Card mouseenter/mouseleave → set/clear `state.hoveredId`, draw(); on canvas selection of element with sequenceId → scroll card into view, focus Length input. |
| Quote integration | `frontend/app.js` | Extend quote table build (Generate Quote) and/or `countCanvasElements` / new helper: for measurable with measuredLength &gt; 0 use length→quantity; else use count. Add length→quantity conversion (27.12). |
| Backend | — | No change for MVP if we send quantity only (27.13). |

---

## 4. What not to change (safety)

- **Hit-test order and selection:** Do not add hit-test for badges; do not change how element or blueprint selection works (including drill-through and lock).
- **Quote modal structure:** No change to quote modal HTML or to `getElementsFromQuoteTable()` contract (still rows with assetId and qty); only change how the **initial** table is populated from canvas when “Generate Quote” is clicked.
- **Backend API:** Keep `POST /api/calculate-quote` body as `{ elements: [{ assetId, quantity }], labour_hours, labour_rate_id }`; no new fields unless we explicitly add optional length later.
- **Gutter accessories:** `expand_elements_with_gutter_accessories` stays as-is; it already uses quantity and gutter length from asset_id. Frontend just sends the right quantity (from length when available).
- **Existing element fields:** Don’t remove or rename id, assetId, x, y, width, height, rotation, zIndex, image, originalImage, color, baseScale, locked. Only add optional `sequenceId` and `measuredLength`.

---

## 5. Testing checklist (for when we implement)

- Add gutter and downpipe; confirm sequence numbers and badges; add non-measurable (e.g. bracket); confirm no badge.
- Resize/rotate/move element; badge stays at center and upright.
- Undo after drop; element and badge disappear; redo if we have redo.
- Measurement Deck: cards appear for measurable elements only; sort by Run #; entering length updates state; hover card highlights element; click element scrolls to card and focuses input.
- Generate Quote: with measured lengths, table shows length-derived quantities where applicable; Calculate Quote and Copy/Print still work.
- E2E: existing tests (drag-drop, center-drop, quote, etc.) still pass; add optional E2E for “measurement deck visible when measurable elements exist” and “card hover highlights element”.

---

## 6. Order of implementation (recommended)

1. **27.2** – Add `isMeasurableElement(assetId)` (no UI yet).
2. **27.1** – Add `nextSequenceId` and assign `sequenceId` / `measuredLength` on drop and center-drop; add to clone/restore for undo.
3. **27.3, 27.4, 27.5** – Draw badges in `draw()`, style, no hit-test.
4. **27.6** – HTML + CSS for bottom Measurement Deck panel.
5. **27.7, 27.8** – `renderMeasurementDeck()`, filter/sort, cards with Length (mm) input; wire input to `el.measuredLength` and call from element-change paths.
6. **27.9** – Card hover → `state.hoveredId`, draw().
7. **27.10** – Canvas selection of measurable element → scroll to card, focus input.
8. **27.12** – Helper: total mm per assetId, length→quantity (standard lengths map).
9. **27.11** – Quote: when building table from canvas, use length-derived quantity for measurable with measuredLength &gt; 0; else count.
10. **27.13** – Confirm backend unchanged (no code change).

After implementation, mark subtasks 27.1–27.13 in `TASK_LIST.md` with `[x]` per project rules.
