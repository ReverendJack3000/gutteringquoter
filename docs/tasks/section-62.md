## 62. Quick Quoter (mobile-first UI shell, local validation, future backend mapping)

*Context: Add a new Quick Quoter flow in canvas view so users can rapidly select common repair types without drawing a diagram first. This section tracks the UI-first implementation only: entry point, modal shell, iOS-style selectable rows, row steppers, local validation, and navigation behavior for "Other". Existing quote calculation and conditional rendering logic must remain unchanged in this phase.*

**Scope:** Mobile UI and accessibility first, with strict desktop non-regression and Railway-safe deployment. Frontend-only for this phase (no backend/API/schema changes implemented yet).

---

### Task 62 checklist

- [x] **62.1** **Canvas entry point:** Add an always-on Quick Quoter card/button in canvas view (mobile-first), visually matching `.placeholder-card`, and keep desktop unaffected.
- [x] **62.2** **Quick Quoter modal shell:** Add modal with header selectors (`Profile`, `Size mm`), repair list body, and inline validation region; register with modal accessibility framework.
- [x] **62.3** **Repair rows + stepper swap:** Render repair type rows in iOS-style inset grouped blocks; unselected rows show right-side empty circle; selected rows show right-side stepper (default qty 1) with fixed row height and text ellipsis.
- [x] **62.4** **Local state + behavior:** Add isolated Quick Quoter local state (`isOpen`, selector values, selected repair/qty map), multi-select accumulation, and deselect behavior.
- [x] **62.5** **Validation rules (local):** Enforce type-specific profile/mm requirements with inline errors; clear errors as selectors become valid.
- [x] **62.6** **"Other" navigation rule:** Selecting `Other` closes Quick Quoter, clears local Quick Quoter state, and opens the main quote modal immediately via existing Generate Quote flow.
- [x] **62.7** **Regression guardrail + future integration notes:** Verify no changes to existing quote calculation/grouping/conditional logic; document future backend integration points (DB/API/files) without wiring live data in this phase.
- [x] **62.8** **Row label prefixes (Profile/Size):** In the Quick Quoter modal, prefix repair row labels from the current dropdowns: Storm Cloud → "SC:", Classic → "CL:" for profile-based (gutter) rows; 65mm → "65:", 80mm → "80:" for size-based rows, using each type’s `requires_profile` / `requires_size_mm` (frontend: `requiresProfile` / `requiresSizeMm`). Use `quickQuoterState.profileValue` and `quickQuoterState.sizeMmValue` when building the display label. No prefix for "Other" or when dropdown not set. Key touchpoints: `app.js` `createQuickQuoterRow` (label at 6029), `renderQuickQuoterRows` (5881); update labels when Profile/Size selectors change (call `renderQuickQuoterRows` from change handlers). Mobile-only; desktop unchanged; Railway-safe.
- [x] **62.9** **Mobile Quick Quoter visibility follows blueprint presence.** In `frontend/app.js` `updatePlaceholderVisibility()`, hide `#quickQuoterEntry` when a blueprint exists (`state.blueprintImage`) and show it when no blueprint exists. Applies to uploaded and loaded blueprints, with desktop behavior unchanged and Railway-safe frontend-only scope.
- [x] **62.10** **Desktop entry parity (card only):** Show the existing Quick Quoter canvas entry card on desktop (no new toolbar trigger). Keep one shared entry point across mobile/desktop and preserve existing modal wiring.
- [x] **62.11** **Desktop visibility rule parity:** Keep Quick Quoter entry visibility blueprint-based for both viewports: show before blueprint, hide after blueprint upload/load, with no viewport-specific JS branch.
- [x] **62.12** **Desktop modal parity (no redesign):** Reuse the existing Quick Quoter modal on desktop with current behavior (`catalog` load, local validation, "Other" rule, Done resolve + merge into quote modal). No backend/API/schema changes.
- [x] **62.13** **Desktop E2E coverage:** Extend `e2e/run.js` desktop phase to assert pre-upload entry visibility, open/close Quick Quoter modal from `#quickQuoterEntryBtn`, and post-upload entry hidden. Keep existing mobile checks unchanged.
- [x] **62.14** **Docs parity update:** Update Quick Quoter smoke-test docs and README to state entry availability before blueprint on both desktop and mobile, and preserve Railway-safe scope (no deploy/config/env changes).
- [ ] **62.15** **Verification + Railway safety sign-off:** Run Quick Quoter backend tests (`tests.test_quick_quoter`, `tests.test_quick_quoter_api`) and full E2E (`npm run test:e2e`); perform manual QA on `?viewport=desktop` and `?viewport=mobile`; confirm no Railway build/runtime/config/env changes. Backend Quick Quoter tests pass; desktop Quick Quoter E2E assertions pass; full suite currently blocked by existing desktop rotate step failure in `e2e/run.js` ("Rotate: handle found ... but rotation did not change"). Manual QA pending.
- [x] **62.16** **Mobile Quick Quoter entry: blue button with camera vertical padding and white icon:** On mobile only, style the Quick Quoter entry as a blue button: background `#007aff` (current icon blue), SVG and text white; use same vertical padding as the camera section (1.5rem). Scope all new/updated rules under `body[data-viewport-mode="mobile"]` so desktop remains unchanged. No HTML or JS changes; CSS only in `frontend/styles.css`. Key selectors: `#quickQuoterEntry` > `#quickQuoterEntryBtn` (`.placeholder-card.quick-quoter-entry-card`), `.quick-quoter-entry-icon` (svg uses `stroke="currentColor"`), `.placeholder-title`, `.placeholder-steps`. Camera section mobile padding reference: `body[data-viewport-mode="mobile"] .canvas-placeholder .placeholder-card { padding: 1.5rem 1.25rem; }`. Ensure focus-visible outline remains visible on blue; high-contrast already overrides card background. Railway-safe; E2E/QA as needed.

---

### Future backend mapping reference (document-only for 62)

- Planned table: `public.quick_quoter_repair_types` (`id`, `label`, `active`, `sort_order`, `requires_profile`, `requires_size_mm`).
- Planned table: `public.quick_quoter_part_templates` (`repair_type_id`, `product_id`, `qty_per_unit`, `condition_profile`, `condition_size_mm`, `length_mode`).
- Planned API: `GET /api/quick-quoter/catalog`, `POST /api/quick-quoter/resolve`.
- Existing integration anchors:
  - `backend/main.py` `QuoteElement` / `CalculateQuoteRequest`
  - `backend/main.py` `POST /api/calculate-quote`
  - `backend/app/gutter_accessories.py` `expand_elements_with_gutter_accessories`
  - `backend/main.py` ServiceM8 profile label logic in add/create job endpoints
  - `backend/app/quotes.py` material line persistence shape
