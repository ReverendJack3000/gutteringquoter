# ServiceM8 API key – local scripts only

This folder contains **local dev/testing scripts** that use `SERVICEM8_API_KEY` (from `backend/.env`). They are not part of the application or deployment.

**Rules:**

- **All** scripts that call the ServiceM8 API using the API key (X-API-Key) must live in this folder. Do not add API-key-based ServiceM8 scripts elsewhere.
- **Never rewrite project files** for the sake of these scripts. Do not change app code, backend routes, or shared config to support them. Keep scripts self-contained and only depend on `backend/.env` for the key.
- The app uses **OAuth 2.0 only** for ServiceM8; see TASK_LIST.md (locked decisions) and `.cursor/rules/servicem8-auth.mdc`.

**Run from project root**, e.g.:

```bash
python scripts/servicem8-api-key-local/query_servicem8.py jobs --limit 5
python scripts/servicem8-api-key-local/query_servicem8.py staff
```

**Sync staff to Supabase (local):**

To pull all ServiceM8 staff and upsert into `public.servicem8_staff` (reference cache for Section 59):

```bash
python scripts/servicem8-api-key-local/sync_staff_to_supabase.py
```

Requires `backend/.env` with `SERVICEM8_API_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`. Run from an environment where `supabase` is installed (e.g. backend venv: `pip install supabase`).
