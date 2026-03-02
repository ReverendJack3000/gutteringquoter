# Investigation: Local changes not visible at http://127.0.0.1:8000/?viewport=desktop

**Date:** 2026-03  
**Symptom:** After making local changes (e.g. Repair Types “Default time (min)” column, coloured profile/size dropdowns in Material Rules or Parts panel), loading `http://127.0.0.1:8000/?viewport=desktop` still shows old UI. Changes are in the repo but not in the browser.

**Conclusion:** Multiple layers of caching cause the browser (and Cursor’s embedded browser) to serve old HTML/JS/CSS. No code bug; cache and versioning behaviour.

---

## 1. Server behaviour (no build step)

- Backend serves the **raw `frontend/` directory** (no bundler). Edits to `frontend/*.js`, `frontend/styles.css`, `frontend/index.html` are what the server would serve on the next request.
- So “local changes” are on disk; the issue is the **browser (and optionally the service worker) not requesting or not using** the updated files.

---

## 2. Cache headers (backend middleware)

**File:** `backend/main.py` (e.g. ~975–1018)

- **Paths with `?v=` in the query string** (e.g. `/app.js?v=20260226-loadspeed2`):  
  Response gets `Cache-Control: public, max-age=31536000, immutable` (1 year, immutable).  
  Browsers are allowed to keep using the cached response without revalidation.
- **Paths without `?v=`** (e.g. `/app.js`):  
  Response gets `Cache-Control: public, max-age=86400` (24 hours).
- **`/` and `*.html`**:  
  `Cache-Control: no-cache` (revalidate before use).

So:

- As long as the **same** `?v=` is used (e.g. `?v=20260226-loadspeed2`), the browser can keep a 1-year cache for that URL. Changing the file on disk does not change the URL, so the browser keeps serving the old file.
- That’s why “we’re having so much trouble seeing our local changes”: the **URLs are versioned, but the version in the HTML (and in app.js for toolbar/modules) is not bumped** when you change JS/CSS.

---

## 3. Version strings in the frontend

- **index.html**
  - `styles.css?v=20260226-loadspeed2`
  - `app.js?v=20260226-loadspeed2`
  - `pwa.js?v=20260226-loadspeed2`
- **app.js**
  - Import: `./toolbar.js?v=20260226-loadspeed2`
  - `STATIC_ASSET_VERSION = '20260303-summary-row-product-name'` (used for admin module, Supabase script, some asset URLs)
- **service-worker.js**
  - `ASSET_VERSION = '20260303-summary-row-product-name'`
  - Shell cache list uses that for `styles.css`, `app.js`, `toolbar.js`, `modules/admin-products-bonus.js`, etc.

So:

- The **first load** is tied to the version in **index.html** (`20260226-loadspeed2`). After that, those URLs are cached for a long time (or indefinitely with immutable).
- The **service worker** uses a different version (`20260303-...`) and caches its own copy of the same logical assets. If the SW is active, it can serve those cached responses even when the server has new files.

---

## 4. Service worker (PWA)

**File:** `frontend/service-worker.js`

- When the SW is registered, it uses **stale-while-revalidate** for static assets: it **returns the cached response first**, then fetches from the network and updates the cache. So you often see **old** JS/CSS until the cache is updated or the SW is replaced.
- The SW is only registered when `PWA_ENABLED=true` (see `pwa.js` and project docs). If you (or Cursor) ever loaded the app with PWA enabled, the SW may still be registered and intercepting requests in that origin/profile.

So:

- Even with the server returning new files, the **SW can still serve old cached shell assets**, which adds a second reason “local changes” don’t show.

---

## 5. Cursor / embedded browser

- Cursor’s embedded browser uses a real browser engine and its own profile/storage. If that profile has:
  - Cached responses for `app.js?v=...`, `styles.css?v=...`, etc. (long-lived or immutable), or
  - An active service worker for `http://127.0.0.1:8000`,
  then it will keep showing old content until cache is cleared or versions are changed.

---

## 6. What to do to see local changes (no code changes required)

Use one or more of these:

1. **Hard reload / disable cache (dev)**  
   - Chrome/Edge: DevTools → Network → “Disable cache”, then reload (or Ctrl+Shift+R / Cmd+Shift+R).  
   - Do this while DevTools is open so “Disable cache” is in effect.

2. **Unregister the service worker**  
   - Application (or Storage) → Service Workers → Unregister for `http://127.0.0.1:8000`.  
   - Then hard reload. This avoids the SW serving old shell assets.

3. **Bump version in HTML and app.js when you want to force refresh**  
   - In `frontend/index.html`: change the `?v=` for `styles.css`, `app.js`, `pwa.js` (e.g. to `?v=20260303-dev` or a timestamp).  
   - In `frontend/app.js`: change the `?v=` in the `toolbar.js` import and/or `STATIC_ASSET_VERSION` so the admin module (and any other versioned URLs) get a new query string.  
   - Then reload. New URLs → cache miss → browser (and SW after update) fetch new files.

4. **Empty cache for this site**  
   - In browser settings, clear cache (or “Cached images and files”) for `http://127.0.0.1:8000`. Then reload.

5. **Use a different browser or a private/incognito window**  
   - Fresh profile has no cache and no SW for the app; you’ll see current server content (subject to 1–4 if you later cache again).

---

## 7. Optional: make local dev always see changes

If you want local development to always see the latest JS/CSS without manually bumping versions or clearing cache:

- **Option A:** In local dev only, serve static assets with `Cache-Control: no-cache` or `no-store` (e.g. when `ENV=dev` or `DEBUG=1`), so the browser revalidates every time.
- **Option B:** In local dev only, add a **cache-busting query param** from the server (e.g. file mtime or a build timestamp) so each deploy/save gets a new URL. (Requires a small backend or build step to inject the param.)
- **Option C:** Keep using “Disable cache” in DevTools and/or unregister the SW when developing.

These can be documented in README or TROUBLESHOOTING so the team has a single place to look.

---

## 8. References

- Backend static cache: `backend/main.py` (~975–1018)
- Frontend versions: `frontend/index.html` (link/script `?v=`), `frontend/app.js` (STATIC_ASSET_VERSION, toolbar import)
- Service worker: `frontend/service-worker.js` (ASSET_VERSION, SHELL_ASSETS, fetch → staleWhileRevalidate)
- Coloured dropdowns: profile filter classes in `frontend/styles.css` (#profileFilter.profile-filter--storm-cloud / .profile-filter--classic), toggled in `frontend/app.js`; Part Templates dropdown colours (63.19.8) in `frontend/styles.css` ~4331.
