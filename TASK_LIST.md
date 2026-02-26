# Quote App – MVP Task List

**This file is the index for the single authoritative task list.** Full task content lives in **`docs/tasks/`** (one file per section or section range). All progress, scope, and completion status are tracked here and in those section files. Do not maintain a separate or duplicate task list elsewhere.

Task list for the property photo → repair blueprint web app (desktop-first, 2/3 blueprint + collapsible Marley panel, Canva-style elements).

**How to update:** When a task is done, open the **section file** for that task (see tables below), change `[ ]` to `[x]` on the task line. If the uncompleted table below needs a row removed (section fully complete), update this index.

---

## Where to look (RAG-style)

**By project stage / theme — use when you're unsure which file to open:**

| Stage / theme | File | Sections |
|---------------|------|----------|
| MVP core: setup, layout, upload, panel, export, deferred | [docs/tasks/sections-01-09.md](docs/tasks/sections-01-09.md) | 1–9 |
| Save/Load project files | [docs/tasks/section-33.md](docs/tasks/section-33.md) | 33 |
| Infrastructure, E2E, canvas polish, viewport, undo | [docs/tasks/sections-10-16.md](docs/tasks/sections-10-16.md) | 10–16 |
| Layering, transforms, quote system, measurement deck | [docs/tasks/sections-17-27.md](docs/tasks/sections-17-27.md) | 17–27 |
| Delete/badge, manual UI, image types, quote table, auth | [docs/tasks/sections-28-34.md](docs/tasks/sections-28-34.md) | 28–34 |
| App views, product management, quote modal, deployment | [docs/tasks/sections-35-48.md](docs/tasks/sections-35-48.md) | 35–48 |
| ServiceM8 OAuth, quote labour, login branding | [docs/tasks/sections-49-53.md](docs/tasks/sections-49-53.md) | 49–53 |
| **Mobile app** (adaptive layout, toolbars, camera, header) | [docs/tasks/section-54.md](docs/tasks/section-54.md) | 54 |
| Mobile accessibility (Apple HIG) | [docs/tasks/section-55.md](docs/tasks/section-55.md) | 55 |
| Toolbar carve-out (toolbar.js), mobile canvas fit/pan | [docs/tasks/sections-56-57.md](docs/tasks/sections-56-57.md) | 56–57 |
| Bonus period / job performance schema (Supabase) | [docs/tasks/section-58.md](docs/tasks/section-58.md) | 58 |
| Technician quotes: team pool bonus (research + implementation) | [docs/tasks/section-59.md](docs/tasks/section-59.md) | 59 |
| Technician bonus: spec refinements (labour rate, travel fee, estimation, spotter, margin, copy) | [docs/tasks/section-60.md](docs/tasks/section-60.md) | 60 |
| Technician job creation, labour default, Create New Job pop-up (permissions, co-seller, stepper) | [docs/tasks/section-61.md](docs/tasks/section-61.md) | 61 |
| Quick Quoter (mobile-first UI shell, local validation, future backend mapping) | [docs/tasks/section-62.md](docs/tasks/section-62.md) | 62 |
| Quick Quoter Backend + Database Integration | [docs/tasks/section-63.md](docs/tasks/section-63.md) | 63 |

**By section number — open the file that contains your section:**

| Section(s) | File |
|------------|------|
| 1, 2, 3, 4, 5, 6, 7, 8, 9 | [sections-01-09.md](docs/tasks/sections-01-09.md) |
| 33 | [section-33.md](docs/tasks/section-33.md) |
| 10, 11, 12, 13, 14, 15, 16 | [sections-10-16.md](docs/tasks/sections-10-16.md) |
| 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27 | [sections-17-27.md](docs/tasks/sections-17-27.md) |
| 28, 29, 30, 31, 32, 34 | [sections-28-34.md](docs/tasks/sections-28-34.md) |
| 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48 | [sections-35-48.md](docs/tasks/sections-35-48.md) |
| 49, 50, 51, 52, 53 | [sections-49-53.md](docs/tasks/sections-49-53.md) |
| 54 | [section-54.md](docs/tasks/section-54.md) |
| 55 | [section-55.md](docs/tasks/section-55.md) |
| 56, 57 | [sections-56-57.md](docs/tasks/sections-56-57.md) |
| 58 | [section-58.md](docs/tasks/section-58.md) |
| 59 | [section-59.md](docs/tasks/section-59.md) |
| 60 | [section-60.md](docs/tasks/section-60.md) |
| 61 | [section-61.md](docs/tasks/section-61.md) |
| 62 | [section-62.md](docs/tasks/section-62.md) |
| 63 | [section-63.md](docs/tasks/section-63.md) |

---

## 🔁 Current Working Branch

- Branch: main
- Based on: main
- Status: In Progress
- Related Tasks: 54.122.1–54.122.4, 49.34.1–49.34.2

**Uncompleted tasks (by section):**

| Section | Task | Description |
|---------|------|-------------|
| 7 | 7.10 | Revisit gutter rotation constraint (E2E Alt override, hysteresis; optional) |
| 13 | 13.4, 13.5 | (Optional) Uploaded images uniform sizing; min/max size guards |
| 15 | 15.5, 15.6 | (Optional) Live dimension/angle display during resize/rotate |
| 16 | 16.10–16.14 | Desktop canvas transform/usability audit fixes (includes shared mobile-path guards for 16.10 and 16.11). |
| 20 | 20.2 | E2E resize test passes or update if intentional |
| 22 | 22.20 | (Optional) Pricing edit permissions by role |
| 22 | 22.21 | Document ServiceM8 integration |
| 22 | 22.22–22.24 | Quote manual testing, error handling tests, optional E2E |
| 22 | 22.29 | ServiceM8 API response Success/Error wiring |
| 24 | 24.4 | (Optional) product_template_id for CSV diagram mapping |
| 26 | 26.2 | Manual guttering distance entry UI |
| 33 | 33.4–33.10 | Signed-in server autosave recovery (prompt restore/discard, strict threshold delete, hidden rolling draft) + job-stamp save-path auth-header fix; desktop/mobile + Railway-safe validation. |
| 36 | 36.11 | Product Library follow-up: optional localProducts migration only (desktop admin user-permissions management completed in 36.12–36.18; invite/remove in 36.19–36.21). |
| 41 | 41.1, 41.3 | 65/80 mm filter dropdown in Marley panel |
| 44 | 44.1, 44.2 | Transparency in pill; editable project name (superseded by 46?) |
| **48** | **48.0.1–48.0.23** | **Pre-deploy: local tests, features, troubleshooting** |
| 48 | 48.1–48.24 | Railway setup, build config, env vars, deploy, post-deploy |
| **50** | **50.1–50.9** | **Quote modal: Labour as table row, independent from materials** |
| **50** | **50.10–50.18** | **Labour as product (REP-LAB): remove rate dropdown, inline unit price, delete X, exclude from panel/Add item** |
| 53 | 53.1, 53.2 | Login screen custom image; ServiceM8 with login (if needed) |
| 19 | 19.12 | SVG elements extremely blurry when colour changed until restored to original |
| 54 | 54.52–54.53, 54.56–54.60 | (Mobile-only) Diagram toolbar refinements + always thin edge-only (54.56–54.60). |
| 54 | 54.122.4 | Diagram toolbar drag-handle polish + top-center open reset (desktop + mobile): E2E assertions stabilized; manual QA + Railway safety sign-off pending. |
| 54 | 54.109.4 | Mobile upload UX follow-up: manual mobile QA + Railway safety sign-off pending (mobile bypasses crop modal across upload/drop/paste/PDF paths; Quick Quoter entry hides when blueprint exists). |
| 54 | 54.65 | Mobile Freeform parity follow-up: gesture arbitration and reliability QA (manual sign-off) |
| 54 | 54.105.4 | (Mobile-only) Selection element toolbar top-dock: manual mobile QA/sign-off pending (iOS Safari + Android Chrome, portrait/landscape, 200% zoom). Implementation + E2E coverage complete; desktop unchanged; Railway-safe. |
| 54 | 54.69 | Mobile header green → blue: optional manifest theme color update |
| 54 | 54.81.1–54.81.4 | (Mobile-only) Product tap-to-add reliability + 25%-relative add sizing (blueprint long side; no-blueprint canvas fallback) with desktop guard and regression QA. |
| 54 | 54.85.12 | (Mobile) Search bar below filters; thumbnail display: manual mobile QA sign-off pending. |
| 54 | 54.93.8.1–54.93.8.4 | Mobile quote: stepper for section-header metres (Gutter/Downpipe length). Plan: docs/plans/2026-02-21-mobile-quote-section-header-metres-stepper.md. Context: app.js syncMobileQuoteLineSummaries 1366+, desktop cleanup 1376–1411, rebuild 3719–3735 / 3776–3792, profileLengthOverride 3654–3670, getElementsFromQuoteTable header read 3002–3022; styles.css .quote-mobile-qty-stepper 5749–5784. |
| 54 | 54.98.6 | Mobile quote non-labour line editor popup: real-device manual QA/sign-off pending (iOS Safari + Android Chrome). Implementation + E2E regression coverage complete; desktop unchanged; Railway-safe. |
| 54 | 54.100.5 | Mobile quote material footer Apply action parity: manual mobile QA + Railway safety verification pending (iOS Safari + Android Chrome, portrait/landscape, 200% zoom). |
| 54 | 54.95.1–54.95.7 | Mobile-only orientation policy (landscape diagram canvas, portrait non-diagram UI, graceful fallback, E2E/docs) + follow-up to prevent landscape→portrait canvas zoom drift into header. |
| 54 | 54.102.1–54.102.4 | (Mobile-only) Prevent double-tap zoom on canvas view; Fit in global toolbar; double-tap empty canvas → Fit; QA. Plan: docs/plans/2026-02-22-mobile-double-tap-zoom-and-graceful-zoom-out.md. |
| 54 | 54.96.1–54.96.6 | (Mobile-only) Ruler icon opens keypad via badge popover; hide measurement pills (measurement deck) on mobile; E2E/docs/QA with desktop guard and Railway-safe verification. |
| 54 | 54.101.6 | Canvas element Bold control (line weight 1–4): manual QA + Railway deploy-safety sign-off pending after implementation and automated coverage. |
| 54 | 54.110.4 | Mobile collapsed global header (Projects + collapse + Generate Quote visible): real-device manual QA + Railway safety sign-off pending (iOS Safari + Android Chrome; 320/360/390 widths, portrait/landscape, 200% zoom). |
| 54 | 54.114.4, 54.115.4, 54.116.4 | Mobile canvas transform/toolbars follow-up QA: blueprint handle hit reliability across orientations, rotated blueprint resize regression verification, and draw-loop battery/performance validation (mobile-first with shared desktop path guards). |
| 54 | 54.119.3 | Mobile upload/toolbar perf hardening follow-up: manual mobile QA + Railway safety sign-off pending (upload same-file relaunch, drag-handle a11y behavior, draw/observer smoothness). |
| 54 | 54.120.3 | Mobile speed: contain: paint on .blueprint-wrap deferred (would break mobile floating toolbar top-dock; see section-54.md). 54.120.1, 54.120.2, 54.120.4 done. |
| 57 | 57.6 | Mobile canvas fit/pan refinement: manual QA + deploy-safety sign-off pending (57.1–57.5 complete). |
| 62 | 62.18.3 | Quick Quoter visibility parity follow-up: manual desktop/mobile QA + Railway deployment safety sign-off pending (elements-only hide/show parity implemented and E2E coverage added). |
| 63 | 63.9, 63.16 | (63.9) Mixed-length gutter accessory inference follow-up. (63.16) Material Rules desktop manual QA + Railway production sign-off (migration applied via MCP; re-test GET /api/admin/material-rules/* and reload Material Rules page in production). |
---

## Locked decisions

| Area | Choice | Notes |
|------|--------|------|
| **Backend** | Python (FastAPI) | Scalable, maintainable; API-ready for future integrations |
| **Blueprint style** | Technical drawing | Clean lines; toggle filter on/off in UI |
| **Marley products (MVP)** | 6 types: gutter, downpipe, bracket, stopend, outlet, dropper | User will upload real diagram images when ready; use placeholders until then |
| **Panel collapsed** | Small Apple-style strip with left-facing chevron icon only | Click to expand; minimalist, no thumbnails when collapsed |
| **Divider** | Resizable | User can drag to change width between blueprint area and panel |
| **Search** | Search bar visible when panel is open | Filter/search ready for later enhancement |
| **Export** | PNG only for MVP | |
| **Port** | Default (e.g. 8000 for FastAPI) | |
| **Codebase** | From scratch | |
| **Data / products** | Supabase (Jacks Quote App) | `public.products`; backend requires `.env` with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY |
| **ServiceM8 auth** | OAuth only in app; API key for local dev only | App uses OAuth 2.0 only. `SERVICEM8_API_KEY` in `backend/.env` is for local dev only. All API-key scripts live in **`scripts/servicem8-api-key-local/`**; never rewrite project files for them. Do not use the API key in production or app code. |

---

*For full task text and checkboxes, open the section file from the tables above (e.g. Section 54 → docs/tasks/section-54.md).*
