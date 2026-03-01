# QA Audit Report: Section 54.130 – Mobile element colour tint (decode-before-tint)

**Date:** 2026-03-02  
**Role:** Strict Senior QA Engineer  
**Scope:** Implementation of 54.130.1–54.130.3 (mobile element disappears when colour changed; fix via decode-before-tint, TROUBLESHOOTING doc, verification).  
**Constraints under review:** Desktop vs mobile production parity, Railway deployment safety, UI/UX best practices.

---

## 1. Regression & conflict check

### 1.1 Mobile layout / CSS bleeding into desktop

| Check | Result | Notes |
|-------|--------|--------|
| New or changed CSS rules (including `body[data-viewport-mode="mobile"]` or desktop-only) | **Pass** | No CSS files were modified. All 54.130 changes are in `frontend/app.js` and docs (TROUBLESHOOTING.md, section-54.md, TASK_LIST.md). |
| New mobile-only selectors that could affect desktop | **Pass** | N/A – no styles added. |
| Shared styles accidentally gated by mobile viewport | **Pass** | N/A. |

**Category result: Pass** – No mobile layout or CSS changes; no desktop/mobile CSS bleed.

---

### 1.2 Desktop behaviour / logic bleeding into mobile (or vice versa)

| Check | Result | Notes |
|-------|--------|--------|
| New viewport-specific branches (`layoutState.viewportMode`, `data-viewport-mode`) in 54.130 code | **Pass** | The new logic in `getElementRenderImage` and `invalidateElementRenderCache` has **no** `viewportMode` or viewport checks. Same path runs on desktop and mobile. |
| Desktop-only code paths broken or removed | **Pass** | No desktop-only paths were changed. Colour palette, draw loop, and hit-test unchanged except for the decode-before-tint gate. |
| Mobile-only code paths introduced that could run on desktop | **Pass** | No mobile-only branches were added. Decode-before-tint is viewport-agnostic. |

**Category result: Pass** – No desktop/mobile logic bleed; behaviour is intentionally shared and safe on both.

---

### 1.3 Railway deployment safety

| Check | Result | Notes |
|-------|--------|--------|
| New environment variables | **Pass** | None. |
| New build steps or dependencies | **Pass** | None. |
| Backend or Procfile / nixpacks changes | **Pass** | None. |
| Frontend-only, static-friendly changes | **Pass** | Only `app.js` and markdown/docs changed; no new assets or build. |

**Category result: Pass** – Deployment and build process unchanged; Railway-safe.

---

### 1.4 UI/UX best practices

| Check | Result | Notes |
|-------|--------|--------|
| Visible regression: element not shown when it should be | **Pass** | Fix ensures tint is created only after image is ready; element should appear (tinted) once decoded. When not yet decoded, originalImage is shown for one or more frames – acceptable and better than invisible. |
| Touch targets / 44px (mobile) | **Pass** | No changes to toolbar, palette, or touch targets. |
| Focus / keyboard / screen reader | **Pass** | No changes to focus, ARIA, or keyboard handling. |
| Flashing or jarring transition | **Advisory** | If image is not complete at colour change, user may see **brief untinted element** then tint applied after decode. Acceptable trade-off; no fix required unless product requests otherwise. |

**Category result: Pass** – No UI/UX regressions; one acceptable transition behaviour noted.

---

## 2. Logic and state audit

### 2.1 State and persistence

| Check | Result | Notes |
|-------|--------|--------|
| `_tintedDecodeScheduled` in undo snapshot (`cloneStateForUndo`) | **Pass** | `cloneStateForUndo` uses an explicit allowlist of properties; it does **not** include `_tintedDecodeScheduled`. Undo/restore does not persist the flag. |
| `_tintedDecodeScheduled` in save payload (`getDiagramDataForSave`) | **Pass** | Save payload only includes serializable fields; no `_tintedDecodeScheduled`. |
| Restore from snapshot/API | **Pass** | `restoreStateFromSnapshot` and `restoreStateFromApiSnapshot` build new element objects with explicit props (`tintedCanvas: null`, etc.) and do not copy `_tintedDecodeScheduled`. Restored elements do not carry over the flag. |
| Cache invalidation clears `_tintedDecodeScheduled` | **Pass** | `invalidateElementRenderCache(el)` sets `el._tintedDecodeScheduled = false`, so colour change / duplicate / other invalidations do not leave a stale flag. |

**Category result: Pass** – Transient flag is not persisted and is cleared on invalidation.

---

### 2.2 Edge cases and races

| Check | Result | Notes |
|-------|--------|--------|
| Decode rejects (e.g. broken image) | **Pass** | `.catch(() => { el._tintedDecodeScheduled = false; })` prevents the flag from staying true. Next frame will retry; if `createTintedCanvas` fails, `_tintedCanvasFailureKey` and fallback to originalImage apply as before. |
| User changes colour again before decode resolves | **Pass** | Second colour change calls `invalidateElementRenderCache(el)`, which sets `_tintedDecodeScheduled = false`. When the first decode’s `.then()` runs, it invalidates and calls `draw()`; no incorrect tint is applied. At most one extra draw. |
| Element removed (delete / clear canvas) before decode resolves | **Minor gap** | If the element is removed from `state.elements` before `decode().then()` runs, the callback still runs: it calls `invalidateElementRenderCache(el)` and `draw()`. The element is no longer in the tree, so draw is correct. We mutate a detached object and trigger an extra draw. **Finding:** Logic gap (no bug): consider guarding the `.then()` with `state.elements.includes(el)` to avoid redundant invalidate + draw. **Severity:** Low; no user-visible bug. |

**Category result: Pass** with one **minor logic gap** (optional cleanup).

---

### 2.3 Duplicate and other call sites

| Check | Result | Notes |
|-------|--------|--------|
| Duplicate element gets cache invalidated | **Pass** | `invalidateElementRenderCache(dup)` is called for duplicates (e.g. ~5293, ~9112, ~9679); dup’s `_tintedDecodeScheduled` is cleared. |
| Other invalidate call sites | **Pass** | All other call sites (colour change, bold, header palette, etc.) go through `invalidateElementRenderCache`, which clears the new flag. |

**Category result: Pass.**

---

## 3. Documentation and task list

| Check | Result | Notes |
|-------|--------|--------|
| TROUBLESHOOTING entry accurate and complete | **Pass** | Entry describes symptom (mobile-only), cause (undecoded image), fix (54.130.1 decode-before-tint), and optional future fallback. |
| Section 54 task checkboxes | **Pass** | 54.130.1, 54.130.2, 54.130.3 marked complete in `docs/tasks/section-54.md`. |
| TASK_LIST index | **Pass** | 54.130 row removed from uncompleted table after section completion. |

**Category result: Pass.**

---

## 4. Strict Pass/Fail summary

| Category | Result |
|----------|--------|
| 1.1 Mobile layout/CSS bleeding into desktop | **Pass** |
| 1.2 Desktop/mobile logic bleed | **Pass** |
| 1.3 Railway deployment safety | **Pass** |
| 1.4 UI/UX best practices | **Pass** |
| 2.1 State and persistence | **Pass** |
| 2.2 Edge cases and races | **Pass** (one minor logic gap noted) |
| 2.3 Duplicate and invalidate call sites | **Pass** |
| 3 Documentation and task list | **Pass** |

**Overall: Pass** – No bugs or regressions that block release. One optional cleanup and one UX advisory noted below.

---

## 5. Findings (no code written; await approval)

### 5.1 Optional cleanup (low priority)

- **What:** When `originalImage.decode().then(...)` runs, the element may already have been removed from `state.elements` (e.g. user deleted it or cleared canvas).
- **Impact:** Callback still runs: `invalidateElementRenderCache(el)` on a detached element and `draw()`. Behaviour is correct (element is not drawn), but we do redundant work.
- **Recommendation:** In the `.then()` callback, guard with `if (state.elements.includes(el)) { invalidateElementRenderCache(el); draw(); }` to avoid mutating detached elements and extra draw. Optional; not required for correctness.

### 5.2 UX advisory (no change required)

- **What:** On slow or heavy pages, when the user changes colour, the element may show as **untinted** for one or more frames until decode completes, then switch to tinted.
- **Assessment:** Acceptable and preferable to the previous bug (element disappearing). No change unless product requests a loading or transition treatment.

---

## 6. Sign-off

Audit completed against: desktop vs mobile production parity, Railway deployment safety, and UI/UX best practices. **No blocking issues.** Optional cleanup (5.1) and UX note (5.2) are documented for product/team decision. No fix code has been written; awaiting approval on this report before any implementation.
