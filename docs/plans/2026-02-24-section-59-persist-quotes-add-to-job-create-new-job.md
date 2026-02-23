# Section 59.19: Persist to public.quotes on Add to Job / Create New Job — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement saving to `public.quotes` when Add to Job or Create New Job succeeds, including `labour_hours`, `servicem8_job_id`, `servicem8_job_uuid`, and material-only `items` (59.19.1), so that 59.6 (webhook creating job_performance) can later set `quote_id` and `quoted_labor_minutes` from the active quote. No breaking changes to existing Add to Job / Create New Job flows; Railway-safe.

**Architecture:** Backend persists one quote row per successful Add to Job or Create New Job, after ServiceM8 calls succeed. Request bodies are extended with an optional `quote_materials` array (id, qty, optional name/item_number/servicem8_material_uuid) so we store material lines suitable for Missed Materials; labour is stored in `labour_hours`. Frontend sends `quote_materials` from `lastQuoteData.materials` (exclude REP-LAB) when present. Schema: ensure `public.quotes` has `labour_hours`, `servicem8_job_uuid` (nullable); `items` and `is_final_quote` already exist.

**Tech Stack:** FastAPI, Supabase (Python client), vanilla JS frontend. Single codebase (desktop + mobile); deploy via `./scripts/run-server.sh` / Railway.

---

## Prerequisites

- **Task list:** Section 59 → `docs/tasks/section-59.md`. Mark 59.19 and 59.19.1 [x] when done; if Section 59 uncompleted table row changes, update `TASK_LIST.md` per `.cursor/rules/task-list-completion.mdc`.
- **Decisions:** Active quote = last quote (by updated_at) for that servicem8_job_id when job moves to Scheduled/In Progress; `is_final_quote` set by webhook (59.6 later). Quote items = material lines only, at least `{ id, qty }`; document shape in BACKEND_DATABASE.md.
- **Key files:**
  - Backend: `backend/main.py` — Add to Job ~1064–1120, Create New Job ~1198–1331; request models ~329–361.
  - Backend: new or existing module for quote persistence (e.g. `backend/app/quotes.py`) or in main.py.
  - Frontend: `frontend/app.js` — `getAddToJobPayload` ~3251, Create New Job payload construction, `lastQuoteData`.
  - Schema: `docs/BACKEND_DATABASE.md` — § public.quotes, Section 59 decisions, Audit Material quoting.
- **Verification:** Add to Job and Create New Job flows still work (manual + existing E2E if any); no new env vars required for Railway.

---

## Task 1: Verify and extend public.quotes schema

**Files:**
- Inspect: Supabase MCP `list_tables` / `execute_sql` for `public.quotes` columns.
- Create: Supabase migration (via MCP `apply_migration` or Dashboard) if columns missing.
- Modify: `docs/BACKEND_DATABASE.md` — document `public.quotes` columns and `items` shape (59.19.1).

**Step 1.1: Inspect public.quotes**

- Use Supabase MCP: `mcp_supabase_execute_sql` with project_id `rlptjmkejfykisaefkeh`, query: `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'quotes' ORDER BY ordinal_position;`
- Record which columns exist: `id`, `quote_number`, `servicem8_job_id`, `items` (jsonb), `is_final_quote` (added in 59.4), and whether `labour_hours` (numeric or float) and `servicem8_job_uuid` (uuid, nullable) exist.

**Step 1.2: Add migration if labour_hours or servicem8_job_uuid missing**

- If `labour_hours` missing: add column `labour_hours numeric`, nullable (or NOT NULL with default 0 if we always set it).
- If `servicem8_job_uuid` missing: add column `servicem8_job_uuid uuid NULL`.
- Migration name example: `add_quotes_labour_hours_and_servicem8_job_uuid`.
- Do not alter `items` or `is_final_quote`; they already exist.

**Step 1.3: Document public.quotes and items shape in BACKEND_DATABASE.md**

- In BACKEND_DATABASE.md, add or update a short subsection for `public.quotes`: list columns (id, quote_number, servicem8_job_id, servicem8_job_uuid, labour_hours, items, is_final_quote, created_at, updated_at, etc.).
- Document **items (JSONB)** shape per 59.19.1: array of **material** lines only (exclude labour). Each element: at least `{ "id": "<product_id>", "qty": <number> }`; optionally `name`, `item_number`, `servicem8_material_uuid`. Use for Missed Materials comparison with ServiceM8 job materials. Reference Section 59 and “Audit: Material quoting and public.quotes.items”.

---

## Task 2: Backend — quote persistence helper and request models

**Files:**
- Create or modify: `backend/app/quotes.py` (new module) or add in `backend/main.py`.
- Modify: `backend/main.py` — request models (AddToJobRequest, CreateNewJobRequest).

**Step 2.1: Define quote snapshot model and insert helper**

- Add Pydantic model for incoming quote snapshot, e.g. `QuoteMaterialLine(id: str, qty: float, name: Optional[str] = None, item_number: Optional[str] = None, servicem8_material_uuid: Optional[str] = None)`. Labour is not part of this (stored in labour_hours).
- Implement `insert_quote_for_job(supabase_client, user_id: uuid, servicem8_job_id: str, servicem8_job_uuid: Optional[str], labour_hours: float, quote_total: float, material_cost: float, items: list[dict]) -> uuid`.
  - Build `items` JSONB from the list of material lines (each at least `id`, `qty`; include optional name, item_number, servicem8_material_uuid if present).
  - Insert into `public.quotes`: user_id (or leave null if quotes table has no user_id — check schema), servicem8_job_id, servicem8_job_uuid, labour_hours, quote_total/material_cost if columns exist, items, is_final_quote = false. Return quote id (uuid).
- Use existing Supabase client from app state (same as diagrams/products). Handle duplicates: one quote per Add to Job / Create New Job call; no uniqueness constraint on (servicem8_job_id) so multiple quotes per job are allowed (active quote chosen later by is_final_quote / updated_at).

**Step 2.2: Extend AddToJobRequest and CreateNewJobRequest**

- Add optional field: `quote_materials: Optional[list[QuoteMaterialLine]] = None`. When present, backend will persist to public.quotes with items = quote_materials (material-only; no labour). When absent, persist quote with items = [] and labour_hours from body (so we still get labour_hours and job ids for 59.6).

---

## Task 3: Backend — call quote persistence after Add to Job and Create New Job success

**Files:**
- Modify: `backend/main.py` — `api_servicem8_add_to_job`, `api_servicem8_create_new_job`.

**Step 3.1: Add to Job — after ServiceM8 success, persist quote**

- After `add_job_note` succeeds and before returning response:
  - Resolve `generated_job_id`: already obtained via `sm8.fetch_job_by_uuid(tokens["access_token"], body.job_uuid)` for the response.
  - Call `insert_quote_for_job(..., servicem8_job_id=generated_job_id, servicem8_job_uuid=body.job_uuid, labour_hours=body.labour_hours, quote_total=body.quote_total, material_cost=body.material_cost, items=body.quote_materials or [])`.
  - Use current `user_id` from `get_current_user_id` for quote row if table has user_id.
  - On Supabase errors: log and either re-raise (fail the request) or swallow and still return success — **decision:** log and still return 200 so Add to Job UX is not broken; quote persistence is best-effort for now, or fail fast for data integrity. Prefer **fail fast** so we don’t silently miss quotes; catch and return 503 or 500 with message so client can retry.
- Ensure response still returns `success`, `uuid`, `generated_job_id` as today.

**Step 3.2: Create New Job — after all ServiceM8 calls succeed, persist quote for the new job only**

- After returning `new_job_uuid` and `generated_job_id`, before the return statement:
  - Call `insert_quote_for_job(..., servicem8_job_id=generated_job_id, servicem8_job_uuid=new_job_uuid, labour_hours=body.labour_hours, quote_total=body.quote_total, material_cost=body.material_cost, items=body.quote_materials or [])`.
  - Same error policy: log and fail the request so we don’t silently skip quote persistence.
- Return unchanged response shape.

---

## Task 4: Frontend — send quote_materials when calling Add to Job and Create New Job

**Files:**
- Modify: `frontend/app.js` — where Add to Job and Create New Job request bodies are built.

**Step 4.1: Build quote_materials from lastQuoteData.materials (exclude labour)**

- When building the payload for `POST /api/servicem8/add-to-job`, if `lastQuoteData?.materials` exists, set `quote_materials` to an array of material lines only: filter out any line with `id === 'REP-LAB'` (or assetId REP-LAB). Each element: `{ id: m.id, qty: m.qty }`; optionally include `name`, `item_number`, `servicem8_material_uuid` if available on the object. If no lastQuoteData or no materials, send `quote_materials: []` or omit (backend treats None as []).
- Use the same structure for Create New Job request body (same payload shape as Add to Job for quote fields).

**Step 4.2: Ensure labour_hours and totals are already sent**

- Add to Job and Create New Job already send labour_hours, quote_total, material_cost. No change needed unless field names differ; ensure backend reads from body.

**Step 4.3: Regression check**

- Add to Job flow: open quote modal, add items, Calculate Quote, then Add to Job with a valid job — should still succeed; verify in Supabase that a new row appears in `public.quotes` with correct servicem8_job_id, servicem8_job_uuid, labour_hours, and items (material lines only).
- Create New Job flow: same; verify quote row for the **new** job (new_job_uuid / generated_job_id), not the original.

---

## Task 5: Document items shape and update section file

**Files:**
- Modify: `docs/BACKEND_DATABASE.md` — “Audit: Material quoting and public.quotes.items” or new subsection: intended `items` shape (59.19.1).
- Modify: `docs/tasks/section-59.md` — mark 59.19 and 59.19.1 [x] when implementation is complete.
- Modify: `TASK_LIST.md` — only if Section 59 is fully complete (remove row); otherwise leave uncompleted row as is.

**Step 5.1: Document items shape**

- In BACKEND_DATABASE.md, state that when persisting to `public.quotes` (Add to Job / Create New Job), `items` is set to a JSONB array of **material** lines only. Each element: at least `{ "id": "<product_id>", "qty": <number> }`; optionally `name`, `item_number`, `servicem8_material_uuid`. Labour (REP-LAB) is excluded. This supports future Missed Materials detection (compare to ServiceM8 job materials).

**Step 5.2: Mark tasks complete**

- In `docs/tasks/section-59.md`, set `- [x] **59.19**` and `- [x] **59.19.1**`.
- If Section 59 still has other uncompleted tasks, do not remove the Section 59 row from `TASK_LIST.md`; only update the row description if helpful (e.g. “59.19 done; remainder: 59.5, 59.6, …”).

---

## Task 6: Verification and Railway safety

**Files:**
- Run: `./scripts/run-server.sh` (or uvicorn from backend); test Add to Job and Create New Job from UI.
- Optional: run E2E if quote/Add to Job paths are covered.

**Step 6.1: Manual verification**

- Start server, sign in, open a diagram, add products and labour, Calculate Quote, then Add to Job (with valid job lookup). Check Supabase `public.quotes`: new row with servicem8_job_id, servicem8_job_uuid, labour_hours, items (material-only). Repeat for Create New Job; confirm quote for new job.
- Confirm desktop and mobile (or viewport override) unchanged: no new UI, same buttons and flows.

**Step 6.2: No new env vars**

- No new environment variables for quote persistence; Supabase client already configured. Railway deploy unchanged.

---

## Edge cases

- **Multiple quotes per job:** Allowed; we insert one row per Add to Job / Create New Job. Active quote for 59.6 will be chosen by is_final_quote (set by future webhook) or “last by updated_at” for that servicem8_job_id.
- **quote_materials omitted or empty:** Backend persists quote with items = [] and labour_hours from body; job still linked via servicem8_job_id and servicem8_job_uuid.
- **Supabase down or insert fails:** Backend fails the request (e.g. 503) so client can retry; do not return Add to Job success without persisting quote when we intend to persist.
- **REP-LAB in lastQuoteData.materials:** Frontend must exclude labour from quote_materials; backend does not add labour to items (labour_hours is separate column).

---

## Summary

| Task | What |
|------|------|
| 1 | Verify public.quotes schema; add migration for labour_hours and servicem8_job_uuid if missing; document table and items shape in BACKEND_DATABASE.md |
| 2 | Quote snapshot model and insert_quote_for_job(); extend request models with optional quote_materials |
| 3 | After Add to Job and Create New Job success, call insert_quote_for_job(); fail request on DB error |
| 4 | Frontend: send quote_materials from lastQuoteData.materials (exclude REP-LAB) in Add to Job and Create New Job |
| 5 | Document items shape (59.19.1); mark 59.19 and 59.19.1 [x] in section-59.md; update TASK_LIST.md only if section complete |
| 6 | Manual verification; confirm Railway-safe and no new env vars |

After this plan, 59.6 (webhook creating job_performance in draft and setting quote_id from active quote) can use the persisted quotes; 59.5 (bonus period management) remains independent and can be implemented in parallel or next.
