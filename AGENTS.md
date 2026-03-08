# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Quote App is a desktop-first web application for Clearstream Guttering (NZ). Users upload property photos, get technical blueprints via OpenCV, drag Marley guttering products onto them (Canva-style editor), build quotes, and export PNGs. The backend is Python 3.12 / FastAPI; the frontend is vanilla HTML/CSS/JS with no build step.

### Running the dev server

From the project root:

```bash
./scripts/run-server.sh
```

This activates `backend/.venv`, starts Uvicorn with `--reload` on `http://127.0.0.1:8000/`. Health check: `GET /api/health`.

The server requires Supabase credentials in `backend/.env`. Copy from `backend/.env.example` and set `SUPABASE_URL=https://rlptjmkejfykisaefkeh.supabase.co` plus a valid `SUPABASE_ANON_KEY` or `SUPABASE_SERVICE_ROLE_KEY`. See `README.md` for details.

### Running tests

- **Backend unit tests:** `./scripts/run-backend-tests.sh` (runs from `backend/` with unittest discover)
- **E2E tests (Puppeteer):** `npm test` (requires the dev server to be running on port 8000 first)
- **E2E helper script:** `./scripts/run-e2e.sh` (checks server is up before running)

### Lint

No dedicated linter (eslint, flake8, ruff) is configured in this project. Code quality is enforced through E2E and unit tests.

### Gotchas

- **System dependency:** `python3.12-venv` and `libcairo2-dev` must be installed for the Python venv and CairoSVG to work. These are pre-installed in the VM snapshot.
- **Cache busting:** The frontend uses versioned static assets (`?v=`). If you change frontend files and don't see updates, hard-reload with cache disabled or bump the version in `frontend/index.html` and `frontend/app.js` (`STATIC_ASSET_VERSION`). See `TROUBLESHOOTING.md` for details.
- **E2E test state:** The E2E suite expects the server at `http://127.0.0.1:8000` and runs headless Chrome. If a product-thumb click fails at the end of the suite, it is a known pre-existing panel-state issue.
- **Supabase credentials:** The server will not start without valid `SUPABASE_URL` and at least one of `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` in `backend/.env`. Project ID: `rlptjmkejfykisaefkeh`.
