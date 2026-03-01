# Investigation: Mobile-only – changing element colour hides element (still selectable)

**Date:** 2026-03-02  
**Scope:** Mobile UI; desktop unchanged. No code changes in this investigation.

## Symptom

On **mobile** (but not desktop), when the user changes the **colour** of a canvas element (Marley product), the element **disappears visually** but remains **selectable** (tap on the same area still selects it). On desktop, the same colour change shows the tinted element correctly.

## Architecture (relevant parts)

- **Single codebase:** `data-viewport-mode` on `body` switches layout (desktop vs mobile). Draw loop and hit-test are shared; no viewport branch that skips drawing colored elements.
- **Colour pipeline:** `frontend/app.js` – `createTintedCanvas(originalImage, color, width, height)` builds an offscreen canvas: fill with color → `globalCompositeOperation = 'destination-in'` → `drawImage(originalImage, ...)` so only the image’s opaque pixels get the colour. `getElementRenderImage(el)` returns `el.tintedCanvas` when `el.color` is set (or `originalImage` on failure/fallback).
- **Draw loop:** `draw()` uses `getElementRenderImage(el)` and `ctx.drawImage(renderImage, -dw/2, -dh/2, dw, dh)` for each element. No mobile-only path that would skip or hide coloured elements.
- **Hit-test:** `hitTestElement(canvasX, canvasY)` → `getSelectionAt(canvasX, canvasY)` uses **bounds only** (element box), not pixel data. So the element stays selectable even if nothing is drawn.

## Root-cause hypotheses (mobile-only)

### 1. **Tinted canvas is created but renders as fully transparent (most likely)**

- **createTintedCanvas** returns a canvas and does not throw. So `el.tintedCanvas` is set and `getElementRenderImage` returns it. The draw loop then does `ctx.drawImage(tintedCanvas, ...)`.
- On **iOS Safari** (and possibly other mobile browsers), known issues exist with:
  - **drawImage + composite:** Using `destination-in` and then drawing that offscreen canvas onto the main canvas can produce **blank/transparent** results (composite or alpha handling differs from desktop).
  - **Image decode timing:** If `originalImage` is not fully decoded/ready when `createTintedCanvas` runs (e.g. right after colour change in the same tick), `drawImage(originalImage, ...)` in the destination-in step may draw nothing → result is fully transparent. Desktop may have already decoded the image from earlier frames; mobile scheduling can differ.
- So the tinted canvas **object** exists (E2E would see `hasTintedCanvas === true`) but its **bitmap** is transparent when drawn on the main canvas on mobile.

### 2. **Drawing the tinted canvas onto the main canvas fails on mobile**

- Some WebKit/Safari bugs report that drawing an **HTMLCanvasElement** that was created with composite operations onto another canvas can fail to show (GPU/backstore not updated). So the tinted canvas could have the correct pixels in memory but `ctx.drawImage(tintedCanvas, ...)` on the main canvas shows nothing on mobile only.

### 3. **Ruled out**

- **CSS:** No mobile-only rule hides `#canvas` or elements; canvas is shared.
- **Draw path:** No `viewportMode === 'mobile'` branch that would skip or alpha-out coloured elements.
- **Zero size:** `dw/dh` come from `el.width * scale`; if they were 0, all elements would vanish, not only coloured ones.
- **createTintedCanvas returning null:** That path falls back to `originalImage` and would show the untinted element, not “hidden”.

## Evidence from codebase

- **createTintedCanvas** (`app.js` ~6779–6865): Uses `destination-in` and `drawImage(originalImage, 0, 0, tw, th)`. No `decode()` or `complete` check before using `originalImage`.
- **getElementRenderImage** (~6949–7002): No viewport check; same logic for desktop and mobile. On failure, falls back to `originalImage`.
- **draw()** (~8024–8073): Single path for all viewports; `dimForBlueprintMode` only dims non-blueprint elements to 0.5 alpha when blueprint is selected.
- **initColorPalette** (~5048–5126): On colour change, `invalidateElementRenderCache(el)` then `draw()`. No delay or decode before next frame.
- **E2E:** Color tinting tests run on **desktop** viewport (1280×720). They assert `hasTintedCanvas` and `tintedCanvasColor`, not on-screen visibility. So the bug would not be caught by current E2E.

## Recommended next steps (for implementation phase)

1. **Confirm on device:** Reproduce on iOS Safari and Android Chrome with `?viewport=mobile`; confirm element invisible but tappable. Optionally enable `window.__quoteAppDebugColorChanges = true` and check console for any errors or warnings from `createTintedCanvas` / `getElementRenderImage`.
2. **Ensure image ready before tinting (mobile workaround):** Before calling `createTintedCanvas`, ensure `originalImage.complete` and, if available, `await originalImage.decode()`. Defer tinted canvas creation to the next frame or after decode so mobile doesn’t run composite with an undecoded image.
3. **Mobile fallback:** If `createTintedCanvas` succeeds but the result is known to be unreliable on mobile (e.g. feature-detect or UA for iOS Safari), consider drawing the tinted canvas to a 2D context once to “flush” the bitmap, or fall back to `originalImage` on mobile when a quick pixel-readback or heuristic suggests the tinted canvas is blank.
4. **Regression:** Add a mobile viewport E2E (or manual checklist) that changes colour and asserts the element remains **visible** (e.g. bounding box or screenshot), not only that `hasTintedCanvas` is true.

## Task list impact

- Add **54.130** (or next free number) in `docs/tasks/section-54.md`: “Mobile-only: fix element disappearing when colour is changed (element still selectable).” Investigation complete; implementation and QA to follow.
- Add row to uncompleted table in `TASK_LIST.md` for section 54.

## References

- `frontend/app.js`: `createTintedCanvas` (~6779), `getElementRenderImage` (~6949), `draw()` (~7824), `initColorPalette` (~5048), `hitTestElement` / `getSelectionAt` (~8557).
- E2E: `e2e/run.js` ~2182–2358 (color/selection and tinting tests; desktop viewport).
- Web: iOS Safari canvas drawImage/alpha/composite issues (e.g. Apple Forums #42960, Stack Overflow canvas drawImage fail on iPhone).
