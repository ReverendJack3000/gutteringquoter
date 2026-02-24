# Plan: Section 59 data and flow decisions

**Date:** 2026-02-23  
**Scope:** Documentation only. No code or schema changes.  
**Purpose:** Record locked decisions for job_performance creation, data ownership, quote–job link, revenue/materials/time sources, and standardised rate so 59.4–59.8 and related tasks can be implemented consistently.

**Update (2026-02-24):** We use a **scheduled cron sync** instead of a ServiceM8 webhook to create job_performance rows. The trigger is cron listing Completed/Invoiced jobs from the API; no inbound webhook. See **`docs/plans/2026-02-24-section-59-cron-sync-job-performance.md`**.

---

## 1. When is a job_performance row created?

**Decision:** Triggered **automatically via a ServiceM8 webhook** when a job’s status changes to **Completed** or **Invoiced**. The webhook will be set up later to POST to our server.

New rows are created in an **“Unverified” or “Draft”** state. Payroll is too sensitive to fully automate without a human glance; admin must verify before the row is treated as locked for the period.

**Implementation notes:**

- **Cron sync (not webhook):** Run a scheduled job that calls ServiceM8 list jobs with filter status Completed/Invoiced; for each job, resolve active quote and upsert into `job_performance` with status = draft. See `docs/plans/2026-02-24-section-59-cron-sync-job-performance.md`.
- Schema: **status** column on `job_performance` (draft/verified/processed). Only verified/processed rows in period pot.

---

## 2. Who populates job_performance and job_personnel?

**Decisions:**

| Source | job_performance fields | job_personnel |
|--------|------------------------|---------------|
| **ServiceM8 API (auto)** | invoiced_revenue_exc_gst, materials_cost, servicem8_job_id (and servicem8_job_uuid from job) | — |
| **Admin/System** | quote_id (matched automatically), bonus_period_id | — |
| **Tech/Admin manual** | callbacks (is_callback, callback_reason, callback_cost), seller_fault_parts_runs, standard_parts_runs, missed_materials_cost as per plan | onsite_minutes, travel_shopping_minutes (admin verifies/splits from raw time data); is_seller, is_executor |

- **quoted_labor_minutes:** Set from the linked quote when creating/updating job_performance (59.3 Option A: `round(quote.labour_hours * 60)`).
- **Revenue for GP:** Base GP on the **invoiced amount** (job.total_invoice_amount).

---

## 3. Quote–job link (multiple quotes per job)

**Decision:** The **active quote** for a job is the **last** quote generated **before** the job is marked **“Scheduled”** or **“In Progress”**.

**Rationale:** If a tech revises a quote (e.g. adds 2 hours labour) because the scope changed before work started, they deserve that updated grace period for estimation accuracy. Using only the first quote would penalize them for legitimate scope changes.

**Implementation options:**

- Add an **`is_final_quote`** boolean to `public.quotes` (set when we know the job has moved to Scheduled/In Progress, or when we persist a quote and can compare job status).
- Or: when matching quote to job_performance, **query the most recent** quote (by `created_at` or similar) for that `servicem8_job_id` where the quote was created before the job’s transition to Scheduled/In Progress. This may require storing job status at quote-save time or querying ServiceM8 for job status history if available.

---

## 4. Revenue: job.total_invoice_amount

**Decision:** Base GP on the **invoiced amount** — use **job.total_invoice_amount** from the ServiceM8 job object. No need to aggregate from Job Payments for this purpose unless we discover total_invoice_amount is unreliable or missing.

---

## 5. Job Materials (materials cost and pricing)

**Decision:** The ServiceM8 **JobMaterial** endpoint has what we need. We already have material UUIDs in ServiceM8 for our materials. For pricing and GP:

- **Pull pricing/GP from our database** (e.g. `public.products` or quote snapshot).
- **Fall back to ServiceM8** (JobMaterial price/cost) if price or cost is missing from our data.

---

## 6. Job Activities (time tracking)

**Context:** ServiceM8 time tracking (check-in/check-out) is notoriously unreliable because techs forget to tap the buttons. The API cannot reliably distinguish “on site” vs “drove to supplier for parts” unless they use specific, custom tasks.

**Decision:**

- **Pull raw JobActivity data** as a **baseline for total hours** (for the job or per assignee).
- **Require Admin to verify and split** the hours into **onsite_minutes** and **travel_shopping_minutes** in our app’s frontend **before locking the period**. Do not auto-populate onsite vs travel from the API for payroll.

---

## 7. Standardised bonus labour rate ($35)

**Decision:** Do **not** hardcode this in app logic. Rates change with inflation and business growth.

**Recommendation:** Store it in one of:

- A new **1-row table** `public.company_settings` (e.g. key `bonus_labour_rate`, value 35 or 35.00), or
- An **environment variable** (e.g. `BONUS_LABOUR_RATE`).

If it changes next year, we should not need to redeploy the codebase. Prefer company_settings if other bonus-related config (e.g. period pot percentage) will also be stored; otherwise env is sufficient.

---

## 8. public.quotes.labour_hours → quoted_labor_minutes

**Decision:** Mapping **quoted_labor_minutes = round(quote.labour_hours * 60)** is **mathematically sound** and the **cleanest** way to handle the 15% / 30-minute estimation accuracy logic. No change to this approach.

---

## 9. Schema and task impact summary

| Item | Action (when implementing) |
|------|----------------------------|
| job_performance | Status (draft/verified/processed) for sync-created rows; only verified/processed in period pot. |
| public.quotes | Add `is_final_quote` and/or support “last quote before Scheduled/In Progress” when matching quote_id. |
| company_settings or env | Add `public.company_settings` (1-row) or document `BONUS_LABOUR_RATE` for 59.4/59.9. |
| Cron sync | Implement scheduled sync for Completed/Invoiced jobs (59.6). See docs/plans/2026-02-24-section-59-cron-sync-job-performance.md. |

---

## 10. Implementation decisions (59.4)

The following were decided for step-by-step implementation. Applied in migrations and docs.

### 10.1 Bonus rate: `public.company_settings` table

**Decision:** Use a **1-row table** `public.company_settings` (not an environment variable).

**Why:** If the rate changes (e.g. $35 → $40) due to inflation, we avoid a redeploy to update .env. The backend can query it when calculating a finalized payroll period, and an Admin UI can edit it later.

**Schema:** Single row table with at least `bonus_labour_rate` (numeric). Enforce single row (e.g. `id = 1` check). Default value 35.

### 10.2 Job performance status: `status` column

**Decision:** Add a **status** column to `public.job_performance` with three values: **`draft`**, **`verified`**, **`processed`**.

**Why:** When the cron sync finds a Completed/Invoiced job (or when a webhook would have fired), the backend creates the row as **draft** — raw math, not yet verified (e.g. $20 parts runs or manual time-splits). After Admin review it moves to **verified**. When the bonus period is closed, it moves to **processed**.

**Schema:** `status varchar` with `CHECK (status IN ('draft','verified','processed'))`, default `'draft'`.

### 10.3 Quote linkage: `is_final_quote`

**Decision:** Add **`is_final_quote`** (boolean) to `public.quotes`. The table already has `servicem8_job_id`.

**Why:** A single ServiceM8 job can have multiple quotes as scope changes. When we learn a job has moved to **Scheduled** or **In Progress** (e.g. via webhook or sync), the backend finds all quotes with that `servicem8_job_id`, picks the **most recently updated** one, and sets **`is_final_quote = true`** on it. That locks in the quoted_labor_minutes for the 15%/30-min variance rule so techs are not penalized for earlier draft quotes.

**Schema:** `is_final_quote boolean` default `false` on `public.quotes`.

---

## 11. References

- Section 59 tasks: `docs/tasks/section-59.md`
- Backend/schema: `docs/BACKEND_DATABASE.md` (§ Section 59 decisions)
- ServiceM8 API: `docs/SERVICEM8_API_REFERENCE.md`
- Quoted labour source (59.3): BACKEND_DATABASE.md § “Source of quoted_labor_minutes (Section 59.3 decision)”
