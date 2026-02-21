# Mobile: Residual blue border on button tap – fix plan

**Date:** 2026-02-21  
**Scope:** Mobile UI/accessibility only. Desktop and Railway deployment unchanged.  
**Related:** Section 54 (mobile app), task 54.6 (focus ring on mobile).

---

## 1. Symptom

When testing with viewport = mobile (`?viewport=mobile`), tapping multiple buttons leaves a **residual blue border** on the last tapped control. The ring persists until the user taps another focusable element.

---

## 2. Root cause (verified against codebase)

Two contributing factors:

### 2.1 Focus persists on the last tapped element (primary)

- **54.6** intentionally shows a focus ring on mobile for any `:focus` (`outline: 2px solid #0b68ff`) so tap targets have a visible focus indicator (tap often doesn’t match `:focus-visible`).
- After a tap, focus remains on that button/link. Tapping the **canvas** or other **non-focusable** areas does **not** move focus, so the last control keeps the outline — which looks like a “residual” blue border.

**Evidence:**  
`frontend/styles.css` lines 135–144: mobile-only rule for `button:focus`, `a:focus`, `input:focus`, `select:focus`, `textarea:focus`, `[tabindex]:focus`, `.product-thumb:focus`. No JS currently blurs after canvas/non-focusable tap.

### 2.2 Browser default tap highlight (secondary)

- The project does **not** set `-webkit-tap-highlight-color`. On iOS Safari and some Android browsers, the default tap highlight (gray/blue flash) can appear and persist briefly, adding to the “residual” effect or being mistaken for the focus ring.

**Evidence:**  
Grep for `tap-highlight` / `webkit-tap` in `frontend/` returns no matches.

---

## 3. Goal

- **Keep** 54.6 behavior: focus ring on mobile when an element is focused (accessibility).
- **Remove** the impression of “residual” blue borders by:
  1. Suppressing the browser’s default tap highlight on mobile so only our focus ring is visible.
  2. On mobile, when the user taps the canvas or another non-focusable area, blur the current focus so the ring doesn’t stay on the last button.

---

## 4. Desktop vs mobile impact

| Change | Mobile | Desktop |
|--------|--------|---------|
| CSS tap highlight | New rules under `body[data-viewport-mode="mobile"]` only | No change |
| JS blur on canvas/non-focusable tap | New logic gated by `layoutState.viewportMode === 'mobile'` | No change |

Desktop production UI and focus behavior remain unchanged.

---

## 5. Implementation plan

### 5.1 CSS: Suppress browser tap highlight (mobile only)

**File:** `frontend/styles.css`

- Under `body[data-viewport-mode="mobile"]`, add a rule so interactive elements do not show the browser’s default tap highlight; we rely on our 54.6 focus outline only.
- Add once (e.g. next to the existing 54.6 block ~135–144):

```css
/* Mobile: suppress browser default tap highlight; we use 54.6 focus ring only */
body[data-viewport-mode="mobile"] button,
body[data-viewport-mode="mobile"] a,
body[data-viewport-mode="mobile"] input,
body[data-viewport-mode="mobile"] select,
body[data-viewport-mode="mobile"] textarea,
body[data-viewport-mode="mobile"] [tabindex],
body[data-viewport-mode="mobile"] .product-thumb {
  -webkit-tap-highlight-color: transparent;
  tap-highlight-color: transparent;
}
```

- **Optional:** If any non-button element (e.g. `.toolbar-pill-btn` wrapper) can receive tap and show native highlight, extend the selector list only as needed; keep scope mobile-only.

**Verification:** No new focus styles; 54.6 focus ring still appears when element has `:focus`. Desktop has no new rules.

---

### 5.2 JS: Blur focus when tapping canvas / non-focusable (mobile only)

**File:** `frontend/app.js`

- **When:** On pointer down (or first pointer in a gesture) on a target that is **not** focusable and is inside the canvas/workspace area.
- **Condition:** Only when `layoutState.viewportMode === 'mobile'`.
- **Action:** If `document.activeElement` is focusable and not `document.body`, call `document.activeElement.blur()` (or move focus to a safe sentinel if preferred; blur is sufficient and common for “tap outside” on mobile).

**Placement options (choose one):**

- **Option A – Canvas pointerdown:** In the existing `canvas.addEventListener('pointerdown', ...)` (e.g. ~6431), at the start of the handler (after `e.button !== 0` check), if viewport is mobile and the event target is the canvas or a non-focusable descendant, blur `document.activeElement` if it’s focusable.  
  - **Caveat:** Canvas may have focusable children in the future; ensure we only blur when the actual target is not focusable (e.g. `!e.target.closest('button, a, input, select, textarea, [tabindex]:not([tabindex="-1"])`).

- **Option B – Document-level pointerdown (capture):** Add a single `document.addEventListener('pointerdown', handler, true)`. In the handler, if viewport is mobile and the event target is **not** inside a focusable element and **not** inside a modal (e.g. not inside `#quoteModal`, `#productModal`, `.diagrams-bottom-sheet`, etc.), blur `document.activeElement` if focusable.  
  - Ensures any tap “outside” (canvas, blueprint-wrap, non-focusable toolbar chrome) clears the residual ring. Must not run when target is inside a focus trap (modal/panel with trap).

**Recommendation:** Option A (canvas pointerdown) is scoped and avoids touching modal/panel logic. If product wants “tap anywhere outside a control” to clear focus, Option B can be a follow-up.

**Safety:**

- Do **not** blur when a modal/dialog is open (focus trap). Check that no modal/overlay that traps focus is currently visible before blurring.
- Do **not** blur when the tap target is focusable (e.g. another button); normal focus move handles that.
- Keep logic behind `layoutState.viewportMode === 'mobile'` so desktop is unchanged.

**Pseudocode (Option A):**

```text
In canvas "pointerdown" handler, after button check:
  if (layoutState.viewportMode !== 'mobile') return; // or skip blur block
  if (modal open that traps focus) return;
  let t = e.target;
  if (t.closest('button, a, input, select, textarea, [tabindex]:not([tabindex="-1"])')) return;
  let el = document.activeElement;
  if (el && el !== document.body && (el.closest('#workspaceMain') || el.closest('.blueprint-wrap') ...)) el.blur();
```

Refine selector so we only blur when the active element is something we’re okay to blur (e.g. a button/link in the toolbar or panel), not an input that the user is typing in. Simplest: if `activeElement` is inside the canvas/workspace and not an input/textarea, blur; or blur only when `activeElement` is one of `button, a, .toolbar-pill-btn, .toolbar-icon-btn, .panel-close, .product-thumb` etc. so we don’t blur form fields.

**Suggested rule:** On mobile, when the user pointerdowns on the canvas (or non-focusable part of the workspace), if the current `activeElement` is a **control that’s not a text input** (e.g. button, a, .product-thumb), blur it. If it’s an input/textarea, do not blur (user might be using an on-screen keyboard). This keeps the ring from sticking on buttons while avoiding breaking form entry.

---

## 6. Edge cases and accessibility

| Edge case | Mitigation |
|-----------|------------|
| Modal/dialog open (focus trap) | Do not blur when a modal/overlay that traps focus is visible. |
| User typing in an input | Do not blur when `activeElement` is an input or textarea. |
| Screen reader / keyboard user on mobile | Blur only on pointerdown on canvas/non-focusable; keyboard focus movement unchanged. 54.6 ring still shows while focus is on a control. |
| Desktop | All new logic and CSS scoped to mobile; no desktop impact. |
| Horizontal scroll / diagram toolbar | Toolbar buttons are focusable; tapping them moves focus. Tapping canvas or empty area triggers blur. |

---

## 7. Verification

- Manual: Load app with `?viewport=mobile`, tap several toolbar/panel buttons, then tap canvas or empty blueprint area — blue ring on the last button should disappear.
- Manual: Same flow on desktop — no change in focus/outline behavior.
- Manual: Open a modal (e.g. Save diagram), tap outside — focus should remain trapped (no blur of modal content).
- Optional: E2E add a check that after tap on canvas in mobile viewport, a previously focused button no longer has focus (e.g. `document.activeElement` not that button).

---

## 8. Railway / deploy

- No new dependencies, no build step. Safe to deploy as-is.

---

## 9. Task list update (draft)

After implementation:

- In **`docs/tasks/section-54.md`**: add (or mark done) a task, e.g. **54.89.1** and **54.89.2**:
  - **54.89.1** Mobile: suppress browser tap highlight so only 54.6 focus ring shows (CSS `-webkit-tap-highlight-color: transparent` under `body[data-viewport-mode="mobile"]`).
  - **54.89.2** Mobile: blur focused control when user taps canvas/non-focusable area so residual blue ring doesn’t persist (JS in canvas pointerdown, mobile-only, no blur in modals or when activeElement is input/textarea).
- In **`TASK_LIST.md`**: add a row to the uncompleted table for Section 54 linking to 54.89.1–54.89.2 (or the chosen task IDs).

---

## 10. Summary

- **Cause:** (1) 54.6 shows focus ring on mobile; focus stays on last tapped control; (2) no tap-highlight suppression, so browser default can add to the effect.
- **Fix:** (1) CSS: mobile-only `-webkit-tap-highlight-color: transparent` for interactive elements. (2) JS: on mobile, on canvas (or non-focusable) pointerdown, blur the current focus if it’s a non-input control and no modal is open.
- **Scope:** Mobile only; desktop and Railway unchanged.
