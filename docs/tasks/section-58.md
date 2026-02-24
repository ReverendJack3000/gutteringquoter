## 58. Bonus period and job performance schema (Supabase)

*Context: Add three tables to support bonus-period math, job financials/callbacks, and technician job attribution. Schema only; no UI or API changes. Plan: docs/plans/2026-02-23-bonus-periods-job-performance-schema.md.*

**Completed**

- [x] **58.1** Add `public.bonus_periods` table: id (uuid PK), period_name, start_date, end_date, status (CHECK open/processing/closed), created_at. RLS off.
- [x] **58.2** Add `public.job_performance` table: id (uuid PK), servicem8_job_id (UNIQUE), quote_id (FK → quotes.id), bonus_period_id (FK → bonus_periods.id), invoiced_revenue_exc_gst, materials_cost, quoted_labor_minutes, standard_parts_runs, seller_fault_parts_runs, missed_materials_cost, is_callback, callback_reason (CHECK NULL or poor_workmanship/bad_scoping), callback_cost, created_at. RLS off.
- [x] **58.3** Add `public.job_personnel` table: id (uuid PK), job_performance_id (FK → job_performance.id), technician_id (FK → auth.users.id), is_seller, is_executor, onsite_minutes, travel_shopping_minutes, created_at. RLS off.
- [x] **58.4** Update `docs/BACKEND_DATABASE.md` with a short subsection describing the three tables, their purpose, and FKs (RLS off).
