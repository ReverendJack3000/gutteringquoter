# Audit Report: 54.84 — Camera placeholder wire and mobile header declutter

**Date:** 2026-02-21  
**Scope:** Implementation of tasks 54.84.1 and 54.84.2 (wire canvas placeholder camera to upload; hide header camera on mobile only).  
**Auditor role:** Strict Senior QA — regression, desktop/mobile separation, Railway safety, UI/UX standards.  
**Constraint:** No code fixes in this report; findings only. Await approval before implementing fixes.

---

## 1. Regression & conflict check

### 1.1 Mobile-only CSS: did any mobile rule bleed into desktop?

| Check | Result | Notes |
|-------|--------|--------|
| 54.84.2 rule scope | **PASS** | `body[data-viewport-mode="mobile"] #cameraUploadBtn { display: none; }` is correctly scoped. Desktop never receives this rule. |
| All other 54.84 CSS | **PASS** | No other new rules are under a mobile-only selector. |

**Verdict: PASS** — No mobile-only layout or visibility change applies on desktop.

---

### 1.2 Shared (unscoped) CSS: desktop impact

| Check | Result | Notes |
|-------|--------|--------|
| `.canvas-placeholder .placeholder-icon` block (1714–1726) | **PASS** | Applies to both viewports. Intentional: same placeholder control on desktop and mobile. Only adds button reset (border/background/padding/cursor/font) so the new `<button>` matches the previous `<span>` appearance. No visibility or layout regression on desktop. |
| Selector scope | **PASS** | `.placeholder-icon` appears only once in the app (inside `#canvasPlaceholder`). No risk of styling unrelated controls. |

**Verdict: PASS** — Shared placeholder-icon styles are appropriate and do not regress desktop.

---

### 1.3 JavaScript: viewport-specific logic and side effects

| Check | Result | Notes |
|-------|--------|--------|
| Placeholder camera listener | **PASS** | Single click handler on `placeholder.querySelector('.placeholder-icon')` calling `fileInput.click()`. No viewport check; same behavior on desktop and mobile. Matches plan (“same entry-point logic once wired”). |
| Header camera listener | **PASS** | Unchanged. Still fires on both viewports; on mobile the button is hidden by CSS so it is not clickable. No logic removed. |
| Init order / double bind | **PASS** | `initUpload()` runs once at app load. One listener per element. No double-fire. |

**Verdict: PASS** — No JS regression or unintended viewport behavior.

---

### 1.4 HTML and accessibility

| Check | Result | Notes |
|-------|--------|--------|
| Placeholder control semantics | **PASS** | `<button type="button" class="placeholder-icon" aria-label="Upload photo">` is focusable, keyboard-activatable, and has an accessible name. |
| Focus visibility | **PASS** | Global `:focus-visible` (outline) and mobile `body[data-viewport-mode="mobile"] button:focus` (54.6) apply to this button. Keyboard and tap focus are visible. |
| Header camera (desktop) | **PASS** | Still present in DOM; only hidden on mobile via CSS. Screen readers on desktop still see and can activate it. |

**Verdict: PASS** — No accessibility regression; new control is accessible.

---

## 2. Desktop vs mobile production behavior

| Scenario | Expected | Audited | Result |
|----------|----------|--------|--------|
| Desktop: header camera visible | Yes | Yes, no rule hides it on desktop | **PASS** |
| Desktop: header camera opens file dialog | Yes | Same click → fileInput.click() | **PASS** |
| Desktop: placeholder camera opens file dialog | Yes | New listener on placeholder icon | **PASS** |
| Mobile: header camera visible | No | Hidden by 54.84.2 rule | **PASS** |
| Mobile: placeholder camera opens file dialog | Yes | Same listener; placeholder visible when no content | **PASS** |

**Verdict: PASS** — Desktop and mobile behavior match stated requirements.

---

## 3. Railway deployment safety

| Check | Result | Notes |
|-------|--------|--------|
| New dependencies | **PASS** | None. |
| Backend / API changes | **PASS** | None. |
| Build / compile step | **PASS** | None; vanilla HTML/CSS/JS. |
| Static assets only | **PASS** | Changes only in `frontend/index.html`, `frontend/app.js`, `frontend/styles.css`. |

**Verdict: PASS** — Safe for existing Railway deployment.

---

## 4. UI/UX best practices

| Check | Result | Notes |
|-------|--------|--------|
| Touch target (mobile) | **PASS** | 54.72 already sets `.canvas-placeholder .placeholder-icon` to min 44×44px on mobile (2455–2452). Unchanged. |
| Single primary upload entry on mobile | **PASS** | Placeholder camera is the only visible upload trigger on mobile when no blueprint is loaded. |
| Copy vs behavior | **FAIL** (see Finding A) | Placeholder title still says “Tap the Camera icon **above** to add a background photo.” On mobile there is no camera above after 54.84.2. |
| Consistency with 54.82 hide rules | **WARN** (see Finding B) | 54.82.3 uses `!important` for hidden header buttons; 54.84.2 does not. Works today; may be worth aligning for consistency and future-proofing. |

**Verdict: PASS** with one **FAIL** (copy) and one **WARN** (CSS consistency).

---

## 5. Logic and flow gaps

| Check | Result | Notes |
|-------|--------|--------|
| Upload path when placeholder visible | **PASS** | Mobile: placeholder camera is the only upload trigger; works. |
| Upload path when placeholder hidden | **FAIL** (see Finding C) | On mobile, once a blueprint (or elements) exists, `updatePlaceholderVisibility()` hides the placeholder. Header camera is also hidden. There is no remaining UI control that calls `fileInput.click()`. Users cannot “replace blueprint” or “upload new photo” from the UI on mobile. |

**Verdict: FAIL** — Logic gap: no upload entry on mobile when placeholder is hidden.

---

## 6. E2E and tests

| Check | Result | Notes |
|-------|--------|--------|
| Desktop toolbar check | **PASS** | E2E uses `#uploadZone` or `#cameraUploadBtn` at 1280×720. Camera button still in DOM and visible on desktop; test passes. |
| Mobile upload path in E2E | **PASS** | Mobile tests use `#fileInput` and `uploadFile()` (e.g. run.js 1524–1526), not the camera button. Unaffected by hiding the button. |

**Verdict: PASS** — No test regression identified.

---

## 7. Summary: Pass/Fail by category

| Category | Result |
|----------|--------|
| 1. Regression & conflict (mobile CSS bleed) | **PASS** |
| 2. Desktop vs mobile production behavior | **PASS** |
| 3. Railway deployment safety | **PASS** |
| 4. UI/UX best practices | **PASS** (with one FAIL and one WARN below) |
| 5. Logic / flow gaps | **FAIL** (Finding C) |
| 6. E2E and tests | **PASS** |

---

## 8. Findings (bugs, cleanup, logic gaps)

### Finding A — Placeholder copy misleading on mobile (UX)

- **What:** Placeholder title text: “Tap the Camera icon **above** to add a background photo, or tap Products below to start building.”
- **Issue:** On mobile, after 54.84.2, there is no camera “above” (header camera is hidden). The camera is only the icon in the placeholder. Copy is misleading.
- **Where:** `frontend/index.html` — `.placeholder-title` (single source for both viewports).
- **Suggested fix (after approval):** Either (1) use viewport-agnostic copy, e.g. “Tap the camera icon to add a background photo…”, or (2) serve different copy on mobile (e.g. data attribute + JS, or a mobile-only span). Plan had noted this as optional; flagging as a UX finding.

---

### Finding B — Optional: align 54.84.2 with 54.82.3 use of `!important`

- **What:** 54.82.3 hides Export, clock, Accessibility with `display: none !important`. 54.84.2 hides the camera with `display: none` (no `!important`).
- **Issue:** None today; specificity is sufficient. For consistency and to guard against future toolbar rules, using `!important` would match 54.82.3.
- **Where:** `frontend/styles.css` — `body[data-viewport-mode="mobile"] #cameraUploadBtn { display: none; }`.
- **Suggested fix (after approval):** Add `!important` to the declaration. Optional cleanup.

---

### Finding C — Logic gap: no upload entry on mobile when placeholder is hidden

- **What:** On mobile, the only upload triggers are (1) header camera (hidden by 54.84.2) and (2) placeholder camera (visible only when there is no blueprint and no elements). When the user has already loaded a blueprint, `updatePlaceholderVisibility()` adds `.hidden` to the placeholder, so the placeholder camera is not visible. No other control triggers `fileInput.click()`.
- **Issue:** On mobile, after the first upload, there is no way to “upload a new/replacement photo” from the UI. Desktop still has the header camera for that.
- **Where:** Product decision + possible UI change (e.g. restore a mobile-only upload entry when content exists, or document that “replace blueprint” is out of scope for mobile in this release).
- **Suggested fix (after approval):** Either (1) add a mobile-only “Upload / Replace photo” entry when the placeholder is hidden (e.g. in diagram toolbar or a menu), or (2) explicitly accept the limitation and document it, or (3) keep the header camera visible on mobile when the placeholder is hidden (more complex, viewport + state dependent). Requires product/UX decision before implementation.

---

## 9. Conclusion

Implementation is **correct and scoped** for the stated tasks: placeholder camera is wired, header camera is hidden on mobile only, desktop is unchanged, and Railway deployment is safe. No desktop regression or mobile CSS bleed.

**Blocking or high-priority:** Finding C (no upload path on mobile when placeholder is hidden). Recommend deciding intended behavior (allow “replace photo” on mobile or not) before release.

**Non-blocking:** Finding A (copy), Finding B (optional `!important`). Can be addressed in follow-up or left as-is per product preference.

No fix code has been written; awaiting your approval on this audit and on which findings to address.
