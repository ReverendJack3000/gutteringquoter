# AGENTS.md

## Cursor Cloud specific instructions

### Architecture overview

Single-service app: Python 3.12 FastAPI backend (`backend/`) serves a vanilla HTML/CSS/JS frontend (`frontend/`) as static files on port 8000. No frontend build step. Supabase is the sole external dependency (hosted PostgreSQL + Auth + Storage). ServiceM8 OAuth integration is optional.

### Running the dev server

```bash
./scripts/run-server.sh
```

Server starts at `http://127.0.0.1:8000/`. Health check: `GET /api/health`. The script auto-activates the venv at `backend/.venv` if present. See README for manual alternative and env overrides (`HOST`, `PORT`, `PWA_ENABLED`).

### Running tests

- **Backend unit tests:** `./scripts/run-backend-tests.sh` (runs from project root)
- **E2E tests (Puppeteer):** Start the server first, then `./scripts/run-e2e.sh` or `npm test`
- See README for headed mode (`npm run test:manual`) and custom base URL

### Linting

No formal linter (ESLint, ruff, flake8, etc.) is configured in this project.

### Key gotchas

- The server **will not start** without `SUPABASE_URL` and at least one of `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` in `backend/.env`. Copy from `backend/.env.example` and set the real project URL (`https://rlptjmkejfykisaefkeh.supabase.co`). The example file already contains a key.
- `python3.12-venv` system package must be installed before creating the venv (`sudo apt-get install -y python3.12-venv`).
- System libraries `libgl1`, `libglib2.0-0`, `libcairo2`, `libgdk-pixbuf-2.0-0` are required for OpenCV and CairoSVG. They are typically pre-installed in the Cloud Agent environment.
- Backend tests must run with `backend/` as cwd so the `app` package resolves (the helper script handles this).
- E2E tests require the server to be running; `./scripts/run-e2e.sh` checks and exits with instructions if not.
- On Ubuntu Noble, use `libgl1` (not `libgl1-mesa-glx`, which is unavailable).
