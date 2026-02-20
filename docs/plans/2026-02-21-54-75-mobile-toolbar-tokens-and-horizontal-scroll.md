# Plan: 54.75 Mobile Toolbar Token Consistency + Horizontal Scroll (UI Fix)

**Date:** 2026-02-21  
**Goal:** Restore design-system consistency for mobile by removing hardcoded overrides, using `--mobile-space-*` tokens everywhere, and allowing horizontal scrolling for the diagram floating toolbar (horizontal orientation) so 44px touch targets and proper padding/gaps can be kept without internal scroll prohibition.

**Scope:** CSS only in `frontend/styles.css` (mobile-scoped); E2E assertion update in `e2e/run.js`; TASK_LIST.md completion. No JS or desktop UI changes. Railway-safe (no build/config changes).

---

## 1. Summary of Exact styles.css Line Numbers to Modify

| Area | Lines | Action |
|------|--------|--------|
| Token block (toolbar-right / toolbar-actions-secondary) | **1843–1846** | Add `flex-wrap: wrap; min-width: 0;` to the existing rule so one source of truth. |
| Toolbar gap fallback | **1871** | Change `gap: var(--mobile-space-md, 0.5rem);` → `gap: var(--mobile-space-md);`. |
| Duplicate .toolbar-right block | **1894–1898** | **Remove** entire block (hardcoded gap + redundant min-width/flex-wrap). |
| Duplicate .toolbar-actions-secondary block | **1900–1904** | **Remove** entire block (hardcoded gap + redundant min-width/flex-wrap). |
| Horizontal diagram toolbar tools-wrap | **2198–2204** | Use `gap: var(--mobile-space-sm);` (8px), replace `overflow: hidden` with overflow-x: auto, scrollbar hiding, -webkit-overflow-scrolling: touch. Add `::-webkit-scrollbar { display: none; }`. |
| Horizontal toolbar 44px children | **2211–2216** | Add `flex-shrink: 0` to the existing rule so flex doesn’t squish buttons when container has overflow-x: auto. |
| Bottom sheet title | **2390–2397** | Replace `padding: 0 20px 12px` with `padding: 0 var(--mobile-space-lg) var(--mobile-space-md);`. |
| Bottom sheet diagram-item | **2436–2440** | Replace `padding: 12px 52px 12px 16px` with `padding: var(--mobile-space-md) 52px var(--mobile-space-md) var(--mobile-space-lg);`. |
| (Optional) Bottom sheet empty / diagram-item-delete | **2411**, **2456** | Replace 24px/20px and 12px with `--mobile-space-xl`, `--mobile-space-lg`, `--mobile-space-md` for single source of truth. |

**Not modified:**  
- **1865–1868** (`.global-toolbar-wrap`, `.toolbar` overflow-x: hidden) — remains; that is the **global header** toolbar, not the diagram floating toolbar.  
- **2205–2209** (vertical diagram toolbar `.diagram-toolbar-tools-wrap`) — no scrolling; vertical has plenty of space.  
- **2219–2229** (`@media (max-width: 430px)`) — can be left as-is (wrap fallback on very narrow) or kept for consistency; plan assumes leave as-is unless we want horizontal scroll everywhere.

---

## 2. CSS Changes (Step-by-Step)

### 2.1 Clean up tech debt (duplicate blocks)

- **Expand the rule at 1843–1846** so it reads:
  - `body[data-viewport-mode="mobile"] .toolbar-right,`
  - `body[data-viewport-mode="mobile"] .toolbar-actions-secondary {`
  - `gap: var(--mobile-space-md);`
  - `flex-wrap: wrap;`
  - `min-width: 0;`
  - `}`
- **Delete the block at 1894–1898** (`body[data-viewport-mode="mobile"] .toolbar-right { gap: 0.5rem; flex-wrap: wrap; min-width: 0; }`).
- **Delete the block at 1900–1904** (`body[data-viewport-mode="mobile"] .toolbar-actions-secondary { flex-wrap: wrap; min-width: 0; gap: 0.5rem; }`).

Result: One rule for .toolbar-right and .toolbar-actions-secondary using tokens and layout; no duplicate hardcoded gap.

### 2.2 Restore tokens in remaining blocks

- **Line 1871:** In `body[data-viewport-mode="mobile"] .toolbar`, change:
  - `gap: var(--mobile-space-md, 0.5rem);` → `gap: var(--mobile-space-md);`
  (Tokens are defined in same scope at 1834–1838; fallback redundant.)

### 2.3 Bottom sheet padding (tokens only)

- **Lines 2390–2397** — `.diagrams-bottom-sheet-title`:  
  - From: `padding: 0 20px 12px;`  
  - To: `padding: 0 var(--mobile-space-lg) var(--mobile-space-md);`

- **Lines 2436–2440** — `.diagrams-bottom-sheet .diagram-item`:  
  - From: `padding: 12px 52px 12px 16px;`  
  - To: `padding: var(--mobile-space-md) 52px var(--mobile-space-md) var(--mobile-space-lg);`

- **(Optional)** `.diagrams-bottom-sheet-empty` (2411): `padding: 24px 20px` → `padding: var(--mobile-space-xl) var(--mobile-space-lg);` and adjust padding-bottom to use `var(--mobile-space-xl)` inside `max()` if desired.
- **(Optional)** `.diagram-item-delete` (2456): `right: 12px` → `right: var(--mobile-space-md);`

### 2.4 Enable horizontal scrolling (diagram floating toolbar, horizontal only)

- **Selector:** `body[data-viewport-mode="mobile"] .diagram-floating-toolbar[data-orientation="horizontal"] .diagram-toolbar-tools-wrap` (currently lines 2198–2204).

- **Replace** the block content so it becomes:
  - `flex-direction: row;`
  - `flex-wrap: nowrap;`
  - `gap: var(--mobile-space-sm);` (8px — fully commit to the token; with scroll allowed there is no need to squish by 2px; eliminates tech debt.)
  - `max-width: none;`
  - `overflow-x: auto;`
  - `overflow-y: hidden;`
  - `-webkit-overflow-scrolling: touch;`
  - `scrollbar-width: none;`
  - `-ms-overflow-style: none;`

- **Add** a new rule immediately after (same selector + pseudo-element) to hide WebKit scrollbar:
  - `body[data-viewport-mode="mobile"] .diagram-floating-toolbar[data-orientation="horizontal"] .diagram-toolbar-tools-wrap::-webkit-scrollbar { display: none; }`

**Protect 44px targets (flex-shrink: 0):** When a flex container has `overflow-x: auto`, some browsers still try to shrink flex children to fit before showing a scrollbar, which can break the 44px minimum. **Add `flex-shrink: 0`** to the existing rule at 2211–2216 that targets the horizontal toolbar’s interactive children (`.toolbar-pill-btn`, `.upload-zone`, `.blueprint-transparency-btn`, `.diagram-toolbar-drag-handle`, `.diagram-toolbar-collapse-btn`). That guarantees the browser respects the 44px minimum and overflow triggers scroll instead of squishing.

**Vertical toolbar:** No change. `body[data-viewport-mode="mobile"] .diagram-floating-toolbar[data-orientation="vertical"] .diagram-toolbar-tools-wrap` (2205–2209) remains non-scrolling.

---

## 3. E2E Updates (e2e/run.js) — Option B (definitive)

- **Location:** ~1542–1557 (mobile toolbar block, after drag-to-top and before post-drag tap check).

- **Current behaviour:** Asserts that both `toolbarScroll` and `toolsScroll` are false (no internal scrollbars).

- **Change (implement Option B):** Update the `evaluate` block to read the toolbar’s `data-orientation` attribute and branch:
  - **If `data-orientation === 'vertical'`:** Assert no internal scrollbars: `!toolbarScrollState.toolbarScroll && !toolbarScrollState.toolsScroll` (throw if either is true).
  - **If `data-orientation === 'horizontal'`:** Do **not** assert “no scrollbars”. Either assert that `toolsScroll === true` (tools wrap is scrollable when content overflows) or skip the scroll assertion for horizontal mode. Choose one: (a) skip assertion, or (b) assert `toolsScroll === true` when overflow is expected — plan prefers (b) when the test leaves the toolbar in horizontal orientation with enough tools to overflow, so we positively confirm scroll is enabled.

**Implementation:** In the same `evaluate`, return (or derive) `orientation: toolbar.getAttribute('data-orientation')`. After the evaluate, if `orientation === 'vertical'`, assert `!toolbarScrollState.toolbarScroll && !toolbarScrollState.toolsScroll`. If `orientation === 'horizontal'`, either skip the no-scroll assertion or assert `toolbarScrollState.toolsScroll === true`; do not throw for “toolbar has internal scrollbars” in horizontal mode.

---

## 4. TASK_LIST.md

- After CSS and E2E changes are applied and verified:
  - Mark **54.75** complete: change `- [ ]` to `- [x]` and add a short note that token consistency and horizontal scroll (mobile diagram toolbar) are done, E2E updated for orientation-aware scroll expectation.

---

## 5. What Is NOT Changing (Critical Rules)

- **JS:** No changes to `app.js` or `run.js` logic (edge-snapping, drag vs tap, bounds, desktop isolation).
- **Desktop UI:** All edits remain under `body[data-viewport-mode="mobile"]`; desktop production UI untouched.
- **44px touch targets:** Preserved; no reduction.
- **Railway:** No dependency, build, or deploy config changes; static CSS and E2E only.

---

## 6. Verification

- Run `npm test` (E2E) and ensure mobile diagram toolbar tests pass (including updated scroll assertion).
- Run `./scripts/verify_api.sh` if applicable.
- Manually: load app with `?viewport=mobile`, expand diagram toolbar to horizontal, confirm tools can be swiped horizontally with no visible scrollbar; vertical orientation has no internal scrollbars.
- Confirm desktop layout and toolbar behaviour unchanged.

---

## 7. Token Reference (from styles.css 1834–1838)

- `--mobile-space-sm: 8px`
- `--mobile-space-md: 12px`
- `--mobile-space-lg: 16px`
- `--mobile-space-xl: 24px`

Mapping used: 12px → `--mobile-space-md`, 16px → `--mobile-space-lg`, 20px → `--mobile-space-lg` (single source of truth), 24px → `--mobile-space-xl`.
