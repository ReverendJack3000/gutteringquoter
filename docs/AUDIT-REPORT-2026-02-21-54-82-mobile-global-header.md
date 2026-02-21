# Audit Report: 54.82 Mobile Global Header (Tools Reorder & Declutter)

**Date:** 2026-02-21  
**Auditor role:** Strict Senior QA Engineer (UI/UX and production-safety focus)  
**Scope:** Implementation of tasks 54.82.1–54.82.4 (tools within `#globalToolbar` only; plan: `docs/plans/2026-02-21-mobile-global-toolbar-reorder-and-declutter.md`).  
**Constraints under review:** Desktop vs. Mobile production isolation, Railway deployment safety, UI/UX best practices.

---

## 1. Regression & conflict check

### 1.1 Desktop viewport: no bleed from mobile rules

**Requirement:** No mobile-only layout change may affect the desktop viewport. Desktop is determined by `body` not having `data-viewport-mode="mobile"` (or having `data-viewport-mode="desktop"`).

**Findings:**

- Every rule added in 54.82 is prefixed with `body[data-viewport-mode="mobile"]`:
  - 54.82.1: `body[data-viewport-mode="mobile"] .toolbar-left`, `body[data-viewport-mode="mobile"] .toolbar-collapse-btn`
  - 54.82.2: `body[data-viewport-mode="mobile"] .breadcrumb-chevron` (only addition is `order: -1` inside existing mobile block)
  - 54.82.3: `body[data-viewport-mode="mobile"] #exportBtn`, `body[data-viewport-mode="mobile"] .toolbar-diagrams-wrap`, `body[data-viewport-mode="mobile"] #openAccessibilitySettingsBtn`
- When `body` does not have `data-viewport-mode="mobile"`, these selectors do not match; desktop layout is unchanged.
- No new rule was added without the `body[data-viewport-mode="mobile"]` prefix.

**Result: PASS** — Mobile layout changes do not bleed into the desktop viewport.

---

### 1.2 Diagram toolbar / other toolbars: no collateral impact

**Requirement:** Only tools inside the global header (`#globalToolbar` in `#globalToolbarWrap`) may be changed. The diagram floating toolbar and any other toolbar must be unaffected.

**Findings:**

- **`.toolbar-collapse-btn`**  
  - In the DOM, only the global header button uses this class (`#toolbarCollapseBtn` in `index.html`).  
  - The diagram toolbar uses **`.diagram-toolbar-collapse-btn`** (`#diagramToolbarCollapseBtn`).  
  - The new rule `body[data-viewport-mode="mobile"] .toolbar-collapse-btn { order: 0 }` therefore applies only to the global header collapse button.

- **`.toolbar-left`**  
  - Appears only once in the app, as a direct child of `#globalToolbar`.  
  - No other toolbar uses this class.

- **`.breadcrumb-chevron`**  
  - Exists only inside `#toolbarBreadcrumbsNav` within the global header.  
  - No reuse elsewhere.

- **`#exportBtn`, `.toolbar-diagrams-wrap`, `#openAccessibilitySettingsBtn`**  
  - IDs are unique; `.toolbar-diagrams-wrap` appears only in the global header.  
  - Hiding applies only to those instances.

**Result: PASS** — No impact on the diagram toolbar or any other toolbar; only global header tools are affected.

---

### 1.3 Specificity and source order

**Requirement:** New rules must not unintentionally override desktop or shared rules, and existing 44px / spacing behavior must remain where required.

**Findings:**

- New rules are *more* specific than base toolbar rules (they add `body[data-viewport-mode="mobile"]`), and apply only in mobile. They do not override desktop rules.
- Existing 44px rules are unchanged and still apply on mobile:
  - `body[data-viewport-mode="mobile"] .global-toolbar-wrap .toolbar-collapse-btn` (min-height/min-width 44px) at line ~2644.
  - `body[data-viewport-mode="mobile"] .toolbar-breadcrumbs` (min-height: 44px) unchanged.
- Header padding/gap on mobile (`body[data-viewport-mode="mobile"] .toolbar`) unchanged (e.g. `padding: clamp(...)`, `gap: var(--mobile-space-md)`).
- No `!important` was introduced except for the three hide rules (54.82.3), which are intentionally high-specificity and mobile-only.

**Result: PASS** — No harmful specificity or source-order conflicts; 44px and spacing preserved.

---

### 1.4 HTML / JS / build and deployment

**Requirement:** No HTML or JS changes; no new dependencies or build steps; Railway deployment remains valid.

**Findings:**

- No changes to `index.html` or any JS file as part of 54.82.
- Only `frontend/styles.css` was modified (additive rules).
- No changes to `Procfile`, `nixpacks.toml`, `package.json`, or backend.
- E2E (`npm test`) was run and passed post-implementation.

**Result: PASS** — No regression in HTML/JS/build/deploy; Railway deployment safety maintained.

---

## 2. UI/UX and accessibility

### 2.1 Touch targets (44px) and spacing

**Requirement:** Mobile primary controls must retain at least 44px touch targets and consistent spacing (e.g. `--mobile-space-*`, header padding/gap).

**Findings:**

- No rule was added or changed that removes or reduces the existing 44px minimums for the global header (collapse button, breadcrumb area, other toolbar controls).
- No change to mobile header padding, gap, or spacing tokens.
- Plan 3.4 (rely on existing gap between `.toolbar-left` and `.toolbar-collapse-btn`) was followed; no extra margin was added. If manual QA finds the first row cramped on very narrow viewports, that can be a follow-up enhancement, not a defect of this implementation.

**Result: PASS** — 44px targets and spacing rules preserved.

---

### 2.2 Hidden controls (Export, Diagrams, Accessibility)

**Requirement:** On mobile, Export, Saved diagrams (clock), and Accessibility are hidden in the header by design. Alternatives and accessibility impact must be acceptable.

**Findings:**

- **Visibility:** `display: none !important` correctly removes the three controls from layout and from the accessibility tree when in mobile viewport.
- **Alternatives:**  
  - Saved diagrams: still open via tapping the breadcrumb (“Projects”), which opens the diagrams bottom sheet (existing behavior).  
  - Accessibility: still available via profile menu (“Accessibility” menuitem).  
  - Export: no in-header alternative on mobile per current scope; acceptable per plan.
- **Focus:** Keyboard users on mobile will not tab to the hidden header buttons; they can use breadcrumb and profile menu as above. This is a known, accepted trade-off for decluttering.
- **Breadcrumb semantics:** `#toolbarBreadcrumbsNav` retains `aria-label="Project"`; no change to that in this implementation.

**Result: PASS** — Hiding is implemented as designed; alternatives and semantics are consistent with the plan.

---

### 2.3 Visual order and clarity

**Requirement:** On mobile, (1) Projects/Untitled at top-left, (2) collapse after breadcrumb, (3) chevron to the left of “Projects” for clear “tap to open” affordance.

**Findings:**

- Flex `order` is used only within the global header: `.toolbar-left { order: -1 }`, `.toolbar-collapse-btn { order: 0 }`, and `.breadcrumb-chevron { order: -1 }` inside the breadcrumb. This yields [Breadcrumb (chevron + Projects/Untitled)] [Collapse] [Rest of header] and, inside the breadcrumb, [Chevron] [Projects /] [Input] [Go back].
- No change to diagram toolbar or other UI; visual order change is limited to the global header.

**Result: PASS** — Visual order matches the specified UX.

---

## 3. Pass/Fail summary

| Category | Result |
|----------|--------|
| **1.1 Desktop viewport: no bleed from mobile rules** | **PASS** |
| **1.2 Diagram toolbar / other toolbars: no collateral impact** | **PASS** |
| **1.3 Specificity and source order** | **PASS** |
| **1.4 HTML / JS / build and deployment** | **PASS** |
| **2.1 Touch targets (44px) and spacing** | **PASS** |
| **2.2 Hidden controls (Export, Diagrams, Accessibility)** | **PASS** |
| **2.3 Visual order and clarity** | **PASS** |

---

## 4. Bugs, missing cleanup, and logic gaps

**Bugs:** None identified.  
**Missing cleanup:** None. No temporary or dead code was introduced.  
**Logic gaps:** None. All added rules are scoped to mobile, target only global header elements, and do not conflict with existing behavior.

---

## 5. Recommendations (no code changes in this audit)

- **Manual QA:** Run the manual checks in the plan (Section 6) on a real device or emulator with `?viewport=mobile` (e.g. 390×844): confirm header order, hidden buttons, breadcrumb tap → bottom sheet, and no horizontal scroll. Then confirm desktop at 1280×720: header order and all buttons unchanged.
- **Railway:** After approval, deploy as usual; no config or build change is required for this CSS-only work.
- **Optional follow-up:** If future feedback indicates the first row (breadcrumb + collapse) feels cramped on very narrow mobile widths, consider a small mobile-only gap or margin (e.g. between `.toolbar-left` and `.toolbar-collapse-btn`) in a later task; not required for this implementation to be correct.

---

**Audit complete.** All categories Pass; no fixes requested before approval.
