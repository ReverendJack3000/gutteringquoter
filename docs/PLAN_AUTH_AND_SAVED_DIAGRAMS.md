# Implementation Plan: Auth, Multi-Tenancy & Saved Diagrams (Sections 33 & 34)

**Status:** Planning only — no code or schema changes yet.  
**Purpose:** Ensure we can implement auth, per-user data, and saved diagram files without harming existing functionality.  
**Related:** `TASK_LIST.md` Section 33 (Save/Load project files), Section 34 (Auth, multi-tenancy, per-user data).

---

## 1. Current State Summary

### 1.1 Application architecture

- **Frontend:** Vanilla HTML/CSS/JS; single-page app; all API calls go to the FastAPI backend (no direct Supabase from browser).
- **Backend:** FastAPI; uses `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (or anon) in `app/supabase_client.py`; all DB access server-side.
- **Supabase project:** Jacks Quote App, project ID `rlptjmkejfykisaefkeh`.

### 1.2 Existing Supabase schema (from MCP inspection)

| Table         | RLS   | Purpose                                      |
|---------------|-------|----------------------------------------------|
| `public.products` | ON  | Marley catalog; policies: public read, insert, update |
| `public.labour_rates` | OFF | Labour rates for quotes                  |
| `public.quotes`     | OFF | Quote records (quote_number, items JSONB, etc.) |
| `auth.users`       | —    | Supabase Auth (standard columns: id, email, etc.) |

- **Storage:** No buckets exist yet.
- **Auth:** Supabase Auth is available (`auth.users`); not used by the app today. No frontend auth flow.

### 1.3 Canvas state (what we need to save)

Serializable state is already defined by `cloneStateForUndo()` in `frontend/app.js`:

- **Elements:** `id`, `assetId`, `x`, `y`, `width`, `height`, `rotation`, `zIndex`, `color`, `baseScale`, `locked`, `sequenceId`, `measuredLength`.
- **Blueprint:** `blueprintTransform` (x, y, w, h, rotation, locked, opacity, zIndex); `hasBlueprint` boolean.
- **Blueprint image:** Currently an in-memory `HTMLImageElement` from `URL.createObjectURL(blob)` after upload. For persistence we must store image data (e.g. base64 or Supabase Storage URL).
- **Groups:** `groups[]` with `id`, `elementIds[]`.

View state (baseScale, baseOffsetX/Y, viewZoom, viewPanX/Y) is optional to persist for “restore view”; can be omitted in v1.

---

## 2. Feature 1: Auth & Multi-Tenancy (Section 34)

### 2.1 Goals

- **34.1:** Password protection and multi-tenancy: login and tenant isolation so each tenant’s data is separate.
- **34.2:** Per-user saved files (project/diagram files) — depends on auth and saved files.

**Tenant model (MVP):** One user = one tenant. No organizations/teams in scope; can add `org_id` later.

### 2.2 Auth approach (recommended)

- **Supabase Auth** (email + password for MVP): Use Supabase Auth in the frontend with the **anon** (publishable) key; backend receives the user’s JWT and either:
  - **Option A:** Backend verifies JWT (e.g. Supabase `get_user(jwt)` or verify with project JWT secret), extracts `user_id` (UUID from `auth.users.id`), and uses it for all per-user operations (saved diagrams, future RLS). Backend continues to use **service_role** for DB access and enforces “user can only see/edit own rows” in API logic.
  - **Option B:** Frontend uses Supabase client with anon key; after login, frontend sends JWT on each request (e.g. `Authorization: Bearer <access_token>`). Backend validates JWT and passes `user_id` into queries.

Recommendation: **Option A** — backend validates JWT, extracts `user_id`, and uses service_role for DB; no RLS on new tables initially, isolation enforced in API. RLS can be added later for defence-in-depth.

### 2.3 What stays unchanged

- **Products, labour_rates, quotes (current):** No `user_id` today; products and labour_rates are global (catalog/config). Quotes table has no `user_id` yet — we can add it when we want per-user quote history; until then, quote generation continues to work without auth.
- **Unauthenticated use:** Plan for an “anonymous” or “logged-out” mode: app still loads, products and blueprint processing work; “Save diagram” and “Recent files” require login (or save to browser only until we have auth). This avoids breaking existing flows before auth is implemented.
- **API surface:** Existing endpoints (`/api/health`, `/api/products`, `/api/process-blueprint`, `/api/labour-rates`, `/api/calculate-quote`, etc.) remain; new endpoints for auth (e.g. session/user) and for saved diagrams are additive.

### 2.4 Database / backend (auth)

- **No new tables required for auth** — `auth.users` is managed by Supabase.
- **Optional:** `public.profiles` (e.g. `id` UUID PK FK to `auth.users.id`, `display_name`, `created_at`) for app-specific profile; not required for MVP.
- **Backend:** Add JWT verification (e.g. Supabase `auth.get_user(access_token)` or verify JWT and read `sub`). Add middleware or dependency that sets `request.state.user_id` when `Authorization: Bearer <token>` is present; leave it `None` when no token (anonymous).
- **Frontend:** Login/signup UI (or redirect to Supabase-hosted auth); store access token (e.g. in memory or secure storage); send token on requests that need user (e.g. list/save/load diagrams).

---

## 3. Feature 2: Saved Diagrams / Blueprints (Section 33 + clock icon UI)

### 3.1 Goals

- Save current diagram/blueprint as a **file** (logical “saved project”): all elements, measurements, blueprint image, and optional view state.
- **Access:** Clock icon in header → dropdown showing **thumbnail**, **file name**, and **date saved**; click entry to open that diagram.
- Files are **per-user** once auth exists; before auth, can support “local only” (e.g. browser storage or download .json + image).

### 3.2 Data model (saved diagram)

One row per saved diagram:

| Column         | Type         | Description |
|----------------|--------------|-------------|
| `id`           | UUID         | Primary key (default gen_random_uuid()) |
| `user_id`      | UUID         | FK to `auth.users.id`; NULL = anonymous (if we allow local-only saves) |
| `name`         | VARCHAR(255) | User-facing name (e.g. “House North – Feb 2026”) |
| `data`         | JSONB        | Serialized canvas state: elements, blueprintTransform, groups; no image bytes here (see below) |
| `blueprint_image_url` | TEXT  | Optional: URL of blueprint image in Supabase Storage (or null if no blueprint) |
| `thumbnail_url`| TEXT         | Optional: URL of small preview image in Storage (for dropdown) |
| `created_at`   | TIMESTAMPTZ  | When saved (default now()) |
| `updated_at`   | TIMESTAMPTZ  | Last update (default now()) |

**Blueprint image handling:**

- **Option A (recommended):** Upload blueprint PNG to Supabase Storage (e.g. bucket `blueprints`, path `{user_id}/{diagram_id}/blueprint.png`); store public or signed URL in `blueprint_image_url`. On load, fetch image from URL.
- **Option B:** Store base64 data URL in `data` JSONB (e.g. `data.blueprintImageDataUrl`). Simpler but large rows and slower; acceptable for small images or MVP.
- **Thumbnail:** Generate small PNG (e.g. 200×150) on save (frontend canvas or backend) and upload to Storage; store URL in `thumbnail_url` for dropdown.

### 3.3 New Supabase objects (to add via migrations)

1. **Table: `public.saved_diagrams`**  
   Columns as above. Indexes: `user_id`, `created_at DESC` (for “recent” list).  
   RLS: OFF initially; isolation by `user_id` in API. Later: enable RLS with policy `auth.uid() = user_id`.

2. **Storage bucket: `blueprints`** (or `diagrams`)  
   - Private recommended; access via signed URLs or backend proxy.  
   - Structure: `{user_id}/{diagram_id}/blueprint.png`, `{user_id}/{diagram_id}/thumb.png`.  
   - Policies: allow insert/select/update/delete only when `auth.uid() = user_id` (when using Supabase client with user JWT); or backend uses service_role and enforces user_id in path.

### 3.4 Backend API (saved diagrams)

All behind “optional auth”: if no JWT, return 401 for list/save/load; or support “anonymous” saves to browser only.

- **GET `/api/diagrams`**  
  Returns list of saved diagrams for the current user: `[{ id, name, thumbnail_url, created_at, updated_at }, ...]` (no `data`). Requires valid JWT.

- **POST `/api/diagrams`**  
  Body: `name`, `data` (JSONB), optional `blueprint_image` (base64 or multipart file), optional `thumbnail` (base64 or multipart). Backend: create row in `saved_diagrams`, upload image/thumb to Storage, set `blueprint_image_url` and `thumbnail_url`. Returns `{ id, name, created_at, ... }`. Requires JWT.

- **GET `/api/diagrams/{id}`**  
  Returns full diagram for current user: `{ id, name, data, blueprint_image_url, ... }`. Backend checks `user_id` matches JWT. Frontend loads blueprint image from `blueprint_image_url` (fetch or signed URL).

- **PATCH `/api/diagrams/{id}`**  
  Update name and/or data and/or image. Requires JWT and ownership.

- **DELETE `/api/diagrams/{id}`**  
  Delete row and optionally Storage objects. Requires JWT and ownership.

Backend must: validate JWT, set `user_id` from JWT for all diagram operations; never return or modify another user’s diagrams.

### 3.5 Frontend (save/load and clock icon)

- **Serialization:** Reuse the same shape as `cloneStateForUndo()` for `data` (elements, blueprintTransform, groups). Do **not** put `blueprintImageRef` (Image object) in payload; send blueprint as separate image upload or base64 in a dedicated field.
- **Save flow:** User clicks “Save” (or “Save as”) → prompt for name if new → build `data` from current state, upload blueprint image (if any) → POST `/api/diagrams` (with JWT). On success, refresh “recent” list.
- **Clock icon:** In header (e.g. toolbar-left or toolbar-right), add a clock/history icon; click opens a dropdown.
- **Dropdown content:** List from GET `/api/diagrams`: each item shows **thumbnail** (img from `thumbnail_url` or placeholder), **name**, **date saved** (`created_at`). Click item → GET `/api/diagrams/{id}` → load `data` into canvas, load blueprint from `blueprint_image_url` → call existing `restoreStateFromSnapshot`-style logic (without `blueprintImageRef`; load image from URL instead).
- **Load/restore:** New helper similar to `restoreStateFromSnapshot(snapshot)` but: (1) snapshot comes from API (no `blueprintImageRef`); (2) if `blueprint_image_url` present, fetch image and set `state.blueprintImage` and `state.blueprintTransform` from `data.blueprintTransform`; (3) restore elements and groups from `data`. Ensure `nextSequenceId` and measurement deck stay consistent.

### 3.6 What stays unchanged

- **Canvas behaviour:** Selection, move, resize, rotate, undo, export PNG, quote generation, measurement deck — unchanged. Save/load only sets `state.elements`, `state.blueprintImage`, `state.blueprintTransform`, `state.groups` and redraws.
- **Products and quotes:** Unchanged; no `user_id` on products or labour_rates; quotes can stay global until we add per-user quote history.
- **Existing endpoints:** No changes to `/api/products`, `/api/process-blueprint`, `/api/calculate-quote`, etc.

---

## 4. Implementation Order (safe sequence)

1. **Database (migrations only)**  
   - Add `public.saved_diagrams` table (id, user_id, name, data JSONB, blueprint_image_url, thumbnail_url, created_at, updated_at).  
   - Create Storage bucket `blueprints` with policies (e.g. service_role only for backend; or RLS by auth.uid() if frontend uploads with user JWT).  
   No code changes to existing tables.

2. **Backend: JWT + optional auth**  
   - Add dependency/middleware to verify `Authorization: Bearer <token>` and set `request.state.user_id`.  
   - Add GET/POST/GET-by-id/PATCH/DELETE for `/api/diagrams` using `user_id`; no changes to existing routes.

3. **Backend: diagram persistence**  
   - Implement upload of blueprint image and thumbnail to Storage; store URLs in `saved_diagrams`.  
   - Ensure all diagram operations filter by `user_id` from JWT.

4. **Frontend: auth UI**  
   - Login/signup (Supabase Auth or backend proxy); store and send JWT.  
   - Keep app usable when logged out (no “Save diagram” to server; optional “Save to browser” or “Download .json” later).

5. **Frontend: save diagram**  
   - “Save” button (or in menu); serialize state; upload blueprint; POST `/api/diagrams`.  
   - Do not change existing canvas or undo logic; only add new actions.

6. **Frontend: clock icon + dropdown**  
   - Clock icon in header; dropdown lists GET `/api/diagrams` with thumbnail, name, date.  
   - Click item → load diagram (GET by id, restore state, load blueprint from URL).

7. **Polish**  
   - Thumbnail generation (frontend canvas or backend), error handling, empty states.

---

## 5. Risks and Mitigations

| Risk | Mitigation |
|------|-------------|
| Breaking existing app for unauthenticated users | All new behaviour behind auth; existing endpoints and UI unchanged until user opts into login/save. |
| RLS or policies lock out backend | Use service_role for backend; enforce user_id in API. Add RLS later with `auth.uid() = user_id` if needed. |
| Blueprint image size / performance | Store in Storage (URL in DB), not huge base64 in JSONB; thumbnail for list view. |
| Restore state breaks undo or measurement deck | Reuse same element/blueprint shape as undo snapshot; after load, reset undo stack and refresh measurement deck from restored `sequenceId`/`measuredLength`. |
| Confusion between “quotes” and “saved diagrams” | Quotes = pricing records (existing); saved diagrams = full canvas state (new). Different tables and APIs. |

---

## 6. Summary

- **Auth (34):** Supabase Auth (email/password); JWT to backend; backend verifies and uses `user_id` for per-user data; no change to products/quotes/process-blueprint.
- **Saved diagrams (33):** New table `saved_diagrams` + Storage for blueprint/thumbnail; new API under `/api/diagrams`; frontend clock icon + dropdown (thumbnail, name, date) and load/save flows.
- **Safety:** New migrations and new endpoints only; existing tables and endpoints untouched; unauthenticated users can continue using the app without save-to-server until we add optional “local save” or require login for save.

This plan is ready for implementation when you start Section 33/34; no code or schema changes have been made in this step.
