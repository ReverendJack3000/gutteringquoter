# QA Audit Report: Section 59.19 (Persist Quotes) & 59.5 (Bonus Period Management)

**Date:** 2026-02-24  
**Role:** Strict Senior QA Engineer  
**Scope:** Implementation completed for 59.19 (persist to `public.quotes` on Add to Job / Create New Job) and 59.5 (bonus period backend API).  
**Constraints audited:** Desktop vs. Mobile production environments, Railway deployment safety, UI/UX best practices.

---

## 1. Executive summary

| Area | Result | Notes |
|------|--------|------|
| **Desktop production** | PASS | No UI changes; Add to Job / Create New Job flows unchanged. New backend behaviour is additive (quote persistence after success). |
| **Mobile production** | PASS | No viewport-specific logic added; job confirm overlay and feedback are shared. No new touch targets or layout changes. |
| **Railway deployment** | PASS | No new env vars, no new dependencies, Procfile and nixpacks.toml unchanged. |
| **UI/UX standards** | PASS with 1 recommendation | Error messaging and accessibility of existing flows preserved; one 503 copy improvement recommended. |
| **Regression risk** | LOW | Optional request field (`quote_materials`); backend fails closed on quote insert (503). One edge case noted below. |

**Verdict:** Implementation is **acceptable for production** from a QA perspective. One UX recommendation and one minor edge case are documented below; neither blocks release.

---

## 2. Desktop vs. mobile impact

### 2.1 Intended behaviour (single codebase, adaptive layout)

- **59.19:** Persisting quotes is backend-only from a user perspective. The only frontend change is adding `quote_materials` to the Add to Job and Create New Job request bodies (from `lastQuoteData.materials`, excluding REP-LAB). No new screens, modals, or controls.
- **59.5:** Bonus period API is admin-only and has **no UI** in this implementation. Consumed only via API (e.g. future admin UI or scripts).

### 2.2 Desktop

- **Add to Job / Create New Job:** Same overlay (`jobConfirmOverlay`), same buttons, same feedback element (`servicem8Feedback`). No layout or styling changes.
- **Viewport / CSS:** No new `data-viewport-mode` or desktop-only/mobile-only branches introduced.
- **Conclusion:** Desktop production behaviour is unchanged; no regression.

### 2.3 Mobile

- **Touch targets:** No new interactive elements; existing Add to Job / Create New Job buttons unchanged.
- **Orientation / safe areas:** No new modals or full-screen UI; job confirm overlay remains as before.
- **Feedback:** Same `servicem8Feedback` with `aria-live="polite"`; error/success messages still surfaced in the same way.
- **Conclusion:** Mobile production behaviour is unchanged; no regression.

### 2.4 Gaps / risks

- **None identified** for desktop or mobile specific to this change set.

---

## 3. Railway deployment safety

### 3.1 Build and runtime

- **Procfile:** Unchanged (`web: cd backend && python -m uvicorn main:app --host 0.0.0.0 --port $PORT`).
- **nixpacks.toml:** Unchanged (Python 3.12, `pip install -r backend/requirements.txt`).
- **backend/requirements.txt:** No new packages; quote and bonus_period logic use existing stack (FastAPI, Pydantic, Supabase client).

### 3.2 Environment and configuration

- **New env vars:** None. Quote persistence and bonus periods use existing `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- **Secrets / keys:** No new secrets; ServiceM8 and Supabase usage unchanged from prior behaviour.

### 3.3 Deployment conclusion

- **Safe to deploy:** No build, runtime, or config changes that could break or alter Railway deployment.

---

## 4. UI/UX practice review

### 4.1 Add to Job / Create New Job (59.19)

- **Success path:** Unchanged. User still sees “Added to job successfully” (and optional “Blueprint attached”) or “New job created. Note and blueprint added to both jobs.” No new steps or prompts.
- **Error handling:**  
  - **503 (quote persistence failure):** Backend returns `detail`: *"Quote saved to job but failed to record quote; please retry or contact support."*  
  - Frontend shows it via `typeof data.detail === 'string' ? data.detail : data.detail?.msg` → message is visible in `servicem8Feedback`.  
  - Buttons are re-enabled after error; loading state is cleared.
- **Recommendation (non-blocking):** When quote persistence fails, the job has already been updated in ServiceM8 (materials + note). Asking the user to “retry” could lead to **duplicate** materials/notes if they click Add to Job again. Suggested copy change:  
  *“Quote was added to the job in ServiceM8, but we couldn’t save a copy for bonus tracking. Please don’t add to this job again; contact support if you need this recorded.”*  
  This reduces the risk of duplicate job updates and sets correct expectations.
- **Accessibility:**  
  - `servicem8Feedback` has `aria-live="polite"`.  
  - `jobConfirmOverlay` has `role="dialog"`, `aria-labelledby="jobConfirmTitle"`, `aria-modal="true"`.  
  - No new focus traps or keyboard flows; existing `openAccessibleModal` behaviour unchanged.

### 4.2 Bonus periods (59.5)

- **User-facing UI:** None. API-only; no new screens, links, or controls. No UX impact until an admin UI is built (e.g. 59.17).

### 4.3 Consistency and clarity

- **Copy:** Existing success/error strings for Add to Job / Create New Job are unchanged. Only the new 503 message is new; wording improvement recommended above.
- **No new jargon** in user-visible strings; “quote” and “job” remain consistent with current product language.

---

## 5. Rigorous double-check: code and behaviour

### 5.1 Backend

- **Quote insert failure (Add to Job):** ServiceM8 calls (add_job_material, add_job_note) complete first; only then is `insert_quote_for_job` called. On Supabase failure we return 503 and do **not** return 200. So we do not report “success” without persisting the quote. **Correct.**
- **Quote insert failure (Create New Job):** Same pattern: job is created and materials/notes added in ServiceM8; then we try to persist the quote. On failure we return 503. **Correct.**
- **Empty or missing `quote_materials`:** Backend uses `body.quote_materials or []`; insert uses `items = []`. Row is still created with `servicem8_job_id`, `servicem8_job_uuid`, `labour_hours`, etc. **Correct.**
- **Bonus period API:** List/Create/Update are admin-only (`require_role(["admin"])`). Status validated to `open` | `processing` | `closed`; `start_date` ≤ `end_date` enforced. 404 on unknown period id. **Correct.**

### 5.2 Frontend

- **`quote_materials` construction:** Built from `lastQuoteData.materials`, filtering out `id === 'REP-LAB'` (case-normalised). Other materials include `id`, `qty`, and optional `name`, `item_number`, `servicem8_material_uuid`. **Correct.**
- **Create New Job body:** Includes `quote_materials: payload.quote_materials ?? []`, so backend always receives an array. **Correct.**
- **Error display:** On `!resp.ok`, message is taken from `data.detail` (string) or `data.detail?.msg`. FastAPI 503 sends `{"detail": "..."}` with a string; client shows it. **Correct.**

### 5.3 Edge case (minor)

- **Material line with empty `id`:** If `lastQuoteData.materials` contained an entry with no `id` (or empty string), we’d send `{ id: '', qty: ... }`. Backend `QuoteMaterialLine` has `id: str` with `min_length=1`, so Pydantic would reject the request (422). In practice, `lastQuoteData.materials` comes from `calculate-quote`, which returns product `id` per line, so this is unlikely. **Recommendation:** Optionally filter on the frontend: exclude lines where `(m.id || '').trim() === ''` before building `quote_materials`, to avoid 422 in edge cases.

---

## 6. Task list and documentation

- **Section 59:** 59.19 and 59.19.1 marked `[x]` in `docs/tasks/section-59.md`; 59.5 marked `[x]`.
- **TASK_LIST.md:** Section 59 row updated to reflect 59.19 and 59.5 done; remainder 59.6–59.23.
- **BACKEND_DATABASE.md:** `public.quotes` documented (§2.5), including `servicem8_job_uuid` and **items** shape; migrations list includes `add_quotes_servicem8_job_uuid`.
- **README.md:** Bonus period endpoints added to API list.

No inconsistencies found between code, task state, and docs.

---

## 7. Summary of findings

| # | Finding | Severity | Action |
|---|---------|----------|--------|
| 1 | 503 message encourages “retry” although job was already updated in ServiceM8; retry can duplicate materials/note | Low (UX) | **Implemented:** Backend 503 copy updated to discourage re-adding to same job (Add to Job and Create New Job). |
| 2 | Material line with empty `id` could cause 422; current data source makes this unlikely | Low (edge case) | **Implemented:** Frontend filters out materials with empty/whitespace `id` when building `quote_materials`. |

No high or medium severity issues. No blocking issues for production from a QA perspective.

---

## 8. Sign-off

**Audit status:** Complete.  
**Production readiness (within scope):** **Approved**, with the above low-severity recommendations applied at product’s discretion.
