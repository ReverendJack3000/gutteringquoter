# Plan: Section 59 – ServiceM8 job link (59.4.1 → 59.4.2–59.4.4)

**Date:** 2026-02-23  
**Scope:** Add nullable `servicem8_job_uuid` to schema; then extend diagrams API and frontend to capture and persist both job number and job uuid. No desktop/mobile UI behaviour change beyond storing an extra identifier. Railway deploy must remain valid.  
**Goal:** Unblock bonus/job-performance linking and ServiceM8 API lookups by uuid without breaking existing Add to Job / Create New Job flows.

---

## 1. Context (verified from codebase and DB)

- **Single codebase:** Desktop + mobile via adaptive layout (`data-viewport-mode`). Changes must not break desktop or mobile; per request, focus is mobile UI/accessibility where applicable — this task is backend/schema + diagrams API + frontend payload only (no visual change).
- **Deployment:** Railway via `./scripts/run-server.sh`, Procfile, nixpacks.toml. No new build steps or env vars for 59.4.1–59.4.4.
- **Task index:** `TASK_LIST.md` (branch, uncompleted table, “Where to look”); Section 59 full text in `docs/tasks/section-59.md`. Completion: checkboxes in section file; remove section row from uncompleted table when section is fully complete (`.cursor/rules/task-list-completion.mdc`).
- **Supabase:** Jacks Quote App, project_id `rlptjmkejfykisaefkeh`. Use MCP for schema and migrations (`.cursor/rules/supabase-database.mdc`).

### 1.1 Live schema (verified 2026-02-23 via Supabase MCP `execute_sql`)

**`public.saved_diagrams`**

| Column               | Type      | Nullable |
|----------------------|-----------|----------|
| id                   | uuid      | NO       |
| user_id              | uuid      | NO       |
| name                 | varchar(255) | NO    |
| data                 | jsonb     | NO       |
| blueprint_image_url  | text      | YES      |
| thumbnail_url        | text      | YES      |
| created_at           | timestamptz | NO     |
| updated_at           | timestamptz | NO     |
| **servicem8_job_id** | varchar(32) | YES   |

- **No** `servicem8_job_uuid` column. Migration `add_servicem8_job_id_to_saved_diagrams` added `servicem8_job_id` only.

**`public.job_performance`**

| Column                    | Type    | Nullable |
|---------------------------|---------|----------|
| id                        | uuid    | NO       |
| servicem8_job_id          | varchar | NO       | UNIQUE |
| quote_id                  | uuid    | YES      |
| bonus_period_id           | uuid    | YES      |
| invoiced_revenue_exc_gst   | numeric | NO       |
| materials_cost            | numeric | NO       |
| quoted_labor_minutes      | integer | NO       |
| standard_parts_runs       | integer | YES      |
| seller_fault_parts_runs   | integer | YES      |
| missed_materials_cost     | numeric | YES      |
| is_callback               | boolean | YES      |
| callback_reason           | varchar | YES      |
| callback_cost             | numeric | YES      |
| created_at                | timestamptz | YES   |

- **No** `servicem8_job_uuid` column.

### 1.2 Backend diagrams (verified from repo)

- **`backend/app/diagrams.py`**
  - `list_diagrams`: selects `servicem8_job_id` only (line 53); returns `servicem8JobId` (65).
  - `get_diagram`: selects `*`; returns `servicem8JobId` (94).
  - `create_diagram(user_id, name, data, *, blueprint_bytes=..., blueprint_image_source_url=..., thumbnail_bytes=..., servicem8_job_id=...)`: insert includes `servicem8_job_id` only, truncated to 32 chars (119–120). Return shape includes `servicem8JobId` (158).
  - `update_diagram(..., servicem8_job_id=...)`: updates `servicem8_job_id` only (187–188).

- **`backend/main.py`**
  - `SaveDiagramRequest`: `servicem8JobId: Optional[str] = Field(None, max_length=32)` (315).
  - `UpdateDiagramRequest`: `servicem8JobId: Optional[str] = Field(None, max_length=32)` (324).
  - `api_create_diagram`: passes `body.servicem8JobId` → `servicem8_job_id` (872).
  - `api_update_diagram`: passes `body.servicem8JobId` → `servicem8_job_id` (920).

### 1.3 Frontend (verified from repo)

- **Add to Job:** Lookup `GET /api/servicem8/jobs?generated_job_id=X` returns `job.uuid`, `job.generated_job_id`. Overlay gets `overlay.dataset.jobUuid = job.uuid` and `jobConfirmAddId` text = job number (genId). On success, `jobNumberForSave = document.getElementById('jobConfirmAddId')?.textContent?.trim()`; then `autoSaveDiagramWithJobNumber(jobNumberForSave)` (app.js ~3415). **Job uuid is available** from `overlay.dataset.jobUuid` until overlay is hidden.
- **Create New Job:** `POST /api/servicem8/create-new-job` returns `data.generated_job_id`, `data.new_job_uuid`. Frontend uses `newJobNumber = data.generated_job_id || data.new_job_uuid` and calls `autoSaveDiagramWithJobNumber(newJobNumber)` (~3489–3497). So today we may store **either** number or uuid in the single `servicem8_job_id` field; we do **not** store both.
- **`autoSaveDiagramWithJobNumber(jobNumber)`** (app.js ~9657): builds body with `servicem8JobId: String(jobNumber)` only; POST `/api/diagrams`. No `servicem8JobUuid` passed.

### 1.4 References

- **docs/BACKEND_DATABASE.md:** “Audit: ServiceM8 job syncing” (saved_diagrams has no job_uuid; job_performance has no servicem8_job_uuid); “4. Bonus / job performance” (table list).
- **docs/plans/2026-02-23-bonus-periods-job-performance-schema.md:** Section 8 “Follow-up (Section 59)” — add servicem8_job_uuid to saved_diagrams and job_performance; extend API and frontend to pass both.

---

## 2. Agreed first implementation step: 59.4.1 (migrations only)

**Task 59.4.1:** Add nullable `servicem8_job_uuid` to `saved_diagrams` and to `job_performance`. **Migrations only; no app code changes.** This unblocks 59.4.2–59.4.4 (API + frontend to send and store both identifiers).

---

## 3. Implementation plan (100% aligned with codebase)

### Step 1: Task 59.4.1 – Schema only

1. **Apply one migration** via Supabase MCP `apply_migration` (project_id: `rlptjmkejfykisaefkeh`):
   - **Name:** `add_servicem8_job_uuid_to_saved_diagrams_and_job_performance` (snake_case per rules).
   - **SQL:**
     - `ALTER TABLE public.saved_diagrams ADD COLUMN IF NOT EXISTS servicem8_job_uuid uuid NULL;`
     - `ALTER TABLE public.job_performance ADD COLUMN IF NOT EXISTS servicem8_job_uuid uuid NULL;`
   - **Type:** Use PostgreSQL `uuid` so we store a proper uuid; API/frontend will send string (e.g. from ServiceM8); backend can pass through and Postgres will validate.
2. **No** changes to `backend/`, `frontend/`, or `README.md` in this step.
3. **After migration:** Update `docs/BACKEND_DATABASE.md` “4. Bonus / job performance” and “Audit: ServiceM8 job syncing” to state that `saved_diagrams.servicem8_job_uuid` and `job_performance.servicem8_job_uuid` exist (nullable). Optional: add a short “Migrations” bullet for this migration name.
4. **Task list:** In `docs/tasks/section-59.md`, mark **59.4.1** as complete (`[x]`). Do **not** remove Section 59 from the uncompleted table in `TASK_LIST.md` (section not fully complete).

**Desktop / mobile / Railway:** No impact; schema-only change applied in Supabase.

---

### Step 2: Task 59.4.2 – Diagrams API

1. **Backend request models** (`backend/main.py`):
   - Add to `SaveDiagramRequest`: `servicem8JobUuid: Optional[str] = None` (no max_length; UUID string). Keep existing `servicem8JobId`.
   - Add to `UpdateDiagramRequest`: `servicem8JobUuid: Optional[str] = None`.
2. **Backend diagrams module** (`backend/app/diagrams.py`):
   - `create_diagram`: add parameter `servicem8_job_uuid: Optional[str] = None`. If present, validate it’s a valid UUID string (e.g. try `uuid.UUID(s)` and catch `ValueError`); set `insert["servicem8_job_uuid"] = str(uuid.UUID(servicem8_job_uuid))` or None. Do not truncate.
   - `update_diagram`: add parameter `servicem8_job_uuid: Optional[str] = None`; same validation; set `updates["servicem8_job_uuid"]` when provided.
   - `list_diagrams`: add `servicem8_job_uuid` to `.select(...)`; add to returned dict as `servicem8JobUuid`.
   - `get_diagram`: return `servicem8JobUuid` from row (column `servicem8_job_uuid`).
   - Create response: include `servicem8JobUuid` in returned object when present.
3. **Backend API handlers** (`backend/main.py`):
   - `api_create_diagram`: pass `body.servicem8JobUuid` into `create_diagram`.
   - `api_update_diagram`: pass `body.servicem8JobUuid` into `update_diagram`.
4. **Tests / sanity:** Run existing E2E or manual Add to Job / Create New Job + save diagram; ensure no regression. Railway deploy: no new env vars; existing Procfile and nixpacks unchanged.

**Desktop / mobile:** No UI change; API accepts an optional field and persists it. Both layouts keep working.

---

### Step 3: Task 59.4.3 – Frontend pass both identifiers

1. **`autoSaveDiagramWithJobNumber`** (app.js):
   - Change signature to accept optional second argument: `autoSaveDiagramWithJobNumber(jobNumber, jobUuid)` (or a single options object `{ jobNumber, jobUuid }` if preferred; must remain backward-compatible when only job number is passed).
   - When building the POST body, set `servicem8JobId: String(jobNumber)` and, when `jobUuid` is provided, set `servicem8JobUuid: jobUuid` (string).
2. **Add to Job success path** (app.js, ~3409–3415):
   - Before calling `autoSaveDiagramWithJobNumber`, read `jobUuid = overlay?.dataset?.jobUuid || ''`.
   - Call `autoSaveDiagramWithJobNumber(jobNumberForSave, jobUuid)` (or equivalent) so both are sent. Ensure overlay is still in DOM when reading `jobUuid` (current code reads `jobConfirmAddId` from DOM before `setTimeout`; same for overlay.dataset).
3. **Create New Job success path** (app.js, ~3489–3497):
   - `jobNumber = data.generated_job_id || ''`; `jobUuid = data.new_job_uuid || ''`. Pass both: `autoSaveDiagramWithJobNumber(jobNumber, jobUuid)`. If backend returns only one, the other can be empty string; backend already accepts optional `servicem8JobUuid`.
4. **Regression:** Existing behaviour (e.g. only job number) must still work; sending only `servicem8JobId` is already supported. No change to desktop vs mobile layout or accessibility; same flows, more data sent.

**Railway:** No config change; frontend remains static assets served by same backend.

---

### Step 4: Task 59.4.4 (optional) – Add to Job response

- **Backend:** `POST /api/servicem8/add-to-job` currently returns `{"success": True}`. Optionally extend response to include `generated_job_id` and `uuid` (from the request body or from ServiceM8 response if available) so the client can persist both even if overlay state is lost. Document in OPENAPI/docs and in BACKEND_DATABASE or Section 59.
- **Frontend:** If backend returns them, use `data.generated_job_id` and `data.uuid` in the Add to Job success path when calling `autoSaveDiagramWithJobNumber(jobNumber, jobUuid)` so we don’t rely solely on overlay dataset. This is “if desired” per section-59.md.

---

## 4. Edge cases and safeguards

- **Backward compatibility:** Existing clients that send only `servicem8JobId` continue to work; new columns are nullable. Old diagram rows have NULL `servicem8_job_uuid`.
- **Invalid UUID:** Backend should validate `servicem8JobUuid` (e.g. `uuid.UUID(s)`) and either reject with 400 or treat as null; do not persist invalid strings into a uuid column.
- **Desktop vs mobile:** No layout or viewport-specific logic; both use the same API and same `autoSaveDiagramWithJobNumber`. No change to production desktop or mobile UI beyond “we now store uuid when provided”.
- **Railway:** No new env vars, no new build step, no change to run-server.sh or Procfile. Supabase migration is applied to Supabase only.

---

## 5. Task list update (after 59.4.1)

- In **`docs/tasks/section-59.md`:** Mark **59.4.1** as complete (`[x]`).
- **TASK_LIST.md:** Leave Section 59 in the uncompleted table until at least 59.4.2–59.4.4 (and/or other section tasks) are done per project rules.

---

## 6. Summary

| Step   | Task    | What | Impact |
|--------|---------|------|--------|
| 1      | 59.4.1  | Migration: add nullable `servicem8_job_uuid` (uuid) to `saved_diagrams` and `job_performance` | Schema only; no app code. |
| 2      | 59.4.2  | Diagrams API: accept optional `servicem8JobUuid` in POST/PATCH, persist and return it | Backend only; backward compatible. |
| 3      | 59.4.3  | Frontend: pass job number + job uuid when auto-saving after Add to Job and Create New Job | Same flows; both identifiers stored. |
| 4      | 59.4.4  | (Optional) Add to Job response return `generated_job_id` and `uuid`; frontend use them for save | Improves robustness if overlay state lost. |

All steps keep desktop and mobile production behaviour unchanged except for persisting an extra optional identifier. Railway deploy remains valid throughout.
