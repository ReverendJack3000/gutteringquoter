# Supabase migrations log

Migrations are applied via **Supabase MCP** (`apply_migration`) to project **Jacks Quote App** (ID: `rlptjmkejfykisaefkeh`). Full history: use MCP `list_migrations` or Supabase Dashboard → Database → Migrations.

---

## Session 2026-03-02: Commission attribution (Section 59.25, 59.28, 59.29)

**Applied via MCP:**

### 1. `add_quotes_commission_attribution_columns`

- **Purpose:** Store job creator and optional co-seller at quote time for GP commission attribution.
- **Changes:**
  - `public.quotes.created_by` — uuid, nullable, REFERENCES auth.users(id). Section 59.25: user who created the quote from the app (Add to Job / Create New Job).
  - `public.quotes.co_seller_user_id` — uuid, nullable, REFERENCES auth.users(id). Section 59.28: optional co-seller when Create New Job included coSellerUserId.
- **Supabase version:** `20260302231627` (from `list_migrations`).

### 2. `add_job_performance_payment_date`

- **Purpose:** Store when the job was paid for 60.7 period assignment (cut-off 11:59 PM last Sunday of fortnight).
- **Changes:**
  - `public.job_performance.payment_date` — timestamptz, nullable. Populated from ServiceM8 job response `payment_date` in job_performance_sync.
- **Supabase version:** `20260302231629` (from `list_migrations`).

**Documentation updated:** `docs/BACKEND_DATABASE.md` (quotes table columns, job_performance additions, migrations list).
