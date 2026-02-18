# Deploying Quote App to Railway

This guide walks through deploying the Quote App (FastAPI backend + static frontend) to [Railway](https://railway.app). Supabase stays external; Railway runs the app and serves the frontend.

## Prerequisites

- **Railway account:** [railway.app](https://railway.app) (sign in with GitHub recommended).
- **Git repo:** Push the code to GitHub, GitLab, or Bitbucket. Railway deploys from a connected repo.
- **Supabase:** Your **Jacks Quote App** project with `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` (from [Supabase → Settings → API](https://supabase.com/dashboard/project/rlptjmkejfykisaefkeh/settings/api)).

## 1. Push code to Git

If the project is not yet in a Git repo:

```bash
cd "/path/to/Quote App"
git init
git add .
git commit -m "Initial commit for Railway deploy"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

Ensure `backend/.env` is **not** committed (it should be in `.gitignore`).

## 2. Create a Railway project

1. Go to [railway.app](https://railway.app) and sign in.
2. **New Project** → **Deploy from GitHub repo** (or GitLab/Bitbucket).
3. Select the Quote App repository and the branch to deploy (e.g. `main`).
4. Railway will detect the app and use the **root** of the repo (monorepo with `backend/` and `frontend/`).

## 3. Build and run configuration

The repo already includes:

- **railway.json:** Forces the **Nixpacks** builder (so Railway doesn’t treat the repo as Node-only because of the root `package.json` for E2E) and sets the start command: `cd backend && uvicorn main:app --host 0.0.0.0 --port $PORT`.
- **Procfile:** Same start command; used if no config override.
- **nixpacks.toml:** Tells Nixpacks to install dependencies from `backend/requirements.txt` (not root).
- **runtime.txt:** Optional; suggests Python 3.12 for the build.

No extra build step is needed; the frontend is static and served by FastAPI from `frontend/`.

## 4. Environment variables

In the Railway dashboard: open your project → **Variables** (or **Settings → Variables**). Add:

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | e.g. `https://rlptjmkejfykisaefkeh.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key from Supabase (backend API, products, diagrams). |
| `SUPABASE_ANON_KEY` | Yes | Anon/public key (frontend auth; exposed via `GET /api/config`). |
| `SUPABASE_JWT_SECRET` | No | Only if your Supabase project uses legacy HS256 JWT secret; leave unset if using ECC (P-256). |

Do **not** commit `.env` or paste these values into the repo. Railway injects them at runtime.

## 5. Deploy

**Option A – From GitHub (recommended):** Connect the repo in Railway (step 2). Push to the connected branch; Railway builds and deploys automatically.

**Option B – From your machine (Railway CLI):** Install the CLI and log in, then deploy from the project directory.

1. **Install Railway CLI** (so it’s on your PATH; required for Cursor’s Railway MCP):
   ```bash
   brew install railway
   ```
   Or: `npm i -g @railway/cli` (ensure your npm global bin is on PATH).

2. **Log in once** (opens browser):
   ```bash
   railway login
   ```

3. **Create project and deploy from current directory:**
   ```bash
   cd "/path/to/Quote App"
   railway init          # create new project or link existing
   railway up            # build and deploy from current directory
   ```
   Or use Cursor’s **Railway MCP** (e.g. “deploy to Railway”): the MCP uses the `railway` command, so `railway` must be on PATH and you must have run `railway login` at least once.

**Option C – Dashboard:** If you connected a repo, the first deploy usually starts automatically; otherwise click **Deploy** or **Redeploy** in the dashboard.

## 6. Open the app

After a successful deploy:

1. Railway provides a URL (e.g. **https://quote-app-production-7897.up.railway.app** for this project).
2. In the dashboard, open **Settings** for the service and note the **Public URL** (or use **Generate Domain** if needed).
3. Open that URL in a browser. You should see the Quote App (login or canvas).
4. **Health check:** `https://YOUR-RAILWAY-URL/api/health` → `{"status":"ok"}`.
5. **Config (public):** `https://YOUR-RAILWAY-URL/api/config` → `supabaseUrl`, `anonKey` for frontend auth.

## 7. Supabase Auth redirect URLs (if using sign-in)

If users sign in with Supabase Auth:

1. In [Supabase Dashboard](https://supabase.com/dashboard/project/rlptjmkejfykisaefkeh/auth/url-configuration) go to **Authentication → URL Configuration**.
2. Add your Railway URL to **Redirect URLs**, e.g. `https://YOUR-RAILWAY-URL/**`.

## 8. Redeploys and logs

- **Redeploy:** Push to the connected branch, or in Railway click **Redeploy**.
- **Logs:** Dashboard → your service → **Deployments** → select a deployment → **View Logs**. Railway captures stdout/stderr from uvicorn.

## 9. Optional: custom domain

In Railway: **Settings** → **Networking** → **Custom Domain**. Add your domain and follow the DNS instructions. If you use a custom domain for the app, add it to Supabase redirect URLs as in step 7.

## 10. Post-deploy checklist

- [ ] App loads at `/` (frontend).
- [ ] `GET /api/health` returns `{"status":"ok"}`.
- [ ] `GET /api/products` returns product list.
- [ ] Sign in works (Supabase); save/load diagrams work.
- [ ] Blueprint upload and processing work (OpenCV in production).

## Troubleshooting

- **“No start command was found” / Railpack detects Node:** Railway’s default builder (Railpack) may see the root `package.json` (used for E2E) and assume a Node app. Add **railway.json** at repo root with `"build": { "builder": "NIXPACKS" }` and `"deploy": { "startCommand": "cd backend && uvicorn main:app --host 0.0.0.0 --port $PORT" }` so Railway uses Nixpacks and runs the FastAPI app. See [TROUBLESHOOTING.md](../TROUBLESHOOTING.md).
- **Build fails on `requirements.txt`:** Ensure `nixpacks.toml` is at repo root and points to `backend/requirements.txt` (see [TROUBLESHOOTING.md](../TROUBLESHOOTING.md) if needed).
- **App starts but 502/503:** Check that the Procfile uses `--host 0.0.0.0` and `--port $PORT`.
- **Supabase errors in logs:** Verify all required env vars are set in Railway and match the Supabase project (Jacks Quote App).
- **Frontend blank or 404:** The backend serves `frontend/` from the repo; ensure `frontend/index.html` and `frontend/app.js` exist and are committed.

For more project-specific issues, see **TROUBLESHOOTING.md** in the repo root.
