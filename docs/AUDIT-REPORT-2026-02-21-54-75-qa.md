# QA Audit Report: 54.75 Mobile Token Consistency + Horizontal Toolbar Scroll

**Date:** 2026-02-21  
**Auditor role:** Strict Senior QA Engineer (UI/UX best practices)  
**Scope:** Recent 54.75 implementation (CSS + E2E) against Desktop vs. Mobile production, Railway deployment safety, and Apple HIG standards.  
**Intent:** Pass/Fail by category; list bugs, missing cleanup, or logic gaps. No fix code until approval.

---

## 1. Regression & Conflict Check: Mobile → Desktop Bleed

**Question:** Did any mobile layout changes accidentally bleed into the desktop viewport CSS?

| Check | Result | Notes |
|-------|--------|--------|
| All modified/added selectors are under `body[data-viewport-mode="mobile"]` | **PASS** | Every rule touched (toolbar-right/toolbar-actions-secondary, .toolbar gap, horizontal tools-wrap, scrollbar hide, flex-shrink: 0, bottom-sheet title/item) is prefixed with `body[data-viewport-mode="mobile"]`. |
| No desktop-only or global rules were removed or weakened | **PASS** | Only mobile duplicate blocks were removed; desktop diagram toolbar rules (e.g. lines 1299–1306, unscoped `.diagram-floating-toolbar[data-orientation="horizontal"] .diagram-toolbar-tools-wrap`) remain and apply when body does not have `data-viewport-mode="mobile"`. |
| Media query `@media (max-width: 430px)` does not affect desktop | **PASS** | The rules inside the query use the same mobile-only selectors (`body[data-viewport-mode="mobile"] .diagram-floating-toolbar...`); they only apply when viewport mode is mobile. |
| `::-webkit-scrollbar` rule is mobile-scoped | **PASS** | Selector is `body[data-viewport-mode="mobile"] .diagram-floating-toolbar[data-orientation="horizontal"] .diagram-toolbar-tools-wrap::-webkit-scrollbar`. |

**Category result: PASS** — No mobile layout changes bleed into desktop.

---

## 2. Railway Deployment Safety

| Check | Result | Notes |
|-------|--------|--------|
| No new dependencies (package.json unchanged) | **PASS** | Only `frontend/styles.css` and `e2e/run.js` were modified. |
| No build step or config change | **PASS** | No Procfile, nixpacks.toml, Dockerfile, or backend change. |
| Static assets only (CSS/JS) | **PASS** | No new env vars or deploy hooks. |

**Category result: PASS**

---

## 3. Apple HIG Compliance (Mobile)

| Check | Result | Notes |
|-------|--------|--------|
| 44px minimum touch targets preserved on diagram toolbar | **PASS** | `min-width: 44px; min-height: 44px` kept on horizontal toolbar children (pill, upload-zone, transparency, drag-handle, collapse-btn); `flex-shrink: 0` added so overflow does not shrink them below 44px. |
| Bottom sheet list rows remain ≥ 44px | **PASS** | `min-height: 44px` on `.diagram-item-wrap` and `.diagram-item` unchanged; only padding was switched to tokens. |
| Scrollbar visually hidden on horizontal tools wrap | **PASS** | `scrollbar-width: none`, `-ms-overflow-style: none`, and `::-webkit-scrollbar { display: none; }` applied to the tools-wrap only. |
| Safe-area / existing mobile spacing tokens | **PASS** | Token usage is consistent (--mobile-space-sm/md/lg/xl); no removal of safe-area handling elsewhere. |

**Category result: PASS**

---

## 4. E2E Logic & Edge Cases

| Check | Result | Notes |
|-------|--------|--------|
| Orientation-aware scroll assertion (Option B) implemented | **PASS** | Vertical: assert no scroll; horizontal: assert toolbar container does not scroll, tools-wrap may scroll. |
| **Logic gap: `data-orientation` null/undefined** | **FAIL** | If `toolbar.getAttribute('data-orientation')` is null (e.g. not yet set), the code falls into the `else` branch and treats the toolbar as “horizontal.” That is acceptable for the current test flow (toolbar is horizontal after drag-to-top) but is ambiguous: we never explicitly assert that orientation is one of `'vertical'` or `'horizontal'`. If the attribute were missing in a vertical state, we would incorrectly apply horizontal rules and could miss a regression. **Recommendation:** Treat `orientation !== 'vertical'` as horizontal only when we expect horizontal (e.g. after drag-to-top); otherwise, if orientation is null/undefined, either fail with “orientation unknown” or skip the scroll assertion and log a warning. |
| No regression in other mobile E2E steps | **PASS** | No other assertions in the same block were changed; post-drag tap and remaining steps are unchanged. |

**Category result: FAIL** (one logic gap: unhandled null/undefined orientation).

---

## 5. Redundancy & Maintainability (No Functional Bug)

| Check | Result | Notes |
|-------|--------|--------|
| Duplicate mobile token blocks for bottom sheet | **Minor** | `.diagrams-bottom-sheet-title` has token padding in two places: ~1849 (early token block) and ~2388 (later full rule). Same for `.diagrams-bottom-sheet .diagram-item` (~1855 and ~2434). Both sets now use the same token values; the later rules override. **Not a bug;** optional cleanup would be to remove the early padding from 1849/1855 and keep a single source in the later blocks. |
| `.diagrams-bottom-sheet-empty` and `.diagram-item-delete` still use hardcoded px | **Minor** | Plan listed these as optional token replacement (24px/20px → xl/lg; 12px → md). Not done; single source of truth would suggest replacing them in a follow-up. |

**Category result: PASS** (no functional defect; optional cleanup only).

---

## 6. Summary: Strict Pass/Fail by Category

| Category | Result |
|----------|--------|
| 1. Regression & conflict (mobile → desktop bleed) | **PASS** |
| 2. Railway deployment safety | **PASS** |
| 3. Apple HIG (mobile) | **PASS** |
| 4. E2E logic & edge cases | **FAIL** (orientation null/undefined handling) |
| 5. Redundancy / maintainability | **PASS** (optional cleanup only) |

---

## 7. Findings Requiring Approval Before Fix

1. **E2E orientation handling (Bug/Logic gap)**  
   - **Issue:** When `data-orientation` is null or undefined, the test treats the toolbar as horizontal. In a scenario where the toolbar is vertical but the attribute is missing, the scroll assertion would be wrong.  
   - **Proposed fix (after approval):** In the E2E block, if `orientation` is null or undefined, throw a clear error (e.g. “Mobile toolbar data-orientation missing”) or skip the scroll assertion and log a warning, so we never silently treat “unknown” as horizontal.

2. **Optional (non-blocking)**  
   - Consolidate duplicate mobile token rules for `.diagrams-bottom-sheet-title` and `.diagrams-bottom-sheet .diagram-item` (one definition each).  
   - Replace hardcoded padding in `.diagrams-bottom-sheet-empty` and `.diagram-item-delete` with `--mobile-space-*` tokens.

---

## 8. Browser Testing (Live Check)

| Test | Result | Notes |
|------|--------|--------|
| Desktop URL `?viewport=desktop` loads | **PASS** | Page loads; desktop layout (header toolbar, right product panel, no diagram floating toolbar in desktop strip). |
| Desktop toolbar: no horizontal scroll / no squished buttons | **PASS** | Header shows normal spacing; no overflow scrollbar on toolbar. |
| Mobile URL `?viewport=mobile` loads | **PASS** | Page loads with mobile layout. |
| Mobile at 390×844: diagram floating toolbar present | **PASS** | Snapshot shows "Collapse toolbar", "Drag to move toolbar", and tool buttons (Upload photo, Export PNG, Save diagram, etc.); mobile-specific UI active. |
| Desktop vs mobile isolation (visual) | **PASS** | Desktop and mobile viewports render distinct layouts; no observed bleed of mobile toolbar scroll or token spacing into desktop. |

**Note:** Horizontal scroll on the diagram toolbar (tools-wrap) was not explicitly swiped in this session; E2E covers that when the server is running. Visual inspection at 390px mobile width did not show an obvious scrollbar on the diagram toolbar (scrollbar is hidden per CSS), which is expected.

---

*End of audit report.*
