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
| `SUPABASE_JWT_SECRET` | For saved diagrams | JWT secret (Supabase → Settings → API); used to verify Bearer tokens for `/api/diagrams` |

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

**Storage:** Bucket `blueprints` (public read). Paths: `{user_id}/{diagram_id}/blueprint.png`, `thumb.png`.

### 3. Future (optional)

- **`public.profiles`** – If using Supabase Auth: extend with app-specific profile fields; link to `auth.users` via `id`.

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
