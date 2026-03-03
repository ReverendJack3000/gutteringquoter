# Plan: Bonus dashboard analytics leaderboard (desktop only, ¼ height)

**Date:** 2026-03  
**Scope:** Frontend only. No backend or API changes.  
**Constraint:** Leaderboard is **desktop only**; mobile layout unchanged. Must not break existing analytics table or filters.

---

## 1. Goal

Add a **leaderboard** at the **top** of the Bonus dashboard analytics view (`#view-bonus-analytics`), taking up **¼ of the screen height**, **desktop only**. Mobile users see the current layout (header + filters + table/empty) with no leaderboard.

---

## 2. Current state (from codebase)

- **View structure** (`frontend/index.html` ~870–913): `#view-bonus-analytics` → `.bonus-analytics-view-container` (flex column, height 100%) → `.bonus-analytics-header` → `.bonus-analytics-main` (flex: 1, min-height: 0, overflow: auto) containing filters, loading, error, table wrap, empty.
- **CSS** (`frontend/styles.css` ~4929–5001): All rules scoped under `#view-bonus-analytics`. Main has `flex: 1; min-height: 0; overflow: auto`.
- **JS** (`frontend/app.js`): `fetchBonusAnalyticsSummary()` fetches `GET /api/bonus/analytics/summary`, gets `data.rows` (array of `{ user_id, email, dashboard_type, view_count, total_duration_seconds }`), renders table and shows/hides loading, error, table wrap, empty. No leaderboard block today.
- **Desktop vs mobile:** Viewport is controlled by `body[data-viewport-mode="desktop"]` or `body[data-viewport-mode="mobile"]` (set from `layoutState.viewportMode`; breakpoint `MOBILE_LAYOUT_BREAKPOINT_PX = 980` in app.js). Desktop-only UI is implemented by hiding on mobile, e.g. `body[data-viewport-mode="mobile"] .bonus-race-board-mobile { display: grid }` and the inverse for desktop-only content (show by default, hide when `data-viewport-mode="mobile"`).

---

## 3. Proposed implementation

### 3.1 HTML (`frontend/index.html`)

- **Where:** Inside `.bonus-analytics-view-container`, **after** `.bonus-analytics-header` and **before** `<main class="bonus-analytics-main">`.
- **Add:** A single section, e.g.:
  - `<section id="bonusAnalyticsLeaderboard" class="bonus-analytics-leaderboard" aria-label="Top viewers leaderboard">`
  - Inside: a heading (e.g. `<h2 class="bonus-analytics-leaderboard-title">Top viewers</h2>`) and a container for the list, e.g. `<ol id="bonusAnalyticsLeaderboardList" class="bonus-analytics-leaderboard-list" aria-label="Ranked by total time"></ol>` (or a `<div>` with role="list" if preferred).
- **No change** to header, main, filters, table, or empty block. The leaderboard is an extra block between header and main.

### 3.2 CSS (`frontend/styles.css`)

- **Scoping:** All new rules under `#view-bonus-analytics` (and optionally under `body[data-viewport-mode="desktop"]` for the leaderboard block so intent is explicit).
- **Desktop-only visibility:** Hide the leaderboard on mobile so mobile layout is unchanged:
  - `body[data-viewport-mode="mobile"] #view-bonus-analytics .bonus-analytics-leaderboard { display: none !important; }`
- **Height and layout:** On desktop, the leaderboard section must take exactly ¼ of the viewport height and not shrink:
  - `.bonus-analytics-leaderboard { flex-shrink: 0; height: 25vh; min-height: 80px; overflow: auto; … }` (min-height avoids an unusable strip on very short windows; overflow: auto if content overflows).
  - Optional: `max-height: 25vh` to cap if content is tall.
- **Content styling:** Style the title and the list (`.bonus-analytics-leaderboard-list`) so entries are readable (e.g. rank, user label, metric). Reuse existing analytics colour tokens where possible (#f8fafc, #0f172a, #e2e8f0, etc.). No need to replicate the full technician-bonus race board styling; keep it simple (e.g. list with rank + email/user_id + total time).
- **Order in file:** Add these rules immediately after the existing `#view-bonus-analytics` block (after `.bonus-analytics-empty`) so the analytics view styles stay together.

### 3.3 JS (`frontend/app.js`)

- **Data source:** Reuse the same `rows` from `GET /api/bonus/analytics/summary`. No new API or backend change.
- **Aggregation:** From `rows`, aggregate by `user_id` (or email as key): sum `total_duration_seconds` and sum `view_count` per user. Sort by total time descending (or by view count; define one primary sort, e.g. total time). Take top N (e.g. 5 or 10).
- **When to render:** In `fetchBonusAnalyticsSummary()`, after the block that builds the table from `rows` (and before or after setting `tableWrap.hidden`), derive the top-N list and render the leaderboard:
  - Get the leaderboard list container (e.g. `document.getElementById('bonusAnalyticsLeaderboardList')`).
  - If no rows or error/loading, clear the list and optionally show a short empty state inside the leaderboard section (e.g. "No data yet") so the 25vh area doesn’t look broken.
  - Otherwise, fill the list with one item per top user: rank, display label (email or user_id), and formatted total time (reuse `formatBonusAnalyticsDuration`). Use `escapeHtml` for any user-supplied or API text.
- **Ids:** Reuse existing element ids from the new HTML (`bonusAnalyticsLeaderboard`, `bonusAnalyticsLeaderboardList`) so JS stays in sync with the markup.

### 3.4 Edge cases

- **Empty state:** When `rows.length === 0`, leaderboard section can show a single line like "No data for the selected filters" or leave the list empty with a short message so desktop layout (25vh slot) is still reserved.
- **Resize:** 25vh is viewport-relative, so when the user resizes the window the leaderboard height updates automatically; no JS resize logic required.
- **Mobile:** Leaderboard is hidden via CSS; the rest of the view (filters, table) behaves as today. No change to mobile layout or touch targets.
- **Accessibility:** Section has `aria-label`; list has a sensible label; list items can include rank (e.g. "1", "2") and names so screen readers get order and content.

---

## 4. What we do not change

- **Backend / API:** No new endpoints, no changes to `GET /api/bonus/analytics/summary` or response shape.
- **Filters or table:** Filters and table logic and DOM stay as they are; we only add the leaderboard block and populate it from the same `rows`.
- **Mobile:** No new elements or behaviour on mobile; leaderboard is hidden and the main area still gets the full remaining space.
- **Cache / deploy:** Optional cache bump after implementation (per project practice); no new env or build steps.

---

## 5. Task list update (draft)

- **Section file:** `docs/tasks/section-59.md` — add **59.30.5** under the "Bonus dashboard view analytics" subsection.
- **TASK_LIST.md:** Add one row to the uncompleted table for Section 59, task 59.30.5.

**Proposed task text:**

- **59.30.5** Bonus dashboard analytics leaderboard (desktop only): add a leaderboard at the top of the analytics view taking ¼ screen height (25vh); desktop only (hidden on mobile via `body[data-viewport-mode="mobile"]`); reuse existing summary API data; aggregate by user, top N by total time; no backend changes. Plan: docs/plans/2026-03-bonus-analytics-leaderboard-plan.md.
