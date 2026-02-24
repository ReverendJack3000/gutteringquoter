# QA Audit Report: Section 59.8 Implementation (job_personnel baseline, admin verify/split)

**Role:** Strict Senior QA Engineer  
**Date:** 2026-02-24  
**Scope:** 59.8 implementation (JobActivity baseline → job_personnel, staff resolution, zero-duration filter, admin PATCH API, UNIQUE constraint).  
**Constraints checked:** Desktop vs Mobile production, Railway deployment safety, UI/UX best practices, database and API alignment.

---

## 1. Executive summary

| Verdict | Detail |
|--------|--------|
| **Overall** | **PASS** with minor recommendations (see §7). |
| **Desktop/Mobile** | No impact (backend/cron + admin-only API; no UI changes). |
| **Railway** | Safe (no new env vars, no new startup imports of sync; one new admin-only route). |
| **UI/UX** | N/A (no user-facing UI; API designed for future 59.17 Admin UI). |
| **Database** | job_personnel used as designed; UNIQUE(job_performance_id, technician_id) applied. |

The 59.8 work adds: (1) ServiceM8 JobActivity and staff list usage in the existing cron sync path; (2) job_personnel insert-only baseline with zero-duration filtering; (3) one new admin-only PATCH route. No frontend changes; no change to Add to Job / Create New Job, quote modal, or viewport behaviour. Desktop and mobile production behaviour is unchanged.

---

## 2. Constraint verification

### 2.1 Desktop vs mobile production

- **Finding:** 59.8 touches only:
  - `backend/app/servicem8.py` (new: `list_staff`, `list_job_activities`, `get_staff_uuid_to_technician_id_map`, `_build_email_to_user_id_map`)
  - `backend/app/job_performance_sync.py` (new helpers and job_personnel block inside existing `run_sync` loop)
  - `backend/main.py` (new: `UpdateJobPersonnelRequest`, `PATCH /api/bonus/job-personnel/{personnel_id}`)
  - Docs and migrations (SERVICEM8_API_REFERENCE, BACKEND_DATABASE, section-59, plan, migration applied)
- **Evidence:** Grep for `job_personnel`, `job-personnel`, `list_job_activities`, `get_staff_uuid` in **frontend/** (HTML/JS/CSS) returns **no matches**. No `data-viewport-mode`, viewport, or mobile/desktop branching in the changed backend files. The sync is still invoked out-of-process (script/cron); the new API is admin-only and not called by the current frontend.
- **Conclusion:** **PASS.** Desktop and mobile behaviour unchanged. No new UI; no touch targets or layout logic.

### 2.2 Railway deployment safety

- **Startup:** `./scripts/run-server.sh` runs `uvicorn main:app` only. `main.py` does **not** import `job_performance_sync` or call `run_sync`. Sync remains out-of-process. **PASS.**
- **Env:** No new environment variables. Existing `SERVICEM8_COMPANY_USER_ID` / `SERVICEM8_COMPANY_EMAIL` and Supabase vars are sufficient. OAuth scope `read_schedule` (JobActivity) and `read_staff` (staff list) are already in `DEFAULT_SCOPES` in `servicem8.py`. **PASS.**
- **Dependencies:** No new pip/package requirements. **PASS.**
- **New route:** `PATCH /api/bonus/job-personnel/{personnel_id}` is protected by `require_role(["admin"])`; unauthenticated or non-admin callers receive 401/403. No public exposure. **PASS.**
- **Conclusion:** **PASS.** Deployment and run-server behaviour unchanged; sync and new API are backward-compatible.

### 2.3 UI/UX best practices

- **Finding:** No user-facing UI was added. 59.8 delivers backend and API only; Admin UI for personnel (verify/split, assign seller/executor) is 59.17 (desktop-first).
- **API design for future UI:**  
  - PATCH returns the updated row (single source of truth for client state).  
  - 400 when body is empty or invalid; 404 when row not found; 500 on server error.  
  - Optional fields allow partial updates (onsite_minutes, travel_shopping_minutes, is_seller, is_executor) so the future admin form can send only changed fields.  
- **Conclusion:** **PASS.** No UI/UX regression; API is suitable for a future admin screen (clear errors, partial update, idempotent by row id).

---

## 3. Database and schema verification

### 3.1 job_personnel table

- **Schema (from plan and BACKEND_DATABASE):** `id`, `job_performance_id` (FK), `technician_id` (FK auth.users, NOT NULL), `is_seller`, `is_executor`, `onsite_minutes`, `travel_shopping_minutes` (NOT NULL default 0), `created_at`.
- **Sync behaviour:** Inserts only when no row exists for (job_performance_id, technician_id). All inserted rows supply: job_performance_id, technician_id, is_seller=False, is_executor=False, onsite_minutes (≥0), travel_shopping_minutes=0. No NULL for NOT NULL columns. **PASS.**
- **UNIQUE constraint:** Migration `add_job_personnel_unique_job_performance_technician` applied (UNIQUE(job_performance_id, technician_id)). Prevents duplicate rows and aligns with insert-only logic. **PASS.**

### 3.2 job_performance sync (no regression)

- **SYNC_OWNED_COLUMNS:** Unchanged; still excludes job_personnel. job_personnel is written in a separate block after the job_performance upsert. **PASS.**
- **Upsert response:** job_performance_id is taken from `upsert_resp.data[0].get("id")`; job_personnel block runs only when job_performance_id and job_uuid and staff_uuid_to_technician_id are present. **PASS.**

---

## 4. Implementation quality and edge cases

### 4.1 JobActivity and zero-duration filter

- **Plan requirement:** “Only sum records where time was actually logged”; “filter out zero-duration activity stubs.”
- **Implementation:** `_minutes_from_activity()` returns 0 for missing or zero duration; `_aggregate_activity_minutes_by_staff()` skips activities with `minutes <= 0`. Only positive logged time is aggregated per staff_uuid. **PASS.**
- **Assignee field:** Code uses `staff_uuid` or `assigned_staff_uuid` (fallback). Aligns with plan (JobActivity uses staff_uuid). **PASS.**
- **Duration fields:** Tries `duration`, `total_minutes`, `minutes`, `duration_minutes`, then start/end datetime diff; broad compatibility. **PASS.**

### 4.2 Staff → technician_id resolution

- **No match:** Unmapped staff (no email or email not in auth.users) get technician_id=None; no job_personnel row is created (schema NOT NULL). Unmapped staff are logged (staff_uuid and email) for admin follow-up. **PASS.**
- **Empty staff list:** `get_staff_uuid_to_technician_id_map` returns `{}`; sync still runs job_performance; job_personnel block is skipped because `staff_uuid_to_technician_id` is empty. **PASS.**
- **PII in logs:** Warning “Unmapped staff for job_personnel: staff_uuid=… email=…” includes email. Acceptable for admin troubleshooting; consider redacting in high-compliance environments (recommendation §7).

### 4.3 Sync failure isolation

- **job_personnel block in try/except:** If list_job_activities, aggregate, or insert fails for a job, the exception is caught and logged; `result["success"]` and `rows_upserted` still reflect the job_performance upsert. Sync does not abort; other jobs are still processed. **PASS.**
- **Staff map failure:** If `get_staff_uuid_to_technician_id_map` throws, it is caught at the start of the loop; `staff_uuid_to_technician_id` remains `{}`, so no job_personnel rows are created but job_performance sync continues. **PASS.**

### 4.4 Admin PATCH API

- **Auth:** `require_role(["admin"])`; non-admin receives 403. **PASS.**
- **Validation:** `UpdateJobPersonnelRequest`: `onsite_minutes` and `travel_shopping_minutes` have `ge=0`. Empty body → 400 “At least one field required”. **PASS.**
- **Idempotency:** Update by primary key `id`; same payload resubmitted returns same row. **PASS.**
- **personnel_id format:** Not validated as UUID; malformed id yields 0 rows and 404. **Recommendation (low):** Validate UUID and return 400 for malformed id to align with REST best practice (§7).

---

## 5. Regression and “don’t shake the tree”

- **Add to Job / Create New Job:** No changes in main.py to those flows. No new imports of job_performance_sync in main. **PASS.**
- **Quote persistence (59.19):** Unchanged. **PASS.**
- **Active quote resolution:** Unchanged; same `get_active_quote_for_job`. **PASS.**
- **59.6 / 59.7 sync path:** Order and logic preserved: list jobs → for each job, quote resolution, merge existing row, overlay SYNC_OWNED_COLUMNS, upsert job_performance, then **new** job_personnel block. job_performance columns and merge behaviour unchanged. **PASS.**
- **Existing bonus routes:** New route is additive; no changes to existing bonus period or job_performance endpoints. **PASS.**

---

## 6. Task list and documentation

- **docs/tasks/section-59.md:** 59.8 and 59.8.1–59.8.5 marked `[x]`. **PASS.**
- **TASK_LIST.md:** Uncompleted row updated to “59.8 done; next 59.9”. **PASS.**
- **docs/plans/2026-02-24-section-59-8-job-personnel-baseline-admin-split.md:** Plan present and matches implementation. **PASS.**
- **docs/SERVICEM8_API_REFERENCE.md:** JobActivity section updated (staff_uuid, zero-duration filter note). **PASS.**
- **docs/BACKEND_DATABASE.md:** Migration #6 documented. **PASS.**

---

## 7. Recommendations (non-blocking) — implementation status

| # | Recommendation | Priority | Status |
|---|----------------|----------|--------|
| 1 | **PATCH /api/bonus/job-personnel/{personnel_id}:** Validate `personnel_id` as UUID; return 400 for malformed id instead of 404. | Low | **Done:** `main.py` validates with `uuid.UUID(personnel_id)` and raises `HTTPException(400, "personnel_id must be a valid UUID")` before update. |
| 2 | **Logging:** Log only staff_uuid for unmapped staff (omit email) to reduce PII in logs. | Low / policy | **Done:** `servicem8.py` warning now logs `staff_uuid=%s (email omitted for log privacy)`. |
| 3 | **59.17 Admin UI:** Ensure list/read endpoint for job_personnel by job or period exists (59.16). | Future (59.16/59.17) | **Documented:** `docs/tasks/section-59.md` 59.16 explicitly requires “list/read job_personnel (e.g. by job_performance_id or period)”; 59.17 notes dependency on 59.16 list/read for the personnel screen. |

---

## 8. Sign-off

| Area | Status |
|------|--------|
| Desktop production | Unchanged; no new UI or routes used by frontend. |
| Mobile production | Unchanged; no new UI or viewport logic. |
| Railway deployment | Safe; no new env, deps, or startup dependency on sync. |
| UI/UX | N/A; API ready for future admin UI. |
| Regression | None identified; existing sync and bonus flows preserved. |

**Audit complete.** Section 59.8 implementation is **approved for production** from a QA perspective, subject to the optional recommendations above.
