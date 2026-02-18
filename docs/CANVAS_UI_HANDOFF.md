# Canvas Page UI – Handoff for Next Session

Use this file to pick up where we left off when continuing to improve the UI of the canvas page. The next chat can continue canvas UI work without re-reading everything.

**Last updated:** Feb 2026

---

## §1 Current state (what’s in place)

### Header
- **Floating header:** Glassmorphism background, three zones: left (breadcrumbs), center (pill), right (export/save/diagrams, Generate Quote CTA, user profile).
- **Left:** Breadcrumbs show “Projects / [name]”. Name is updated when a diagram is loaded or saved; currently **read-only** (not editable).
- **Center:** Empty (diagram controls moved to floating toolbar over canvas).
- **Right:** Export PNG, Save, Saved diagrams (icons); **Generate Quote** (primary CTA); toolbar message; user profile at far right.

### Diagram floating toolbar (Canva/Freeform style)
- **Location:** `#diagramFloatingToolbar` (`.diagram-floating-toolbar`) overlays the blueprint area, inside `.blueprint-wrap`, positioned absolute top 12px, horizontally centered, z-index 20.
- **Contents:** Upload, Technical drawing toggle, Recenter, Zoom −/fit/+, Colour wheel, Transparency (checkerboard). Pill shape, frosted background, flexbox gap 8px. All behaviour preserved.

### Transparency
- **Location:** `#blueprintTransparencyBtn` is **inside** `#diagramFloatingToolbar`. Visibility: when blueprint exists and technical drawing off. Popover `#transparencyPopover` positioned by JS from button; slider + number input unchanged.

### Colour wheel
- **Header colour wheel:** Button in diagram toolbar opens `#headerColorPalettePopover` (positioned by JS from button). Apply-to-all elements; one undo snapshot. Z-index 100.
- Per-element colour: floating toolbar Colour button + `#colorPalettePopover` (unchanged).

### Measurement deck
- Horizontal scrollable tray with **glassmorphism** background.
- Cards: soft grey border, subtle shadow; **coloured dot** (red = no length, green = filled) matching canvas badge. No red/green borders on cards.

### Save / breadcrumb behaviour
- Save modal: user enters name; on success, `updateToolbarBreadcrumbs(name)` runs. Breadcrumb is **display only**; the name typed in the save modal is not pre-filled from the breadcrumb.

---

## §2 Next tasks (Section 45 complete; Section 44 next)

| Task | Description | Notes |
|------|-------------|-------|
| **45.1** | Create the new floating diagram toolbar container. | Add `#diagramFloatingToolbar` inside `.blueprint-wrap`. Pill shape, rounded corners, background; flexbox with consistent gap. No controls moved yet. |
| **45.2** | Move controls from Source A (header pill) into the new toolbar. | Relocate upload, technical drawing, recenter, zoom −/fit/+, colour wheel from `.toolbar-center .toolbar-pill` into `#diagramFloatingToolbar`. Empty/remove center pill from header. Preserve all behaviour and header colour popover positioning. |
| **45.3** | Move transparency control from Source B into the new toolbar. | Relocate `#blueprintTransparencyBtn` into `#diagramFloatingToolbar`. Keep popover behaviour and visibility rules. Update `updateBlueprintTransparencyButtonVisibility` and popover positioning. |
| **45.4** | Position the new toolbar over the diagram. | Absolute positioning relative to diagram container; horizontally centered, just below white header; z-index so it floats above canvas. |
| **45.5** | Final styling and regression. | Pill shape, flexbox gap for even icon spacing. Verify upload, technical drawing, zoom, recenter, colour-all, transparency, selection floating toolbar all work. |

*Section 45 is complete. Next “floating toolbar over canvas” Section 44.*

---

## §3 Key files

| Area | Files |
|------|--------|
| **Header / pill / breadcrumbs** | `frontend/index.html` (toolbar, `.toolbar-left`, `.toolbar-center`, `.toolbar-pill`, `#toolbarBreadcrumbs`); `frontend/styles.css` (`.toolbar-floating`, `.toolbar-pill`, `.toolbar-pill-btn`, `.breadcrumb-text`); `frontend/app.js` (`updateToolbarBreadcrumbs`, init inits). |
| **Transparency** | `frontend/index.html` (`#blueprintTransparencyBtn`, `#transparencyPopover`); `frontend/app.js` (`initTransparencyPopover`, `updateBlueprintTransparencyButtonVisibility`, draw loop where blueprint opacity is applied); `frontend/styles.css` (`.blueprint-transparency-btn`, `.transparency-popover`). |
| **Diagram floating toolbar** | `frontend/index.html` (`#diagramFloatingToolbar` inside `.blueprint-wrap`); `frontend/styles.css` (`.diagram-floating-toolbar`, transparency overrides); `frontend/app.js` (`updateTransparencyButtonPositionAndVisibility` – visibility only). |
| **Save / name** | `frontend/app.js` (save confirm handler, `saveDiagramName` input, `updateToolbarBreadcrumbs(name)` after save and after load); `frontend/index.html` (save modal, `#saveDiagramName`). |
| **Measurement deck** | `frontend/index.html` (`#measurementDeck`, `#measurementDeckScroll`); `frontend/app.js` (`renderMeasurementDeck`); `frontend/styles.css` (`.measurement-deck`, `.measurement-deck-card`, `.measurement-deck-card-dot`). |
| **Colour wheel** | `frontend/index.html` (`#headerColorDiagramBtn`, `#headerColorPalettePopover` – sibling of header, not inside pill); `frontend/app.js` (`initHeaderColorPalette`); `frontend/styles.css` (`.header-color-popover`). |

---

## §4 How to continue

1. **Open** `TASK_LIST.md`; Section 45 is complete. Next: **Section 44** (editable project name for save).
2. **Implement 44.2:** Make breadcrumb name editable; on Save click, pre-fill save modal with "[name] – [today's date]"; on save success, call `updateToolbarBreadcrumbs(savedName)`.
3. **44.1:** Transparency is already in the diagram toolbar; mark done or adjust per product.
4. Mark tasks complete in TASK_LIST and refresh this handoff if needed.

---

## §5 Other ideas (not yet in task list)

- **Section 41** (Marley panel): 65/80 mm filter dropdown; remove placeholder/original elements.
- **Section 44** (still open): Transparency in pill and editable project name for save – can be done after or alongside Section 45.
- Possible future: more pill tools (e.g. grid snap), keyboard shortcuts in UI, or further measurement deck tweaks.

Refer to `TASK_LIST.md` as the single source of truth for scope and completion.
