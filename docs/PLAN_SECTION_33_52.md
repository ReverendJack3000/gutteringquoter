# Implementation Plan: Section 33.2 & Section 52.1–52.6

**Purpose:** Implement blueprint load on project load (33.2) and Quote modal / ServiceM8 UI enhancements (52.1–52.6) without breaking existing behaviour or Railway deployment.

**Constraints:**
- No changes that would prevent successful Railway deploy (no new backend dependencies; frontend remains static HTML/CSS/JS; no new env vars required for these tasks).
- All changes are additive or minimal (warnings, loaders, copy, step value, conditional UI).
- Single source of truth: `TASK_LIST.md`; mark tasks `[x]` when done.

---

## Section 33.2 – Load blueprint image when loading from project

**Current state:**
- **Save:** `getDiagramDataForSave()` in `frontend/app.js` already builds `blueprintImageBase64` when `state.blueprintImage && state.blueprintTransform`, and the save flow (POST `/api/diagrams`) sends it. Backend `create_diagram` / `update_diagram` in `backend/app/diagrams.py` upload blueprint to Supabase Storage and set `blueprint_image_url` on the row.
- **Load:** GET `/api/diagrams/{id}` returns the diagram from `get_diagram()`, which includes `blueprintImageUrl` (camelCase). Load from dropdown/project history calls `restoreStateFromApiSnapshot(diagram)`, which already has logic: if `apiSnapshot.blueprintImageUrl` then `loadImage(apiSnapshot.blueprintImageUrl)` and set `state.blueprintImage` (and default `blueprintTransform` if missing).

**Possible reasons blueprint doesn’t appear on load:**
1. Diagrams saved before blueprint upload was implemented have no `blueprint_image_url` in DB.
2. Frontend receives `blueprintImageUrl` but image load fails (e.g. CORS from Supabase Storage, or network).
3. Backend response key mismatch (backend returns `blueprintImageUrl`; frontend reads `apiSnapshot.blueprintImageUrl` — correct).

**Plan (33.2):**
1. **Verify save path:** Confirm that when the user has a blueprint on canvas and clicks Save, the request body includes `blueprintImageBase64` and the backend persists it and sets `blueprint_image_url`. (Already implemented; no change unless a bug is found.)
2. **Verify load path:** Confirm GET `/api/diagrams/{id}` response includes `blueprintImageUrl` when the row has `blueprint_image_url`. (Already in `get_diagram()`; no change unless bug.)
3. **Verify restore:** Confirm `restoreStateFromApiSnapshot` in `frontend/app.js` (around 6265–6310) uses `apiSnapshot.blueprintImageUrl`, loads the image, and assigns `state.blueprintImage` and `state.blueprintTransform`. (Already implemented.)
4. **Robustness:** If `d.hasBlueprint` is true but `apiSnapshot.blueprintImageUrl` is null or image load fails, keep `state.blueprintTransform` from `d.blueprintTransform` so at least layout is restored; leave `state.blueprintImage = null` and optionally log or show a one-time message that the blueprint image could not be loaded (e.g. CORS). Ensure `loadImage` failure in the catch block does not leave `state.blueprintImage` in a bad state (already set to null in catch).
5. **CORS (if needed):** If Supabase Storage image URLs are on a different origin, ensure the bucket or project allows the app origin (Railway URL and localhost). This may be a Supabase dashboard / bucket setting, not code.
6. **No backend API or schema changes** required for 33.2; optional improvement is clearer handling when image fails to load (user-visible message or placeholder).

**Files to touch:** `frontend/app.js` only (restore logic and possibly a short user message when blueprint URL missing or load fails). No `backend/` or `index.html` changes unless we add a small “image failed to load” message in the UI.

---

## Section 52.1 – Warning when Add to Job with no labour

**Current state:** Add to Job is triggered from the quote modal: user enters Job # and clicks “Add to Job”, which calls `runAddToJobLookupAndConfirm(servicem8AddToJobBtn, jobId)`. There is no check for labour.

**Plan (52.1):**
1. **Where to check:** At the start of the Add to Job flow — i.e. when the user clicks “Add to Job” (before job lookup). In `frontend/app.js`, in the `servicem8AddToJobBtn` click handler (around 1440–1457), before calling `runAddToJobLookupAndConfirm`:
   - Compute total labour: `getLabourRowsOrdered()` and sum `parseFloat(row.querySelector('.quote-labour-hours-input')?.value) || 0`.
   - If total labour hours ≤ 0 (or no labour rows), show a **warning** (e.g. `showMessage('Add labour hours to the quote before adding to a job.', 'info')` or similar) and **return** without opening the confirm overlay.
2. **Copy:** Use clear, non-blocking wording, e.g. “Add labour to the quote before adding to a job” or “No labour on quote. Add labour hours before sending to ServiceM8.”
3. **No change** to API or overlay; only add this guard and message.

**Files:** `frontend/app.js` (one guard + one message call before `runAddToJobLookupAndConfirm`).

---

## Section 52.2 – Header row qty step 0.5 (not 0.001)

**Current state:** Quote table **header row** length inputs (Gutter Length / Downpipe length in metres) use `step="0.001"` in the innerHTML where header rows are built in `frontend/app.js` (gutter section ~2681, downpipe section ~2739). Class: `quote-header-metres-input`.

**Plan (52.2):**
1. Change **only** the **header row** metres input step from `0.001` to `0.5` in both places:
   - Gutter Length header row (around line 2681): in the template string, replace `step="0.001"` with `step="0.5"`.
   - Downpipe length header row (around line 2739): same replacement.
2. Do **not** change:
   - `quote-line-qty-input` (quantity column).
   - `quote-qty-metres-input` (Metres? inline in material rows) — step set at line 1378.
   - Badge length popover input (`badgeLengthInput` in `index.html` or app.js) — leave as 0.001 if that is for precise measurement.

**Files:** `frontend/app.js` (two string replacements in header row templates).

---

## Section 52.3 & 52.4 – Confirm overlay: loaders and tick on Add to Job # / Create New Job

**Current state:** The main “Add to Job” button in the quote footer uses `.quote-servicem8-btn--loading` (white spinner) and `.quote-servicem8-btn--done` (tick). The Confirm Job overlay has two buttons: `jobConfirmAddBtn` (“Add to Job #…”) and `jobConfirmCreateNew` (“Create New Job Instead”). They are only disabled during the request; they do not show a spinner or tick.

**Plan (52.3 – Add to Job #… in overlay):**
1. **Markup:** Add the same structure as the main Add to Job button to `jobConfirmAddBtn`: visible text in a span, spinner span, done (tick) span. Reuse the same CSS pattern (stacked, one visible at a time) so we can reuse classes or add overlay-specific classes that mirror the behaviour.
2. **Behaviour:** In `handleConfirm` (in `initJobConfirmationOverlay`):
   - On click: add loading class, show spinner (white), hide button text.
   - When API (add-to-job + optional attachment) succeeds: remove loading, add done class, show tick; after a short delay (e.g. 800ms) hide overlay and show feedback; then remove done class and re-enable button for next use.
   - On error: remove loading, re-enable button, show error feedback (no tick).
3. **Style:** White spinning load wheel and centralised tick, same as the original Add to Job button (reuse or duplicate the spinner/tick styles for `.job-confirm-add-btn`).

**Plan (52.4 – Create New Job Instead):**
1. **Markup:** Add spinner + done spans to `jobConfirmCreateNew` button.
2. **Behaviour:** In `handleCreateNew`: on click add loading (blue spinner), on success add done (tick), short delay then hide overlay and feedback, then reset button. On error remove loading and re-enable.
3. **Style:** Blue spinning load wheel (same structure as white but border-color blue) and same centralised tick. Add a modifier class for the overlay “Create New” button so the spinner is blue (e.g. `.job-confirm-create-new .job-confirm-spinner { border-top-color: #18A0FB; }` or similar).

**Implementation details:**
- **HTML:** In `frontend/index.html`, update the two overlay buttons to contain: `<span class="job-confirm-btn-text">…</span><span class="job-confirm-spinner" aria-hidden="true"></span><span class="job-confirm-done" aria-hidden="true">✅</span>`. Use a wrapper or existing button so the three are stacked (position absolute, centered).
- **CSS:** In `frontend/styles.css`, add rules for `.job-confirm-add-btn` and `.job-confirm-create-new`: hide text when loading, show spinner when loading, show done when done; spinner for add-btn white, for create-new blue. Mirror the transition and centering used by `.quote-servicem8-btn`.
- **JS:** In `initJobConfirmationOverlay`, in `handleConfirm` and `handleCreateNew`: before fetch add loading class and disable; on success set done class, setTimeout then hideOverlay + showFeedback and remove done + enable; on error remove loading and enable.

**Files:** `frontend/index.html` (button contents), `frontend/styles.css` (overlay button loading/done/spinner), `frontend/app.js` (handleConfirm and handleCreateNew state toggles).

---

## Section 52.5 – ServiceM8 warning symbol left of Export icon

**Current state:** Canvas toolbar has Export (download) button in `frontend/index.html` (around line 30–32), inside `.toolbar-right` > `.toolbar-actions-secondary`. ServiceM8 connection state is in `window.servicem8Connected`, set by `checkServiceM8Status()` in `frontend/app.js`.

**Plan (52.5):**
1. **Markup:** Add a small warning element (e.g. `<span>` with an icon or Unicode ⚠) to the **left** of the Export button, inside `.toolbar-actions-secondary`, e.g. before the Export `<button>`. Give it an id (e.g. `servicem8ExportWarning`) and a class to style it (e.g. `toolbar-servicem8-warning`). Default state: hidden.
2. **Visibility:** Show only when **not** signed into ServiceM8: `!window.servicem8Connected`. Hide when connected.
3. **Logic:** When `checkServiceM8Status()` runs (and sets `window.servicem8Connected`), update the visibility of this element (e.g. call a small function `updateServicem8ToolbarWarning()` that sets `servicem8ExportWarning.hidden = window.servicem8Connected`). Call the same from init when the canvas view is shown (or on first load after auth/ServiceM8 check).
4. **Placement:** “To the left of the download (Export) icon” — so the order in the toolbar should be: [warning?] [Export button] [Save] [clock] … .

**Files:** `frontend/index.html` (one span/element), `frontend/app.js` (update visibility in `checkServiceM8Status` and on init if needed), `frontend/styles.css` (optional: size and color for the warning icon).

---

## Section 52.6 – Greyed-out Add to Job: small red explanation text

**Current state:** The Add to Job section (`#quoteServicem8Section`) is greyed out when `updateServiceM8SectionState(hasIncomplete)` sets `shouldDisable = hasIncomplete || !window.servicem8Connected`. So two reasons: (1) not signed in to ServiceM8, (2) incomplete manual entries (Metres? / missing materials).

**Plan (52.6):**
1. **Markup:** Add a small text element (e.g. `<span id="quoteServicem8DisabledReason" class="quote-servicem8-disabled-reason">`) inside or immediately after the Add to Job section, only visible when the section has class `quote-servicem8-section--disabled`. Place it so it doesn’t break layout (e.g. below the Job # row or below the button).
2. **Copy:**
   - When disabled because **not signed in to ServiceM8:** e.g. “Not signed in to ServiceM8”
   - When disabled because **incomplete manual entries:** e.g. “Complete manual entries (Metres?) first” or “Complete manual entries or add materials first”
3. **Logic:** In `updateServiceM8SectionState(hasIncomplete)` (or immediately after), set the text of the new element and show/hide it:
   - If `!shouldDisable`: hide the reason element.
   - If `shouldDisable`: show it and set text to the appropriate reason (`!window.servicem8Connected` → “Not signed in to ServiceM8”; else → “Complete manual entries (Metres?) first” or similar).
4. **Style:** Small, red text (e.g. `font-size: 12px; color: #c62828;` or similar) so it’s visible but secondary.

**Files:** `frontend/index.html` (one span in quote modal Add to Job section), `frontend/app.js` (in `updateServiceM8SectionState`, set text and visibility), `frontend/styles.css` (`.quote-servicem8-disabled-reason`).

---

## Order of implementation (suggested)

1. **33.2** – Verify and, if needed, harden blueprint load (no new features; ensures existing save/load chain works and handles failures).
2. **52.2** – Header row step 0.5 (two string edits; low risk).
3. **52.1** – Labour warning before Add to Job (one guard + message).
4. **52.5** – ServiceM8 warning icon left of Export (markup + visibility in checkServiceM8Status).
5. **52.6** – Greyed-out explanation text (markup + text in updateServiceM8SectionState).
6. **52.3 & 52.4** – Overlay loaders and tick (markup + CSS + JS for both overlay buttons).

---

## Railway and regression

- **Railway:** No new env vars, no new backend deps, no build step. All changes are frontend (HTML/CSS/JS) and optional backend robustness (33.2). Deploy should remain successful.
- **Regression:** No removal or change of existing behaviour; only additions (warnings, loaders, copy, step value, conditional UI). Existing Add to Job flow, quote calculation, and save/load behaviour unchanged except where explicitly specified above.
- **Testing:** After implementation, manually: save diagram with blueprint → load from project history → confirm blueprint appears; open quote → Add to Job with zero labour → see warning; header metres step 0.5; overlay buttons show spinner then tick; Export warning when not connected; disabled section shows correct red reason.

---

*Plan created for Section 33.2 and 52.1–52.6. Ready to implement.*
