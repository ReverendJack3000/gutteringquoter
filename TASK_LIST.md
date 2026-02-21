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

---

## 🔁 Current Working Branch

- Branch: main
- Status: Stable

**Uncompleted tasks (by section):**

| Section | Task | Description |
|---------|------|-------------|
| 7 | 7.10 | Revisit gutter rotation constraint (E2E Alt override, hysteresis; optional) |
| 13 | 13.4, 13.5 | (Optional) Uploaded images uniform sizing; min/max size guards |
| 15 | 15.5, 15.6 | (Optional) Live dimension/angle display during resize/rotate |
| 20 | 20.2 | E2E resize test passes or update if intentional |
| 22 | 22.20 | (Optional) Pricing edit permissions by role |
| 22 | 22.21 | Document ServiceM8 integration |
| 22 | 22.22–22.24 | Quote manual testing, error handling tests, optional E2E |
| 22 | 22.29 | ServiceM8 API response Success/Error wiring |
| 24 | 24.4 | (Optional) product_template_id for CSV diagram mapping |
| 26 | 26.2 | Manual guttering distance entry UI |
| 35 | 35.7, 35.8, 35.9 | Auth view switching; no regressions; manual/E2E check |
| 36 | 36.11 | localProducts migration (optional) |
| 41 | 41.1, 41.3 | 65/80 mm filter dropdown in Marley panel |
| 44 | 44.1, 44.2 | Transparency in pill; editable project name (superseded by 46?) |
| **48** | **48.0.1–48.0.23** | **Pre-deploy: local tests, features, troubleshooting** |
| 48 | 48.1–48.24 | Railway setup, build config, env vars, deploy, post-deploy |
| **50** | **50.1–50.9** | **Quote modal: Labour as table row, independent from materials** |
| **50** | **50.10–50.18** | **Labour as product (REP-LAB): remove rate dropdown, inline unit price, delete X, exclude from panel/Add item** |
| 51 | 51.7, 51.8 | Confirm Job popup UI refine; measured materials: any click away should commit length |
| 53 | 53.1, 53.2 | Login screen custom image; ServiceM8 with login (if needed) |
| 19 | 19.12 | SVG elements extremely blurry when colour changed until restored to original |
| 54 | 54.49–54.53, 54.56–54.60 | (Mobile-only) Diagram toolbar refinements + always thin edge-only (54.56–54.60); expanded edge-snap behavior now covered by automated checks, final QA sign-off pending. |
| 54 | 54.65 | Mobile Freeform parity follow-up: gesture arbitration and reliability QA (manual sign-off) |
| 54 | 54.69 | Mobile header green → blue: optional manifest theme color update |
| 54 | 54.78.1–54.78.6 | Mobile: vertical diagram toolbar tighter fit + overflow-y in pill; optional drag handle span removal |
| 54 | 54.80.1–54.80.4.4, 54.80.2.9 | Diagram toolbar auto-collapse (8 triggers + products panel open 54.80.2.9) + position 4 UIs (plan: docs/plans/2026-02-21-diagram-toolbar-auto-collapse-on-element-toolbar-and-dropdowns.md) |
| 54 | 54.81.1–54.81.4 | (Mobile-only) Product tap-to-add reliability + 25%-relative add sizing (blueprint long side; no-blueprint canvas fallback) with desktop guard and regression QA. |
| 54 | 54.82.1–54.82.4 | (Mobile-only) Tools within global header #globalToolbar only: Projects/Untitled top-left, collapse after; chevron left of Projects; hide Export/Diagrams/Accessibility. No diagram toolbar or other toolbar changes (plan: docs/plans/2026-02-21-mobile-global-toolbar-reorder-and-declutter.md). |
| 54 | 54.84.3 | Auto collapse global toolbar when products panel opened (mobile-only). |
| 54 | 54.85.12 | (Mobile) Search bar below filters; thumbnail display: manual mobile QA sign-off pending. |
| 54 | 54.87.5 | (Mobile quote) Future follow-up: extrapolate line-item popup edit pattern from labour to other quote elements/items. |
| 57 | 57.6 | Mobile canvas fit/pan refinement: manual QA + deploy-safety sign-off pending (57.1–57.5 complete). |
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

---

*For full task text and checkboxes, open the section file from the tables above (e.g. Section 54 → docs/tasks/section-54.md).*
