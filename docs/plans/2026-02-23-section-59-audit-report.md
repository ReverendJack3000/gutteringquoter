# Audit Report: Section 59 ServiceM8 job link (59.4.1–59.4.3)

**Date:** 2026-02-23  
**Scope:** Implementation of nullable `servicem8_job_uuid` (schema, diagrams API, frontend auto-save).  
**Constraints reviewed:** Desktop vs. mobile production, Railway deployment safety, UI/UX best practices.

---

## 1. Executive summary

| Constraint | Status | Notes |
|------------|--------|--------|
| **Desktop vs. mobile** | **PASS** | No viewport/layout logic; same API and flows for both. No `data-viewport-mode` or mobile-only branches introduced. |
| **Railway deployment** | **PASS** | No new env vars, no build changes, no Procfile/nixpacks changes. Schema change is Supabase-only. |
| **UI/UX** | **PASS** | No visible UI change; same messages, timing, and flows. Optional payload addition only. |

**Verdict:** Implementation is safe for production desktop and mobile and for Railway. One minor recommendation (list_diagrams defensive str) and one doc wording fix noted below.

---

## 2. Desktop vs. mobile production

### 2.1 Single codebase, adaptive layout

- **Architecture:** One codebase serves desktop and mobile via adaptive layout (viewport detection, `data-viewport-mode` in JS/CSS). Changes must not break either environment.
- **What changed:** Schema (Supabase), backend request/response (optional `servicem8JobUuid`), and frontend payload (sending optional `jobUuid` in two success paths). No new UI, no new modals, no new CSS, no viewport checks.

### 2.2 Verification

| Area | Finding |
|------|---------|
| **Backend** | `SaveDiagramRequest` / `UpdateDiagramRequest` and diagram handlers are viewport-agnostic. No `viewport` or `mobile` branching. |
| **Frontend** | `autoSaveDiagramWithJobNumber(jobNumber, jobUuid)` is used from the same Add to Job and Create New Job success paths that run on both desktop and mobile. No `layoutState.viewportMode` or `data-viewport-mode` references in changed code. |
| **API contract** | POST/PATCH `/api/diagrams` accept optional `servicem8JobUuid`; GET list/get return optional `servicem8JobUuid`. Old clients that omit it are unchanged. |
| **User-facing text** | No change to “Project saved with Job #…”, “Added to job successfully”, or “New job created…” messages. No new labels or controls. |

**Conclusion:** Desktop and mobile behaviour is unchanged except that both now send and store an optional job UUID when available. No environment-specific branches were added.

---

## 3. Railway deployment safety

### 3.1 Deployment chain

- **Procfile:** `web: cd backend && python -m uvicorn main:app --host 0.0.0.0 --port $PORT` — **unchanged.**  
- **nixpacks.toml:** Python 3.12, pip install from `backend/requirements.txt` — **unchanged.** No new system or npm dependencies.  
- **run-server.sh / README:** No references in changed files; no new setup steps.  
- **Environment variables:** No new `SUPABASE_*`, `PWA_*`, or other env vars. Backend and frontend use existing config.

### 3.2 Database

- **Migration:** Applied in Supabase (project `rlptjmkejfykisaefkeh`) via MCP `apply_migration`. Railway does not run migrations; they are applied to the linked Supabase project.  
- **Backward compatibility:** New columns are nullable. Existing rows have `NULL` for `servicem8_job_uuid`. Existing INSERT/UPDATE paths that do not set the column remain valid.  
- **Supabase client:** Backend uses existing `get_supabase()`; no new connection or config.

### 3.3 Build and runtime

- **Build:** No new build step (frontend remains vanilla HTML/CSS/JS; no bundler).  
- **Runtime:** No new startup dependency or health-check change. Diagram endpoints use the same auth and error handling as before.

**Conclusion:** Deployment to Railway is unaffected. No config or build changes required.

---

## 4. UI/UX best practices

### 4.1 No visible change

- **Add to Job / Create New Job:** Same confirmation overlay, same buttons, same success/error feedback and timing (e.g. 800 ms before hide + auto-save).  
- **Save flow:** Auto-save still runs after success; user still sees “Project saved with Job #…”. No new steps, no new modals, no new form fields.  
- **Accessibility:** No new interactive elements; no ARIA or focus changes. Existing modal and feedback patterns unchanged.

### 4.2 Data and robustness

- **Add to Job:** `jobUuidForSave` is read from `overlay?.dataset?.jobUuid` **before** `setTimeout`, so it is captured while the overlay is still in DOM. Matches existing pattern for `jobNumberForSave`.  
- **Create New Job:** `newJobNumber` and `newJobUuid` are taken from the API response; empty string fallback is safe and backend accepts optional `servicem8JobUuid`.  
- **Backward compatibility:** If `jobUuid` is missing or empty, `autoSaveDiagramWithJobNumber` only sends `servicem8JobId`; behaviour matches prior implementation.

### 4.3 Error handling and feedback

- **Backend:** Invalid UUID is normalized to `None` (not 400), so legacy or malformed clients do not get new errors.  
- **Frontend:** Same `showMessage(…, 'success'|'error')` and `showFeedback` usage; no new error paths.  
- **User message:** Still “Project saved with Job #&lt;number&gt;” — no mention of UUID (correct; UUID is an internal/link identifier).

**Conclusion:** No UI/UX regressions; behaviour and feedback remain consistent with existing patterns.

---

## 5. Implementation correctness and edge cases

### 5.1 Backend

| Item | Implementation | Status |
|------|----------------|--------|
| **UUID validation** | `_parse_servicem8_job_uuid()` returns canonical string or `None`; catches `ValueError`, `TypeError`. Invalid input is not persisted. | OK |
| **create_diagram** | Only adds `servicem8_job_uuid` to insert when `parsed_uuid is not None`. Return includes `servicem8JobUuid` from `insert`. | OK |
| **update_diagram** | Only updates `servicem8_job_uuid` when `servicem8_job_uuid is not None`; value is parsed (empty string → None, clearing column). | OK |
| **list_diagrams** | Selects `servicem8_job_uuid`; uses `r.get("servicem8_job_uuid")` for condition and `str(r["servicem8_job_uuid"])` only when value is not None. Safe because we only use `r["..."]` in the truthy branch. | OK (see 5.3) |
| **get_diagram** | Returns `servicem8JobUuid` via `str(suuid) if suuid is not None else None`. Handles missing/None. | OK |

### 5.2 Frontend

| Item | Implementation | Status |
|------|----------------|--------|
| **Signature** | `autoSaveDiagramWithJobNumber(jobNumber, jobUuid)` — second param optional; callers that pass one argument still work. | OK |
| **Body** | `servicem8JobUuid` added only when `jobUuid && String(jobUuid).trim()`; avoids sending empty or whitespace. | OK |
| **Add to Job** | `jobUuidForSave = overlay?.dataset?.jobUuid || ''` captured before `setTimeout`; overlay still in DOM. | OK |
| **Create New Job** | `newJobNumber = data.generated_job_id \|\| data.new_job_uuid || ''`; `newJobUuid = data.new_job_uuid || ''`; both passed to save. | OK |

### 5.3 Minor recommendation (non-blocking)

- **list_diagrams:** The expression `str(r["servicem8_job_uuid"]) if r.get("servicem8_job_uuid") is not None else None` is correct: we only use `r["servicem8_job_uuid"]` when `r.get("servicem8_job_uuid") is not None`. For extra defensiveness against unexpected types from the client, the branch could use `r.get("servicem8_job_uuid")` again: `str(r.get("servicem8_job_uuid")) if r.get("servicem8_job_uuid") is not None else None` to avoid any possibility of KeyError if the row shape ever differed. **Current code is correct;** this is an optional hardening.

### 5.4 Edge cases covered

- **Missing overlay / no job uuid:** `overlay?.dataset?.jobUuid || ''` → empty string → not added to body. Backend receives no `servicem8JobUuid`.  
- **Create New Job returns only one of number/uuid:** `newJobNumber` and `newJobUuid` can be empty string; save still runs when `newJobNumber` is truthy; backend accepts optional uuid.  
- **Invalid UUID from client:** Backend stores `None` (does not persist invalid value).  
- **Existing diagrams (pre-migration rows):** Column exists, value NULL; `r.get("servicem8_job_uuid")` is None; API returns `servicem8JobUuid: null`.  
- **PATCH with servicem8JobUuid omitted:** Field not in request; `body.servicem8JobUuid` is None; `update_diagram` does not add `servicem8_job_uuid` to `updates`; column unchanged.

---

## 6. Task list and documentation

### 6.1 Section file and index

- **docs/tasks/section-59.md:** 59.4.1, 59.4.2, 59.4.3 marked `[x]`; 59.4.4 left `[ ]` (optional). “Agreed first implementation step” and plan reference present.  
- **TASK_LIST.md:** Section 59 remains in the uncompleted table (other tasks in the section are open). No incorrect removal.

### 6.2 BACKEND_DATABASE.md

- **saved_diagrams:** Table lists `servicem8_job_id` and `servicem8_job_uuid` with types and migration name.  
- **Bonus / job performance:** `job_performance` notes `servicem8_job_uuid` (nullable); migrations list includes `add_servicem8_job_uuid_to_saved_diagrams_and_job_performance`.  
- **Audit: ServiceM8 job syncing:** Current flow table and Gaps/Recommendations updated to reflect schema done and 59.4.2–59.4.3 implemented.

### 6.3 Doc wording fix (optional)

- In the Audit table, the “After Add to Job success” row still says “API/frontend to persist it are in Section 59 tasks 59.4.2–59.4.3” and the Create New Job row says “59.4.2–59.4.3 will store both.” These could be updated to past tense (“are implemented” / “now store both”) for consistency. **Not a functional issue.**

---

## 7. Summary table

| Check | Result |
|-------|--------|
| Desktop behaviour unchanged | Yes |
| Mobile behaviour unchanged | Yes |
| No viewport/mobile-only branches | Yes |
| Railway: Procfile / nixpacks / env unchanged | Yes |
| Railway: No new build step | Yes |
| Backward compatibility (old clients, existing rows) | Yes |
| Invalid UUID handled without breaking clients | Yes |
| No new user-facing UI or copy | Yes |
| Same error/success feedback and timing | Yes |
| Task checkboxes and docs consistent | Yes |

**Overall:** The implementation satisfies the core constraints (Desktop vs. mobile production, Railway deployment safety, UI/UX best practices). No blocking issues; optional items are minor (defensive list_diagrams and doc tense).
