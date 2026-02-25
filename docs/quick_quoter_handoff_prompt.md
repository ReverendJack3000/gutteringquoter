# Handoff prompt – Quick Quoter context & next task

**Paste this into the next chat to restore context and continue.**

---

## Context

Quote App: desktop-first repair blueprint PWA (FastAPI backend, vanilla JS frontend), deployed on Railway. Single codebase serves desktop and mobile via `data-viewport-mode`; mobile-first features (e.g. Quick Quoter) must not regress desktop. Task tracking: **TASK_LIST.md** (index + uncompleted table) and **docs/tasks/section-62.md**, **section-63.md**. Mark completion in the section file with `[x]` and remove completed sections from the uncompleted table.

**Where we left off:** Section 63 (Quick Quoter Backend + Database Integration) is **functionally complete**: backend resolver (`backend/app/quick_quoter.py`), GET/POST API in `main.py`, frontend uses catalog and resolve (no static fallback), Done merges into quote modal with Metres? rows and quantity-scaling (effective_metres = entered_metres × resolver quantity). Supabase migrations A/B applied and seed data in place (16 repair types, 76 part_templates). Mobile smoke test checklist: **docs/quick_quoter_mobile_smoke_test.md**.

**Next logical task:** Change Quick Quoter **row label text** so the selected Profile and Size are reflected as prefixes: when **Profile** is Storm Cloud show **"SC:"** in front of all gutter-related repair rows; when **Profile** is Classic show **"CL:"**. When **Size** is 65mm or 80mm show **"65:"** or **"80:"** (or equivalent) in front of rows whose repair type is size-based (component parts), using the same logic (profile/size from dropdowns, gutter vs size-based from each repair type’s `requires_profile` / `requires_size_mm`).

---

## Key files and line references

| Area | File | Lines / notes |
|------|------|----------------|
| Task index, branch, uncompleted | **TASK_LIST.md** | Top: branch; "Where to look" tables; uncompleted table. Section 63 row removed (complete). |
| QQ Backend + DB tasks | **docs/tasks/section-63.md** | Full 63.1–63.8 checklist (all [x]); integration anchors. |
| QQ spec (API, scaling) | **docs/QUICK_QUOTER_BACKEND_DATABASE_INTEGRATION.md** | §5.2 resolve response; "How missing_measurements[].quantity affects the quote (scale entered metres)". |
| QQ resolver | **backend/app/quick_quoter.py** | get_quick_quoter_catalog, resolve_quick_quoter_selection. |
| QQ API + models | **backend/main.py** | ~811 request models; ~1839 GET catalog; ~1850 POST resolve. |
| QQ state, catalog, Done, merge | **frontend/app.js** | quickQuoterState ~258; fetchQuickQuoterCatalog, getQuickQuoterResolvePayload, merge; Done handler ~6148; openQuoteModalWithElements ~3037; getElementsFromQuoteTable scaling ~3874; commitMetresInput ~3201. |
| QQ row render + label | **frontend/app.js** | renderQuickQuoterRows 5881 (builds list from quickQuoterState.repairTypes); createQuickQuoterRow 6019 (label.textContent = type.label at 6029); profile/size selects 5863–5864, 6075–6076. |
| QQ modal HTML | **frontend/index.html** | quickQuoterProfileSelect, quickQuoterSizeSelect ~1081–1091; quickQuoterList ~1099. |
| QQ styles | **frontend/styles.css** | .quick-quoter-row-label 5618; .quick-quoter-loading-message, list. |
| Mobile smoke test | **docs/quick_quoter_mobile_smoke_test.md** | Steps for Done → quote modal, Metres? rows, scaling. |

---

## Implementation hint for prefix task

Repair types from the catalog have `label`, `requires_profile`, and `requires_size_mm` (or normalized `requiresProfile` / `requiresSizeMm` in app.js ~5764–5765). Current display is `type.label` in **createQuickQuoterRow** (app.js 6029). To add SC/CL and 65/80 prefixes: either compute a display label when creating the row (using **quickQuoterState.profileValue** and **quickQuoterState.sizeMmValue**) and set `label.textContent` to that, or update the label in **renderQuickQuoterRows** after creating each row so it reacts to current dropdown values. Ensure "Other" and rows that need no profile/size are not given a misleading prefix. Scope: Quick Quoter modal only (mobile-first); keep desktop behaviour unchanged.
