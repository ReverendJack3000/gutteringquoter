# Backend & database specification – Quote App

This document defines the backend and Supabase database required for the Quote App. The live database is in the **Jacks Quote App** Supabase project.

---

## Supabase project

| Item | Value |
|------|--------|
| **Project name** | Jacks Quote App |
| **Project ID** | `rlptjmkejfykisaefkeh` |
| **Region** | ap-southeast-1 |
| **Usage** | Products catalog; future: projects/blueprints, auth, storage |

When working on anything database-related (schema, queries, migrations, API that reads/writes data), **use the Supabase MCP tools** to inspect the current tables and data. See `.cursor/rules/supabase-database.mdc`.

---

## Environment variables (backend)

Set in `backend/.env` (from `backend/.env.example`):

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | **Yes** | Project URL; server will not start without it |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** | Service role key (backend only; never expose in frontend) |
| `SUPABASE_ANON_KEY` | For auth | Anon (publishable) key; exposed via `GET /api/config` so frontend can use Supabase Auth |
| `SUPABASE_JWT_SECRET` | Optional (legacy) | Legacy JWT secret for HS256. If your project uses **ECC (P-256)** only, leave unset; the backend verifies tokens via JWKS (ES256) using `SUPABASE_URL`. |

---

## Schema overview

### 1. `public.products`

Marley product catalog shown in the right panel. Replaces the hardcoded list in `backend/app/products.py` when Supabase is enabled.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `text` | PRIMARY KEY | Slug, e.g. `gutter`, `downpipe` |
| `name` | `text` | NOT NULL | Display name, e.g. `Gutter`, `Downpipe` |
| `category` | `text` | NOT NULL | One of: `channel`, `pipe`, `fixing`, `fitting` |
| `thumbnail_url` | `text` | NOT NULL | URL or path for panel thumbnail |
| `diagram_url` | `text` | NOT NULL | URL or path for blueprint diagram |
| `created_at` | `timestamptz` | DEFAULT now() | Row creation time |

**Indexes:** Primary key on `id`. Optional: index on `category` for filtered lists.

**RLS:** Can be disabled for public read of products, or enable RLS and allow `SELECT` for `anon`/`authenticated` if you add auth later.

**Seed data:** Six MVP products (gutter, downpipe, bracket, stopend, outlet, dropper) with `/assets/marley/{id}.svg` paths.

### 1.1 `public.quick_quoter_repair_types` + `public.quick_quoter_part_templates`

Quick Quoter catalog and conditional part templates (Section 63). Admin Material Rules UI edits these tables directly.

**`public.quick_quoter_repair_types` (catalog)**

| Column | Type | Description |
|--------|------|-------------|
| `id` | text (PK) | Repair type key (e.g. `joiner_replacement`) |
| `label` | text | User-facing label |
| `active` | boolean | Enable/disable repair type |
| `sort_order` | integer | UI order |
| `requires_profile` | boolean | Requires SC/CL selection |
| `requires_size_mm` | boolean | Requires 65/80 selection |
| `default_time_minutes` | integer nullable | Optional default labour minutes per repair; used for resolve `suggested_labour_minutes` and optional quote modal labour prefill |
| `created_at` | timestamptz | Row created timestamp |
| `updated_at` | timestamptz | Last updated timestamp |
| `updated_by` | uuid nullable | `auth.users.id` of admin/super-admin editor |

**`public.quick_quoter_part_templates` (conditional parts)**

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Template row id |
| `repair_type_id` | text FK | → `quick_quoter_repair_types.id` |
| `product_id` | text FK | → `products.id` |
| `qty_per_unit` | numeric | Quantity multiplier |
| `condition_profile` | text nullable | `SC` / `CL` / null |
| `condition_size_mm` | integer nullable | `65` / `80` / null |
| `length_mode` | text | `none` / `missing_measurement` / `fixed_mm` |
| `fixed_length_mm` | integer nullable | Required when `length_mode=fixed_mm` |
| `active` | boolean | Enable/disable template |
| `sort_order` | integer | Per-repair ordering |
| `created_at` | timestamptz | Row created timestamp |
| `updated_at` | timestamptz | Last updated timestamp |
| `updated_by` | uuid nullable | `auth.users.id` of admin/super-admin editor |

### 1.2 `public.measured_material_rules`

Single-row global config (`id = 1`) for measured-length accessory inference used by `POST /api/calculate-quote`.

| Column | Type | Description |
|--------|------|-------------|
| `id` | integer (PK, check `id=1`) | Singleton row |
| `bracket_spacing_mm` | integer | Bracket spacing rule |
| `clip_spacing_mm` | integer | Downpipe clip spacing rule |
| `screws_per_bracket` | integer | Screws per inferred bracket |
| `screws_per_dropper` | integer | Screws per dropper |
| `screws_per_saddle_clip` | integer | Screws per saddle clip |
| `screws_per_adjustable_clip` | integer | Screws per adjustable clip |
| `screw_product_id` | text FK | Screw product id |
| `bracket_product_id_sc` | text FK | Storm Cloud bracket product id |
| `bracket_product_id_cl` | text FK | Classic bracket product id |
| `saddle_clip_product_id_65` | text FK | 65mm saddle clip product id |
| `saddle_clip_product_id_80` | text FK | 80mm saddle clip product id |
| `adjustable_clip_product_id_65` | text FK | 65mm adjustable clip product id |
| `adjustable_clip_product_id_80` | text FK | 80mm adjustable clip product id |
| `clip_selection_mode` | text | `auto_by_acl_presence` / `force_saddle` / `force_adjustable` |
| `updated_at` | timestamptz | Last updated timestamp |
| `updated_by` | uuid nullable | `auth.users.id` of admin/super-admin editor |

`/api/calculate-quote` reads this row; if it is missing/unavailable, backend falls back to built-in defaults to avoid quote outage.

---

### 2. `public.saved_diagrams`

Per-user saved blueprint/diagram state (Sections 33 & 34). Blueprint image stored in Storage bucket `blueprints`.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | PRIMARY KEY, default gen_random_uuid() |
| `user_id` | uuid | NOT NULL, REFERENCES auth.users(id) ON DELETE CASCADE |
| `name` | varchar(255) | User-facing name |
| `data` | jsonb | Canvas state: elements, blueprintTransform, groups (no image bytes) |
| `blueprint_image_url` | text | URL of blueprint PNG in Storage |
| `thumbnail_url` | text | URL of thumbnail in Storage |
| `created_at` | timestamptz | default now() |
| `updated_at` | timestamptz | default now() |
| `servicem8_job_id` | varchar(32) | Optional job number stamp (Add to Job / Create New Job) |
| `servicem8_job_uuid` | uuid | Optional ServiceM8 job UUID (nullable); for API lookups. Migration: `add_servicem8_job_uuid_to_saved_diagrams_and_job_performance`. |

**Storage:** Bucket `blueprints` (public read). Paths: `{user_id}/{diagram_id}/blueprint.png`, `thumb.png`.

### 2.5 `public.quotes`

Quote estimates; persisted when Add to Job or Create New Job succeeds (Section 59.19). Referenced by `job_performance.quote_id`.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | PRIMARY KEY, default uuid_generate_v4() |
| `quote_number` | varchar | Optional display number |
| `customer_name` | varchar | Optional |
| `property_address` | text | Optional |
| `labour_hours` | numeric | Quoted labour hours (for quoted_labor_minutes = round(labour_hours * 60)) |
| `labour_rate_id` | uuid | Optional FK to labour_rates |
| `materials_subtotal` | numeric | Optional |
| `labour_subtotal` | numeric | Optional |
| `total` | numeric | Quote total (exc GST) |
| `blueprint_image_url` | text | Optional |
| `items` | jsonb | Material lines only — see “items shape” below |
| `status` | varchar | Default 'draft' |
| `servicem8_job_id` | varchar | ServiceM8 job number (generated_job_id) |
| `servicem8_job_uuid` | uuid | ServiceM8 job UUID (nullable). Migration: `add_quotes_servicem8_job_uuid`. |
| `created_at` | timestamptz | default now() |
| `updated_at` | timestamptz | default now() |
| `is_final_quote` | boolean | NOT NULL default false; set when job → Scheduled/In Progress (e.g. by future webhook or job-status sync). |

**items (JSONB) shape (Section 59.19.1):** When persisting a quote (Add to Job / Create New Job), `items` is set to an array of **material** lines only (exclude labour/REP-LAB). Each element: at least `{ "id": "<product_id>", "qty": <number> }`; optionally `name`, `item_number`, `servicem8_material_uuid`. Used for Missed Materials comparison with ServiceM8 job materials. See “Audit: Material quoting and public.quotes.items”.

### 3. Future (optional)

- **`public.profiles`** – If using Supabase Auth: extend with app-specific profile fields; link to `auth.users` via `id`. App role column `role`: one of `viewer`, `editor`, `technician`, `admin`.
- **Quick Quoter backend wiring (Section 62)** – Planned schema + API + integration contract are documented in `docs/QUICK_QUOTER_BACKEND_DATABASE_INTEGRATION.md` (documentation-only; not wired yet).

---

### 4. Bonus / job performance (RLS off)

Three tables support bonus-period math, job financials/callbacks, and technician job attribution. No application code reads or writes them yet; for future bonus/period/job features.

| Table | Purpose | Key FKs |
|-------|---------|---------|
| **`public.bonus_periods`** | Pay cycles (e.g. fortnight/week/month); status open/processing/closed. | — |
| **`public.job_performance`** | Ledger per completed ServiceM8 job: revenue, materials cost, parts runs, callback fields. | `quote_id` → `public.quotes.id`; `bonus_period_id` → `public.bonus_periods.id`. `servicem8_job_id` UNIQUE; `servicem8_job_uuid` (nullable) for API fallback. |
| **`public.job_personnel`** | Who was on each job (seller/executor), onsite and travel/shopping minutes. | `job_performance_id` → `public.job_performance.id`; `technician_id` → `auth.users.id`. |

**RLS:** Off on all three. Migrations: `add_bonus_periods_job_performance_job_personnel`; `add_servicem8_job_uuid_to_saved_diagrams_and_job_performance` (adds nullable `servicem8_job_uuid` to `saved_diagrams` and `job_performance`).

**Section 59.4 additions (implemented):**

- **`public.job_performance.status`** — `varchar` with `CHECK (status IN ('draft','verified','processed'))`, default `'draft'`. Sync-created rows are `draft`; after admin review → `verified`; when period closed → `processed`. Only verified/processed rows in period pot. Migration: `add_job_performance_status`.
- **`public.quotes.is_final_quote`** — `boolean` NOT NULL default `false`. When a job moves to Scheduled/In Progress (e.g. via webhook or sync), backend sets `is_final_quote = true` on the most recently updated quote for that `servicem8_job_id`. That quote is used for `quoted_labor_minutes`. Migration: `add_quotes_is_final_quote`.
- **`public.company_settings`** — Single-row table for app config (no hardcoded bonus rate). Columns: `id` (integer PK, check id = 1), `bonus_labour_rate` (numeric NOT NULL default 35.00), `updated_at` (timestamptz). Backend reads at calculation time; Admin UI can update. Migration: `add_company_settings_bonus_rate`. **Section 60.1:** Code default is 33 (ex-GST); stored value is ex-GST $ per man-hour; GST applies for display/billing elsewhere.

**Job GP calculation (59.9, 60.2):** Base Job GP = `invoiced_revenue_exc_gst` − `materials_cost` − (`standard_parts_runs` × 10). Unscheduled parts run deduction is $10 (Travel Fee) per run. Not subtracted here: `missed_materials_cost`, `callback_cost`, `seller_fault_parts_runs` (period-level or post-split). Computed on read (e.g. `GET /api/bonus/job-performance/{id}` returns row + `job_gp`). Bonus labour rate is read from `public.company_settings` (id=1) or env `BONUS_LABOUR_RATE` (default **33** ex-GST per Section 60.1); not used in this formula but used by period pot / splits (59.10+) where labour cost is applied.

**Period pot eligibility (59.10, 60.5):** Only jobs with `job_performance.status` IN ('verified', 'processed') are included. **Minimum margin (60.5):** A job contributes to the period pot only if Job GP / Price to Customer (invoiced_revenue_exc_gst) ≥ 0.50. Ineligible jobs are excluded from period pot and from tech GP splits. Periods used are those with `bonus_periods.status` IN ('open', 'processing').

**Estimation accuracy (59.13, 60.3):** Seller share applies only if actual labour (sum of `onsite_minutes` + `travel_shopping_minutes` across job_personnel for the job) is within 15% of `quoted_labor_minutes` or within 20 minutes, whichever is greater: tolerance = max(round(quoted × 0.15), 20). Edge cases: (1) quoted_labor_minutes = 0 → tolerance = 20 minutes; (2) rounding: tolerance and comparison use the same formula so behaviour is consistent.

**Schedule Saver (59.15):** A seller who did not execute (is_seller true, is_executor false) keeps full 60% credit (or 60% ÷ number of sellers when truck-shared). The 60/40 split is by role only; there is no extra penalty for not executing. Implemented by `compute_job_base_splits`: sellers split 60% of Job GP, executors split 40%; a seller-only tech receives their share of the 60% with no reduction.

**Cut-off and period assignment (60.7):** The tally closes at **11:59 PM on the last Sunday** of the fortnight’s pay cycle. This time must be evaluated in the **local timezone** (e.g. Pacific/Auckland), not server UTC. **Payment date** (when the job was paid), not just completion or invoice date, must be used to assign the job to the correct fortnightly `bonus_period`. Jobs paid after 11:59 PM on the last Sunday of the period roll into the next period. Sync or cron must have access to payment date (e.g. from ServiceM8) where applicable. Period `end_date` may be stored as date only; implement cut-off as end of that day in the configured timezone when enforcing roll-to-next-period logic.

**Lost shares to CSG (60.8):** Voided shares (e.g. seller share lost due to estimation accuracy fail, executor share voided by poor_workmanship callback, seller share voided by bad_scoping callback) **revert to CSG (the House)**, not to other technicians. The calculation pipeline zeros the affected tech’s share; that amount is not reallocated to anyone else.

---

## Staff → technician_id mapping (Section 59.2)

**Purpose:** `job_personnel.technician_id` references `auth.users.id`. When we create job_personnel rows (from ServiceM8 job activities or admin assignment), we need to resolve ServiceM8 staff to our user id.

### ServiceM8 staff response (read_staff)

GET `/api_1.0/staff.json` returns an array of staff objects. Key fields for mapping:

- **`uuid`** — ServiceM8 staff UUID (stable; use for API lookups and optional mapping table).
- **`email`** — Staff email (string; may be empty for some staff).
- **`first`**, **`last`** — Name (display only).

Full field list: see `docs/SERVICEM8_API_REFERENCE.md` §5.

### Our side

- **auth.users:** `id` (UUID), `email` (from Supabase Auth; set at sign-up/invite).
- **public.profiles:** `user_id` → auth.users.id, `role` (viewer | editor | technician | admin). Role is for app permissions; any app user can be a “technician” for bonus if we assign them to jobs.
- **`public.servicem8_staff`** (optional reference cache): Columns `servicem8_staff_uuid` (PK), `email`, `first_name`, `last_name`, `active`, `job_title`, `updated_at`. Populated by **local script only**: `scripts/servicem8-api-key-local/sync_staff_to_supabase.py` (uses ServiceM8 API key; run from project root with backend/.env). RLS off. Used for reference/admin visibility; **technician_id resolution still uses email match** to auth.users (no requirement to read this table). Migration: `add_servicem8_staff_reference_table`.

### Mapping decision: derive from email (no mapping table)

We **do not** add a mapping table for the first implementation. Resolve `technician_id` as follows:

1. **Input:** ServiceM8 staff record (e.g. from GET staff.json or from job activity assignee).
2. **Key:** Staff `email` (trimmed, case-insensitive). If email is empty, we cannot derive technician_id for that staff.
3. **Lookup:** Match staff email to `auth.users.email` (case-insensitive). Use the same approach as `_resolve_company_email_to_user_id()` in `backend/app/servicem8.py`: list auth users (service role), find user where email matches, return that user’s `id` as `technician_id`.
4. **Cache:** Reuse or extend a cache (e.g. email → user_id) to avoid repeated list_users calls when resolving many staff in one run.
5. **No match:** If no auth user has that email, leave `technician_id` NULL for that staff in job_personnel, or do not create a job_personnel row until an admin links them. Optional: log unmapped staff for admin follow-up.

**Rationale:** Technicians who use the app are invited by email; the same email is typically used in ServiceM8. A mapping table would be needed only if we must support staff whose ServiceM8 email differs from their app login email, or to exclude certain staff from bonus.

### Optional later: mapping table

If we need to override or handle non-matching emails, add a table such as:

- **servicem8_staff_technician_map:** `servicem8_staff_uuid` (UUID, UNIQUE), `technician_id` (UUID → auth.users.id). Look up by staff uuid first; if row exists use its technician_id; else fall back to email match. Admin UI could manage this table.

No migration for this until required.

---

## Audit: Labour quote logic and quoted_labor_minutes (Section 59 / estimation accuracy)

**Purpose:** Ensure the new compensation schema (e.g. `job_performance.quoted_labor_minutes` for the 15% / 30‑minute estimation accuracy rule) does not conflict with current quoting flow, and identify whether quoted labour time is persisted.

**Search terms used:** REP-LAB, labour_hours, labour_subtotal, quotes table inserts.

### Backend (FastAPI)

| Touchpoint | File | Behaviour |
|------------|------|-----------|
| **Calculate quote** | `backend/main.py` | `POST /api/calculate-quote` accepts `CalculateQuoteRequest`: `elements` (materials) and `labour_elements` (each `assetId` e.g. REP-LAB, `quantity` = hours). Labour is summed from `labour_elements` as `labour_hours` and priced from `public.products` (REP-LAB). Response includes `labour_hours` and `labour_subtotal`. **Does not write to DB.** |
| **Labour product** | `backend/main.py` | `GET /api/labour-rates` returns a single “rate” from REP-LAB product pricing for backward compatibility; hours are not stored there. |
| **Add to Job** | `backend/main.py` | `AddToJobRequest` and `CreateNewJobRequest` include `labour_hours: float`. That value is used only in `_build_job_note_text()` (job note and new-job description). **Not persisted to our database.** |
| **Quotes table** | Backend (all) | **No code path inserts or updates `public.quotes`.** No endpoint reads or writes the quotes table. The table exists (Section 22) but is unused by the app today. |

**Conclusion (backend):** Labour hours are computed correctly from REP-LAB line items (`quantity` = hours) and returned in the quote and passed to ServiceM8 in the job note. Hours are **not** stripped; they are never persisted to our DB, so there is no stored “quoted labour” for a given job.

### Frontend (app.js)

| Touchpoint | Behaviour |
|------------|-----------|
| **REP-LAB** | `LABOUR_PRODUCT_IDS = ['REP-LAB']`. Labour rows use assetId `REP-LAB`; quantity is hours from `.quote-labour-hours-input`. |
| **calculateAndDisplayQuote()** | Builds `labour_elements` from labour rows: `{ assetId: 'REP-LAB', quantity: hours }` per row. Sends `elements` + `labour_elements` to `POST /api/calculate-quote`. Response quote includes `labour_hours` and `labour_subtotal`; stored in `lastQuoteData` for display and edit mode. |
| **Add to Job payload** | `getAddToJobPayload()` computes `labourHours` from the same labour rows (sum of `.quote-labour-hours-input`), sends `labour_hours` in the add-to-job and create-new-job request bodies. |

**Conclusion (frontend):** REP-LAB is used as a line item with quantity = hours. The same hours are sent to calculate-quote and to Add to Job. There is no “save quote” action that writes to the server or to `public.quotes`.

### Risk for compensation plan (quoted_labor_minutes)

- **Estimation accuracy rule** (Section 59): Seller share applies only if actual labour is within 15% of **quoted** labour or 30 minutes (whichever is greater). That requires a stored **quoted** labour value per job (e.g. `job_performance.quoted_labor_minutes`).
- **Current state:** We never persist a quote to `public.quotes` and never set `quoted_labor_minutes` anywhere. The only place quoted hours exist today is in the Add to Job request body and in the ServiceM8 job note text; neither is stored in our DB.
- **Recommendation:** Before or as part of Section 59, introduce a way to store quoted labour for the job, for example: (1) **Option A:** When Add to Job (or Create New Job) runs, persist a row to `public.quotes` (e.g. quote_number, items, labour_hours, total, `servicem8_job_id`), then when creating `job_performance` link `quote_id` and set `quoted_labor_minutes = round(quote.labour_hours * 60)`. (2) **Option B:** When creating `job_performance`, accept `quoted_labor_minutes` (or quoted labour hours) from the client or from a dedicated “finalise job” payload that includes the quote snapshot. (3) **Option C:** Rely on ServiceM8 if they expose estimated/invoiced labour and we sync it. Document the chosen approach in Section 59 (task 59.3).

**Schema impact:** The new bonus schema does **not** break the current quoting flow: we do not read or write `public.quotes` or `job_performance` today. Adding persistence for quoted labour is an additive change (new or extended write path) once the option above is decided.

---

## Source of quoted_labor_minutes (Section 59.3 decision)

**Decision: Option A** — Persist to `public.quotes` when Add to Job (or Create New Job) runs; when creating a `job_performance` row, set `quoted_labor_minutes = round(quote.labour_hours * 60)` from the linked quote.

**Rationale:**

- **Single source of truth:** The quote row captures what was actually sent to ServiceM8 at Add to Job / Create New Job time, so estimation accuracy (15% / 30 min rule) compares actual labour to that stored value.
- **Aligns with existing plan:** Task 59.19 already covers persisting to `public.quotes` on Add to Job / Create New Job (including `servicem8_job_id`, `servicem8_job_uuid`, labour and items). 59.19.1 defines the `items` shape for Missed Materials. Using the same quote row for `quoted_labor_minutes` avoids a second source or client-supplied value that could drift.
- **Option B (client/finalise payload):** Would require the client or admin to supply quoted labour when creating `job_performance`; that value would still need to come from somewhere (e.g. diagram or a stored quote). Option A stores it once at quote time.
- **Option C (ServiceM8):** ServiceM8 “estimated labour” / “quoted hours” on the job object is **not yet confirmed** (see `docs/SERVICEM8_API_REFERENCE.md` §1). We do not rely on it for 59.3; we can revisit if ServiceM8 later exposes a reliable field.

**Implementation (no code in this change):**

- **59.19:** Implement saving to `public.quotes` on Add to Job / Create New Job (include `labour_hours`, `servicem8_job_id`, `servicem8_job_uuid`, and materials `items` per 59.19.1). Ensure existing flows remain working and Railway-safe.
- **59.6 / 59.7:** When creating a `job_performance` row, set `quote_id` to the quote created at Add to Job (or Create New Job) and set `quoted_labor_minutes = round(quote.labour_hours * 60)`. If `public.quotes` does not yet have a `labour_hours` column, add it (or store labour in an existing column) as part of 59.19.

**Constraint respected:** We do not write to `public.quotes` until 59.19 is implemented; this section only records the decision and the intended behaviour once that write path exists.

---

## Section 59 decisions (data flow, quote link, rate, time)

The following are **locked decisions** for bonus ledger and calculation. Full rationale and implementation notes: **`docs/plans/2026-02-23-section-59-data-flow-decisions.md`**. Summary:

- **job_performance creation:** Triggered by **scheduled cron sync** (lists Completed/Invoiced jobs from ServiceM8 API; no inbound webhook). New rows created with **status = 'draft'**; admin verifies → **verified**; period closed → **processed**. Schema: **status** column (draft/verified/processed). Only verified/processed in period pot. Plan: `docs/plans/2026-02-24-section-59-cron-sync-job-performance.md`.
- **Data ownership:** ServiceM8 API (via sync) populates: invoiced_revenue_exc_gst, materials_cost, servicem8_job_id. Admin/System: quote_id (matched automatically by sync), bonus_period_id. Tech/Admin manual: callbacks, seller_fault_parts_runs, onsite_minutes vs travel_shopping_minutes (admin verifies/splits from raw JobActivity before locking period).
- **Active quote (multiple quotes per job):** The active quote is the **last** quote (by updated_at) for that servicem8_job_id when the job moves to Scheduled or In Progress. **`is_final_quote`** (boolean) on `public.quotes`; when we learn job → Scheduled/In Progress (e.g. future webhook or sync), backend sets `is_final_quote = true` on that most recent quote.
- **Revenue for GP:** Base on **job.total_invoice_amount** (invoiced amount).
- **Job Materials:** Use JobMaterial endpoint; pull pricing/GP from our DB, fall back to ServiceM8 if missing.
- **Job Activities:** Pull raw data as baseline for total hours; **Admin verifies/splits** into onsite_minutes and travel_shopping_minutes in our app before locking period (do not rely on API to distinguish onsite vs travel).
- **Standardised bonus labour rate:** Do not hardcode. Store in **`public.company_settings`** (1-row table, `bonus_labour_rate` column; default 35). Backend reads at calculation time; Admin can update without redeploy.
- **quoted_labor_minutes:** Confirmed: `round(quote.labour_hours * 60)` from linked quote (see “Source of quoted_labor_minutes” above).

---

## Data ownership and ServiceM8 field mapping (Section 59.22)

**Purpose:** Single reference for which fields in `job_performance` and `job_personnel` come from the ServiceM8 API (sync), from our app/admin entry, or from system logic. Staff ↔ technician_id mapping is in **"Staff → technician_id mapping"** above.

### job_performance

| Field / group | Source | Notes |
|---------------|--------|-------|
| **servicem8_job_id**, **servicem8_job_uuid** | API (sync) | From ServiceM8 job; sync sets both when creating/updating row. |
| **invoiced_revenue_exc_gst**, **materials_cost** | API (sync) | Populated by cron sync from ServiceM8 job (e.g. total_invoice_amount, job materials). |
| **quote_id**, **quoted_labor_minutes** | System / our app | quote_id matched by sync (last quote for that servicem8_job_id with is_final_quote or by updated_at). quoted_labor_minutes = round(quote.labour_hours * 60) from that quote. |
| **bonus_period_id** | Admin / our app | Set by admin (Bonus Admin UI or API) when assigning job to a period. |
| **status** | Admin / our app | draft (sync default) → verified (admin) → processed (when period closed). Only verified/processed in period pot. |
| **standard_parts_runs**, **is_callback**, **callback_reason**, **callback_cost**, **seller_fault_parts_runs**, **missed_materials_cost** | Admin / our app | Admin enters or corrects in Bonus Admin (Edit job). Sync does not set these. |
| **is_upsell** (Section 60.6) | Admin / our app (or sync when ServiceM8 badge available) | True = job is a true upsell and counts toward period pot. Admin toggle in Edit job. When syncing from ServiceM8, if the job has the "Site Sale" badge (name "Site Sale", uuid d14c817e-4ba4-43ee-b51c-219867379a2b), set is_upsell true. Default false. |

### job_personnel

| Field | Source | Notes |
|-------|--------|-------|
| **job_performance_id** | Our app | FK to the job; set when creating personnel rows (sync or admin). |
| **technician_id** | Our app (derived) | Resolved from ServiceM8 staff: match staff email to auth.users.email → auth.users.id. See **"Staff → technician_id mapping"** above. If no match, NULL until admin assigns. |
| **onsite_minutes**, **travel_shopping_minutes** | Admin / our app | Admin verifies/splits from raw job activity data in Bonus Admin (Edit personnel). Sync may create rows with 0/0; admin fills. |
| **is_seller**, **is_executor** | Admin / our app | Set by admin in Bonus Admin (Edit personnel). Not derived from API. |
| **is_spotter** (Section 60.4) | Admin / our app | Set by admin in Bonus Admin (Edit personnel). When true, that technician receives 20% of job GP for that job; remaining 80% reverts to CSG (house). |

### Staff ↔ technician_id (summary)

- **ServiceM8:** Staff has `uuid`, `email`, `first`, `last` (GET staff.json). No mapping table in first implementation.
- **Resolution:** Match staff `email` (trimmed, case-insensitive) to `auth.users.email`; use that user's `id` as `job_personnel.technician_id`.
- **No match:** technician_id NULL; admin can assign later or add app user with same email.

---

## Audit: ServiceM8 job syncing (Section 59 / job_performance link)

**Purpose:** Ensure we capture and persist ServiceM8 job identifiers so the payroll/bonus system can link finalized jobs back to the original estimate. `job_performance` uses `servicem8_job_id` (UNIQUE) to link to a ServiceM8 job; a `job_uuid` fallback supports API lookups (e.g. `fetch_job_by_uuid`).

**Search terms used:** servicem8_job_id, Add to Job, OAuth, ServiceM8 API, job_uuid, generated_job_id.

### Current flow (no assumptions)

| Step | Where | What is captured / stored |
|------|--------|----------------------------|
| **Lookup job** | GET `/api/servicem8/jobs?generated_job_id=X` | Backend returns `uuid`, `generated_job_id`, `job_address`, `total_invoice_amount`. Frontend stores `job.uuid` in `overlay.dataset.jobUuid` and job number in confirm UI (`jobConfirmAddId` = `generated_job_id` or user input). |
| **Add to current job** | POST `/api/servicem8/add-to-job` | Body has `job_uuid` (from lookup). Backend returns `{ "success": true, "uuid": "<job_uuid>", "generated_job_id": "<number>" }` so the client can persist both for diagram save even if overlay state is lost (59.4.4). |
| **After Add to Job success** | Frontend `autoSaveDiagramWithJobNumber(jobNumber, jobUuid)` | `jobNumber` from `jobConfirmAddId`, `jobUuid` from `overlay.dataset.jobUuid`. POST `/api/diagrams` with `servicem8JobId` and optional `servicem8JobUuid`. Backend writes both to `saved_diagrams` (59.4.2–59.4.3 implemented). |
| **Create New Job** | POST `/api/servicem8/create-new-job` | Backend returns `new_job_uuid`, `generated_job_id`. Frontend passes both to `autoSaveDiagramWithJobNumber(newJobNumber, newJobUuid)` so both job number and uuid are stored in `saved_diagrams`. |
| **public.quotes** | — | **Never written.** No `servicem8_job_id` or `servicem8_job_uuid` stored when Add to Job runs. |

### Gaps and risk

- **saved_diagrams:** Schema now has `servicem8_job_uuid` (nullable). App still writes only `servicem8_job_id`; 59.4.2–59.4.3 add API and frontend to persist both.
- **public.quotes:** Not used; when we add quote persistence (Section 59), we should store both job number and job uuid so `job_performance` can link via `quote_id` and/or `servicem8_job_id` / `servicem8_job_uuid`.
- **job_performance:** Has `servicem8_job_id` (UNIQUE) and `servicem8_job_uuid` (nullable, schema done). App does not write to this table yet; when it does, use both columns as needed.

### Recommendations

1. **Schema done:** `servicem8_job_uuid` (nullable) added to `saved_diagrams` and `job_performance`. **Next:** Persist when saving a diagram: extend POST/PATCH `/api/diagrams` to accept optional `servicem8JobUuid`; frontend passes both job number and job uuid (59.4.2–59.4.3).
2. **Schema done:** `job_performance.servicem8_job_uuid` exists for payroll/bonus API lookups.
3. **Add to Job response:** Optionally return `generated_job_id` and `uuid` in the add-to-job response so the client can persist both even if overlay state is lost; currently the client has them from the lookup.
4. **Create New Job:** Frontend should pass both `generated_job_id` and `new_job_uuid` into the diagram save (and any future quote save) so both are stored; avoid overloading a single field with “number or uuid”.
5. **When persisting to `public.quotes`** (Section 59 option A): store both `servicem8_job_id` and `servicem8_job_uuid` (add nullable column if needed) so the link to the finalized job is robust.

---

## Audit: Material quoting and public.quotes.items (Section 59 / Missed Materials)

**Purpose:** The compensation plan penalizes the Seller for “Missed Materials.” To detect missed materials automatically we must compare the **quoted** materials (product IDs + quantities) to final ServiceM8 material usage. That requires storing the quoted materials cleanly in `public.quotes.items` (JSONB) when a quote is saved.

**Search terms used:** materials_subtotal, items (JSONB), csv diagram mapping.

### Current state

| Touchpoint | Behaviour |
|------------|-----------|
| **public.quotes** | Table has `items` (jsonb). **No code path inserts or updates this table**; `items` is never populated. |
| **POST /api/calculate-quote** | Accepts `elements` (assetId + quantity, optional length_mm). Returns `quote.materials` array: `{ id, name, qty, cost_price, markup_percentage, sell_price, line_total }`. So we have product **id** and **qty** in the response. Not persisted. |
| **getElementsFromQuoteTable()** | Builds elements with `assetId`, `quantity`, optionally `length_mm`. Used for calculate-quote request. Source of truth for what’s on the quote table (including gutter/downpipe bin-pack from header metres). |
| **Add to Job payload** | `getAddToJobPayload()` sends `elements: [{ name, qty }]` — **display name and qty only, no product id.** Backend `AddToJobRequest.elements` is `AddToJobElement(name, qty)`. Used for job note text and the single bundled material line in ServiceM8. So the payload to ServiceM8 does **not** include product IDs; we cannot reliably match “quoted line” to “ServiceM8 material line” by id later. |
| **Products** | `public.products` has `id`, `item_number`, `servicem8_material_uuid` (for ServiceM8 material mapping). CSV import uses `item_number`; diagram mapping is by item_number. For Missed Materials we need to match our quote line to ServiceM8 usage by product id and/or `servicem8_material_uuid` / `item_number`. |

### Gap for Missed Materials detection

- We never write to `public.quotes`, so **no snapshot of quoted materials** (IDs + quantities) exists. When we add quote persistence (Section 59), we must store in `public.quotes.items` a **clean, machine-readable array** of quoted material lines that can be compared to ServiceM8 job materials.
- The **Add to Job** path sends only `name` and `qty`; names are not stable for matching. The **calculate-quote response** has `id` and `qty` — that shape is suitable for `quotes.items`. Storing `name` as well is fine for display; for comparison we need at least **id** (and optionally **item_number** or **servicem8_material_uuid** if ServiceM8 API returns material by UUID or item number).
- **Labour:** Exclude labour lines (REP-LAB) from the “materials” snapshot in `quotes.items` when used for Missed Materials, or store labour separately; the plan’s “Missed Materials” refers to parts, not labour.

### Recommendations

1. **When persisting a quote to `public.quotes`** (e.g. on Add to Job / Create New Job per 59.3): set `items` to a JSONB array of **material** lines only (exclude labour). Each element: at least `{ "id": "<product_id>", "qty": <number> }`; optionally `name`, `item_number`, `servicem8_material_uuid` from products for ServiceM8 matching. Use the same structure as the calculate-quote **materials** array (id, qty, and optionally name) so one source of truth. Do not store only name+qty.
2. **Schema:** `public.quotes.items` already exists (jsonb); no migration needed for the column. Document the intended shape (e.g. array of `{ id, qty, name?, item_number?, servicem8_material_uuid? }`) in Section 59 or BACKEND_DATABASE so future “Missed Materials” logic can rely on it.
3. **Future Missed Materials logic:** Compare `quotes.items` (by id or servicem8_material_uuid) to ServiceM8 job materials (from read_job_materials or equivalent); any quoted line with no matching or under-used ServiceM8 line can be treated as “missed” or over-quoted depending on business rule.

---

## API alignment

| API route | Source |
|-----------|--------|
| `GET /api/health` | — |
| `GET /api/config` | Env (supabaseUrl, anonKey for frontend auth) |
| `GET /api/products` | `public.products` |
| `POST /api/process-blueprint` | OpenCV (no DB) |
| `GET /api/diagrams` | `public.saved_diagrams` (requires Bearer JWT) |
| `POST /api/diagrams` | Insert + Storage upload |
| `GET /api/diagrams/{id}` | `public.saved_diagrams` (owner only) |
| `PATCH /api/diagrams/{id}` | Update + optional Storage upload |
| `DELETE /api/diagrams/{id}` | Delete row + Storage objects |
| `GET /api/admin/material-rules/quick-quoter` | `public.quick_quoter_repair_types` + `public.quick_quoter_part_templates` |
| `PUT /api/admin/material-rules/quick-quoter/repair-types` | Upsert/delete `public.quick_quoter_repair_types` (+ `updated_at`, `updated_by`) |
| `PUT /api/admin/material-rules/quick-quoter/templates` | Upsert/delete `public.quick_quoter_part_templates` (+ `updated_at`, `updated_by`) |
| `GET /api/admin/material-rules/measured` | `public.measured_material_rules` (row `id=1`, defaults-safe) |
| `PUT /api/admin/material-rules/measured` | Upsert `public.measured_material_rules` (+ `updated_at`, `updated_by`) |

---

## Migrations

Migrations are applied via Supabase MCP (`apply_migration`) or the Supabase dashboard SQL editor. Naming: `YYYYMMDD_description`, e.g. `20260216_create_products`.

Current migrations in **Jacks Quote App** (see Supabase dashboard or `list_migrations` MCP):

1. **create_products** – Creates `public.products` (with RLS and a public read policy) and inserts the six MVP products.
2. **add_company_settings_bonus_rate** (Section 59.4) – Creates `public.company_settings` (1-row: id=1, bonus_labour_rate default 35, updated_at). No hardcoded bonus rate.
3. **add_job_performance_status** (Section 59.4) – Adds `status` to `job_performance`: draft | verified | processed, default 'draft'.
4. **add_quotes_is_final_quote** (Section 59.4) – Adds `is_final_quote` boolean (default false) to `public.quotes` for active-quote rule.
5. **add_quotes_servicem8_job_uuid** (Section 59.19) – Adds nullable `servicem8_job_uuid` (uuid) to `public.quotes` for API lookups and quote–job link.
6. **add_job_personnel_unique_job_performance_technician** (Section 59.8.4) – Adds UNIQUE(job_performance_id, technician_id) on `public.job_personnel` to prevent duplicates and support insert-only baseline from sync.
7. **material_rules_migration** (Section 63.11+) – Creates `public.measured_material_rules` singleton table, seeds defaults matching existing accessory logic, and adds `updated_by` to `quick_quoter_repair_types` + `quick_quoter_part_templates`.

(Other migrations omitted for brevity; see Supabase dashboard or `list_migrations` MCP for full list.)

---

## Checking the database

- **Cursor:** Use Supabase MCP tools (`list_tables`, `execute_sql`) to inspect schema and data when changing anything database-related.
- **Dashboard:** Supabase → Jacks Quote App → Table Editor / SQL Editor.
- **Backend:** Once wired, use `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` with the Supabase Python client or REST API to read/write from the FastAPI app.
