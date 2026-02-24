# Manual test: 59.18.2 Bonus dashboard (canonical + closed-period lock)

**Purpose:** Verify the final dashboard pass: canonical metrics/ledger and locked payout for closed periods.

## Prerequisites

- Server running: `./scripts/run-server.sh`
- Log in as a user with role **admin**, **editor**, or **technician**
- At least one **open** or **processing** bonus period with **verified** or **processed** jobs linked (so the dashboard can show non-zero pot and expected payout)

## Dummy data (Supabase)

If you need test data, the following was inserted via Supabase MCP:

- **bonus_periods:** 1 open period (“Feb 2026 Fortnight 1 (dummy)”), 1 closed period (“Jan 2026 Fortnight 2 (dummy closed)”).
- **job_performance:** 3 verified jobs in the open period (JOB-DUM-001, JOB-DUM-002, JOB-DUM-003), 1 processed job in the closed period (JOB-DUM-004). Revenue/materials/quoted labour set so Job GP and period pot are non-zero.
- **job_personnel:** Each job has one technician (seller + executor) — the user with `user_id = 9a98e732-d30d-49b1-bab1-d9b04e4f90ba` (admin in `public.profiles`, e.g. **jack@clearstreamguttering.co.nz**). Log in as that user to see “My Bonus” with your GP and expected payout.

**Closed period UUID (for manual test step 3):** `67cc3896-0432-4a06-a842-076ed00b0912`. Request the dashboard with `?period_id=67cc3896-0432-4a06-a842-076ed00b0912` to see “Final payout (period closed).”

## Automated checks (already run)

- Backend tests: `cd backend && python3 -m unittest discover -s tests -p "test_*.py" -v`
  - `test_bonus_dashboard_canonical`: eligible filter, period pot, canonical ledger shape (`is_provisional=False`), expected payout math
- Dashboard API without auth returns **401** (Bearer required)

## Manual steps

1. **Open app and go to My Bonus**
   - Open http://127.0.0.1:8000/
   - Log in if needed (admin/editor/technician)
   - Open **My Bonus** (menu or mobile GP Race button)

2. **Open period (no closed period)**
   - With at least one **open** or **processing** period that has eligible jobs:
     - **Expected Payout** should show a **dollar amount** (not "Pending").
     - **Payout note** should say: "Payout may change until the period is closed."
     - Job cards should show **"Job GP"** (not "Job GP (provisional)").
   - If there are no eligible jobs or no period: Team Pot and Expected Payout can be $0.00 / Pending; that is correct.

3. **Closed period (explicit period_id)**
   - Create or pick a **closed** bonus period with eligible jobs (or use an existing closed period UUID).
   - In the URL or period selector (if you add one), request that period:  
     `GET /api/bonus/technician/dashboard?period_id=<closed-period-uuid>`
   - Or from the app: if the UI allows choosing a closed period, select it.
   - **Expected Payout** should show the **final dollar amount**.
   - **Payout note** should say: **"Final payout (period closed)."**
   - The payout value element should have a muted/locked style (data-locked).

4. **Regression**
   - Team Pot and My GP hero values should match the canonical rule engine (10% of eligible job GP minus callback costs; my GP from canonical ledger).
   - No "pending final rules" or "expected payout pending" when the payload has `is_provisional: false`.

## Result

- **Pass:** Expected Payout shows when there are eligible jobs; closed period shows "Final payout (period closed)." and locked styling; job labels show "Job GP" for canonical rows.
- **N/A:** No open/processing or closed period with eligible jobs in DB — automated tests and API 401 check are sufficient until data exists.

---

## 59.18.2.5 Mobile accessibility and regression QA pass

**Scope:** After 59.18.2.1–59.18.2.4 (layout, reduced-motion, slice-bar, tooltips). Desktop unchanged.

### Mobile viewport only

1. **Viewport:** Resize to mobile width or use device toolbar; confirm `body[data-viewport-mode="mobile"]`. Bonus Race block (Team Pot, The Race, Status Effects) is visible; hero grid is hidden.
2. **Touch targets:** Tally buttons, Team Pot value, My GP value, leaderboard "View details", Status Effects chips — each has minimum ~44px tap area (no overlapping or tiny hit areas).
3. **Safe area:** On notched devices or with home indicator, content does not sit under notch or indicator. Top: bonus view container has `padding-top: max(16px, env(safe-area-inset-top))`. Left/right/bottom: race board section has safe-area padding.
4. **Focus order:** Tab through the bonus view; order is logical (header → period → race cards → ledger). No focus trap; Escape or Back exits.
5. **Screen reader / accessibility:** Leaderboard list has `aria-labelledby="bonusRaceHeading"`. Buttons have `aria-label` or `title` (tooltip text). Announcer has `aria-live="polite"`.
6. **Reduce motion:** With system "Reduce motion" on (or app a11y setting): gauge fill, racer bar, and currency count-up do not animate (instant update). Slice-bar does not animate on leaderboard update.
7. **Tooltips:** Tap/focus on effect chips and ledger badges shows tooltip (custom or native `title`). Leaderboard "View details" shows tooltip with share/contribution text.

### Regression

8. **Canonical data:** Same as main manual steps 2–4: Expected Payout, closed-period lock, "Job GP" labels unchanged.
9. **Desktop:** At desktop width, bonus race board is hidden and hero grid is visible; no layout or behaviour change from 59.18.2.
