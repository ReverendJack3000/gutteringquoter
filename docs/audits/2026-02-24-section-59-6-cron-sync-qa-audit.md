# QA Audit Report: Section 59.6 Cron Sync Implementation

**Role:** Strict Senior QA Engineer  
**Date:** 2026-02-24  
**Scope:** Implementation and task completion for 59.6 (job ledger creation via scheduled cron sync).  
**Constraints under review:** Desktop vs. Mobile production, Railway deployment safety, UI/UX best practices.

---

## 1. Executive Summary

| Verdict | Area |
|--------|------|
| **PASS** | Desktop vs. Mobile impact |
| **PASS** | Railway deployment safety |
| **PASS** | UI/UX (N/A – no user-facing change) |
| **PASS with notes** | Implementation correctness and task tracking |
| **Recommendations** | 3 hardening / doc items (non-blocking) |

The 59.6 work is **backend-only**, adds **no HTTP routes**, **no frontend changes**, and **no new runtime dependencies**. It does not affect the production web UI (desktop or mobile) or the standard deploy path. A few defensive and documentation improvements are recommended.

---

## 2. Desktop vs. Mobile Production

### 2.1 Constraint

Single codebase serving desktop and mobile via adaptive layout (`data-viewport-mode`). No change must break desktop or mobile production UI without explicit scope.

### 2.2 Findings

- **No frontend changes:** No edits to `index.html`, `styles.css`, `app.js`, or any frontend asset.
- **No new UI surface:** Sync is invoked by an external cron (or `scripts/run_job_performance_sync.py`); there is no “Sync” button, modal, or route in the app.
- **No viewport/layout logic:** No use of `data-viewport-mode`, `layoutState.viewportMode`, or mobile/desktop-specific branches.
- **Existing flows untouched:** Add to Job and Create New Job still use only `get_effective_servicem8_user_id`, `fetch_job_by_*`, and `insert_quote_for_job`; no call sites were modified.

### 2.3 Verdict

**PASS.** Desktop and mobile production behaviour is unchanged. Future admin “trigger sync” (if added) must follow brainstorming rules and desktop/mobile impact analysis.

---

## 3. Railway Deployment Safety

### 3.1 Constraint

All code must be deployable to Railway. No dependencies or build steps that conflict with `./scripts/run-server.sh` (README).

### 3.2 Findings

- **`run-server.sh` unchanged:** Still runs `uvicorn main:app` from `backend/`; no new steps or env checks.
- **No new dependencies:** `requirements.txt` unchanged; sync uses existing `supabase`, `httpx`, stdlib.
- **No new HTTP routes:** `main.py` does not import `job_performance_sync` or register any route. Sync is not part of the web process startup.
- **Startup path:** The app starts without `SERVICEM8_COMPANY_USER_ID` / `SERVICEM8_COMPANY_EMAIL`. Those are only required when **running** the sync (cron or script); missing them does not affect server boot.
- **Cron invocation:** Sync is designed to be run separately (e.g. Railway cron, GitHub Actions, or host cron calling the script). Not started by the web process.

### 3.3 Verdict

**PASS.** Deployment and run-server behaviour are unchanged. Sync is opt-in and does not affect web app startup or health.

---

## 4. UI/UX Best Practices

### 4.1 Constraint

Follow best UI/UX practice (e.g. Apple HIG where applicable: touch targets, safe areas, clarity).

### 4.2 Findings

- **No user-facing UI:** 59.6 introduces no screens, components, or interactive elements. The only “output” is the script’s JSON (e.g. `{"success": true, "jobs_processed": N, "rows_upserted": N}`) when run from the command line.
- **Operational UX:** Clear, machine-readable result shape and exit code (0/1) are appropriate for a cron/script. No user-facing copy or accessibility requirements apply to this change.

### 4.3 Verdict

**PASS (N/A).** No UI/UX impact; design is appropriate for a headless sync job.

---

## 5. Implementation Rigour

### 5.1 Correctness

- **Merge-before-upsert:** Existing `job_performance` row is fetched by `servicem8_job_id`, then only sync-owned fields are overlayed; `created_at` is removed before upsert. Admin-edited fields (e.g. bonus_period_id, callbacks, parts runs) are preserved. **Correct.**
- **Idempotency:** Upsert key is `servicem8_job_id`; re-runs do not create duplicates. **Correct.**
- **Required columns:** `invoiced_revenue_exc_gst` and `materials_cost` set to 0 until 59.7; `quoted_labor_minutes` set to 0 when no quote. Matches schema (NOT NULL). **Correct.**
- **Active quote:** `get_active_quote_for_job` orders by `is_final_quote DESC`, `updated_at DESC`, limit 1. Aligns with plan. **Correct.**
- **Token path:** Sync uses `get_sync_user_id()` → `get_tokens()`; no request user. **Correct.**

### 5.2 Gaps / Recommendations (non-blocking)

1. **`list_jobs` status parameter:** Status is currently only called with literals `"Completed"` and `"Invoiced"`. If the API is later called with user- or config-driven values, a single quote in `status` could break the filter or create risk. **Recommendation:** Restrict to a known set (e.g. allowlist) or sanitize (e.g. alphanumeric + underscore) before building `$filter`.
2. **`SYNC_OWNED_COLUMNS`:** Defined but not used in the merge loop (overlay is hardcoded). **Recommendation:** Either use it to drive the overlay (so new sync columns are single-sourced) or remove it to avoid dead code.
3. **Script run instructions:** README does not yet document how to run the sync (e.g. from backend with venv or via cron). **Recommendation:** Add a short “Job performance sync (59.6)” subsection under deployment or operations, referring to the script and env requirements (e.g. 59.23 or a dedicated ops doc).

### 5.3 Error Handling and Logging

- Sync returns a structured result and logs warnings/exception; script exits 1 on failure. **Acceptable.**
- Partial failure: if an exception occurs mid-loop, the result is not marked success and no partial count is reported for “rows_upserted” after the failure (current code sets `result["success"] = True` only after the full loop). **Correct.**

---

## 6. Task and Documentation Consistency

### 6.1 Section 59 and TASK_LIST

- **59.6** and **59.6.1–59.6.4** are marked complete in `docs/tasks/section-59.md`. Sub-tasks match the implementation (get_sync_user_id, list_jobs, get_active_quote_for_job, sync module). **Consistent.**
- **TASK_LIST.md:** Branch block shows `feature/section-59-cron-sync`; Related task 59.6 marked [x]; uncompleted table row updated to “59.7–59.23” with “59.6 (cron sync) done.” **Consistent.**
- No new uncompleted tasks were introduced; plan file reference is correct.

### 6.2 Verdict

**PASS.** Task list and section file accurately reflect completed work.

---

## 7. Regression and “Don’t Shake the Tree”

### 7.1 Existing Code Paths

- **main.py:** No new imports from `app.job_performance_sync`, `app.servicem8.get_sync_user_id`, or `app.servicem8.list_jobs`. Add to Job and Create New Job unchanged.
- **quotes.py:** `insert_quote_for_job` unchanged; only `get_active_quote_for_job` added. No callers of the new function except the sync module.
- **servicem8.py:** `get_effective_servicem8_user_id`, `fetch_job_by_generated_id`, `fetch_job_by_uuid` unchanged. New symbols are additive.

### 7.2 Verdict

**PASS.** No existing production code paths were modified; only additive backend code and a standalone script.

---

## 8. Sign-Off Summary

| Constraint | Result |
|------------|--------|
| Desktop vs. Mobile | **PASS** – No UI or layout impact. |
| Railway deployment | **PASS** – No change to run-server or startup; sync is out-of-process. |
| UI/UX | **PASS (N/A)** – No user-facing change. |
| Implementation | **PASS** – Logic and merge/upsert behaviour correct. |
| Task tracking | **PASS** – Section 59 and TASK_LIST consistent. |
| Regressions | **PASS** – No existing flows altered. |

**Recommendations (non-blocking):**

1. Harden `list_jobs` status (allowlist or sanitize) if the parameter is ever non-literal.
2. Use or remove `SYNC_OWNED_COLUMNS` in `job_performance_sync.py`.
3. Document sync execution (script + env) in README or ops doc (e.g. with 59.23).

**Audit complete.** Implementation is suitable for merge from a QA perspective subject to team approval.
