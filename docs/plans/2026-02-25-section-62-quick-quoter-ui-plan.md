# Plan: Section 62 — Quick Quoter (mobile-first UI, desktop-safe, Railway-safe)

## Summary

Implement a frontend-only Quick Quoter shell in canvas view:

- Always-on mobile Quick Quoter entry card (matching placeholder-card style language).
- Quick Quoter modal with:
  - Header selectors: `Profile`, `Size mm`.
  - Repair type list in iOS-style inset rows.
  - Multi-select with per-row stepper swap on selection.
  - Inline local validation (type-specific).
- `Other` row behavior: close Quick Quoter, clear Quick Quoter local state, open Quote modal immediately.

No backend/API/schema wiring in this phase. Existing quote compute and conditional rendering paths remain unchanged.

---

## Scope (locked)

1. UI + local validation only.
2. Entry available in canvas even when placeholder is hidden.
3. Two header dropdowns (`Profile`, `Size mm`).
4. `Other` opens main quote modal immediately and discards Quick Quoter selection.
5. Type-specific validation map:
   - `requiresProfile`: Expansion Joiner, Joiner, Stop-End, Bracket, Outlet, Straight Section, External Corner, Internal Corner, Sealing Plastic Gutter, Sealing & Riveting Metal Gutter.
   - `requiresSizeMm`: Replacing Pipe Clips, Replacing Pipe Elbow Bends, Cutting a Down Pipe, Screwing Top of a Downpipe back into Place.
   - Neither: Screwing Clips/Brackets Back into Place, Other.

---

## Implementation shape

### 1) Task tracking

- Add `docs/tasks/section-62.md` (task checklist 62.1–62.7).
- Update `TASK_LIST.md` "Where to look" and uncompleted table entries for Section 62.

### 2) Frontend markup

- Add Quick Quoter entry button near canvas content in `frontend/index.html` (separate from `#canvasPlaceholder`).
- Add Quick Quoter modal in `frontend/index.html` (header selectors, validation region, repair list host).

### 3) Frontend styling

- Add entry card styles (visual parity with `.placeholder-card`) in `frontend/styles.css`.
- Keep entry hidden on desktop and shown on mobile only.
- Add modal + row styles:
  - Inset grouped rows with rounded corners.
  - Unselected row background white.
  - Selected row background light blue.
  - Right action slot fixed width:
    - empty circle indicator when unselected.
    - compact stepper when selected.
  - Left label ellipsis and no wrapping.
  - Fixed row height regardless of selection state.

### 4) Frontend behavior

- Add isolated Quick Quoter local state in `frontend/app.js`:
  - `isOpen`, selector values, `selectedItems` map.
- Add static repair catalog with metadata (`requiresProfile`, `requiresSizeMm`, `isOther`).
- Add row toggle and stepper handlers:
  - select -> qty 1.
  - deselect -> remove from map.
  - multi-select allowed.
- Add inline validation updater on selection/dropdown change.
- `Other` handler:
  - close modal without focus restore,
  - clear Quick Quoter state,
  - trigger existing `#generateQuoteBtn` flow.

### 5) Accessibility integration

- Register modal in existing accessibility modal framework (`registerAccessibleModal`) in `frontend/app.js`.
- Add close button handler; rely on existing backdrop/Escape behavior defaults.

---

## Guardrails (must hold in this phase)

Do not change behavior of:

- `frontend/app.js` `getElementsFromQuoteTable` (quote element build path).
- `frontend/app.js` `calculateAndDisplayQuote` (quote calculation + grouping path).
- `frontend/app.js` inferred/conditional item rendering paths in quote rebuild.
- `backend/main.py` `POST /api/calculate-quote`.

Deployment remains Railway-safe and frontend-only.

---

## Future backend integration points (document only)

### Existing code anchors

- `backend/main.py` `QuoteElement` / `CalculateQuoteRequest`.
- `backend/main.py` `/api/calculate-quote`.
- `backend/app/gutter_accessories.py` `expand_elements_with_gutter_accessories`.
- `backend/main.py` ServiceM8 profile-label branches (`/api/servicem8/add-to-job`, `/api/servicem8/create-new-job`).
- `backend/app/quotes.py` `QuoteMaterialLine`.

### Proposed data model (future)

1. `public.quick_quoter_repair_types`
   - `id text pk`, `label text`, `active bool`, `sort_order int`,
   - `requires_profile bool`, `requires_size_mm bool`.
2. `public.quick_quoter_part_templates`
   - `id uuid pk`, `repair_type_id fk`, `product_id fk`,
   - `qty_per_unit numeric`,
   - `condition_profile text null` (`SC|CL`),
   - `condition_size_mm int null` (`65|80`),
   - `length_mode text` (`none|missing_measurement|fixed_mm`).

### Proposed API (future)

1. `GET /api/quick-quoter/catalog`
2. `POST /api/quick-quoter/resolve` -> `{ elements, missing_measurements }`

---

## Acceptance checks

1. Mobile entry always visible in canvas view.
2. Desktop canvas/quote behavior unchanged.
3. Row selection/stepper swap matches spec; no row height jumps.
4. Text truncates with ellipsis when stepper needs space.
5. Type-specific inline validation appears and clears correctly.
6. `Other` opens Quote modal and clears Quick Quoter local selections.
7. No regression in existing quote conditional/inferred rendering.

