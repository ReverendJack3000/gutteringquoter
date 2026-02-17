# Plan: Canvas Interaction Improvements

**Goal:** Improve canvas interaction in `frontend/app.js` to prevent accidental background movement and make element dragging more reliable.

**Context:** The Quote App is a desktop-first web app for uploading property photos, generating technical drawing blueprints, and placing Marley guttering products on the blueprint with Canva-style interactions.

---

## Change 1: Lock Blueprint by Default

**Location:** Two places in `app.js` where `state.blueprintTransform` is initialized with `locked: false`.

**1a. `processFileAsBlueprint`** (around line 2566)

```javascript
// Current
state.blueprintTransform = { x: 0, y: 0, w: img.width, h: img.height, rotation: 0, zIndex: BLUEPRINT_Z_INDEX, locked: false };

// Change to
state.blueprintTransform = { x: 0, y: 0, w: img.width, h: img.height, rotation: 0, zIndex: BLUEPRINT_Z_INDEX, locked: true };
```

**1b. `technicalDrawingToggle` change listener** (around line 2664)

```javascript
// Current
state.blueprintTransform = { x: 0, y: 0, w: img.width, h: img.height, rotation: 0, zIndex: BLUEPRINT_Z_INDEX, locked: false };

// Change to
state.blueprintTransform = { x: 0, y: 0, w: img.width, h: img.height, rotation: 0, zIndex: BLUEPRINT_Z_INDEX, locked: true };
```

**Rationale:** When a blueprint is first uploaded (or the technical drawing toggle changes), the background image should start locked so the user cannot accidentally move it. The user must explicitly unlock via the Lock control when the blueprint is selected.

---

## Change 2: Fix "Drill-Through" Selection Logic

**Location:** `pointerdown` event listener, around lines 2065–2073.

**Current behavior:** If the top hit is already selected (element or blueprint), it automatically cycles to the next item in the stack (`target = sel.stack[1]`).

**New behavior:** Only cycle to the next item when **Alt (Option)** is held (`e.altKey`). If Alt is not held, keep the current selection so the user can drag immediately.

**Code change:**

```javascript
// Current (lines 2065–2073)
// Drill-through: if the top hit is already selected, cycle to the next in stack (same spot, next click)
let target = sel.top;
if (target && sel.stack.length > 1) {
  const alreadySelected = target.type === 'element' && state.selectedIds.length === 1 && state.selectedIds[0] === target.element.id;
  const alreadyBlueprint = target.type === 'blueprint' && state.selectedBlueprint;
  if (alreadySelected || alreadyBlueprint) {
    target = sel.stack[1];
  }
}

// Change to
// Drill-through: only cycle to next in stack when Alt/Option is held; otherwise keep selection for immediate drag
let target = sel.top;
if (target && sel.stack.length > 1 && e.altKey) {
  const alreadySelected = target.type === 'element' && state.selectedIds.length === 1 && state.selectedIds[0] === target.element.id;
  const alreadyBlueprint = target.type === 'blueprint' && state.selectedBlueprint;
  if (alreadySelected || alreadyBlueprint) {
    target = sel.stack[1];
  }
}
```

**Rationale:** Without Alt, a click on an already-selected element should keep that element selected and allow immediate drag. With Alt, users can cycle through overlapping items (drill-through).

---

## Change 3: Prevent Accidental Blueprint Selection

**Location:** `pointerdown` event listener. The blueprint body click is handled in two places:

1. **Blueprint handle hit** (lines 2011–2037): `bpHandle` is truthy when clicking a resize/rotate handle. This already checks `state.blueprintTransform.locked` and only allows selection for unlocking when clicking a handle.
2. **Blueprint body hit via `getSelectionAt`** (lines 2144–2160): When `target?.type === 'blueprint'`, the blueprint is selected. Currently it returns early if locked (line 2149) but still sets `state.selectedBlueprint = true` (line 2147).

**Current flow when clicking blueprint body (no handle):**

- `getSelectionAt` returns `target = { type: 'blueprint' }` (blueprint is in the stack; when locked, it’s last due to drill-through logic in `getSelectionAt`).
- When `target?.type === 'blueprint'`:
  - `state.selectedBlueprint = true`
  - `setSelection([])`
  - If locked → `return` (no move mode)
  - If unlocked → enter `blueprint-move` mode

**Required behavior:** If the user clicks the blueprint **body** (hit test true, but `hitTestBlueprintHandle` is null) and the blueprint is **locked**, do **not** select the blueprint. Treat it as a click on empty space (deselect all).

**Implementation approach:**

When `target?.type === 'blueprint'`:

- If `state.blueprintTransform.locked === true`:
  - Do **not** set `state.selectedBlueprint = true`
  - Deselect all elements and blueprint: `setSelection([])` and `state.selectedBlueprint = false`
  - Fall through to marquee mode (or treat as empty-space click)
- If unlocked:
  - Proceed with current behavior: select blueprint, enter `blueprint-move` mode

**Code change:** In the `if (target?.type === 'blueprint')` block (lines 2145–2160):

```javascript
if (target?.type === 'blueprint') {
  state.hoveredId = null;
  if (state.blueprintTransform && state.blueprintTransform.locked) {
    // Locked blueprint body: treat as empty space — deselect all, start marquee
    setSelection([]);
    state.selectedBlueprint = false;
    state.marqueeStart = { x: canvasPos.x, y: canvasPos.y };
    state.marqueeCurrent = null;
    state.mode = 'marquee';
    return;
  }
  state.selectedBlueprint = true;
  setSelection([]);
  state.snapshotAtActionStart = cloneStateForUndo();
  state.mode = 'blueprint-move';
  const bt = state.blueprintTransform;
  if (bt) {
    state.dragOffset.x = canvasPos.x - bt.x;
    state.dragOffset.y = canvasPos.y - bt.y;
  }
  return;
}
```

**Note:** The blueprint handle path (lines 2011–2037) already allows selecting the blueprint when locked (so the user can unlock via the Lock control). That behavior should remain: clicking a **handle** on a locked blueprint selects it for unlocking; clicking the **body** on a locked blueprint does not.

---

## Change 4: Isolate Snapping (Exclude Blueprint Boundaries)

**Location:** `getSnapGuides` (around lines 1031–1045) and `getActiveGuidesForPosition` (around lines 1047–1080).

**Current behavior:** Snap guides include both element boundaries and `state.blueprintTransform` boundaries (edges and center).

**New behavior:** Elements should only snap to other elements, not to the blueprint edges.

**4a. `getSnapGuides`:**

Remove or comment out the block that adds blueprint boundaries:

```javascript
// Remove this block:
if (state.blueprintTransform) {
  const bt = state.blueprintTransform;
  vertical.push(bt.x, bt.x + bt.w / 2, bt.x + bt.w);
  horizontal.push(bt.y, bt.y + bt.h / 2, bt.y + bt.h);
}
```

**4b. `getActiveGuidesForPosition`:**

Apply the same change: remove the block that pushes blueprint boundaries into `vertical` and `horizontal`.

**Rationale:** Snapping to the background image can feel distracting and can make elements snap to arbitrary positions. Snapping only to other Marley elements gives more predictable, product-aligned layout.

---

## Change 5: Visual Feedback (Optional) – "Background Edit Mode"

**Location:** `draw()` function, where layers are rendered (around lines 1393–1434).

**Current behavior:** No special visual cue when the blueprint is selected.

**New behavior:** When `state.selectedBlueprint === true`, render Marley elements with `ctx.globalAlpha = 0.5` so the user clearly sees they are in "Background Edit Mode."

**Implementation approach:**

- In the `layers.forEach` loop, when drawing an **element** layer:
  - If `state.selectedBlueprint` is true, wrap the element drawing in `ctx.save()`, set `ctx.globalAlpha = 0.5`, draw, then `ctx.restore()`.
- The blueprint itself is drawn at full opacity.
- Ghost and other overlays should respect this where appropriate.

**Code change:** Inside the `layers.forEach` callback, in the `layer.type === 'element'` branch (around line 1405):

```javascript
if (layer.type === 'element') {
  const el = layer.element;
  if (ghost && el.id === ghost.id) {
    // ... existing ghost drawing ...
    return;
  }
  // ... existing position/rotation setup ...
  ctx.save();
  if (state.selectedBlueprint) {
    ctx.globalAlpha = 0.5;
  }
  // ... existing drawImage and rest of element render ...
  ctx.restore();
  return;
}
```

**Caveat:** The ghost branch already uses `ctx.save()` / `ctx.restore()` and `globalAlpha`. Ensure the `selectedBlueprint` alpha is applied to **all** element layers when the blueprint is selected, and that we don’t double-apply alpha. The simplest approach is to add the alpha check at the start of the element drawing block (after the ghost early-return) and wrap the whole element draw in a save/restore if needed.

---

## Summary of Edits

| # | Location | Lines (approx) | Change |
|---|----------|----------------|--------|
| 1a | `processFileAsBlueprint` | 2566 | `locked: false` → `locked: true` |
| 1b | `technicalDrawingToggle` listener | 2664 | `locked: false` → `locked: true` |
| 2 | `pointerdown` – Drill-through | 2067 | Add `&& e.altKey` condition |
| 3 | `pointerdown` – Blueprint body | 2145–2160 | If locked, deselect and marquee; don’t select blueprint |
| 4a | `getSnapGuides` | 1039–1043 | Remove blueprint boundary push |
| 4b | `getActiveGuidesForPosition` | 1055–1059 | Remove blueprint boundary push |
| 5 | `draw()` – element layers | ~1424–1434 | Apply `globalAlpha = 0.5` when `state.selectedBlueprint` |

---

## TASK_LIST.md Alignment

These changes relate to:

- **17.3** "Drill-Through" Selection (currently unchecked) – Change 2 implements Alt-key gating.
- **17.4** Explicit Blueprint Lock (currently unchecked) – Changes 1 and 3 support locked-by-default and preventing selection when locked.
- **17.7** Lock uploaded picture to background (currently unchecked) – Same as above.

After implementation, consider updating the relevant checkboxes in `TASK_LIST.md`.

---

## Testing Checklist

After implementing:

1. **Lock by default:** Upload a blueprint → verify it cannot be moved until unlocked.
2. **Drill-through:** Place overlapping elements → click selected element without Alt → should stay selected and be draggable; with Alt → should cycle to next.
3. **Locked blueprint body:** Lock blueprint, click on blueprint body (not handle) → should deselect/marquee, not select blueprint.
4. **Locked blueprint handle:** Lock blueprint, click on blueprint handle → should select blueprint for unlock.
5. **Snapping:** Drag an element near blueprint edge → should NOT snap to blueprint; should snap only to other elements.
6. **Visual feedback:** Select blueprint → Marley elements should render at 50% opacity.
