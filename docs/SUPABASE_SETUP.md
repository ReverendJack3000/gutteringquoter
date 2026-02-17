# Supabase setup for Quote App

Use this when you create a Supabase project. The app works without Supabase today; these steps prepare for database, storage, or auth later.

---

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in.
2. **New project** → choose org, name (e.g. `quote-app`), database password, region.
3. Wait for the project to be ready.

---

## 2. Get API keys and URL

In the Supabase dashboard:

- **Project Settings** → **API**:
  - **Project URL** → use as `SUPABASE_URL`
  - **anon public** key → safe for frontend (e.g. browser)
  - **service_role** key → **secret**, backend-only; use as `SUPABASE_SERVICE_ROLE_KEY`

---

## 3. Backend environment variables

In the **backend** directory, copy the example env file and fill in your values:

```bash
cd backend
cp .env.example .env
```

Edit `.env` (do not commit it):

```env
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

- **SUPABASE_URL** – Project URL from step 2.
- **SUPABASE_SERVICE_ROLE_KEY** – service_role key from step 2. Use only on the server; never in the frontend.

These are **required**: the backend always uses Supabase. Without them, the server will not start (you’ll see a clear error). Local server testing uses the same Supabase project (Jacks Quote App).

---

## 4. (Optional) Tables for later

When you want to move data to Supabase, you can add tables in **SQL Editor** or Table Editor. Examples:

**Products** (to replace the hardcoded list):

```sql
create table if not exists products (
  id text primary key,
  name text not null,
  category text not null,
  thumbnail_url text not null,
  diagram_url text not null,
  created_at timestamptz default now()
);

-- Optional: insert the MVP products
insert into products (id, name, category, thumbnail_url, diagram_url) values
  ('gutter', 'Gutter', 'channel', '/assets/marley/gutter.svg', '/assets/marley/gutter.svg'),
  ('downpipe', 'Downpipe', 'pipe', '/assets/marley/downpipe.svg', '/assets/marley/downpipe.svg'),
  ('bracket', 'Bracket', 'fixing', '/assets/marley/bracket.svg', '/assets/marley/bracket.svg'),
  ('stopend', 'Stop End', 'fitting', '/assets/marley/stopend.svg', '/assets/marley/stopend.svg'),
  ('outlet', 'Outlet', 'fitting', '/assets/marley/outlet.svg', '/assets/marley/outlet.svg'),
  ('dropper', 'Dropper', 'fitting', '/assets/marley/dropper.svg', '/assets/marley/dropper.svg')
on conflict (id) do nothing;
```

**Storage bucket** (for uploads or exports):

- **Storage** → **New bucket** (e.g. `blueprints`, private or public as needed).
- Use the Supabase Storage API from the backend (with the service role key) when you implement save/load.

---

## 5. (Optional) Auth

If you add user accounts later:

- **Authentication** → **Providers** (e.g. Email, Google).
- Use the **anon** key in the frontend with `@supabase/supabase-js` for sign-in; use the **service_role** key only on the backend for admin or trusted operations.

---

## Summary

| What you need now | Action |
|-------------------|--------|
| Supabase project | Create in dashboard |
| Backend env | Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to `backend/.env` (from `.env.example`) |
| Tables / storage / auth | Add when you’re ready; the app runs without them |

After creating the project, fill in `backend/.env` as in step 3. The codebase can then be extended to read products from Supabase, store files in Storage, or use Auth.
