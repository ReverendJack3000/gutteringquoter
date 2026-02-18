# Analysis: Gutter System Header Appearing on Downpipe-Only Repairs

**Date:** Feb 2026  
**Status:** Investigation complete; tasks added, no code changes yet.

---

## Symptom

The "Gutter System: Storm Cloud" (or Classic) header appears on the quote form even when there are **no gutter parts** on the canvas. This happens on downpipe-only repairs where the only inferred items are saddle/adjustable clips (SCL/ACL) and screws (SCR-SS).

---

## Root Cause

### Flow summary

1. User places downpipes only → `getElementsForQuote()` sends downpipes with length → backend `expand_elements_with_gutter_accessories` infers SCL/ACL + SCR-SS
2. Backend returns materials: DP-65-3M, SCL-65, SCR-SS (for example)
3. Frontend `calculateAndDisplayQuote()` groups materials and renders the quote table
4. **Screws (SCR-SS)** are classified as **gutter system items** and, when they have no profile, are assigned to the first gutter profile (`SC`) by fallback
5. A gutter group with only screws as children causes the "Gutter System: Storm Cloud" header to render

### Key logic: `isGutterSystemItem` and profile fallback

**File:** `frontend/app.js`  
**Approx lines:** 1644–1672

```javascript
const isGutterSystemItem = (id) => {
  const x = u(id);
  return GUTTER_PATTERN.test(id) || x.startsWith('BRK-') || x === 'SCR-SS';
};
// ...
let profile = getProfileFromAssetId(line.id);
if (!profile) {
  if (u(line.id) === 'SCR-SS') {
    profile = Object.keys(gutterGroups)[0] || 'SC';  // <-- FALLBACK: creates group with profile 'SC'
  } else { ... }
}
```

- `getProfileFromAssetId('SCR-SS')` returns `null` (screws have no profile)
- When `profile` is null and the line is SCR-SS, the fallback `Object.keys(gutterGroups)[0] || 'SC'` runs
- If there are no gutters/brackets, `gutterGroups` is empty, so `profile` becomes `'SC'`
- This creates `gutterGroups['SC']` with `children: [SCR-SS]`
- The header render loop (lines 1778–1820) iterates `profileOrder` and, for any group with `group.children.length > 0`, renders "Gutter System: [Profile]"
- Because screws are the only child, the header still shows

### Other inferred items

- **SCL-65, SCL-80, ACL-65, ACL-80:** Not in `isGutterSystemItem` → go to `ungrouped` (lines 1653–1656)
- **BRK-SC-MAR, BRK-CL-MAR:** In `isGutterSystemItem`, have a profile from `getProfileFromAssetId` → grouped under gutter profiles
- **SCR-SS:** In `isGutterSystemItem`, no profile → fallback to `'SC'` (or first existing profile) → creates or joins a gutter group

### Backend behaviour

**File:** `backend/app/gutter_accessories.py`  
**Approx lines:** 98–164

The backend aggregates all screws into a single SCR-SS quantity. It does **not** record whether screws came from:

- Gutters (brackets), or  
- Downpipes (clips), or  
- Droppers, or  
- Manually placed clips  

So the frontend cannot reliably infer screw *origin* from the response alone.

---

## Key file references

| File | Area | Approx lines |
|------|------|--------------|
| `frontend/app.js` | `isGutterSystemItem` definition | 1648–1651 |
| `frontend/app.js` | Profile fallback for SCR-SS | 1657–1666 |
| `frontend/app.js` | Grouping loop (`materialsToProcess.forEach`) | 1653–1672 |
| `frontend/app.js` | Gutter header render loop | 1777–1820 |
| `frontend/app.js` | `getProfileFromAssetId` | 109–117 |
| `backend/app/gutter_accessories.py` | Screw aggregation (no source metadata) | 98–164 |

---

## Desired end state (per user)

1. **No gutter header if no gutters**  
   The "Gutter System" header must not appear when there are no gutter parts on the canvas.

2. **Downpipe-only repairs**  
   If there are downpipes but no gutters:
   - Screws required for downpipe clips should appear under a **Downpipe sub-header** (e.g. "Downpipe accessories" or similar)

3. **Mixed gutter + downpipe repairs**  
   If there are both gutters and downpipes:
   - Screws from brackets and clips should appear as a **standalone row**
   - Product column should read something like **"(brackets & clips)"** or equivalent

---

## Implementation considerations

- The backend currently returns a flat list; it does not distinguish screw sources. Options:
  - **A:** Extend the backend to return metadata (e.g. `screw_source: "gutter" | "downpipe" | "both"`) or separate screw line items per source
  - **B:** Infer from the **materials list** (backend response): e.g. presence of GUT-*/BRK-* vs DP-*/SCL-*/ACL-*/SCR-SS. Downpipe-only = no GUT/BRK; mixed = both gutter/bracket and downpipe/clip/screw items. `calculateAndDisplayQuote` only has `quote.materials`, not the original request

- Frontend grouping logic (lines 1644–1672) needs to change so that:
  - Groups are only created when there are actual gutters or brackets
  - SCR-SS alone does not create or populate a gutter group
  - A separate grouping and/or display strategy handles downpipe-only screws and mixed screws

- Existing behaviour for gutter-only or gutter+bracket repairs should remain correct.
