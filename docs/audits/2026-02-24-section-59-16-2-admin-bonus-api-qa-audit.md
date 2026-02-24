# QA Audit Report: Section 59.16.2 — Admin bonus API (finalise full bonus API for Admin UI)

**Date:** 2026-02-24  
**Auditor role:** Strict Senior QA Engineer  
**Scope:** Implementation of task 59.16.2 against project constraints: Desktop vs Mobile production, Railway deployment safety, and UI/UX / API best practices.  
**Artifacts reviewed:** `backend/main.py` (new/admin bonus routes, `UpdateJobPerformanceRequest`), `docs/tasks/section-59.md`, `docs/plans/2026-02-24-section-59-16-2-and-next-plan.md`, `backend/.env.example`, `scripts/run-server.sh`, `README.md`, existing bonus routes and helpers.

---

## 1. Executive summary

| Area | Result | Notes |
|------|--------|--------|
| Desktop production | **PASS** | No desktop UI or behaviour changed; no frontend touched. |
| Mobile production | **PASS** | No mobile UI or behaviour changed; no frontend touched. |
| Railway deployment | **PASS** | No new env vars, no build changes, no new dependencies; same run-server.sh / Procfile. |
| API / backend best practices | **PASS** | Consistent auth (admin-only), validation, error handling, response shape. One **minor** recommendation: optional OpenAPI tags for admin bonus. |

**Overall:** The 59.16.2 implementation is **production-ready** and compliant with all stated constraints. No regression to technician dashboard, period list, or existing bonus API. Optional follow-ups are non-blocking.

---

## 2. Desktop vs mobile production

### 2.1 Intent

Project rule: *Unless specified, changes are mobile UI/accessibility; desktop production UI must remain unaffected.*  
59.16.2 scope: **backend API only** for future Admin UI (59.17), desktop-first.

### 2.2 Verification

- **Frontend (HTML/CSS/JS):** **No files modified.** No changes to `frontend/index.html`, `frontend/app.js`, or `frontend/styles.css`. Technician-facing bonus dashboard (My Bonus, GP Race, hero grid, ledger) is unchanged.
- **Viewport / layout:** No references to `data-viewport-mode`, `layoutState.viewportMode`, or mobile/desktop branching in the changed code. New code is viewport-agnostic (API only).
- **Existing bonus routes:** `GET /api/bonus/technician/period-current`, `GET /api/bonus/technician/dashboard`, `GET /api/bonus/technician/jobs` unchanged. Behaviour and payload shape unchanged. No shared helper used by technician dashboard was altered in a way that could change output (only **new** routes and one new Pydantic model were added).
- **Shared helpers:** `_resolve_bonus_dashboard_period`, `_fetch_period_jobs_with_fallback`, `select_period_jobs`, `filter_eligible_period_jobs`, `_fetch_job_personnel_rows_for_jobs`, `group_personnel_by_job`, `build_canonical_ledger_rows`, `compute_technician_contribution_total`, `compute_total_contributed_gp`, `compute_period_pot`, `compute_job_gp` — **read-only usage** in new endpoints; no signatures or behaviour changed.

**Finding:** **PASS.** Desktop and mobile production are unaffected. No “tree shaking” of existing bonus or technician flows.

---

## 3. Railway deployment safety

### 3.1 Constraints

Deploy via `./scripts/run-server.sh` / Railway; no new required env; no new build step (README: vanilla HTML/CSS/JS, Python/FastAPI backend).

### 3.2 Verification

- **Environment variables:** No new variables introduced. `backend/.env.example` unchanged (BONUS_LABOUR_RATE and existing bonus/Supabase/ServiceM8 vars only). New endpoints use existing `get_supabase()` and `require_role(["admin"])`; no new env reads.
- **Dependencies:** No changes to `backend/requirements.txt`. New code uses only existing imports (`FastAPI`, `Depends`, `HTTPException`, `Field`, `BaseModel`, existing `app.*` and bonus helpers).
- **Start command:** `scripts/run-server.sh` unchanged; still runs `python3 -m uvicorn main:app --reload --host "$HOST" --port "$PORT"`. No Procfile or nixpacks change required for this work.
- **Build step:** No frontend build; no new static assets. Backend remains Python-only; no new system or pip packages.
- **Backward compatibility:** New routes are additive only. No existing URL or request/response contract was changed or removed. Unauthenticated or non-admin callers receive 401/403 as before; no new public or weaker auth path.

**Finding:** **PASS.** Railway deployment and run-server behaviour remain safe and unchanged.

---

## 4. API and backend best practices

### 4.1 Auth and authorization

- **Admin-only:** All six new/updated surfaces require `require_role(["admin"])`:  
  `GET /api/bonus/admin/periods/{period_id}/jobs`, `GET .../summary`, `GET .../breakdown`, `GET /api/bonus/job-performance/{job_performance_id}/personnel`, `PATCH /api/bonus/job-performance/{job_performance_id}`. Consistent with existing `GET /api/bonus/periods`, `PATCH /api/bonus/job-personnel/{id}`, `GET /api/bonus/job-performance/{id}`.
- **No privilege escalation:** Technician and editor roles cannot call admin bonus endpoints; no new code path bypasses role check.

**Finding:** **PASS.**

### 4.2 Input validation

- **Path parameters:** `period_id` and `job_performance_id` validated as valid UUIDs; invalid UUID → 400 with clear message. Non-existent period/job → 404.
- **PATCH body:** `UpdateJobPerformanceRequest` uses Pydantic: optional fields with `ge=0` for numeric fields; `status` validated in handler to be one of `draft`, `verified`, `processed`; `bonus_period_id` validated as UUID when present. Empty body (no fields to update) → 400. No raw dict update; only `model_dump(exclude_unset=True)` so only provided fields are sent to DB.

**Finding:** **PASS.**

### 4.3 Error handling and consistency

- **HTTP semantics:** 400 (bad request), 404 (not found), 500 (server error) used appropriately. HTTPException re-raised in `except HTTPException: raise` blocks so FastAPI returns correct status.
- **Logging:** All new endpoints log exceptions with `logger.exception(...)` before raising 500, preserving stack trace for debugging.
- **Response shape:**  
  - **Period jobs:** `{ "period", "jobs" }` with each job including `job_gp` and `personnel` array.  
  - **Summary:** `{ "period", "total_team_pot", "eligible_job_count", "callback_cost_total" }`.  
  - **Breakdown:** `{ "period", "total_team_pot", "breakdown" }` with entries `technician_id`, `gp_contributed`, `share_of_team_pot`, `expected_payout`, `display_name` (null).  
  - **Personnel by job:** `{ "job_performance_id", "personnel" }`.  
  - **PATCH response:** Updated job_performance row plus `job_gp` (same shape as GET job-performance/{id}).  
  Consistent with plan and sufficient for Admin UI (59.17).

**Finding:** **PASS.**

### 4.4 Route ordering (FastAPI)

- **Personnel vs single-job GET:** `GET /api/bonus/job-performance/{job_performance_id}/personnel` is declared **before** `GET /api/bonus/job-performance/{job_performance_id}`. So a request to `.../job-performance/<uuid>/personnel` matches the personnel route; a request to `.../job-performance/<uuid>` matches the single-job route. No path-parameter capture of the literal `"personnel"` as a job_performance_id.

**Finding:** **PASS.**

### 4.5 Data and calculation integrity

- **Period resolution:** Admin period endpoints pass `period_rows=[]` to `_resolve_bonus_dashboard_period` with `requested_period_id` set, so the period is always fetched by id from the DB; closed periods are allowed (plan: admin can view any period). No reliance on “current” open/processing list for admin.
- **Eligible vs all jobs:** Summary and breakdown use `filter_eligible_period_jobs` (verified/processed only) for pot and breakdown; period jobs list returns **all** period jobs (including draft/unverified) so admin can assign and finalise. Aligns with plan.
- **PATCH writable fields:** Only status, bonus_period_id, is_callback, callback_reason, callback_cost, standard_parts_runs, seller_fault_parts_runs, missed_materials_cost. Sync- and quote-populated fields (e.g. invoiced_revenue_exc_gst, materials_cost, quoted_labor_minutes) are **not** in the request model and cannot be overwritten by admin PATCH. Prevents accidental data corruption.

**Finding:** **PASS.**

### 4.6 Optional follow-ups (non-blocking)

- **OpenAPI tags:** New admin bonus endpoints could be grouped under a tag (e.g. `Bonus (Admin)`) for clearer API docs. Not required for production.
- **display_name in breakdown:** Currently `null`; Admin UI can resolve from `/api/admin/user-permissions` or a future profile/display-name endpoint. Documented in plan; acceptable for 59.16.2.

---

## 5. UI/UX relevance (future Admin UI)

59.16.2 does not implement UI. From a **future Admin UI and UX** perspective:

- **Payloads support key workflows:** Period summary (pot, counts), per-tech breakdown (payroll view), job list with personnel (assign/verify), single-job personnel (detail/edit), and PATCH for finalise/callbacks/parts-run/missed-materials. Response shapes are consistent and sufficient for desktop-first Admin UI (59.17).
- **No mobile-specific API design:** Admin UI is desktop-first; when/if mobile admin is added, same endpoints can be consumed. No hard-coded desktop-only assumptions in the API.

**Finding:** **PASS** for intended scope (API only; UI in 59.17).

---

## 6. Task completion and documentation

- **Section file:** `docs/tasks/section-59.md` — 59.16.2 checkbox set to `[x]`. Matches “Finalize full bonus API surface for Admin UI and payroll flow (period summary, per-tech breakdown, list/read job_personnel by period/job, and any required write endpoints beyond existing admin PATCH).”
- **TASK_LIST.md:** Section 59 row already included “Next recommended: 59.16.2”; no structural change required for 59.16.2 completion. Section 59 remains in the uncompleted table (59.16.3–59.16.7, 59.17, 59.24 still open).
- **Plan:** `docs/plans/2026-02-24-section-59-16-2-and-next-plan.md` accurately describes the implemented endpoints and behaviour. No drift.

**Finding:** **PASS.**

---

## 7. Regression and test evidence

- **Existing backend tests:** `tests/test_bonus_calc.py` and `tests/test_bonus_dashboard_canonical.py` — **8/8 passed** after implementation. No tests were removed or disabled. New code does not alter the code paths covered by these tests (bonus_calc and bonus_dashboard helpers unchanged).
- **No new tests added:** 59.16.2 did not add automated tests for the new HTTP endpoints. **Recommendation:** In a follow-up (e.g. with 59.17 or a dedicated test task), add tests for admin period summary/breakdown/jobs and PATCH job_performance (auth, validation, 404). Not required for this audit sign-off.

**Finding:** **PASS** (no regressions; optional test expansion noted).

---

## 8. Checklist summary

| # | Criterion | Status |
|---|-----------|--------|
| 1 | Desktop production unchanged | ✅ |
| 2 | Mobile production unchanged | ✅ |
| 3 | No new required env vars | ✅ |
| 4 | Procfile / run-server.sh unchanged | ✅ |
| 5 | No new build step or frontend change | ✅ |
| 6 | Admin-only auth on all new/updated bonus endpoints | ✅ |
| 7 | Input validation (UUID, status, optional body) | ✅ |
| 8 | Correct HTTP status and error handling | ✅ |
| 9 | Route order (personnel before single-job GET) | ✅ |
| 10 | PATCH does not allow overwriting sync-populated fields | ✅ |
| 11 | Task 59.16.2 marked done in section-59.md | ✅ |
| 12 | Existing backend tests still pass | ✅ |

---

## 9. Audit conclusion

The Section 59.16.2 implementation is **approved for production** and complies with:

- **Desktop vs mobile:** No production UI change; backend-only, viewport-agnostic API.
- **Railway deployment:** No new env, no new build, same run-server.sh and stack.
- **API and backend practice:** Consistent admin-only auth, validation, error handling, and response contracts; route order correct; data integrity preserved.

No regressions to technician dashboard, existing bonus routes, or shared helpers were introduced. Optional follow-ups (OpenAPI tags, automated tests for new endpoints, display_name resolution for breakdown) are non-blocking and can be scheduled with 59.17 or later.

**Signed off:** Strict Senior QA Engineer (audit only; no code changes).
