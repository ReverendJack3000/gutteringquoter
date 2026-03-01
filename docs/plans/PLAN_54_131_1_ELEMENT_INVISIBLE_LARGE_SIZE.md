# Plan: 54.131.1 – Mobile element invisible when size increased too much

**Scope:** Mobile (and shared data layer). Desktop resize behavior capped for consistency. Railway-safe, no new env/build.

**Refinements (post–Gemini review):** Aspect-ratio-preserving cap; lower offscreen canvas max for mobile memory; mandatory desktop resize cap.

---

## 1. Root cause (summary)

- Offscreen canvases in `createTintedCanvas` and `createBoldCanvas` use `tw = width * TINT_RESOLUTION_SCALE` (4×). No upper bound on element `width`/`height`.
- When `tw` or `th` exceeds device canvas limits (or total canvas memory on iOS), the element can become invisible while remaining selectable (bounds hit-test).
- Mobile two-finger resize and desktop handle resize both allow arbitrarily large dimensions.

---

## 2. Implementation

### 2.1 Constants (`frontend/app.js`)

- **`MAX_OFFSCREEN_CANVAS_DIM = 2048`**  
  - Clamp for `tw`/`th` in createTintedCanvas/createBoldCanvas.  
  - Use 2048 (not 4096) to respect mobile total canvas memory (e.g. iOS ~256MB); 4096×4096×4 ≈ 67MB per canvas; multiple tinted/bold canvases or elements could crash. 2048 keeps stability and avoids memory-pressure crashes on older devices.
- **`MAX_ELEMENT_DIMENSION_PX = 4096`**  
  - Cap for element `width`/`height` applied in both mobile two-finger and desktop handle resize so the data layer is consistent and projects don’t contain huge elements that behave poorly on mobile.

### 2.2 Defensive clamp in render path (shared)

**In `createTintedCanvas` and `createBoldCanvas`:**

- After computing `tw` and `th`:
  - `twClamped = Math.min(tw, MAX_OFFSCREEN_CANVAS_DIM)`, `thClamped = Math.min(th, MAX_OFFSCREEN_CANVAS_DIM)` (each ≥ 1).
  - Use `twClamped`/`thClamped` for `canvas.width`/`canvas.height` and for all `drawImage(..., 0, 0, twClamped, thClamped)` (and equivalent in createBoldCanvas).
- No change to desktop UX for normal sizes; huge elements from any source render safely.

### 2.3 UI cap – preserve aspect ratio (critical)

**When capping applied dimensions, always preserve aspect ratio.** Independent per-dimension clamping would freeze one axis while the other grows and distort the part.

**Correct logic (use in both mobile and desktop resize):**

1. Compute intended size: `nextW = start.width * scaleFactor`, `nextH = start.height * scaleFactor` (desktop: `newW`/`newH` from handle math).
2. If the largest dimension exceeds the max, apply a single scale to both:
   - `maxDim = Math.max(nextW, nextH)`
   - If `maxDim > MAX_ELEMENT_DIMENSION_PX`: `clampScale = MAX_ELEMENT_DIMENSION_PX / maxDim`, then `nextW = nextW * clampScale`, `nextH = nextH * clampScale`.
3. Then apply the existing **minimum** dimension clamp (e.g. `Math.max(MIN_ELEMENT_DIMENSION_PX, nextW)` and same for height) so neither dimension goes below the min.

**In `applyMobileElementTransformFromActivePointers`:**

- After `nextW = Math.max(MIN_ELEMENT_DIMENSION_PX, start.width * scaleFactor)` and same for `nextH`, **replace** with:
  - `let nextW = start.width * scaleFactor; let nextH = start.height * scaleFactor;`
  - `const maxDim = Math.max(nextW, nextH);`
  - `if (maxDim > MAX_ELEMENT_DIMENSION_PX) { const clampScale = MAX_ELEMENT_DIMENSION_PX / maxDim; nextW *= clampScale; nextH *= clampScale; }`
  - `nextW = Math.max(MIN_ELEMENT_DIMENSION_PX, nextW); nextH = Math.max(MIN_ELEMENT_DIMENSION_PX, nextH);`
- Then assign `selected.width = nextW`, `selected.height = nextH` (and position/rotation as now).

**In `applyResizeWith` (desktop – mandatory):**

- After all aspect-ratio and min-dimension logic, **before** updating `el.x`, `el.y`, `el.width`, `el.height`:
  - Compute `maxDim = Math.max(newW, newH)`.
  - If `maxDim > MAX_ELEMENT_DIMENSION_PX`: `clampScale = MAX_ELEMENT_DIMENSION_PX / maxDim`; `newW *= clampScale`; `newH *= clampScale`.
  - Recompute center shift (or re-derive from clamped newW/newH) so position stays consistent, then update `el.x`, `el.y`, `el.width`, `el.height`.
- This keeps desktop and mobile data layer consistent and prevents saved projects with 8000px elements that behave poorly on mobile.

### 2.4 Verification

- Manual: Mobile – two-finger scale up to cap; element stays visible, selectable, and **not distorted** (aspect preserved at cap).
- Desktop: Resize by handle to large size; hits cap without squashing; same cap as mobile.
- `npm test`; no regressions.
- Railway deploy; smoke-test.

---

## 3. Edge cases

- **Aspect ratio at cap:** Handled by single `clampScale` applied to both dimensions so the part never squashes.
- **Minimum dimension:** Applied after the max-dimension cap so we never go below MIN_ELEMENT_DIMENSION_PX / MIN_RESIZE_DIM.
- **Cross-device:** Desktop cap is mandatory so saved projects never contain elements that only get clamped on mobile and feel inconsistent.

---

## 4. Task list and docs

- On completion: mark 54.131.1 done in `docs/tasks/section-54.md`; update `TASK_LIST.md` uncompleted table if the section is fully complete for that row.
- Add a short entry to `TROUBLESHOOTING.md` (symptom: element invisible when resized too large on mobile; cause: canvas/memory limits; fix: offscreen clamp + aspect-preserving element dimension cap).

---

## 5. Summary of refinements (Gemini)

| Item | Original | Refined |
|------|----------|---------|
| Cap math | Independent clamp of nextW/nextH | Single clampScale from max dimension; apply to both to preserve aspect |
| MAX_OFFSCREEN_CANVAS_DIM | 4096 | 2048 (mobile memory / stability) |
| Desktop resize cap | Optional | Mandatory (consistent data layer, no cross-device drift) |
