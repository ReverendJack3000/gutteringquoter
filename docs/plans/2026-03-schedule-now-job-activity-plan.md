# Schedule now: Create Job Activity after Create New Job (61.9)

**Goal:** When a technician chooses "Yes, doing it now" and Create New Job succeeds, call the ServiceM8 API to create a Job Activity (scheduled booking) so the job is allocated on their schedule. Start time = time the job is processed; end time = start + quote labour estimate. Record in the backend that at schedule-now creation time the job was not completed.

**No assumptions:** This plan is derived from the current codebase (backend `main.py`, `servicem8.py`; frontend `app.js` Create New Job flow; section 61).

---

## 1. Current flow (code-based)

| Step | Location | Behaviour |
|------|----------|-----------|
| Technician clicks Create New Job | `app.js` ~4211 `handleCreateNew` | Builds payload via `getAddToJobPayload(originalJobUuid)`; for technician, awaits `showDoingItNowModal()` which returns `{ doingItNow, coSellerUserId }`. |
| Request body | `app.js` ~4269–4285 | `body` includes `original_job_uuid`, `elements`, `quote_total`, `labour_hours`, `material_cost`, `user_name`, `profile`, `people_count`, `quote_materials`, `image_base64`, optional `job_notes_above`, optional `co_seller_user_id`. **No `schedule_now` today.** |
| Backend Create New Job | `main.py` @2682 `api_servicem8_create_new_job` | Uses `CreateNewJobRequest` (no `schedule_now`). Creates job in ServiceM8, adds materials/notes/attachments/contact, persists quote via `insert_quote_for_job(..., created_by=user_id, co_seller_user_id=...)`, returns `{ success, new_job_uuid, generated_job_id }`. |
| Staff resolution | `servicem8.py` | `get_staff_uuid_to_technician_id_map(access_token)` returns `staff_uuid → technician_id` (auth user id). Used by job_performance_sync. **No inverse (technician_id → staff_uuid) today.** |

**Relevant request model:** `backend/main.py` ~903–916 `CreateNewJobRequest`: has `labour_hours`, `co_seller_user_id`; does not have `schedule_now`.

**Relevant ServiceM8:** `manage_schedule` is already in `DEFAULT_SCOPES` (`servicem8.py` ~30). We only **list** job activities today (`list_job_activities` GET); we do **not** POST to create a Job Activity.

---

## 2. Trigger: when to call Schedule Now

- **When:** After the new job is successfully created in ServiceM8 and the quote is persisted, and only when the client requested "schedule now".
- **Client signal:** Add optional `schedule_now: bool` to the Create New Job request body. Frontend sets `body.schedule_now = true` when `isTechnicianRole()` and `doingItNow === true` (i.e. user chose "Yes, doing it now"). Do not set for editor/admin or when "No, office to schedule".
- **Backend:** After `insert_quote_for_job(...)` and before `return {"success": True, ...}`, if `body.schedule_now` is true, run the Schedule Now step (resolve staff_uuid, compute start/end, POST job activity, note job completed state). If Schedule Now fails, do **not** fail the overall request: log the error and return success (optionally include `schedule_now_done: false` in the response so the frontend can show a message).

---

## 3. Resolving staff_uuid from current user

- **Need:** ServiceM8 Job Activity body requires `staff_uuid`. We have `user_id` (auth.users.id) from `get_current_user_id` in the create-new-job handler.
- **Existing:** `get_staff_uuid_to_technician_id_map(access_token)` returns `dict[staff_uuid, technician_id]` (staff email → auth.users.email match).
- **Implementation:** Add a helper that inverts that map for one-off use, or a dedicated function, e.g. `resolve_technician_id_to_staff_uuid(access_token: str, user_id: str) -> Optional[str]`. Implementation: call `get_staff_uuid_to_technician_id_map(access_token)`, then build `technician_id → staff_uuid`: `{v: k for k, v in m.items() if v is not None}`; return `.get(str(user_id))`. If the result is `None`, do not create the Job Activity (log warning: "Schedule now skipped: current user has no ServiceM8 staff mapping") and return success for Create New Job as normal.

**File:** `backend/app/servicem8.py`.

---

## 4. Start and end date maths

- **Start time:** "The time the job is processed" = current time at the moment we are about to POST the Job Activity (server-side). Use a consistent timezone: prefer company timezone (e.g. `SERVICEM8_SCHEDULE_TIMEZONE` or `BONUS_TIMEZONE` if present, e.g. `Pacific/Auckland`); if not set, use UTC. Format: ServiceM8 expects string dates; from existing docs (`payment_date`), use `"YYYY-MM-DD HH:MM:SS"` (confirm against ServiceM8 Create Job Activity docs or Try It). So: `now = datetime.now(tz)` then `start_date = now.strftime("%Y-%m-%d %H:%M:%S")`.
- **End time:** Start + quote labour duration. `body.labour_hours` is already in the request (float, e.g. 2.0 for 2 hours). So: `end_dt = start_dt + timedelta(hours=body.labour_hours)`, then `end_date = end_dt.strftime("%Y-%m-%d %H:%M:%S")`. Edge case: if `labour_hours` is 0, end will equal start; if the API rejects zero duration, use a small minimum (e.g. 0.25 hours) or document and leave as-is and handle API error in logs.
- **Timezone:** Add optional env e.g. `SERVICEM8_SCHEDULE_TIMEZONE` (e.g. `Pacific/Auckland`). Use `zoneinfo.ZoneInfo(tz_name)` for Python 3.9+; if unset or invalid, fall back to `timezone.utc`. Document in `.env.example` and BACKEND_DATABASE or README.

---

## 5. Job Activity request body

- **URL:** `POST https://api.servicem8.com/api_1.0/jobactivity.json` (same base as existing `make_api_request`; path `/api_1.0/jobactivity.json`).
- **Body (JSON):**
  - `job_uuid`: the new job we just created (`new_job_uuid`).
  - `staff_uuid`: from `resolve_technician_id_to_staff_uuid(access_token, user_id)`.
  - `start_date`: string as above (processed time).
  - `end_date`: string as above (start + labour_hours).
  - `activity_was_scheduled`: `"1"` (string) per user spec.
- **Scope:** `manage_schedule` already in `DEFAULT_SCOPES`; no change.

Implement in `servicem8.py`: e.g. `create_job_activity(access_token, job_uuid, staff_uuid, start_date, end_date) -> tuple[bool, Optional[str]]`, using existing `make_api_request("POST", "/api_1.0/jobactivity.json", access_token, json_data=payload)`. Return `(True, None)` on success, `(False, error_message)` on failure.

---

## 6. Note in backend: job completed or not at schedule-now time

- **Requirement:** "We will note in the backend whether the job that they're checked into when creating this job is completed or not."
- **Interpretation:** At the moment we create the Schedule Now activity, the job we are scheduling is the **new job we just created**. That job is never completed at that moment (it has just been created). So we record: **job_completed_at_schedule_time = false**.
- **Where to record (options):**
  - **A) Application log:** Log a structured line when creating the activity, e.g. "schedule_now_created job_uuid=... staff_uuid=... job_completed_at_schedule_time=false". Minimal; no schema.
  - **B) New table:** e.g. `schedule_now_log` (id, job_uuid, servicem8_job_id, user_id, staff_uuid, start_date, end_date, job_completed_at_schedule_time, created_at). Allows querying later.
  - **C) No separate store:** The fact that we created a Job Activity with `activity_was_scheduled=1` at this time is itself a record; the job was by definition not completed then. Rely on logs only.
- **Recommendation:** At minimum, **log** the fact (option A). If product later needs an audit table, add (B). Plan should state: "Log in backend that at schedule-now creation the job was not completed (job_completed_at_schedule_time = false); optional: add a small audit table for queryability."

---

## 7. Request/response changes

- **CreateNewJobRequest** (`main.py`): Add optional `schedule_now: Optional[bool] = Field(False, description="If true, create a Job Activity to allocate the job on the current user's schedule (technician, doing it now).")`.
- **Frontend** (`app.js` `handleCreateNew`): When building `body`, if `isTechnicianRole()` and `doingItNow === true`, set `body.schedule_now = true`. Otherwise do not set (or set false).
- **Response:** Optionally add `schedule_now_done: bool` to the create-new-job response when `body.schedule_now` was true: `true` if the Job Activity was created successfully, `false` if skipped (e.g. no staff mapping) or if the POST failed. Frontend can then show "Job created; added to your schedule" vs "Job created; could not add to your schedule" without failing the main flow.

---

## 8. Implementation order (tasks)

1. **Backend – servicem8.py**
   - Add `resolve_technician_id_to_staff_uuid(access_token, user_id) -> Optional[str]` (invert existing staff→tech map).
   - Add `create_job_activity(access_token, job_uuid, staff_uuid, start_date, end_date) -> tuple[bool, Optional[str]]` (POST jobactivity.json with body job_uuid, staff_uuid, start_date, end_date, activity_was_scheduled="1").
   - Confirm date format with ServiceM8 docs (or Try It); use `"YYYY-MM-DD HH:%M:%S"` unless docs say otherwise.

2. **Backend – timezone and dates**
   - Add optional env `SERVICEM8_SCHEDULE_TIMEZONE` (e.g. `Pacific/Auckland`). Use for `start_date`/`end_date`; fallback UTC. Use `zoneinfo` (Python 3.9+).
   - In the create-new-job handler (or a small helper): given `body.labour_hours`, compute `start_date` = now in that tz, `end_date` = start + timedelta(hours=body.labour_hours), formatted as above.

3. **Backend – main.py**
   - Add `schedule_now: Optional[bool] = False` to `CreateNewJobRequest`.
   - After quote persist, if `body.schedule_now`:
     - Resolve `staff_uuid = resolve_technician_id_to_staff_uuid(access_token, user_id)`.
     - If None, log and skip; optionally set `schedule_now_done = False`.
     - Else compute start_date, end_date; call `create_job_activity(...)`.
     - Log "job_completed_at_schedule_time = false" (and optionally write to audit table if added).
     - On create_job_activity failure: log, set `schedule_now_done = False`, do not raise.
   - Include `schedule_now_done` in response when `body.schedule_now` was true.

4. **Frontend – app.js**
   - In `handleCreateNew`, after setting `co_seller_user_id` on body, if `isTechnicianRole()` and `doingItNow === true`, set `body.schedule_now = true`.
   - Optionally: if response has `schedule_now_done === false` and `body.schedule_now` was true, show a secondary message ("Could not add to your schedule") after the success message.

5. **Docs**
   - Document Schedule Now in BACKEND_DATABASE or SERVICEM8_API_REFERENCE: Create Job Activity endpoint, body, and that we call it after Create New Job when `schedule_now` is true.
   - Document `SERVICEM8_SCHEDULE_TIMEZONE` in `.env.example` and deployment docs.

6. **Optional**
   - Audit table for schedule-now events (job_uuid, user_id, job_completed_at_schedule_time, created_at) if product wants queryability.

---

## 9. Edge cases

- **User has no ServiceM8 staff mapping:** Skip Job Activity creation; log; return success with `schedule_now_done: false`.
- **labour_hours is 0:** end_date = start_date; if API rejects, log and treat as schedule_now_done: false.
- **POST jobactivity returns 4xx/5xx:** Log full error; do not fail Create New Job; set `schedule_now_done: false`.
- **Editor/admin:** They do not see the doing-it-now modal; they never send `schedule_now: true`; no change to their flow.
- **Create New Job fails before quote persist:** Schedule Now is never run (it runs only after success).

---

## 10. Files to touch (summary)

| File | Changes |
|------|---------|
| `backend/app/servicem8.py` | `resolve_technician_id_to_staff_uuid`; `create_job_activity`; optional timezone helper using env. |
| `backend/main.py` | `CreateNewJobRequest.schedule_now`; after quote persist, conditional Schedule Now block; optional `schedule_now_done` in response. |
| `frontend/app.js` | In `handleCreateNew`, set `body.schedule_now = true` when technician and doingItNow; optionally handle `schedule_now_done` in response. |
| `backend/.env.example` | Optional `SERVICEM8_SCHEDULE_TIMEZONE`. |
| `docs/SERVICEM8_API_REFERENCE.md` | Document Create Job Activity (POST jobactivity.json), request body, and when we call it. |
| Optional: migration + BACKEND_DATABASE | If adding audit table for schedule-now. |

---

## 11. Verification

- Technician: Create New Job → "Yes, doing it now" → job created; in ServiceM8 the job appears on the technician’s schedule with start = processing time, end = start + quote hours; backend log shows job_completed_at_schedule_time = false.
- Technician: "No, office to schedule" → no Job Activity created; no schedule_now in body.
- Editor/admin: Create New Job (no modal) → no Job Activity; no schedule_now.
- Technician with no staff mapping: Create New Job + doing it now → job created; no Job Activity; response or log indicates schedule_now_done: false.
