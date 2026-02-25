## 63. Quick Quoter Backend + Database Integration

*Context: Wire Quick Quoter to live backend and Supabase so selections resolve into quote-ready materials and missing-measurement rows. Spec: `docs/QUICK_QUOTER_BACKEND_DATABASE_INTEGRATION.md`. Keep canvas elements authoritative; add Quick Quoter output as additive; route gutter/downpipe items that need measurements into existing quote modal "Metres?" flow; keep `expand_elements_with_gutter_accessories` unchanged.*

**Scope:** Backend (Supabase migrations, resolver, API), optional catalog-driven UI, and frontend merge when user confirms Quick Quoter. Mobile-first entry point (Section 62); merge and quote flow shared. No Railway deploy config changes; existing Supabase env only.

---

### Task 63 checklist

- [x] **63.1** **DB Migration A:** Create `public.quick_quoter_repair_types` (id, label, active, sort_order, requires_profile, requires_size_mm, created_at, updated_at) and index `idx_quick_quoter_repair_types_active_sort` via Supabase MCP `apply_migration` (SQL file: `docs/quick_quoter_migration_a.sql`).
- [x] **63.2** **DB Migration B:** Create `public.quick_quoter_part_templates` (repair_type_id FK, product_id FK → products.id, qty_per_unit, condition_profile SC/CL, condition_size_mm 65/80, length_mode none|missing_measurement|fixed_mm, fixed_length_mm when fixed_mm, active, sort_order, created_at, updated_at) with check constraint for fixed_length_mm and indexes per spec (SQL file: `docs/quick_quoter_migration_b.sql`).
- [x] **63.3** **DB Migration C:** Seed `quick_quoter_repair_types` with the 16 repair types and `quick_quoter_part_templates` using `docs/quick_quoter_seed.sql` (mapping doc: `docs/quick_quoter_seed_part_templates.md`).
- [x] **63.4** **Backend resolver:** Add `backend/app/quick_quoter.py` with `get_quick_quoter_catalog(supabase)` and `resolve_quick_quoter_selection(supabase, profile, size_mm, selections)`; output compatible with `QuoteElement` (assetId, quantity, optional length_mm) and missing_measurements list (assetId, quantity, repair_type_id). Map request profile storm_cloud/classic to template condition_profile SC/CL.
- [x] **63.5** **Backend API:** Add `GET /api/quick-quoter/catalog` (returns repair_types with id, label, requires_profile, requires_size_mm, sort_order, active) and `POST /api/quick-quoter/resolve` (body: profile, size_mm, selections; validate requires_profile/requires_size_mm, quantity >= 1; return elements, missing_measurements, validation_errors; 400 on validation errors).
- [x] **63.6** **Frontend merge:** On Quick Quoter "Done" with selections (and no "Other" only): call `POST /api/quick-quoter/resolve`; merge resolved `elements` with `getElementsForQuote()` and inject resolved `missing_measurements` as incomplete rows; open quote modal with merged list via existing Generate Quote flow; pass through existing `calculateAndDisplayQuote()` path. Keep "Other" behavior: close QQ and open quote modal without resolve.
- [x] **63.7** **Optional catalog-driven UI:** If desired, load repair list from `GET /api/quick-quoter/catalog` when opening Quick Quoter modal (else keep static `QUICK_QUOTER_REPAIR_TYPES` until catalog is ready).
- [x] **63.8** **Validation and tests:** Backend unit tests (resolver condition filtering, length_mode mapping, qty aggregation); API tests (catalog ordering/active, resolve validation and success); integration check (QQ + measured elements merge, no clobber; accessory behavior unchanged). E2E/QA as needed; desktop unchanged; Railway-safe.
- [ ] **63.9** **Follow-up (baseline lock):** Mixed-length gutter accessory inference should use aggregated measured length consistently across packed pieces. Current baseline behavior (first packed piece carrying `length_mm`) is intentionally preserved and covered by audit tests.
- [x] **63.10** **Quick Quoter gutter rows → must-enter metres (data-only):** In Quick Quoter templates, convert gutter rows that auto-fill from `length_mode='none'` to `length_mode='missing_measurement'` so the gutter header shows "Metres?" (empty) instead of prefilled 1.0m. Change seed `docs/quick_quoter_seed.sql` at lines 48, 49, 75, 76, 80, 81, 93, 94, 107, 108 (all GUT-SC-MAR-3M / GUT-CL-MAR-3M rows); add idempotent Supabase migration `UPDATE quick_quoter_part_templates SET length_mode = 'missing_measurement' WHERE length_mode = 'none' AND product_id IN ('GUT-SC-MAR-3M','GUT-CL-MAR-3M')`. Keep `qty_per_unit` as-is. Do not touch `backend/app/gutter_accessories.py`, bin-pack helpers, or `/api/calculate-quote`. Validation: Stop-End Replacement only → "Metres?"; enter metres → bin-pack 1.5/3/5; `./scripts/run-backend-tests.sh` and `npm run test:manual-metre`. Desktop and mobile share quote modal; no viewport-specific change. Railway-safe (migration in Supabase only).

---

### Integration anchors (verified)

- Backend: `backend/main.py` QuoteElement (799), CalculateQuoteRequest (805), POST /api/calculate-quote (1827), expand_elements_with_gutter_accessories (1840); `backend/app/gutter_accessories.py` (86); `backend/app/quotes.py` QuoteMaterialLine / persistence.
- Frontend: `frontend/app.js` getElementsForQuote (6505), Generate Quote open flow (2953), getElementsFromQuoteTable (3773), calculateAndDisplayQuote (4141), QUICK_QUOTER_REPAIR_TYPES (258), quickQuoterState and initQuickQuoter (279, 5744+).
- Supabase: project_id `rlptjmkejfykisaefkeh`; `public.quick_quoter_repair_types` (16 rows) and `public.quick_quoter_part_templates` (76 rows) created and seeded via migrations A/B + seed.
