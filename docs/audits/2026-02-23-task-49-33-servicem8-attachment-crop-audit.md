# Audit Report: Task 49.33 – ServiceM8 job attachment PNG crop to content

**Role:** Strict Senior QA Engineer  
**Date:** 2026-02-23  
**Scope:** Implementation of getExportContentBounds(), getExportCanvasDataURLCropped(), and wiring for Add to Job / Create New Job.  
**Constraints:** Desktop vs. mobile production, Railway deployment safety, UI/UX best practices.

---

## 1. Regression & conflict check

### 1.1 Mobile layout / CSS bleeding into desktop

| Check | Result | Notes |
|-------|--------|------|
| New or modified CSS rules | **Pass** | No changes to `styles.css`. No new `body[data-viewport-mode="mobile"]` or desktop-only selectors. |
| New or modified HTML / DOM | **Pass** | No changes to `index.html`. No new viewport-dependent markup. |
| Viewport-dependent logic in new code | **Pass** | `getExportContentBounds()`, `getExportCanvasDataURLCropped()`, and both call sites do not reference `layoutState.viewportMode`, `data-viewport-mode`, or any mobile/desktop branch. |

**Verdict: Pass** – No mobile layout or CSS bleed into desktop; no desktop-only logic in the new path.

---

### 1.2 Desktop logic bleeding into mobile

| Check | Result | Notes |
|-------|--------|------|
| New code path gated by desktop-only condition | **Pass** | Export helpers and ServiceM8 call sites are shared; no desktop-only guard. |
| Shared code path behavior on mobile | **Pass** | Same cropped ?? full export and attachment flow on both viewports. |

**Verdict: Pass** – No desktop-only behavior forced on mobile.

---

### 1.3 Export PNG download (toolbar “Export PNG”)

| Check | Result | Notes |
|-------|--------|------|
| Export PNG still uses full canvas | **Pass** | `initExport()` unchanged: builds its own canvas from `state.canvasWidth` / `state.canvasHeight`, does not call `getExportCanvasDataURL()` or `getExportCanvasDataURLCropped()`. |
| Download filename and behavior | **Pass** | Still `link.download = 'blueprint.png'`; no change to user flow. |

**Verdict: Pass** – Export PNG download is unchanged and still full-canvas.

---

### 1.4 ServiceM8 Add to Job flow

| Check | Result | Notes |
|-------|--------|------|
| Cropped used first, full as fallback | **Pass** | `getExportCanvasDataURLCropped() ?? getExportCanvasDataURL()` used. |
| Feedback strings unchanged | **Pass** | Still “Added to job successfully.” / “Blueprint attached.” / “Blueprint could not be attached.” |
| Attachment upload failure handling | **Pass** | Inner try/catch around upload still shows “Blueprint could not be attached.” on failure. |

**Verdict: Pass** – Add to Job behavior and UX unchanged except for image content (cropped when possible).

---

### 1.5 ServiceM8 Create New Job flow

| Check | Result | Notes |
|-------|--------|------|
| Cropped used first, full as fallback | **Pass** | Same `getExportCanvasDataURLCropped() ?? getExportCanvasDataURL()` for `image_base64`. |
| Success message when no image | **Pass** | Backend skips attachment when `image_base64` is null; frontend still shows “New job created. Note and blueprint added to both jobs.” (message is slightly optimistic if attachment was skipped; pre-existing). |

**Verdict: Pass** – Create New Job uses cropped export when available; no new regression in messaging.

---

## 2. Railway deployment safety

| Check | Result | Notes |
|-------|--------|------|
| Backend changes | **Pass** | No changes to `backend/main.py`, `backend/app/servicem8.py`, or any backend code. |
| New environment variables | **Pass** | None. |
| New dependencies / build steps | **Pass** | No new npm/pip deps; no change to `run-server.sh`, Procfile, or nixpacks. |
| Static assets | **Pass** | Only `frontend/app.js` modified; no new static files or paths. |

**Verdict: Pass** – Frontend-only change; Railway deploy and runtime unchanged.

---

## 3. UI/UX and robustness

| Check | Result | Notes |
|-------|--------|------|
| User-visible success/error messages | **Pass** | No change to copy; user still sees same feedback. |
| Fallback when cropped returns null | **Pass** | `?? getExportCanvasDataURL()` ensures we attach full-canvas PNG when there is no content bounds (e.g. blueprint-fit only, no elements). |
| Blueprint-only (with transform) or elements-only | **Pass** | `getExportContentBounds()` covers blueprint+elements and elements-only; cropped export draws correct layers. |

**Verdict: Pass** for normal flows.

---

## 4. Failures and logic gaps (fix not implemented; await approval)

### 4.1 Add to Job – export throws before fallback

- **Finding:** If `getExportCanvasDataURLCropped()` or `getExportCanvasDataURL()` **throws** (e.g. canvas dimensions exceed browser limit, or a transient canvas/context failure), the exception is inside the same `try` as the add-to-job `fetch`. The `catch` then runs and shows **“Network error. Try again.”**
- **Impact:** User may believe the add-to-job request failed or the network is broken, when the real failure is export generation. Fallback to full export is never attempted when the first call throws.
- **Category:** Logic gap / misleading UX.
- **Recommendation:** Wrap export generation in a local try/catch: on throw, call `getExportCanvasDataURL()` in the catch and use that for attachment if non-null; only then treat as “could not be attached” or surface a specific export error. Do not change the outer catch to assume “network error” when the inner failure was export.

---

### 4.2 Create New Job – export throw is uncaught

- **Finding:** `const dataUrl = getExportCanvasDataURLCropped() ?? getExportCanvasDataURL();` runs **before** the `try { fetch(...) }`. If either function throws (e.g. canvas dimension limit), the exception is not caught by the handler’s `catch`, so the promise rejects with an unhandled rejection.
- **Impact:** User may see a generic console error or platform “Something went wrong”; no “Network error. Try again.” and no fallback to full export.
- **Category:** Bug – missing error handling.
- **Recommendation:** Wrap the two-line export call in try/catch; on throw, set `dataUrl = getExportCanvasDataURL()` (in catch or after) and continue building `body` with that (or null). Ensure the rest of the flow (fetch, success/error feedback) is unchanged.

---

### 4.3 Very large diagrams – canvas dimension limit

- **Finding:** Cropped export uses `outW = (bboxW + 2*pad) * scale`, `outH = (bboxH + 2*pad) * scale` with `EXPORT_CROP_SCALE = 2` and `EXPORT_CROP_PAD = 20`. Browsers enforce maximum canvas dimensions (often 16384 or 32767 per side). For very large logical bounds (e.g. bboxW or bboxH in the thousands), `outW`/`outH` can exceed that limit; `exportCanvas.width/height` or `toDataURL()` may then throw or produce an invalid result.
- **Impact:** Same as 4.1 and 4.2: throw with no fallback and misleading or no user feedback.
- **Category:** Logic gap / edge case.
- **Recommendation:** Either (a) clamp `outW`/`outH` to the browser’s maximum canvas size (with a safe constant, e.g. 16384) and scale down the export scale for that call, or (b) catch export failure and fall back to `getExportCanvasDataURL()` as in 4.1 and 4.2. (b) alone is sufficient for correctness; (a) improves behavior for very large diagrams.)

---

### 4.4 JSDoc accuracy

- **Finding:** `getExportCanvasDataURL()` JSDoc still says “Used for ServiceM8 job attachment upload (same output as Export PNG).” ServiceM8 now prefers cropped export and uses this as fallback only.
- **Impact:** Documentation only; no runtime or UX impact.
- **Category:** Minor cleanup.
- **Recommendation:** Update the comment to state that ServiceM8 uses cropped export first and this is fallback and used for Export PNG download.

---

## 5. Summary table

| Category | Result | Notes |
|----------|--------|-------|
| Mobile → desktop bleed (CSS/layout) | **Pass** | No new CSS/HTML; no viewport branching in new code. |
| Desktop → mobile bleed | **Pass** | Shared path; no desktop-only logic. |
| Export PNG download regression | **Pass** | Unchanged. |
| ServiceM8 Add to Job regression | **Pass** | Correct fallback; messaging unchanged. |
| ServiceM8 Create New Job regression | **Pass** | Same; messaging unchanged. |
| Railway deployment safety | **Pass** | Frontend-only; no env or build change. |
| Error handling when export throws | **Fail** | Add to Job: misleading “Network error”; Create New Job: uncaught rejection. |
| Very large diagram (canvas limit) | **Fail** | No clamp or fallback; can throw. |
| JSDoc / comments | **Advisory** | getExportCanvasDataURL doc slightly outdated. |

---

## 6. Recommended actions (after approval)

1. **Required:** Add try/catch around export generation in both Add to Job and Create New Job; on throw, attempt `getExportCanvasDataURL()` and use that (or null) for attachment; avoid labeling export failure as “Network error.”
2. **Required:** In Create New Job, ensure export is computed inside a try so any throw is caught and fallback can run.
3. **Optional but recommended:** Clamp cropped export canvas dimensions to a safe maximum (e.g. 16384) or rely on (1)–(2) so fallback handles oversized canvas.
4. **Optional:** Update `getExportCanvasDataURL()` JSDoc to reflect ServiceM8 cropped-first and fallback role.

No code changes have been applied; awaiting your approval on this audit before implementing fixes.
