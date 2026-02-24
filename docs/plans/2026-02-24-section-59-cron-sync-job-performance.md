# Section 59.6: Cron-based job_performance sync (draft plan)

**Status:** Adopted. Webhook replaced with scheduled cron sync in section-59.md, TASK_LIST.md, BACKEND_DATABASE.md, and data-flow plan. Implementation tasks (59.6) remain in TASK_LIST; see "Key files" table and cron flow below.

**Goal:** Replace the webhook-based 59.6 with a **scheduled cron sync** that (1) lists Completed/Invoiced jobs from ServiceM8, (2) for each job finds the **active quote** in our DB, (3) **upserts** into `public.job_performance` with status `draft`, `servicem8_job_id`, `servicem8_job_uuid`, `quote_id`, `quoted_labor_minutes`. Optionally in the same pass (or 59.7) populate `invoiced_revenue_exc_gst`, `materials_cost` from ServiceM8. No webhook endpoint or ServiceM8 webhook registration required.

**Out of scope for this plan:** 59.7 full population (JobMaterial, etc.), 59.8 job_personnel, calculation engine. This plan covers only “create/update job_performance rows in draft and link quote.”

---

## Key files and line references (for next chat)

Use these to restore context quickly without re-reading the whole codebase.

| Purpose | File | Lines / section |
|--------|------|------------------|
| Task 59.6 / 59.7 text | `docs/tasks/section-59.md` | 88–90 (59.6 webhook, 59.7 populate); Decisions 47–65 |
| job_performance schema, status, FKs | `docs/BACKEND_DATABASE.md` | §4 bonus tables 107–116; job_performance.status 120; public.quotes §2.5 73–98 |
| job_performance columns (full) | `docs/plans/2026-02-23-bonus-periods-job-performance-schema.md` | 50–76 (note: status column added in 59.4, see BACKEND_DATABASE) |
| public.quotes, active quote, labour_hours | `docs/BACKEND_DATABASE.md` | 73–98 (§2.5 quotes); Section 59 decisions 200–218 |
| ServiceM8 Jobs API (list, filter, status) | `docs/SERVICEM8_API_REFERENCE.md` | 12–35 (Jobs); filter syntax 19; status field 31 |
| Fetch job by uuid / generated_id | `backend/app/servicem8.py` | `fetch_job_by_uuid` 441–459; `fetch_job_by_generated_id` 414–438; `make_api_request` used for GET job.json with `$filter` |
| Quote persistence (active quote concept) | `backend/app/quotes.py` | `insert_quote_for_job` 39–69; no “active quote” helper yet—that logic would live in cron/sync |
| Bonus period API (token/ Supabase) | `backend/main.py` | Bonus routes ~737–810; `get_supabase()` 30; `require_role(["admin"])` for admin routes |
| Supabase client | `backend/app/supabase_client.py` | `get_supabase()` |
| Auth / company token for cron | `backend/app/servicem8.py` | `get_effective_servicem8_user_id`, `get_tokens` (company user when `SERVICEM8_COMPANY_USER_ID` set); see main.py Add to Job 1074–1076 |
| Locked decisions (webhook vs sync) | `docs/tasks/section-59.md` | 48–65 (who populates what; quote–job link; status draft/verified/processed) |
| Data flow rationale | `docs/plans/2026-02-23-section-59-data-flow-decisions.md` | Job creation trigger, quote_id, quoted_labor_minutes |

---

## Cron flow (high level)

1. **Trigger:** Run daily (or N times per day) via Railway cron, GitHub Actions, or a script invoked by a scheduler. No inbound webhook.
2. **Auth:** Use the same ServiceM8 token as the app (e.g. company token via `SERVICEM8_COMPANY_USER_ID` or a dedicated “sync” user). Token must have `read_jobs` (and for 59.7: `read_job_payments`, `read_job_materials`). Refresh token if expired (existing OAuth refresh in `servicem8.py`).
3. **List jobs:** Call ServiceM8 `GET /api_1.0/job.json` with `$filter` to restrict to Completed/Invoiced jobs. **Verified:** ServiceM8 supports `$filter=status eq 'Completed'` (and `status eq 'Quote'`, `status eq 'Work Order'`); string values in single quotes. **Limitation:** API supports only `and` (no `or`), max 10 conditions. So we cannot do one request for “Completed or Invoiced”. **Approach:** Two GET requests (e.g. `status eq 'Completed'` and `status eq 'Invoiced'`) and merge results, or verify exact status string for “Invoiced” (may be same as Completed in some configs). Optional date scope: if job resource exposes `last_modified` or similar, add `and last_modified gt '...'` to limit scope; otherwise run over full list with cursor pagination.
4. **For each job:**  
   - Read `uuid`, `generated_job_id` from ServiceM8 response.  
   - **Active quote:** In our DB, select from `public.quotes` where `servicem8_job_id = generated_job_id` (or match by `servicem8_job_uuid` if we prefer). Order by `is_final_quote DESC NULLS LAST, updated_at DESC`; take first row. When "job → Scheduled" webhook exists, `is_final_quote = true` will be set; until then (e.g. when we have “job → Scheduled” webhook), prefer row with `is_final_quote = true` when present, else latest by `updated_at`.  
   - `quoted_labor_minutes` = `round(quote.labour_hours * 60)` from that quote, or **0** when no quote (schema has `quoted_labor_minutes` NOT NULL).  
   - **Upsert** into `public.job_performance`: `servicem8_job_id` (UNIQUE), `servicem8_job_uuid`, `quote_id`, `quoted_labor_minutes`, `status = 'draft'`. Schema requires `invoiced_revenue_exc_gst` and `materials_cost` NOT NULL—use **placeholder 0** until 59.7. Use Supabase upsert on `servicem8_job_id`. **Preserve admin-edited fields on conflict:** fetch existing row by `servicem8_job_id` first and merge only sync-owned columns (quote_id, quoted_labor_minutes, servicem8_job_uuid, status, optionally invoiced_revenue_exc_gst, materials_cost) into the payload before upsert; default upsert would overwrite callback/bonus_period_id etc.
5. **Idempotency:** Upsert key = `servicem8_job_id`. On conflict, update only sync-owned fields (see above); do not overwrite admin-edited fields (bonus_period_id, callback fields, parts runs, etc.).

---

## Open questions for next chat

- **ServiceM8 status "Invoiced":** Confirm exact status string (may be `'Invoiced'` or same as Completed). If different, use two list requests and merge.
- **Job date filter:** If job resource exposes `last_modified` or similar, add to filter to limit scope; otherwise rely on cursor pagination.
- **Where cron runs:** Railway cron job vs external (e.g. GitHub Actions) vs a small CLI script in repo run by a host. If Railway: confirm cron add-on and env (token) availability.
- **59.7 in same pass or separate:** Whether the cron should also fetch `total_invoice_amount` and JobMaterials and set `invoiced_revenue_exc_gst` / `materials_cost` in the same run (simplifies one “sync” job) or leave that for a separate 59.7 implementation.

---

## Implementation notes (after investigation)

- Add a **sync module** (e.g. `backend/app/job_performance_sync.py` or `scripts/sync_job_performance.py`) that: gets ServiceM8 token; lists jobs via new helper (two requests for Completed + Invoiced, merge); for each job resolves active quote from `public.quotes`; upserts `job_performance` with merge-before-upsert to preserve admin fields. No new HTTP route unless we add an admin “trigger sync” button later.
- **Active quote:** Add `get_active_quote_for_job(supabase, servicem8_job_id)` in `backend/app/quotes.py` (reusable by sync and webhook). Query: `SELECT id, labour_hours FROM public.quotes WHERE servicem8_job_id = $1 ORDER BY is_final_quote DESC NULLS LAST, updated_at DESC LIMIT 1`. Return row or None.
- **List jobs helper:** Add in `backend/app/servicem8.py` (e.g. `list_jobs(access_token, status: str)`) that GETs `/api_1.0/job.json` with `$filter=status eq 'Completed'` (or `'Invoiced'`), handles cursor pagination, returns list of job dicts.
- **Token for cron:** Cron has no request user. Require `SERVICEM8_COMPANY_USER_ID` or `SERVICEM8_COMPANY_EMAIL`. Add public helper in `servicem8.py`: e.g. `get_sync_user_id() -> Optional[str]` returning company user id so sync can call `get_tokens(get_sync_user_id())`. `get_tokens` already refreshes when expired; works headless.
- **job_performance insert/upsert:** Use Supabase `upsert` with `on_conflict='servicem8_job_id'`. On conflict, fetch existing row first, merge only sync-owned columns into payload, then upsert so admin-edited fields are preserved.

---

## Relation to section-59 tasks

- **59.6:** This plan replaces “webhook handler” with “cron sync” for creating/updating job_performance rows in draft. Task text in `docs/tasks/section-59.md` (line 88) still says webhook; if we adopt cron, we’ll update the task description and decisions to “scheduled sync” and keep the rest (draft, quote_id, quoted_labor_minutes) the same.
- **59.7:** Populate invoiced_revenue_exc_gst, materials_cost—can be done inside the same cron or in a separate pass; see open questions above.
- **Not in TASK_LIST yet:** Per request, this plan is not added to the uncompleted table until the next chat investigates and confirms the approach.

---

## Deep dive validation (2026-02-24)

Validation against codebase and docs; corrections applied above.

| Area | Finding | Correction / note |
|------|--------|--------------------|
| **ServiceM8 list/filter** | Official docs: `$filter=status eq 'Completed'` (single quotes); only `and` supported, no `or`, max 10 conditions. | Plan updated: two GET requests (Completed + Invoiced) and merge, or confirm "Invoiced" status string. Date filter (e.g. `last_modified`) to be verified against job resource. |
| **List jobs helper** | We have `fetch_job_by_generated_id` and `fetch_job_by_uuid` only; no list-with-filter. | Add `list_jobs(access_token, status)` in `servicem8.py` with pagination (cursor per ServiceM8 docs). |
| **Token for cron** | Add to Job uses `get_effective_servicem8_user_id(user_id)` then `get_tokens(effective_id)`. Cron has no request user. `_get_company_user_id()` returns company user from env; `get_tokens()` already refreshes when within 5 min of expiry. | Require company user env; add public `get_sync_user_id()` in servicem8.py that returns `_get_company_user_id()` so cron can call `get_tokens(get_sync_user_id())`. No API key in app. |
| **Active quote SQL** | `quotes` has `servicem8_job_id`, `is_final_quote`, `updated_at`. No helper yet. | Query confirmed: `ORDER BY is_final_quote DESC NULLS LAST, updated_at DESC LIMIT 1`. Add `get_active_quote_for_job` in `quotes.py` for reuse. |
| **job_performance schema** | BACKEND_DATABASE §4 + bonus-periods schema: `invoiced_revenue_exc_gst`, `materials_cost`, `quoted_labor_minutes` NOT NULL. | Use placeholder 0 for revenue/materials until 59.7; use 0 for quoted_labor_minutes when no quote. |
| **Upsert idempotency** | Supabase `.upsert(..., on_conflict='servicem8_job_id')` replaces whole row by default; would overwrite admin-edited fields. | Merge before upsert: fetch existing by `servicem8_job_id`, update only sync-owned columns in payload, then upsert merged row. |
| **Decisions 47–65** | section-59.md and BACKEND_DATABASE §59: draft/verified/processed, quote–job link, who populates what. | Unchanged; only trigger changes from webhook to cron. When adopting, update 59.6 task text and decision wording to "scheduled sync". |
