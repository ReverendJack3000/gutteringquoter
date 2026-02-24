# ServiceM8 sync: job_performance and token handling (Section 59)

This document describes how the **scheduled cron sync** for `job_performance` (Section 59.6/59.7/59.8) works, how **token expiry** is handled, **recommended sync frequency**, and how to add **additional syncs** (e.g. payment data, one-off backfill).

---

## 1. What the sync does

- **Trigger:** Run out-of-process (cron, scheduler, or manually). No webhook.
- **Script:** `scripts/run_job_performance_sync.py` (from project root) or `python -c "from app.job_performance_sync import run_sync; print(run_sync())"` from `backend/`.
- **Flow:** Resolve sync user (`SERVICEM8_COMPANY_USER_ID` or `SERVICEM8_COMPANY_EMAIL`) → get OAuth tokens → list Completed/Invoiced jobs from ServiceM8 → for each job resolve active quote, fetch job materials and activities → upsert `job_performance` (merge to preserve admin-edited fields) and create `job_personnel` baseline where missing.
- **Idempotency:** Upsert key = `servicem8_job_id`. Safe to run repeatedly.

---

## 2. Token expiry handling

### 2.1 How tokens are obtained and refreshed

- **Source:** `get_sync_user_id()` returns the company user id; `get_tokens(sync_user_id)` returns stored OAuth tokens from `servicem8_oauth`.
- **Refresh rule:** `get_tokens()` (in `backend/app/servicem8.py`) refreshes the access token **when it expires within 5 minutes** (i.e. if `time.time() >= expires_at - 300`). It calls ServiceM8’s refresh endpoint, then stores the new tokens. So a sync that runs while the token is still valid (or within the 5‑minute window) gets a valid or freshly refreshed token without extra logic.
- **On refresh failure:** If the refresh request fails (e.g. revoked refresh token, network error), `get_tokens()` logs a warning, **deletes the stored tokens** for that user, and returns `None`. The sync then exits with a clear error: *"No ServiceM8 tokens for sync user (connect ServiceM8 in app first)"*. The company user must reconnect ServiceM8 in the app to restore tokens.

### 2.2 Sync behaviour when tokens are missing or expire mid-run

- **No sync user:** If `SERVICEM8_COMPANY_USER_ID` / `SERVICEM8_COMPANY_EMAIL` is not set or cannot be resolved, the sync returns an error and does not call the API.
- **No tokens:** If `get_tokens(sync_user_id)` returns `None` (never connected or refresh failed and tokens deleted), the sync returns an error and does not call the API.
- **401 during sync:** If the first ServiceM8 API call (listing jobs) returns 401 Unauthorized (e.g. token expired or revoked between `get_tokens` and the request), the sync **retries once** after calling `get_tokens(sync_user_id)` again. That second call will refresh if the token is within the 5‑minute expiry window. If the retry still fails or tokens are still missing, the sync returns an error.

### 2.3 Recommendations

- **Run sync within token lifetime:** ServiceM8 access tokens typically last 1–2 hours. Running the sync at least once every 1–2 hours (or daily) keeps usage within a valid window; the 5‑minute pre-expiry refresh then keeps tokens fresh for the next run.
- **If sync fails with "No ServiceM8 tokens":** Have the company user open the app, go to ServiceM8 connection (or settings), and reconnect ServiceM8 so new tokens are stored. Then re-run the sync.

---

## 3. Sync frequency

- **Recommended:** Run the job_performance sync **at least daily** (e.g. once per night or early morning). Many teams run it **every 6–12 hours** so new Completed/Invoiced jobs appear within a few hours.
- **Idempotency:** The sync is idempotent (upsert by `servicem8_job_id`). Running it more often does not duplicate data; it only updates existing rows or adds new jobs.
- **Rate limits:** ServiceM8 may throttle if you make too many requests in a short period. Avoid running the sync more than once every few minutes unless you have confirmed higher limits. If you see rate-limit errors in logs, increase the interval between runs.
- **Scheduling:** Use your host’s cron (e.g. `0 */6 * * *` for every 6 hours), Railway cron (if available), or another scheduler. Ensure the sync process has access to the same env (e.g. `SUPABASE_*`, `SERVICEM8_*`, `SERVICEM8_COMPANY_USER_ID` or `SERVICEM8_COMPANY_EMAIL`) as the app.

---

## 4. Additional sync (payment data, one-off backfill)

### 4.1 Same token and user

- Any additional sync (e.g. payment data, extra job fields) that uses the ServiceM8 API should use the **same** pattern: `get_sync_user_id()` → `get_tokens(sync_user_id)` → use `access_token` for API calls. Token expiry handling and the 5‑minute refresh apply to all such syncs.

### 4.2 Adding a new sync script

- **Option A:** New script (e.g. `scripts/run_payment_sync.py`) that imports `get_sync_user_id` and `get_tokens` from `app.servicem8`, then calls your own sync logic (e.g. fetch job payments, write to a table). Reuse the same env and token handling as `run_job_performance_sync.py`.
- **Option B:** Extend `job_performance_sync.run_sync()` with an optional mode or flag (e.g. `backfill_only`, `since_date`) if the new logic fits the same run. Document the flag and any new env in this file or in README.

### 4.3 One-off backfill

- For a **one-off backfill** (e.g. historical jobs or a one-time data fix), run the existing script (or a variant) once with the same env. The sync merges by `servicem8_job_id`, so re-running over the same jobs is safe. If you add a date filter or job-id filter in the future, run the script with that filter; token handling and frequency guidance above still apply.

---

## 5. References

- **Sync implementation:** `backend/app/job_performance_sync.py` (`run_sync()`), `backend/app/servicem8.py` (`get_sync_user_id()`, `get_tokens()`, `list_jobs()`, etc.).
- **Cron plan:** `docs/plans/2026-02-24-section-59-cron-sync-job-performance.md`.
- **Env and deployment:** `README.md` (ServiceM8 company user, sync script), `docs/RAILWAY_DEPLOYMENT.md` (env vars, optional sync).
