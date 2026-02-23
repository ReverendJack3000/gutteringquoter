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

### 3. Future (optional)

- **`public.profiles`** – If using Supabase Auth: extend with app-specific profile fields; link to `auth.users` via `id`. App role column `role`: one of `viewer`, `editor`, `technician`, `admin`.

---

### 4. Bonus / job performance (RLS off)

Three tables support bonus-period math, job financials/callbacks, and technician job attribution. No application code reads or writes them yet; for future bonus/period/job features.

| Table | Purpose | Key FKs |
|-------|---------|---------|
| **`public.bonus_periods`** | Pay cycles (e.g. fortnight/week/month); status open/processing/closed. | — |
| **`public.job_performance`** | Ledger per completed ServiceM8 job: revenue, materials cost, parts runs, callback fields. | `quote_id` → `public.quotes.id`; `bonus_period_id` → `public.bonus_periods.id`. `servicem8_job_id` UNIQUE; `servicem8_job_uuid` (nullable) for API fallback. |
| **`public.job_personnel`** | Who was on each job (seller/executor), onsite and travel/shopping minutes. | `job_performance_id` → `public.job_performance.id`; `technician_id` → `auth.users.id`. |

**RLS:** Off on all three. Migrations: `add_bonus_periods_job_performance_job_personnel`; `add_servicem8_job_uuid_to_saved_diagrams_and_job_performance` (adds nullable `servicem8_job_uuid` to `saved_diagrams` and `job_performance`).

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

---

## Migrations

Migrations are applied via Supabase MCP (`apply_migration`) or the Supabase dashboard SQL editor. Naming: `YYYYMMDD_description`, e.g. `20260216_create_products`.

Current migrations in **Jacks Quote App** (see Supabase dashboard or `list_migrations` MCP):

1. **create_products** – Creates `public.products` (with RLS and a public read policy) and inserts the six MVP products.

---

## Checking the database

- **Cursor:** Use Supabase MCP tools (`list_tables`, `execute_sql`) to inspect schema and data when changing anything database-related.
- **Dashboard:** Supabase → Jacks Quote App → Table Editor / SQL Editor.
- **Backend:** Once wired, use `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` with the Supabase Python client or REST API to read/write from the FastAPI app.
