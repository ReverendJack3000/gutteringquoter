# Plan: Add bonus_periods, job_performance, and job_personnel tables to Supabase

**Date:** 2026-02-23  
**Scope:** Schema only. No frontend or backend application code changes. No desktop or mobile UI impact.  
**Goal:** Add three new tables to support bonus-period math, job financials/callbacks, and technician job attribution (2 Visit Rule, Truck Share, Do it all get it all) without harming existing functionality or Railway deployment.

---

## 1. Context verified from codebase

- **Single source of truth for tasks:** `TASK_LIST.md` + section files in `docs/tasks/` (see `.cursor/rules/task-list-completion.mdc`).
- **Stack:** FastAPI backend, vanilla HTML/CSS/JS frontend, Supabase (Jacks Quote App, project ID `rlptjmkejfykisaefkeh`). Deployment via Railway (`Procfile`, `nixpacks.toml`); no new build steps or env vars required for this change.
- **Existing schema (verified via Supabase MCP):**
  - `public.quotes`: `id` uuid PK (default `uuid_generate_v4()`), `quote_number`, `servicem8_job_id`, etc. RLS off. Referenced by `job_performance.quote_id` (FK).
  - `public.profiles`: `user_id` uuid PK, FK → `auth.users.id`. RLS off. Technicians are `auth.users`; `job_personnel.technician_id` will FK to `auth.users.id` (same relation as profiles).
  - `public.labour_rates`, `public.products`, `public.saved_diagrams`, `public.servicem8_oauth` unchanged and unused by these new tables.
- **Existing app behaviour:** No backend or frontend code reads or writes `bonus_periods`, `job_performance`, or `job_personnel`. Quote flow uses `POST /api/calculate-quote` (no insert into `quotes` in current code paths). Diagrams use `saved_diagrams` and optional `servicem8_job_id`. Adding these tables is **additive only**; no existing code paths are modified.

---

## 2. Impact summary

| Area | Impact |
|------|--------|
| **Desktop UI** | None. Schema only. |
| **Mobile UI** | None. Schema only. |
| **Railway deploy** | No change. Migrations run against Supabase (Dashboard or MCP), not via the app deploy. |
| **Existing APIs** | No change. No new env vars. |
| **Existing tables** | No alters. New tables only; FKs reference existing `public.quotes.id` and `auth.users.id`. |

---

## 3. Table definitions (exact spec)

### 3.1 `public.bonus_periods`

- **Purpose:** Handles “10% of Gross Profit goes into a pot every fortnight/week/month” and global callback deductions.
- **RLS:** Off.
- **Primary key:** `id` (uuid).

| Column | Type | Nullable | Default | Constraints / notes |
|--------|------|----------|---------|---------------------|
| id | uuid | no | uuid_generate_v4() | PK |
| period_name | varchar | no | — | e.g. "Fortnight Ending Mar-08-2026" |
| start_date | date | no | — | |
| end_date | date | no | — | |
| status | varchar | no | 'open' | CHECK: status IN ('open','processing','closed') |
| created_at | timestamptz | yes | now() | |

### 3.2 `public.job_performance`

- **Purpose:** Central ledger for every completed ServiceM8 job: financials, parts runs, callback rules; used to compute Job $GP and apply penalties before bonus pool.
- **RLS:** Off.
- **Primary key:** `id` (uuid).

| Column | Type | Nullable | Default | Constraints / notes |
|--------|------|----------|---------|---------------------|
| id | uuid | no | uuid_generate_v4() | PK |
| servicem8_job_id | varchar | no | — | UNIQUE. Links to finalized ServiceM8 job. |
| quote_id | uuid | yes | — | FK → public.quotes.id |
| bonus_period_id | uuid | yes | — | FK → public.bonus_periods.id |
| invoiced_revenue_exc_gst | numeric | no | — | Final billed amount from ServiceM8 |
| materials_cost | numeric | no | — | Total actual cost of materials used |
| quoted_labor_minutes | integer | no | — | For 15% / 30-min Estimation Accuracy Rule |
| standard_parts_runs | integer | yes | 0 | Count of runs; admin multiplies by $20 from Job GP |
| seller_fault_parts_runs | integer | yes | 0 | $20 deduction from Seller's 60% share |
| missed_materials_cost | numeric | yes | 0 | Deducted from Seller's share |
| is_callback | boolean | yes | false | Return visit? |
| callback_reason | varchar | yes | — | CHECK: IS NULL OR IN ('poor_workmanship','bad_scoping') |
| callback_cost | numeric | yes | 0 | Deducted from Period Pot |
| created_at | timestamptz | yes | now() | |

**Foreign keys:**  
`quote_id` → `public.quotes.id`  
`bonus_period_id` → `public.bonus_periods.id`

### 3.3 `public.job_personnel`

- **Purpose:** 2 Visit Rule, Truck Share Rule, “Do it all, get it all.” Many-to-one mapping of techs to a job: who was seller, who was executor, and time (onsite + travel/shopping).
- **RLS:** Off.
- **Primary key:** `id` (uuid).

| Column | Type | Nullable | Default | Constraints / notes |
|--------|------|----------|---------|---------------------|
| id | uuid | no | uuid_generate_v4() | PK |
| job_performance_id | uuid | no | — | FK → public.job_performance.id |
| technician_id | uuid | no | — | FK → auth.users.id |
| is_seller | boolean | yes | false | Proportional split of 60% pot |
| is_executor | boolean | yes | false | Proportional split of 40% pot |
| onsite_minutes | integer | no | 0 | Time on tools |
| travel_shopping_minutes | integer | no | 0 | “Clock Keeps Ticking” rule |
| created_at | timestamptz | yes | now() | |

**Foreign keys:**  
`job_performance_id` → `public.job_performance.id`  
`technician_id` → `auth.users.id`

---

## 4. Implementation steps (100% correct, no assumptions)

1. **Apply one migration** (via Supabase MCP `apply_migration` or Dashboard SQL Editor) that:
   - Creates `public.bonus_periods` with columns and CHECK on `status` as above. RLS off (default for new table; do not enable).
   - Creates `public.job_performance` with columns, UNIQUE on `servicem8_job_id`, CHECK on `callback_reason`, FKs to `public.quotes(id)` and `public.bonus_periods(id)`. RLS off.
   - Creates `public.job_personnel` with columns and FKs to `public.job_performance(id)` and `auth.users(id)`. RLS off.
2. **Use consistent UUID default:** Existing tables use `uuid_generate_v4()` (e.g. `quotes`, `labour_rates`). Use `uuid_generate_v4()` for all three new tables so behaviour matches; the `uuid-ossp` (or equivalent) extension is already enabled in this project.
3. **Do not** alter `public.quotes`, `public.profiles`, or `auth.users`. Do not enable RLS on the new tables unless a future task explicitly requires it.
4. **Document:** Update `docs/BACKEND_DATABASE.md` to add a short “Bonus / job performance” subsection listing the three tables and their purpose and FKs (and that RLS is off).

---

## 5. Migration SQL (single migration, run in order)

Order matters: `bonus_periods` first (no FKs), then `job_performance` (FKs to `quotes` and `bonus_periods`), then `job_personnel` (FKs to `job_performance` and `auth.users`).

```sql
-- 1. bonus_periods
CREATE TABLE public.bonus_periods (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  period_name varchar NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status varchar NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'processing', 'closed')),
  created_at timestamptz DEFAULT now()
);

-- 2. job_performance
CREATE TABLE public.job_performance (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  servicem8_job_id varchar NOT NULL UNIQUE,
  quote_id uuid REFERENCES public.quotes(id),
  bonus_period_id uuid REFERENCES public.bonus_periods(id),
  invoiced_revenue_exc_gst numeric NOT NULL,
  materials_cost numeric NOT NULL,
  quoted_labor_minutes integer NOT NULL,
  standard_parts_runs integer DEFAULT 0,
  seller_fault_parts_runs integer DEFAULT 0,
  missed_materials_cost numeric DEFAULT 0,
  is_callback boolean DEFAULT false,
  callback_reason varchar
    CHECK (callback_reason IS NULL OR callback_reason IN ('poor_workmanship', 'bad_scoping')),
  callback_cost numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- 3. job_personnel
CREATE TABLE public.job_personnel (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_performance_id uuid NOT NULL REFERENCES public.job_performance(id),
  technician_id uuid NOT NULL REFERENCES auth.users(id),
  is_seller boolean DEFAULT false,
  is_executor boolean DEFAULT false,
  onsite_minutes integer NOT NULL DEFAULT 0,
  travel_shopping_minutes integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
```

Suggested migration name: `add_bonus_periods_job_performance_job_personnel`.

---

## 6. Edge cases and safeguards

- **Existing quotes:** `job_performance.quote_id` is nullable; jobs can be recorded without a linked quote. No backfill or change to existing `quotes` rows required.
- **Existing auth:** `job_personnel.technician_id` references `auth.users.id`; only real auth users can be linked. Same as `profiles.user_id` and `saved_diagrams.user_id`.
- **ServiceM8 job id uniqueness:** One `job_performance` row per finalized ServiceM8 job (UNIQUE on `servicem8_job_id`). Prevents duplicate ledger entries.
- **Referential integrity:** Deleting a bonus period or a job performance row would cascade or restrict depending on future policy; for now, no ON DELETE is specified (default RESTRICT), which is safe for a ledger.
- **Railway:** No code or config changes; deploy continues to use existing Procfile and nixpacks. Supabase migrations are applied to the Supabase project only.

---

## 7. Task list update (draft)

After implementation:

- In **`docs/tasks/section-58.md`** (or the section file that holds this work): mark the “Add three Supabase tables (bonus_periods, job_performance, job_personnel)” task as complete (`[x]`).
- In **`TASK_LIST.md`**: remove the row for this task from the uncompleted table when the section is fully complete (or leave the row until the section is fully done).

No other sections or files need checkbox changes for this schema-only work.

---

## 8. Follow-up (Section 59 — ServiceM8 job link)

**Audit (BACKEND_DATABASE.md):** ServiceM8 job syncing audit found we store only the job number (`servicem8_job_id`) in `saved_diagrams` and have no `job_uuid` fallback in `job_performance`. To keep the link robust and support API lookups by uuid:

- **Section 59 tasks 59.4.1–59.4.4:** Add nullable `servicem8_job_uuid` to `saved_diagrams` and to `job_performance`; extend diagrams API and frontend to capture and persist both identifiers when Add to Job / Create New Job runs. Optional: return both from add-to-job response.
- **When persisting to `public.quotes`** (59.3 option A): add nullable `servicem8_job_uuid` to quotes if needed and store both job number and uuid.
- **Quote items (Missed Materials):** When saving a quote, set `public.quotes.items` (JSONB) to a clean array of material lines with at least `{ id, qty }` per line (exclude labour) so we can compare to ServiceM8 material usage for Missed Materials detection. See BACKEND_DATABASE.md “Audit: Material quoting and public.quotes.items” and Section 59 task 59.19.1.
