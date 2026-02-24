# QA Audit Report: Section 59.7 Implementation (invoiced_revenue_exc_gst & materials_cost)

**Role:** Strict Senior QA Engineer  
**Date:** 2026-02-24  
**Scope:** 59.7 implementation (cron sync populates `job_performance.invoiced_revenue_exc_gst` and `job_performance.materials_cost`).  
**Constraints checked:** Desktop vs Mobile production, Railway deployment safety, UI/UX best practices, database alignment.

---

## 1. Executive summary

| Verdict | Detail |
|--------|--------|
| **Overall** | **PASS with minor recommendations** |
| **Desktop/Mobile** | No impact (backend/cron only; no UI changes). |
| **Railway** | Safe (no new routes, env vars, or startup dependencies). |
| **UI/UX** | N/A (no user-facing change). |
| **Database** | Schema verified via Supabase MCP; code matches. |

The 59.7 work is confined to the job_performance sync module and ServiceM8 API client. No frontend, no new HTTP routes, and no change to Add to Job / Create New Job flows. Database columns used for read/write exist and are NOT NULL; the implementation always supplies values (0 or computed).

---

## 2. Constraint verification

### 2.1 Desktop vs mobile production

- **Finding:** 59.7 touches only:
  - `backend/app/servicem8.py` (new `list_job_materials`)
  - `backend/app/job_performance_sync.py` (GST constant, materials-cost helper, extended `run_sync` loop)
- **Evidence:** Grep for `job_performance_sync`, `run_sync`, `list_job_materials` in **frontend/** and **backend/main.py** returns no matches. The sync is invoked by an external script/cron (`scripts/run_job_performance_sync.py`), not by the web app.
- **Conclusion:** **PASS.** No `data-viewport-mode` or viewport logic; no new UI; desktop and mobile behaviour unchanged.

### 2.2 Railway deployment safety

- **Startup:** `./scripts/run-server.sh` runs `uvicorn main:app` only. `main.py` does not import `job_performance_sync` or call `run_sync`. Sync is out-of-process (cron/script).
- **Env:** No new environment variables introduced. Existing `SERVICEM8_COMPANY_USER_ID` / `SERVICEM8_COMPANY_EMAIL` and Supabase vars remain sufficient. OAuth scope `read_job_materials` is required for 59.7; if the app already requests it (per plan), no code change—otherwise document in README/deployment.
- **Dependencies:** No new pip/package requirements; `httpx` and Supabase client already used.
- **Conclusion:** **PASS.** Deployment and run-server behaviour unchanged; sync remains an optional side process.

### 2.3 UI/UX best practices

- **Finding:** No UI or UX change. No new screens, modals, or touch targets. No change to quote modal, Add to Job, or Create New Job flows.
- **Conclusion:** **N/A.** No UI/UX regression or addition to assess.

---

## 3. Database verification (Supabase MCP)

### 3.1 Tables and columns

- **job_performance**
  - `invoiced_revenue_exc_gst`: numeric, **NOT NULL** (confirmed via `information_schema.columns`).
  - `materials_cost`: numeric, **NOT NULL**.
  - Implementation always sets both (0 or computed); no NULL written. **PASS.**

- **products**
  - `servicem8_material_uuid`: text, nullable. Used in `_compute_materials_cost_from_job_materials` for `.in_("servicem8_material_uuid", material_uuids)`.
  - `cost_price`: numeric, nullable. Code treats `None` as “no our cost” and falls back to ServiceM8. **PASS.**

### 3.2 Edge case: empty `material_uuids`

- Code uses `if material_uuids:` before querying products; `.in_("servicem8_material_uuid", material_uuids)` is never called with an empty list. **PASS.**

---

## 4. Implementation quality and edge cases

### 4.1 Revenue (invoiced_revenue_exc_gst)

- `total_invoice_amount` missing → 0. **PASS.**
- `total_invoice_amount` string/number → `float(raw) / GST_DIVISOR` with try/except; ValueError/TypeError → 0. **PASS.**
- GST: constant `GST_DIVISOR = 1.15` used; docstring states ServiceM8 amount is inc GST. **PASS.**

### 4.2 Materials (materials_cost)

- No `job_uuid` → `materials_cost = 0`. **PASS.**
- `list_job_materials` failure → returns `[]`; helper returns 0.0; sync continues. **PASS.**
- Products query failure (e.g. missing column in older DB) → exception caught in helper, logged at debug, ServiceM8-only cost used. **PASS.**
- JobMaterial line with no product match and no ServiceM8 cost → line contributes 0. **PASS.**
- Quantity/float parsing: try/except; invalid → 0.0. **PASS.**

### 4.3 Merge-before-upsert and sync-owned columns

- Only sync-owned columns are overwritten; admin-edited fields (e.g. `bonus_period_id`, callback fields) preserved. **PASS.**
- `SYNC_OWNED_COLUMNS` still includes `invoiced_revenue_exc_gst` and `materials_cost`; behaviour consistent. **PASS.**

### 4.4 ServiceM8 API usage

- `list_job_materials`: filter built as `f"job_uuid eq '{job_uuid}'"`. `job_uuid` comes from ServiceM8 job response (`job.get("uuid")`) and is stripped. If ServiceM8 ever returned a value with single quotes or non-UUID characters, the filter could be invalid or injective. **Recommendation (low):** Validate `job_uuid` with a strict UUID pattern before calling the API; reject or skip and set `materials_cost = 0` if invalid. Not required for current spec.

---

## 5. Regression and “don’t shake the tree”

- **Add to Job / Create New Job:** Unchanged (no imports or calls from main.py to job_performance_sync). **PASS.**
- **Quote persistence (59.19):** Unchanged. **PASS.**
- **Active quote resolution:** Same `get_active_quote_for_job(supabase, generated_job_id)`; no change. **PASS.**
- **Script:** `scripts/run_job_performance_sync.py` still imports `run_sync` and prints JSON; exit 0/1 on success/failure. Comment says “59.6”; optional doc update to “59.6/59.7” for clarity.

---

## 6. Task list and documentation

- **docs/tasks/section-59.md:** 59.7 checkbox set to `[x]`. **PASS.**
- **TASK_LIST.md:** Related tasks and uncompleted row updated (59.7 done, 59.8 next). **PASS.**
- Plan doc: `docs/plans/2026-02-24-section-59-7-revenue-materials-plan.md` present. **PASS.**

---

## 7. Recommendations (non-blocking) — implemented

| # | Recommendation | Priority | Status |
|---|----------------|----------|--------|
| 1 | Validate `job_uuid` with a UUID pattern before calling `list_job_materials` to harden the ServiceM8 filter. | Low | **Done:** `servicem8.list_job_materials` now validates with `uuid.UUID(job_uuid)` and returns `[]` on invalid format. |
| 2 | Update `scripts/run_job_performance_sync.py` docstring to “59.6/59.7” for accuracy. | Low | **Done:** Docstring updated to mention 59.7 and invoiced_revenue_exc_gst/materials_cost. |
| 3 | If OAuth app does not yet request `read_job_materials`, add it and document in README/deployment. | As needed | **Done:** App already requests `read_job_materials` in `DEFAULT_SCOPES`. README and docs/RAILWAY_DEPLOYMENT.md now document that the job_performance sync requires `read_jobs` and `read_job_materials` (included by default). |

---

## 8. Sign-off

- **Desktop/Mobile:** No impact; **PASS.**  
- **Railway:** No new surface; **PASS.**  
- **UI/UX:** N/A; no regression.  
- **Database:** Schema and NOT NULL constraints verified; code aligns; **PASS.**  
- **Edge cases and errors:** Handled; sync continues with 0 where appropriate; **PASS.**  
- **Regression:** No change to app routes or Add to Job / Create New Job; **PASS.**

**Audit status:** Complete. Implementation is suitable for production from a QA perspective, with optional follow-ups above.
