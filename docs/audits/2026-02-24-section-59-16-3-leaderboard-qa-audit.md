# QA Audit Report: Section 59.16.3 Leaderboard Implementation

**Date:** 2026-02-24  
**Auditor role:** Strict Senior QA Engineer (UI/UX and production-safety focus)  
**Scope:** Task 59.16.3 (dashboard `leaderboard[]` API and consumer behaviour).  
**Constraints under review:** Desktop vs Mobile production, Railway deployment safety, UI/UX best practices.

---

## 1. Executive summary

| Area | Status | Notes |
|------|--------|------|
| Desktop vs mobile | **PASS** | Leaderboard UI is mobile-only; desktop bonus view unchanged. API is viewport-agnostic. |
| Railway deployment | **PASS** | No new env or build steps; failure path uses placeholders. |
| UI/UX / accessibility | **PASS with minor recommendations** | Existing a11y and reduce-motion respected; one improvement suggested. |
| Backend robustness | **PASS with recommendation** | Silent fallback preserves availability; logging recommended for ops. |

**Verdict:** Implementation is production-safe and aligns with constraints. No blocking issues. Two non-blocking recommendations are recorded below.

---

## 2. Desktop vs mobile production

### 2.1 Intended behaviour (from plan)

- **Mobile:** GP Race (The Race) shows leaderboard; 59.16.3 fills it with real data when `payload.leaderboard` is non-empty.
- **Desktop:** Bonus view shows hero grid only; race board is hidden by CSS. No change.

### 2.2 Verification

- **CSS**
  - `.bonus-race-board-mobile` is `display: none` by default (styles.css ~4192–4194).
  - `body[data-viewport-mode="mobile"] .bonus-race-board-mobile` sets `display: grid` (~4432–4437).
  - `body[data-viewport-mode="mobile"] .bonus-hero-grid` is `display: none` (~4439–4441).
- **Backend**
  - `GET /api/bonus/technician/dashboard` has no viewport or device logic; same response for all clients.
  - New key is additive: `leaderboard` only; existing keys unchanged.
- **Frontend**
  - `buildBonusLeaderboardRows(payload)` uses `payload?.leaderboard` when present and non-empty; otherwise keeps previous fallback (self + two “Challenger Slot” placeholders).
  - No changes to `layoutState.viewportMode` or bonus view entry; no new desktop-only or mobile-only branches in this task.

**Conclusion:** Desktop production behaviour is unchanged. Mobile gains real leaderboard data when the API returns `leaderboard[]`. **PASS.**

---

## 3. Railway deployment safety

### 3.1 Requirements

- Deploy via existing path: `./scripts/run-server.sh` (README); no new required env.
- No new dependencies or build steps.

### 3.2 Verification

- **Env**
  - No new environment variables. Leaderboard resolution uses existing Supabase client and, when available, `auth.admin.list_users` (same service-role usage as admin user-permissions).
  - If `SUPABASE_SERVICE_ROLE_KEY` is missing: `_require_service_role_for_admin_permissions()` raises `HTTPException(503)`, which is caught in `_resolve_technician_display_names`; the helper returns placeholders for all requested IDs. The dashboard still returns **200** with `leaderboard[].display_name = "Tech"`, `avatar_initials = "??"`. No 503 from the dashboard route.
- **Scripts**
  - `scripts/run-server.sh` unchanged; no new args or env.
- **Dependencies**
  - No new packages; only new code in `backend/main.py`.

**Conclusion:** Deployment and runtime behaviour remain safe; failure of auth resolution does not break the dashboard. **PASS.**

---

## 4. UI/UX and accessibility

### 4.1 Leaderboard consumer (existing code)

- **HTML:** `#bonusRaceLeaderboard` is an `<ol>` with `aria-labelledby="bonusRaceHeading"` (index.html ~665).
- **Per row:** Rank has `aria-label="Rank ${rank}"`; initials are `aria-hidden="true"`; name and GP are in the DOM; “View details” button has `aria-label="View details"` and `title`/`data-bonus-tooltip` with descriptive text when not a placeholder (app.js ~13386–13389).
- **Reduce motion:** `body.a11y-reduce-motion` and `@media (prefers-reduced-motion: reduce)` both set `transition: none !important` for `.bonus-racer` and `.bonus-racer-bar` (styles.css ~7247–7259).
- **Touch targets (mobile):** `.bonus-race-board-mobile .bonus-tally-btn` and `.bonus-race-leaderboard .bonus-badge-chip` have `min-height: 44px` under `body[data-viewport-mode="mobile"]` (~4454–4473).

### 4.2 New data behaviour

- When `leaderboard[]` is present and non-empty, rows show real `display_name`, `gp_contributed`, and `share_of_team_pot`; tooltip is “{name}: ${amount} contributed ({percent} of team share).”
- When `leaderboard` is missing or empty, existing fallback (self + two placeholders) still shows; placeholder tooltip remains “Peer leaderboard data will appear here after backend wiring.”

### 4.3 Findings and recommendations

| Item | Severity | Finding | Recommendation |
|------|----------|---------|----------------|
| A11y – list structure | OK | `<ol>` and heading association already correct. | None. |
| A11y – reduce motion | OK | Transitions disabled when reduce-motion is preferred. | None. |
| A11y – button label | Low | “View details” is generic; screen reader does not get the name in the label. | Consider `aria-label="View details for ${row.display_name}"` in a follow-up. |
| Long names | OK | `.bonus-racer-name` uses `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`. | None. |
| Privacy | Low | When `user_metadata.full_name` is absent, backend uses **email** as `display_name`. Internal team bonus view only; acceptable for many orgs. | Document in product/ops: “Leaderboard may show email if full name is not set.” Optional: add `profiles.display_name` later (e.g. 59.17) and prefer it over email. |

**Conclusion:** Current UI/UX and a11y are in line with existing standards; one optional improvement for button labels and one documentation/privacy note. **PASS with minor recommendations.**

---

## 5. Backend robustness and observability

### 5.1 Failure handling

- `_resolve_technician_display_names` catches `HTTPException` and generic `Exception` and falls back to placeholders. Dashboard response is always returned; no unhandled exception from this helper.

### 5.2 Observability

- **Gap:** On auth unavailability or any exception in the try block, the code uses `pass` with no logging. Operations cannot see that display-name resolution failed without additional tooling.
- **Recommendation (non-blocking):** Log at debug (or info) level when falling back to placeholders, e.g. `logger.debug("Leaderboard display names: auth resolution failed, using placeholders for %s", ids)` or log the exception. Avoid logging PII (e.g. do not log emails or names in the same line).

**Conclusion:** Behaviour is safe; logging would improve diagnosability. **PASS with recommendation.**

---

## 6. Contract and regression

### 6.1 API contract (59.16.3)

- Required: `technician_id`, `display_name`, `avatar_initials`, `gp_contributed`, `share_of_team_pot`, `rank`. All are present in the implemented payload.
- Optional (omitted as planned): `avatar_url`, `previous_rank`.

### 6.2 Frontend contract

- `buildBonusLeaderboardRows` expects array of objects with `technician_id`, `display_name`, `avatar_initials`, `gp_contributed`, `share_of_team_pot`, `rank`; uses defaults for missing values. Implemented payload matches.

### 6.3 Edge cases (from plan)

- No period: payload includes `"leaderboard": []`. **Verified.**
- No eligible jobs: `personnel_by_job` empty → `technician_ids_leaderboard` empty → `leaderboard` []. **Verified.**
- Zero `total_contributed_gp`: `share_of_team_pot` set to 0.0 for all; rank order by `gp_contributed` then `technician_id`. **Verified in code.**
- Unmapped `technician_id`: placeholder `display_name` "Tech", `avatar_initials` "??". **Verified.**

### 6.4 Regression

- Existing bonus dashboard keys and shapes unchanged; only `leaderboard` added.
- Backend unit tests (run-backend-tests.sh): 8 tests passed (bonus_calc and bonus_dashboard_canonical).

**Conclusion:** Contract and edge cases match plan; no regressions identified. **PASS.**

---

## 7. Initials and non-ASCII (backend)

- `_leaderboard_initials_from_display_name` uses `str.split()` and first character(s) with `.upper()`. For “John Doe” → “JD”; single word → first two chars or first char + “?”.
- Non-ASCII (e.g. “José García”): slicing by `[:1]` is byte/unit dependent; in Python 3 this is one Unicode code point. So “J” and “G” is typical; acceptable for initials.
- Empty or missing name: returns “??”. **OK.**

No change required for this audit.

---

## 8. Summary of recommendations

| Priority | Item | Action |
|----------|------|--------|
| Low | Button aria-label | Consider “View details for {name}” in a future a11y pass. |
| Low | Privacy / display name | Document that leaderboard may show email when full name is not set; optional: use profiles.display_name when available (e.g. 59.17). |
| Low | Observability | Consider debug/info log when leaderboard display-name resolution falls back to placeholders (no PII). |

---

## 9. Sign-off

The 59.16.3 leaderboard implementation has been reviewed against:

- Desktop vs mobile production (no unintended desktop impact; mobile-only leaderboard UI).
- Railway deployment (no new env, no new failure modes for the dashboard route).
- UI/UX and accessibility (existing standards met; minor improvement and documentation suggestions).
- Backend robustness and contract (safe fallbacks; contract and tests satisfied).

**Audit result: PASS.** Implementation is suitable for production with the above non-blocking recommendations recorded for follow-up if desired.
