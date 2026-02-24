# QA Audit Report: Section 59.9 Implementation (Base Job GP)

**Date:** 2026-02-24  
**Scope:** Post-implementation audit of 59.9 (Base Job GP calculation), 59.9.1–59.9.3  
**Auditor role:** Strict Senior QA Engineer  
**Constraints checked:** Desktop vs Mobile production, Railway deployment safety, UI/UX best practices, task-list and doc consistency.

---

## 1. Executive summary

| Outcome | Result |
|--------|--------|
| **Desktop / Mobile impact** | **PASS** — Backend-only; no frontend, no viewport/adaptive logic touched. |
| **Railway deployment safety** | **PASS** — No Procfile, run-server.sh, nixpacks, or required env changes; optional env only. |
| **UI/UX standards** | **N/A** — No UI changes; API contract and auth align with existing bonus routes. |
| **Task list & documentation** | **PASS** — 59.9, 59.9.1–59.9.3 marked complete; BACKEND_DATABASE and .env.example updated; TASK_LIST index unchanged (section not fully complete). |
| **Regression / “don’t shake the tree”** | **PASS** — No edits to sync, dashboard, periods, or frontend; additive code only. |

**Verdict:** Implementation is safe for production. No blocking issues. One optional recommendation (see §5).

---

## 2. Desktop vs. Mobile production

**Constraint:** Same codebase serves desktop and mobile; production behaviour must not regress on either.

| Check | Result | Evidence |
|-------|--------|----------|
| Frontend touched? | **No** | No changes to `frontend/` (index.html, app.js, styles.css). |
| Viewport / layout logic in backend? | **No** | Grep for `data-viewport-mode`, `viewportMode`, `layoutState` in `backend/`: no matches. |
| New API consumed by frontend? | **No** | New endpoint `GET /api/bonus/job-performance/{id}` is admin-only and not called by existing frontend. |
| Existing bonus/technician flows? | **Unchanged** | `_fetch_period_jobs_with_fallback`, `_build_provisional_technician_dashboard_payload`, technician routes unchanged. |

**Conclusion:** Desktop and mobile production behaviour is unchanged. 59.9 is backend-only.

---

## 3. Railway deployment safety

**Constraint:** Deploy via `./scripts/run-server.sh` and Railway (Procfile, nixpacks); no new required env or build steps that could break deploy.

| Check | Result | Evidence |
|-------|--------|----------|
| **Procfile** | Unchanged | Not modified (still `web: cd backend && … uvicorn main:app --host 0.0.0.0 --port $PORT`). |
| **scripts/run-server.sh** | Unchanged | Still runs `python3 -m uvicorn main:app --reload --host "$HOST" --port "$PORT"`. |
| **nixpacks.toml / railway.json** | Unchanged | Not modified. |
| **backend/requirements.txt** | Unchanged | No new dependencies; only stdlib + existing FastAPI/Supabase. |
| **Startup behaviour** | Safe | `main.py` does not import or invoke `job_performance_sync`; new modules `company_settings` and `bonus_calc` are only used when the new GET route is called. No sync or heavy init at import. |
| **New env vars** | Optional only | `BONUS_LABOUR_RATE` added to `.env.example` as commented optional; app runs without it (fallback: company_settings → 35.0). No new *required* vars. |

**Conclusion:** Railway and run-server behaviour unchanged. Deployment remains safe.

---

## 4. UI/UX and API standards

**Constraint:** Follow best UI/UX practice; where no UI exists, API and auth should be consistent and predictable.

| Check | Result | Notes |
|-------|--------|--------|
| UI changes | **None** | 59.9 is backend-only; no UI/UX implementation to review. |
| API auth | **Consistent** | New route uses `require_role(["admin"])` like other bonus admin routes (e.g. PATCH job-personnel, PATCH periods). |
| API contract | **Stable** | Response = existing `BONUS_JOB_PERFORMANCE_COLUMNS` row plus `job_gp` (float); same shape as other bonus job reads + one computed field. |
| Error behaviour | **Clear** | 400 for invalid UUID; 404 when row not found; 500 on unexpected errors with logging. |
| Idempotency / safety | **Read-only** | GET only; no state change. |

**Conclusion:** No UI to audit; API design and auth align with existing bonus routes and are suitable for future Admin UI (59.17).

---

## 5. Implementation and code quality

### 5.1 Formula and data usage

- **Base Job GP:** `invoiced_revenue_exc_gst − materials_cost − (standard_parts_runs × 20)`. Implemented as specified.
- **Excluded from formula:** `missed_materials_cost`, `callback_cost`, `seller_fault_parts_runs` are not used in `compute_job_gp` (correct for Step 1).
- **Nulls:** All numeric inputs default to 0 via `_to_float`; no KeyError or TypeError from missing keys.
- **Constants:** `PARTS_RUN_DEDUCTION_DOLLARS = 20` and `DEFAULT_BONUS_LABOUR_RATE = 35.0` used; no magic numbers in formula.

### 5.2 Rate reader (59.9.1)

- **Order:** company_settings (id=1) → env `BONUS_LABOUR_RATE` → 35.0. Matches plan.
- **Logging:** Debug on DB failure; INFO when using env or default (acceptable; not called by new GET so no per-request spam).
- **Not used in 59.9 response:** By design; rate is for 59.10+.

### 5.3 New GET route

- **Path:** `GET /api/bonus/job-performance/{job_performance_id}`; UUID validated; fetch by `id` with `BONUS_JOB_PERFORMANCE_COLUMNS`.
- **Response:** `dict(rows[0])` then `row["job_gp"] = compute_job_gp(row)` — copy used, no mutation of shared response.
- **Supabase types:** Numeric columns may be `Decimal`; `float(value)` in `_to_float` handles that in Python. No issue observed.

### 5.4 Documentation

- **BACKEND_DATABASE.md:** “Job GP calculation (59.9)” subsection added with formula and rate source. Accurate.
- **.env.example:** Optional `BONUS_LABOUR_RATE=35` with comment. Clear.

---

## 6. Task list and index

| Item | Expected | Verified |
|------|----------|----------|
| 59.9 | Marked complete | `[x]` in section-59.md |
| 59.9.1, 59.9.2, 59.9.3 | Marked complete | All `[x]` in section-59.md |
| TASK_LIST.md uncompleted row | Row 59.9–59.23 remains (section not fully complete) | Row still present; no removal. Correct. |

---

## 7. Regression and “don’t shake the tree”

| Area | Status |
|------|--------|
| **job_performance_sync.py** | Not modified; SYNC_OWNED_COLUMNS and merge logic unchanged. |
| **bonus_dashboard.py** | Not modified. |
| **bonus_periods.py** | Not modified. |
| **Existing bonus routes** | Unchanged; new route appended after PATCH job-personnel, before GET technician/period-current. |
| **Frontend** | No changes. |
| **Quotes / diagrams / products / auth** | No changes. |

Only additive changes: two new modules, one new route, one .env.example comment, one BACKEND_DATABASE subsection.

---

## 8. Optional recommendation

- **Future Admin UI (59.17):** When building job-detail or period job list, the response of `GET /api/bonus/job-performance/{id}` does not include `quote_id`. If Admin UI needs to show or link to the linked quote, consider adding `quote_id` to the select (or a separate “detail” constant) in a later task (e.g. 59.16.2). Not required for 59.9; documented here to avoid surprise.

---

## 9. Sign-off

- **Desktop vs Mobile:** PASS — No impact on production UI.
- **Railway:** PASS — No deploy or startup risk.
- **UI/UX:** N/A (backend-only); API and auth consistent.
- **Tasks & docs:** PASS — Complete and consistent.
- **Regression:** PASS — Additive only; tree not shaken.

**Audit complete.** Implementation approved for production from a QA perspective.
