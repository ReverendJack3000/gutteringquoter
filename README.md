# Quote App – Repair Blueprint MVP

Desktop-first web app: upload a property photo → get a technical drawing blueprint → drag Marley guttering products onto it (Canva-style move, resize, rotate) → export PNG. Optional PWA support is available behind a server flag (`PWA_ENABLED`) and is disabled by default. The same deployment now serves both desktop and mobile layouts automatically.

## Stack

- **Backend:** Python 3.x, FastAPI (API-ready for future integrations)
- **Frontend:** Vanilla HTML/CSS/JS, no build step
- **Blueprint processing:** OpenCV (technical drawing or grayscale)
- **Optional:** Supabase (database, storage, auth) – see [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)

## Setup

1. **Python env (recommended)**

   ```bash
   cd backend
   python3 -m venv .venv
   source .venv/bin/activate   # Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   ```

2. **Configure Supabase (required)**

   The app always uses Supabase for data (e.g. products). Copy the example env file and add your **Jacks Quote App** project credentials:

   ```bash
   cd backend
   cp .env.example .env
   # Edit .env: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from Supabase dashboard → Settings → API
   # Optional PWA rollout flag (default-off safety): PWA_ENABLED=false
   ```

3. **Run the local server (single command)**

   From the **project root**, one command starts the backend and serves the frontend (Task 10.8):

   ```bash
   ./scripts/run-server.sh
   ```

   The script activates the backend `.venv` if present and runs `uvicorn` on **http://127.0.0.1:8000/** by default.  
   Health check: **GET http://127.0.0.1:8000/api/health** (returns `{"status":"ok"}`).

   Optional overrides:

   ```bash
   HOST=0.0.0.0 PORT=8000 PWA_ENABLED=true ./scripts/run-server.sh
   ```

   **Alternative (manual):** from the `backend` directory run:

   ```bash
   cd backend
   source .venv/bin/activate   # Windows: .venv\Scripts\activate
   uvicorn main:app --reload --host 127.0.0.1 --port 8000
   ```

   On startup you should see: `Quote App frontend: serve at http://127.0.0.1:8000/`. If you see an error about Supabase, add the env vars to `backend/.env`.

4. **Load the app in the browser**

   Open **http://127.0.0.1:8000/** (or http://localhost:8000/). The app is served at the root; do not open the HTML file directly (file://) or it will not work.

5. **Use the app**

   - Open http://127.0.0.1:8000 in a desktop browser.
   - Upload a property photo (toolbar).
   - Toggle **Technical drawing** on/off to switch blueprint style.
   - Open the right panel (chevron if collapsed); drag products onto the blueprint.
   - Select an element to move, resize (corners), or rotate (top handle).
   - On mobile, tap a measurable element to select it, then use the ruler button in the floating toolbar to enter length.
   - Drag the divider between blueprint and panel to resize.
   - **Export PNG** to download the composed blueprint.
   - On phones/tablets, the products panel becomes a slide-out drawer and desktop behavior remains unchanged on large screens.

   Optional viewport override for QA:

   - `http://127.0.0.1:8000/?viewport=desktop`
   - `http://127.0.0.1:8000/?viewport=mobile`

**Troubleshooting:** If you see a blank page or 404, ensure you started the server from the `backend` directory and that the project has a `frontend` folder (with `index.html`, `app.js`, `styles.css`) next to `backend`. Use the URL with a trailing slash or without: `http://127.0.0.1:8000/`.

## Marley products (MVP)

Placeholder diagram SVGs for: **gutter**, **downpipe**, **bracket**, **stopend**, **outlet**, **dropper**.  
Replace files in `frontend/assets/marley/` with your own Marley guttering diagram images when ready (keep same filenames or update `backend/app/products.py`).

## Saved diagrams and sign-in (Sections 33 & 34)

To save and load diagrams (clock icon in the toolbar), configure auth in `backend/.env`:

- **`SUPABASE_ANON_KEY`** – from Supabase → Settings → API (anon/public). Used by `GET /api/config` so the frontend can sign in with Supabase Auth.
- **`SUPABASE_JWT_SECRET`** – only for projects using the legacy JWT secret (HS256). If your project uses **ECC (P-256)** signing (no “JWT Secret” on the API page), leave this unset; the backend verifies tokens via JWKS (ES256) using your existing `SUPABASE_URL`.

Then sign in via the **Sign in** button, use **Save** to store the current diagram, and open the **clock icon** dropdown to list and load saved diagrams.

## API (for later integration)

- `GET /api/health` – health check
- `GET /api/config` – public config (supabaseUrl, anonKey for frontend auth)
- `GET /api/products?search=&category=` – list products
- `POST /api/process-blueprint?technical_drawing=true|false` – upload image, returns PNG
- `GET /api/diagrams` – list saved diagrams (requires `Authorization: Bearer <token>`)
- `POST /api/diagrams` – save diagram (requires Bearer token)
- `GET /api/diagrams/{id}` – load diagram (requires Bearer token)
- `GET /manifest.webmanifest` – PWA manifest (static)
- `GET /service-worker.js` – service worker script (static)

OpenAPI docs: http://127.0.0.1:8000/docs

## Deployment (Railway)

To deploy to production:

1. Push the repo to GitHub (or GitLab/Bitbucket).
2. Create a project at [railway.app](https://railway.app) and deploy from the repo.
3. Set environment variables in Railway: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` (and optionally `SUPABASE_JWT_SECRET`, `PWA_ENABLED`).
4. The repo includes a **Procfile** and **nixpacks.toml** so Railway runs `uvicorn` from `backend/` and serves the frontend.

Full steps, env vars, and troubleshooting: **[docs/RAILWAY_DEPLOYMENT.md](docs/RAILWAY_DEPLOYMENT.md)**. After deploy, the live app URL is shown in the Railway dashboard (e.g. `https://quote-app-production.up.railway.app`).

## PWA rollout (default-off)

- **Default behavior:** `PWA_ENABLED=false` (or unset). No service worker is registered; desktop production behavior stays unchanged.
- **Enable PWA:** set `PWA_ENABLED=true` in the server environment and redeploy/restart.
- **Kill switch:** set `PWA_ENABLED=false` and redeploy/restart. On next app load, client logic unregisters service workers and clears Quote App PWA caches.
- **Scope:** app shell/assets are cached for offline load; `/api/*` remains network-only.

## Phone homescreen testing

1. For local network phone testing (same Wi-Fi), run:

```bash
./scripts/run-phone-preview.sh
```

2. Open the printed URL on your phone and add it to your homescreen.
3. For full PWA behavior (service worker + offline), use an **HTTPS** URL (for example Railway staging) with `PWA_ENABLED=true`.

**Quick curl test (blueprint pipeline):** with the server running and a small image at `scripts/fixtures/tiny.png`:

```bash
curl -X POST "http://127.0.0.1:8000/api/process-blueprint?technical_drawing=true" \
  -F "file=@scripts/fixtures/tiny.png" -o out.png && file out.png
```

## Verification and desktop testing

**API checks (with server running):**

```bash
python3 scripts/create_fixtures.py   # once, creates scripts/fixtures/tiny.png
./scripts/verify_api.sh              # or: ./scripts/verify_api.sh http://127.0.0.1:8000
```

**Desktop testing (task 8.2):** Open http://127.0.0.1:8000, then:

- Resize the browser to **1280×720** and **1920×1080** and confirm: blueprint area uses ~2/3 width, right panel ~1/3, resizer drag works, panel collapses to a narrow strip with left-facing chevron and expands to show search + product grid.
- Upload a photo, toggle **Technical drawing**, drag products onto the blueprint, select/move/resize/rotate an element, export PNG.

## E2E tests (Puppeteer)

**One-time setup:** from the project root:

```bash
npm install
```

**To test:**

1. **Start the backend** (in one terminal):

   ```bash
   cd backend
   source .venv/bin/activate   # Windows: .venv\Scripts\activate
   uvicorn main:app --reload --host 127.0.0.1 --port 8000
   ```

2. **Run E2E** (in another terminal, from project root):

   ```bash
   npm test
   ```

   Or use the helper script (checks that the server is up first):

   ```bash
   ./scripts/run-e2e.sh
   ```

- **Headless (default, CI):** `npm test` or `npm run test:e2e`
- **Headed (visible Chrome, manual testing):** `npm run test:manual` or `HEADED=1 npm test`
- **Custom URL:** `BASE_URL=http://localhost:8000 npm test`

**What the E2E suite covers:**

- **App shell and UI:** Toolbar, canvas, panel expand/collapse, product grid
- **Blueprint upload** (if `Columba College Gutters 11.jpeg` exists in project root)
- **Drag-and-drop:** Product placement onto canvas; selection at cursor
- **Recenter View** button present and clickable
- **Stable viewport:** No auto-refit in 250ms after interaction
- **Zoom controls** (− / Fit / +)
- **Import normalization (desktop):** Dropped/center-added elements keep max dimension ≤ 150px
- **Mobile tap-add sizing:** Tap-added element max dimension = 25% of blueprint long side, or 25% of canvas long side when no blueprint is loaded
- **Center-drop / tap-add:** Click/tap on a product thumb adds exactly one element; mobile tap-add auto-closes the products panel
- **Mobile measurement ruler flow:** measurable element tap does not auto-focus length input; ruler button focuses the matching measurement card input
- **Color tinting:** originalImage preservation, tintedCanvas creation, multiple color changes, color removal
- **Selection over blueprint:** Can select elements after color changes
- **Accessibility modal keyboarding:** focus trap + Escape close in accessibility settings modal
- **Live-region announcements:** app announcer emits updates during core interactions
- **Mobile viewport regressions:** forced mobile mode, portrait/landscape orientation, no horizontal overflow

**Manual checks (optional):**

- **Aspect lock:** Resize a part by a corner handle → aspect ratio stays locked. Hold **Alt** and resize → aspect can warp.
- **Handle padding:** Selection box has a 10px gap so handles sit outside the part edges.
- **Viewport:** After resize/move/rotate, the canvas does not zoom or pan on its own; use **Recenter View** or upload a new blueprint to re-fit.
- **200% zoom (mobile + desktop):** no clipped primary actions in quote/product/accessibility dialogs; controls remain reachable.
- **Modal focus order:** Tab/Shift+Tab stay inside open modal; Escape closes and focus returns to trigger.
