# Reconsideration: Enrich existing tables? + Full effect trace

**Date:** 2026-02-23  
**Context:** Before implementing the three new tables (bonus_periods, job_performance, job_personnel), reconsider whether enriching existing tables (especially profiles) makes sense, and trace all effects of adding this schema.

---

## 1. Should we enrich existing tables?

### 1.1 `public.profiles`

**Current role:** One row per auth user. Columns: `user_id` (PK, FK → auth.users.id), `role` (viewer | editor | technician | admin), `created_at`, `updated_at`. Used for:

- **Backend:** Admin list (merge auth.users + profiles → user_id, email, role); PATCH role (upsert user_id + role); invite (upsert user_id + role after invite); last-admin checks (count where role = 'admin'); delete user (delete profile row).
- **Auth:** Custom Access Token Hook reads `profiles.role` and sets JWT `app_metadata.role`. No other profile columns are read by the hook.
- **Frontend:** User Permissions table shows role; invite modal sends role. No other profile fields displayed.

**Could we put bonus/job data on profiles?**

- **Technician identity:** job_personnel needs to link “this person” to a job. Today we FK `technician_id` → auth.users.id. We could FK → profiles.user_id instead (1:1 with auth.users). That would mean “only users with a profile can be assigned to jobs,” which is already true in practice (invite/signup create a profile). So either FK is valid. Enriching profiles doesn’t remove the need for job_personnel: we still need a table of *assignments* (who was on which job, is_seller, is_executor, minutes). So we don’t replace job_personnel by adding columns to profiles.

- **Bonus-eligible flag:** We could add an optional attribute on the *person*, e.g. `bonus_eligible boolean DEFAULT false`. Then “technicians who get bonus calculations” = users with role technician (or editor) and bonus_eligible = true. That avoids a separate “technician_bonus_eligibility” table and keeps a single place for “is this user in the bonus pool?” Effect: one optional column; existing backend only selects/upserts user_id and role, so adding a nullable or defaulted column is safe. Invite and PATCH don’t need to send it (default applies). Custom Access Token Hook doesn’t need to read it. So **optional enrichment:** add something like `bonus_eligible boolean DEFAULT false` (or `true` for technicians, depending on policy) if we want the person record to carry that flag. Not required for the three-table design; it’s a convenience for future “filter by bonus_eligible” without extra joins.

- **Per-period or per-job data on profiles:** Wrong place. Bonus periods are global (one row per period in bonus_periods). Job-level data is many rows per job (job_performance). Per-job-per-person is many rows (job_personnel). Putting any of that on profiles would duplicate data or force arrays/JSON and complicate updates. So we do **not** put period/job/ledger data on profiles.

**Conclusion (profiles):** The three new tables stay as designed. Optionally we can add a small number of technician/bonus attributes to profiles (e.g. bonus_eligible, or display_name for pay slips) in a separate migration if we want; that does not replace bonus_periods, job_performance, or job_personnel.

---

### 1.2 `public.quotes`

**Current role:** Quote estimates (quote_number, customer_name, items JSONB, labour, totals, status, servicem8_job_id, etc.). No app code currently inserts into quotes (calculate-quote returns computed totals; future “save quote” or ServiceM8 sync would write here).

**Enrichment?** job_performance already has optional `quote_id` FK → quotes.id to link a completed job to the original estimate. We don’t need to add bonus or job columns to quotes. Quotes remain “the estimate”; job_performance is “the completed job ledger.” No enrichment of quotes.

---

### 1.3 `public.saved_diagrams`

**Current role:** Per-user diagram state; optional `servicem8_job_id` when diagram was added to a ServiceM8 job.

**Enrichment?** Diagram is “this blueprint linked to a job number.” job_performance is “this completed job’s financials.” Different concepts. We could later add a logical link (e.g. “diagrams where servicem8_job_id = job_performance.servicem8_job_id”) but we don’t add bonus or personnel columns to saved_diagrams. No enrichment.

---

### 1.4 Other tables

- **products, labour_rates, servicem8_oauth:** No bonus/job/period data belongs there. No enrichment.

---

## 2. Full effect trace of adding the three tables

### 2.1 Database

| What | Effect |
|------|--------|
| **New tables** | bonus_periods, job_performance, job_personnel created. No ALTER on any existing table. |
| **Existing tables** | No schema change. No new columns, no new constraints on profiles, quotes, saved_diagrams, products, labour_rates, servicem8_oauth. |
| **Foreign keys** | job_performance.quote_id → quotes.id; job_performance.bonus_period_id → bonus_periods.id; job_personnel.job_performance_id → job_performance.id; job_personnel.technician_id → auth.users.id. All reference existing PKs. |
| **Indexes / RLS** | Only what the migration defines (e.g. UNIQUE on job_performance.servicem8_job_id). RLS off on new tables. No change to existing RLS. |
| **Migrations** | One new migration in Supabase (e.g. add_bonus_periods_job_performance_job_personnel). Applied via MCP or Dashboard; not part of app deploy. |

So: **zero impact on existing table definitions or existing data.**

---

### 2.2 Backend (main.py, auth.py, diagrams, servicem8, etc.)

| Code path | Reads/writes | Effect of new tables |
|-----------|--------------|----------------------|
| Auth (auth.py) | JWT; no DB read for role (role from JWT set by hook from profiles) | None. New tables not in auth flow. |
| GET/POST/PATCH/DELETE diagrams | saved_diagrams, Storage | None. New tables not touched. |
| GET /api/admin/user-permissions | auth.users (admin API), profiles (user_id, role) | None. Still only profiles for role. |
| PATCH /api/admin/user-permissions/{id} | profiles upsert (user_id, role) | None. |
| POST /api/admin/user-permissions/invite | auth.admin.invite, profiles upsert (user_id, role) | None. |
| DELETE /api/admin/user-permissions/{id} | auth.admin.delete_user, profiles delete | None. |
| GET /api/products, POST update-pricing, import-csv | products | None. |
| POST /api/calculate-quote | products (pricing), no quotes insert | None. |
| ServiceM8 OAuth / Add to Job | servicem8_oauth, saved_diagrams, external API | None. New tables not in current flow. |
| ensure_super_admin.py | profiles upsert (user_id, role) | None. |

So: **no existing backend code path reads or writes the new tables.** When we later add bonus/period/job features, new (or extended) endpoints will do so; that’s future work.

---

### 2.3 Frontend (app.js, index.html, styles.css)

| Code path | Data used | Effect of new tables |
|-----------|-----------|----------------------|
| Auth state, deriveAuthRole | JWT (role from profiles via hook) | None. |
| User Permissions list/save/invite/remove | GET/PATCH/POST/DELETE admin endpoints → profiles + auth | None. |
| Quote modal, calculate-quote | POST /api/calculate-quote, state.products | None. |
| Diagram list/save/load | diagrams API → saved_diagrams | None. |
| Products panel, canvas, export | products, diagrams, no bonus tables | None. |
| Mobile/desktop viewport, toolbar, etc. | No server-side bonus data | None. |

So: **no frontend code path touches the new tables.** Desktop and mobile behaviour unchanged.

---

### 2.4 Auth / JWT (Supabase Custom Access Token Hook)

- Hook reads `public.profiles` (role) and sets `app_metadata.role` in the token. It does not read bonus_periods, job_performance, or job_personnel. Adding those tables does not change token contents or hook behaviour.

---

### 2.5 Scripts and config

- **ensure_super_admin.py:** Only touches profiles. No effect.
- **Railway (Procfile, nixpacks.toml):** No schema in repo; no new env vars. Migrations run in Supabase. Deploy unchanged.
- **.env:** No new variables required for the three tables.

---

### 2.6 Future code that will use the new tables

When we implement bonus/period/job features:

- New or extended APIs will read/write bonus_periods (e.g. list periods, set status), job_performance (e.g. create ledger row when job is finalized, update callback fields), job_personnel (e.g. assign techs to a job, record minutes).
- Those APIs will need auth rules (e.g. who can create job_performance: admin only? technician?).
- UI may join job_personnel to profiles or auth.users to show technician names (e.g. in a bonus report). That’s new code; it doesn’t change existing profiles usage.

So: **the only place that will “see” the new tables is future feature code.** No existing path is affected.

---

### 2.7 If we also add an optional `profiles` enrichment (e.g. bonus_eligible)

| What | Effect |
|------|--------|
| Migration | ALTER profiles ADD COLUMN bonus_eligible boolean DEFAULT false (or similar). |
| Backend | Current code only selects user_id/role and upserts user_id+role. New column is nullable or defaulted, so no change required. Future bonus logic can filter by bonus_eligible if desired. |
| Hook | Unchanged (still only reads role). |
| Frontend | No change unless we add a User Permissions or technician UI for the new field. |
| Invite / PATCH | Don’t need to send bonus_eligible; default applies. |

So: **optional profiles enrichment is low-risk and doesn’t replace the three-table design.**

---

## 3. Summary

- **Enrich profiles?** Optional. We can add a small set of technician/bonus attributes (e.g. bonus_eligible) in a later migration if we want “person-level” flags. We do **not** move period/job/ledger data onto profiles; the three new tables remain the right place for that.
- **Enrich quotes or saved_diagrams?** No. Quotes stay as estimates; job_performance links to them via quote_id. Diagrams stay as blueprint state; no bonus columns.
- **Effect of adding the three tables:** No change to existing tables, backend, frontend, auth, scripts, or deploy. Only future feature code will read/write bonus_periods, job_performance, and job_personnel.
