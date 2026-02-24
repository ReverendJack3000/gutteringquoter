# Manual test: Bonus Admin (Section 59.17)

**Purpose:** Regression and smoke check for the Bonus Admin UI (period selector, summary/breakdown, jobs list, Edit job, Edit personnel, Create/Edit period). Use when verifying 59.21 or after changes to bonus admin.

## Prerequisites

- Server running: `./scripts/run-server.sh`
- Log in as a user with role **admin** on **desktop** viewport (Bonus Admin is desktop-only; mobile redirects away)
- At least one bonus period in the database (create via Bonus Admin “Create period” if none)

## Automated regression (run first)

- **Backend:** `./scripts/run-backend-tests.sh` — all 8 tests pass
- **E2E:** `./scripts/run-e2e.sh` — quote modal and bonus-unrelated flows pass (quote modal test in `e2e/run.js`)

## Manual checklist: Bonus Admin

1. **Entry**
   - Profile menu → **Bonus Admin**. View switches to Bonus Admin; period dropdown and “Create period” visible.

2. **Period selector**
   - Select a period from the dropdown. Summary (pot, eligible count, callback total) and per-technician breakdown appear. Jobs list for that period appears.

3. **Summary and breakdown**
   - Summary cards show Total team pot, Eligible jobs, Callback total (or — if no data). Breakdown table lists technicians and amounts (or empty).

4. **Jobs list**
   - Table shows jobs for the selected period. **Edit job** and **Edit personnel** buttons per row.

5. **Edit job modal**
   - Click **Edit job** on a job. Modal opens; status and other fields editable. **Enter** submits form (59.17 bugfix). Save and cancel close modal.

6. **Edit personnel modal**
   - Click **Edit personnel** on a job. Modal shows personnel table (onsite/travel minutes, seller/executor). Edit and save; modal closes.

7. **Create period**
   - Click **Create period**. Modal opens; enter name, start/end dates, status. Save creates period; it appears in dropdown.

8. **Edit period**
   - Select a period; click **Edit period**. Modal opens with that period’s data. Change and save; dropdown label updates.

9. **Redirect cleanup (desktop → mobile or role change)**
   - With Bonus Admin open, optionally open Edit job modal. Resize to mobile width (or switch to non-admin). View should redirect to canvas (or login); Edit job modal should close and not remain over canvas.

## Quote / Add to Job / Create New Job

- **Quote modal:** Covered by E2E (`e2e/run.js` quote modal test).
- **Add to Job / Create New Job:** No E2E; verify manually that from the quote flow, Add to Job and Create New Job still complete successfully and diagram stamp and (if implemented) quote persistence behave as expected.

## Result

- **Pass:** All checklist items behave as above; backend and E2E pass.
- **Fail:** Note step and behaviour for fix.
