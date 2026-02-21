# Plan: 54.84 — Wire camera upload to canvas placeholder; remove camera from mobile header

**Scope:** Tasks 54.84.1 and 54.84.2. Mobile-only UI/UX change; desktop unchanged. Single codebase; no new dependencies; Railway-safe (frontend-only).

**Goal:** (1) Make the canvas placeholder camera icon open the same upload flow as the header camera button; (2) hide the header camera button on mobile only to declutter.

---

## 1. Context (verified from codebase)

- **Header camera:** `#cameraUploadBtn` lives in `frontend/index.html` inside `#globalToolbar` → `.toolbar-right` → `.toolbar-actions-secondary` (lines 56–64). It is wired in `initUpload()` in `frontend/app.js` (lines 6864–6873): on click it runs `fileInput.click()` where `fileInput` is `#fileInput` (hidden file input at line 140 in index.html).
- **Canvas placeholder:** `#canvasPlaceholder` (index.html 196–204) contains `.placeholder-card` → `.placeholder-icon` (a `<span>`) with a camera SVG inside. The card has `pointer-events: auto` and `cursor: pointer` (styles.css ~1692–1708); the icon is `.placeholder-icon` (~1714–1720). There is **no** click handler on the placeholder today; `initUpload()` already gets `placeholder` but does not use it for any listener.
- **Upload flow:** Single path: `fileInput` change handler (app.js 6878–6913) validates file, shows crop modal for images or PDF conversion, then processing. Any trigger that calls `fileInput.click()` uses this same flow.
- **Mobile E2E:** Main suite runs at 1280×720 (desktop); toolbar check uses `#uploadZone` or `#cameraUploadBtn` (run.js 151). `#uploadZone` does not exist in HTML, so the test effectively requires `#cameraUploadBtn`. Mobile viewport tests (run.js 1414+, 1495+) use `page.$('#fileInput')` and `uploadFile()` for blueprint upload (1524–1526), not the camera button, so hiding the button on mobile does not break existing E2E.
- **Desktop:** No change to layout or behavior; camera stays in header; once 54.84.1 is done, both header and placeholder trigger the same flow on desktop.

---

## 2. Implementation plan

### 2.1 Task 54.84.1 — Wire placeholder camera to upload

**Requirement:** Tapping the placeholder camera (`.placeholder-icon` / its SVG) must trigger the same upload flow as the header button (e.g. programmatic `fileInput.click()` or shared handler). Same entry-point logic for desktop and mobile.

**Option A (recommended): HTML + JS**

1. **HTML (`frontend/index.html`)**  
   - Replace the placeholder camera **span** with a **button** so the control is focusable and keyboard-activatable without extra JS.
   - Change:
     - From: `<span class="placeholder-icon" aria-hidden="true"><svg>...</svg></span>`
     - To: `<button type="button" class="placeholder-icon" aria-label="Upload photo"><svg>...</svg></button>`
   - Keep class `placeholder-icon` so existing CSS (including 54.72 mobile 44px tap target) still applies. Remove `aria-hidden` from the control so it is exposed to assistive tech; the SVG can stay decorative (no extra aria on SVG).

2. **JS (`frontend/app.js`, inside `initUpload()`)**  
   - After the existing `cameraUploadBtn` block (after line 6873), add wiring for the placeholder camera:
     - Get the placeholder icon: e.g. `const placeholderCamera = placeholder && placeholder.querySelector('.placeholder-icon');`
     - If `placeholderCamera` and `fileInput` exist: `placeholderCamera.addEventListener('click', (e) => { e.preventDefault(); fileInput.click(); });`
   - No new shared function is strictly required; both triggers call `fileInput.click()`. Optionally factor to a one-liner like `function openUploadDialog() { if (fileInput) fileInput.click(); }` and call from both for clarity.
   - Ensure this runs only once (initUpload is called once at app load; placeholder is in DOM when canvas view is shown).

**Option B (no HTML change):**  
   - Keep the `<span class="placeholder-icon">`. In JS, add `click` listener on that span. For accessibility, add in JS or HTML: `role="button"`, `tabindex="0"`, `aria-label="Upload photo"`, and a `keydown` handler for Enter/Space that calls `fileInput.click()`. Option A is simpler and more robust.

**Placeholder copy (optional):**  
   - The current title says “Tap the Camera icon **above** to add a background photo”. After 54.84.2, on mobile there is no camera “above”. Optional follow-up: on mobile only, change copy to “Tap the camera icon to add a background photo” (e.g. via a data attribute or JS). Not required for 54.84.1/54.84.2.

**Edge cases**

- **Double trigger:** Only one listener is added (on the placeholder icon/button). The header button is separate. No double-fire.
- **Placeholder visibility:** `updatePlaceholderVisibility()` hides the placeholder when there is content; when visible, the new button is the only upload-from-placeholder entry. No change to that logic.
- **Init order:** `initUpload()` is called from app startup (app.js ~10445); placeholder is in the same document. Safe.

### 2.2 Task 54.84.2 — Remove camera from global header (mobile only)

**Requirement:** After 54.84.1, hide or remove `#cameraUploadBtn` from `#globalToolbar` on **mobile only**. Desktop keeps the camera in the header. Upload on mobile must still work via the canvas placeholder.

1. **CSS (`frontend/styles.css`)**  
   - Add a mobile-only rule that hides the header camera button:
     - `body[data-viewport-mode="mobile"] #cameraUploadBtn { display: none; }`
   - Place it with other mobile `#globalToolbar` overrides (e.g. near the 54.82 block around lines 1946–1975, or with other `body[data-viewport-mode="mobile"]` header rules) so mobile-only scope is clear and maintainable.

2. **Verification**  
   - Desktop: Camera button still visible and opens file dialog.  
   - Mobile: Camera button not visible in header; tapping the placeholder camera opens the file dialog and upload flow works (crop/process as today).  
   - E2E: Main suite (desktop viewport) still sees `#cameraUploadBtn`; mobile tests use `#fileInput` for upload, so no E2E change required. If any future test explicitly expects the header camera on mobile, it would need to use the placeholder camera instead.

---

## 3. Desktop vs mobile impact

| Area              | Desktop                         | Mobile                                      |
|-------------------|----------------------------------|---------------------------------------------|
| Header camera     | Unchanged; visible and works    | Hidden (54.84.2)                            |
| Placeholder camera | Works after 54.84.1 (same flow)  | Primary upload entry after 54.84.2          |
| Upload flow        | Unchanged (fileInput + change)   | Unchanged; entry point is placeholder only  |

All changes are either shared (placeholder click) or scoped with `body[data-viewport-mode="mobile"]` (CSS hide). No desktop-only logic removed.

---

## 4. Files to touch

| File              | Change |
|-------------------|--------|
| `frontend/index.html` | Replace placeholder camera `<span>` with `<button class="placeholder-icon" aria-label="Upload photo">` wrapping the same SVG. |
| `frontend/app.js`     | In `initUpload()`, add click listener on `placeholder.querySelector('.placeholder-icon')` → `fileInput.click()`. |
| `frontend/styles.css` | Add `body[data-viewport-mode="mobile"] #cameraUploadBtn { display: none; }` in mobile header block. |

No backend, no new scripts, no build changes. Railway deployment unchanged.

---

## 5. Task list text (for completion)

When 54.84.1 is done, mark:

- `- [x] **54.84.1** **Wire #cameraUploadBtn to canvas placeholder camera.** ...`

When 54.84.2 is done, mark:

- `- [x] **54.84.2** **Remove camera from global header (mobile) after 54.84.1.** ...`

---

## 6. Checklist before implementation

- [ ] Confirm `#fileInput` and `#canvasPlaceholder` and `.placeholder-icon` selectors in local index.html match this plan.
- [ ] Implement 54.84.1 first; verify placeholder camera opens file dialog on desktop and mobile.
- [ ] Then add CSS for 54.84.2; verify header camera hidden on mobile only and placeholder still works on mobile.
- [ ] Run E2E (desktop) to ensure toolbar and upload path still pass.
- [ ] Optional: adjust placeholder copy on mobile so “above” is not misleading (not required for 54.84).
