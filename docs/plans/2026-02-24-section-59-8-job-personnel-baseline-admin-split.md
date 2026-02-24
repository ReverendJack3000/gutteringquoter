# Section 59.8: job_personnel — JobActivity baseline, admin verify/split

**Status:** Plan only. No code changes in this document.  
**Goal:** Populate `public.job_personnel` from ServiceM8 JobActivity as a baseline for total hours; provide API so Admin can verify/split into onsite_minutes vs travel_shopping_minutes and set is_seller/is_executor before locking the period. Full Admin UI is 59.17 (desktop-first).

**Single source of truth:** `TASK_LIST.md` (branch, uncompleted table); full task text in `docs/tasks/section-59.md`. Decisions: `docs/plans/2026-02-23-section-59-data-flow-decisions.md`; BACKEND_DATABASE.md §4 and § "Staff → technician_id mapping", § "Section 59 decisions".

---

## 1. Context (verified from codebase)

- **Branch:** feature/section-59-cron-sync (from main). 59.6 and 59.7 done; cron creates/upserts `job_performance` and sets `invoiced_revenue_exc_gst`, `materials_cost`.
- **job_personnel schema** (`docs/plans/2026-02-23-bonus-periods-job-performance-schema.md`): `id` (uuid PK), `job_performance_id` (FK → job_performance.id), `technician_id` (FK → auth.users.id, **NOT NULL**), `is_seller`, `is_executor` (boolean, default false), `onsite_minutes`, `travel_shopping_minutes` (integer NOT NULL default 0), `created_at`. No UNIQUE(job_performance_id, technician_id) in original migration; consider adding for safe upsert/avoid duplicates.
- **Decision (data flow):** Pull raw JobActivity as baseline for total hours; **Admin verifies/splits** into onsite_minutes and travel_shopping_minutes in our app before locking the period. Assign is_seller, is_executor (admin or from schedule where feasible). ServiceM8 check-in/check-out is unreliable; API cannot reliably distinguish onsite vs travel/shopping.
- **Staff → technician_id:** Resolve by staff **email** match to `auth.users.email` (case-insensitive). No mapping table for first implementation. If no match, **do not create** a job_personnel row (schema has technician_id NOT NULL); log unmapped staff for admin follow-up. See BACKEND_DATABASE.md "Staff → technician_id mapping" and `_resolve_company_email_to_user_id` pattern in `backend/app/servicem8.py`.
- **Scopes:** `read_schedule` is already in `DEFAULT_SCOPES` (`backend/app/servicem8.py`). JobActivity: GET `/api_1.0/jobactivity.json` with `$filter=job_uuid eq 'VALUE'`. See `docs/SERVICEM8_API_REFERENCE.md` §2.
- **Desktop vs mobile:** 59.8 is **backend and API only**. No mobile UI changes. Admin UI for personnel (verify/split, assign seller/executor) is 59.17 (desktop-first).

---

## 2. ServiceM8 JobActivity API (verified)

| Item | Source | Note |
|------|--------|------|
| Endpoint | GET `/api_1.0/jobactivity.json` | Scope: `read_schedule` (we have it). |
| Filter | `$filter=job_uuid eq '<job_uuid>'` | Same pattern as list_job_materials. |
| Assignee | **staff_uuid** | JobActivity uses staff_uuid; translate via staff.json → email → auth.users.id (59.8.2). |
| Duration | Known API limitations | "Some timing details may not be fully exposed." Confirm duration/start/end field names when implementing. |
| Terminology | activity_was_scheduled: 1 = scheduled booking, 0 = recorded time | Use for who was on job; duration may be per-activity. |

**Developer tip — Active vs. inactive time:** Only sum records where time was actually logged. ServiceM8 can create zero-duration activity stubs when a tech taps in and immediately taps out; filter those out before creating the job_personnel baseline so Admin isn’t looking at garbage data.

**Implementation note:** Add `list_job_activities(access_token: str, job_uuid: str) -> list[dict]` in `backend/app/servicem8.py` (same pattern as `list_job_materials`). Validate job_uuid format (UUID); on error return []. Document actual response field names (assignee, duration) in SERVICEM8_API_REFERENCE.md or TROUBLESHOOTING.md after first successful call.

---

## 3. Staff → technician_id resolution

- **Input:** JobActivity uses **staff_uuid**. Use the staff.json list (GET staff.json) to translate staff_uuid → email → auth.users.id (technician_id).
- **Option A:** In sync run, call GET `/api_1.0/staff.json` once (or per-job if small), build `staff_uuid → email` map; for each activity assignee resolve email → auth.users.id via same approach as `_resolve_company_email_to_user_id` (list auth users, match email). Cache email → user_id per run to avoid N+1.
- **Option B:** Use `public.servicem8_staff` if populated by local script — but cron may run where that table is not populated; **do not depend on it** for sync. Prefer Option A (API staff list + email match).
- **No match:** Do **not** create a job_personnel row (technician_id is NOT NULL). Log unmapped staff (e.g. staff_uuid or email) for admin follow-up.

---

## 4. Baseline minutes and idempotency

- **Aggregate:** From `list_job_activities(job_uuid)`, **filter out zero-duration (or inactive) activity stubs** (e.g. tap-in/tap-out with no logged time), then group by assignee (staff_uuid) and sum duration (or derived minutes from start/end if API exposes it). If API exposes no duration, use 0 and rely entirely on admin entry.
- **Baseline split:** Set **onsite_minutes = total_minutes** (from API), **travel_shopping_minutes = 0**. Admin later edits to split. Do not auto-split onsite vs travel from API (decision: admin verifies/splits).
- **is_seller / is_executor:** Set **false** at creation. Admin assigns (or future: from schedule where feasible). No overwrite of existing job_personnel from API after first create.
- **Idempotency:** **Do not overwrite existing job_personnel.** For each (job_performance_id, technician_id) from JobActivity: if a row already exists for that pair, **skip** (preserve admin edits). If no row exists, **insert** with baseline. Do not delete job_personnel rows from sync (staff removed in ServiceM8 → admin handles).
- **Unique constraint:** Current schema has no UNIQUE(job_performance_id, technician_id). Recommend adding it in a migration so (1) we can safely "insert only if not exists" and (2) we avoid duplicate rows. Then sync: select existing job_personnel for job_performance_id; for each (job_performance_id, technician_id) from activities, insert only if not in existing set.

---

## 5. Where job_personnel sync runs

- **Same cron pass as job_performance.** In `backend/app/job_performance_sync.py`, after upserting each job_performance row for a job:
  1. Obtain `job_performance_id` (from upsert response or select by servicem8_job_id).
  2. Call `list_job_activities(access_token, job_uuid)` for that job.
  3. Build staff_uuid → email (from GET staff.json, cached per run).
  4. For each distinct assignee: resolve to technician_id; if NULL skip (log); else if no existing job_personnel for (job_performance_id, technician_id), insert baseline row.
- **Token:** Reuse same `access_token` and `get_sync_user_id()` / `get_tokens()` as current run_sync(); no new env or auth.

---

## 6. Admin verify/split (59.8 scope)

- **Decision:** "Admin must verify/split ... in our app before locking the period."
- **59.8 deliverable:** Backend **API** so admin (or 59.17 UI) can update job_personnel: at least **PATCH** (or PUT) for a single job_personnel row: allow updating `onsite_minutes`, `travel_shopping_minutes`, `is_seller`, `is_executor`. Optionally bulk update for a job (e.g. PUT job_performance/:id/personnel with array). Auth: admin only for ledger writes (per 59.16); use existing `require_role(["admin"])` pattern from bonus routes in main.py.
- **59.17:** Full Admin UI (desktop-first) to "assign personnel, enter ... data" — uses the 59.8 API. Requires **59.16** to provide list/read job_personnel (by job or period) so the personnel screen can load and display rows before PATCH. No mobile UI required for 59.8.

**Post-audit (2026-02-24):** QA audit recommendations implemented: (1) PATCH validates `personnel_id` as UUID and returns 400 for malformed id; (2) unmapped staff log omits email (staff_uuid only) for log privacy; (3) 59.16/59.17 task text updated to require list/read job_personnel for Admin UI. See `docs/audits/2026-02-24-section-59-8-job-personnel-qa-audit.md` §7.

---

## 7. Implementation steps (no assumptions)

| Step | Action |
|------|--------|
| **59.8.1** | Add `list_job_activities(access_token, job_uuid)` in `backend/app/servicem8.py`. GET jobactivity.json with $filter=job_uuid; return list of dicts; validate job_uuid (UUID); on error return []. Document response fields (assignee key, duration/start/end) after first call. |
| **59.8.2** | Staff resolution: In sync (or shared helper), obtain staff list from ServiceM8 (GET staff.json), build staff_uuid → email; resolve email → technician_id via auth.users (reuse/extend pattern from servicem8.py). Cache per run. Skip create when technician_id is None; log unmapped. |
| **59.8.3** | In `job_performance_sync.run_sync()`: after each job_performance upsert, get job_performance_id; fetch list_job_activities(job_uuid); aggregate total minutes per assignee (confirm field names); for each assignee with resolved technician_id, if no existing job_personnel for (job_performance_id, technician_id), insert row (onsite_minutes=total, travel_shopping_minutes=0, is_seller=false, is_executor=false). Do not update existing rows. |
| **59.8.4** | Optional migration: add UNIQUE(job_performance_id, technician_id) on job_personnel to prevent duplicates and allow clear "insert if not exists" logic. |
| **59.8.5** | Backend API: add endpoint(s) for admin to update job_personnel (e.g. PATCH /api/bonus/job-personnel/:id with body { onsite_minutes?, travel_shopping_minutes?, is_seller?, is_executor? }). Auth: require_role(["admin"]). Used by 59.17 Admin UI. |

---

## 8. Edge cases and safeguards

- **technician_id NOT NULL:** Do not create job_personnel without a resolved technician_id; skip and log.
- **JobActivity returns no duration:** Set onsite_minutes=0, travel_shopping_minutes=0; admin fills all.
- **Duplicate (job_performance_id, technician_id):** Avoid by checking existing rows before insert; add UNIQUE constraint so DB enforces.
- **Existing admin edits:** Sync never overwrites existing job_personnel rows; only inserts when no row exists for that job+tech.
- **Desktop/mobile:** 59.8 is backend-only; no change to desktop or mobile production UI. Admin UI in 59.17 is desktop-first.

---

## 9. Task list update (after implementation)

- In `docs/tasks/section-59.md`: mark **59.8** and sub-tasks **59.8.1–59.8.5** as complete (`[x]`).
- If Section 59 is not fully complete, keep the 59 row in TASK_LIST.md uncompleted table; update description if needed to show "59.8 done; next 59.9".

---

## 10. Key files (for implementation)

| Purpose | File |
|---------|------|
| Task 59.8 text | docs/tasks/section-59.md (~94) |
| Cron sync | backend/app/job_performance_sync.py (run_sync, SYNC_OWNED_COLUMNS) |
| ServiceM8 list helpers | backend/app/servicem8.py (list_jobs, list_job_materials pattern) |
| Staff / auth resolution | backend/app/servicem8.py (_resolve_company_email_to_user_id, get_sync_user_id) |
| JobActivity API reference | docs/SERVICEM8_API_REFERENCE.md §2 |
| job_personnel schema | docs/plans/2026-02-23-bonus-periods-job-performance-schema.md §3.3 |
| Bonus routes / auth | backend/main.py (bonus routes, require_role) |
| Data ownership | docs/plans/2026-02-23-section-59-data-flow-decisions.md §2, §6 |
