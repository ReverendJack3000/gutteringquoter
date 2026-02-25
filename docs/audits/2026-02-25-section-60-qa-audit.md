# Section 60 – QA Audit Report (Strict Senior QA)

**Date:** 2026-02-25  
**Scope:** Implementation and tasks 60.1–60.11 (Technician bonus spec refinements).  
**Constraints checked:** Desktop vs mobile production environments, Railway deployment safety, UI/UX best practices.  
**Branch:** main (Stable).

---

## 1. Regression & Conflict Check

### 1.1 Mobile layout bleeding into desktop viewport

| Check | Result | Evidence |
|-------|--------|----------|
| Mobile-only bonus section visible on desktop | **PASS** | `.bonus-race-board-mobile` has `display: none` by default (styles.css ~4457–4459). It becomes `display: grid` only under `body[data-viewport-mode="mobile"]` (~4697–4698). Desktop never shows `#bonusRaceBoardMobile` or the “How it works” collapsible. |
| Mobile-only “How it works” styling affecting desktop | **PASS** | All “How it works” rules are scoped under `body[data-viewport-mode="mobile"] .bonus-how-it-works` (~4751–4780). No unscoped `.bonus-how-it-works` rules that would apply on desktop. |
| Touch targets / mobile-only styles leaking to desktop | **PASS** | 44px min-height/min-width and related mobile bonus rules are under `body[data-viewport-mode="mobile"]` (e.g. ~4720–4748). Desktop bonus styles (e.g. `.bonus-hero-grid`, `.bonus-ledger-section`) remain unscoped or under `#view-bonus-admin` / shared layout only. |

### 1.2 Desktop layout unaffected by Section 60 UI changes

| Check | Result | Evidence |
|-------|--------|----------|
| Desktop bonus hero still shown on desktop | **PASS** | `.bonus-hero-grid` is visible by default; only hidden on mobile via `body[data-viewport-mode="mobile"] .bonus-hero-grid { display: none }` (~4705–4706). |
| Desktop labels/aria unchanged (60.10) | **PASS** | Desktop keeps “Total Team Pot” (index.html ~775), `aria-label="Total team pot. Click to replay tally."` (~781), and “Team pot progress gauge” (~776). No “Team Pool” in desktop-visible DOM. |
| Desktop ledger and admin UI unchanged | **PASS** | Ledger section and admin tables are shared; no Section 60–specific desktop-only regressions. Admin Edit job (is_upsell) and Edit personnel (Spotter) are additive. |

### 1.3 Oversights / regressions (any scope)

| Area | Result | Notes |
|------|--------|------|
| Estimation tolerance value | **PASS** | `bonus_calc.py` and `bonus_dashboard.py` use 20 minutes (no remaining `30`). `_build_estimation_payload` uses `max(..., 20)`. Frontend shows `estimation.tolerance_minutes` from API. |
| Parts run deduction | **PASS** | `PARTS_RUN_DEDUCTION_DOLLARS = 10` in bonus_calc.py; used in job GP and seller penalty; test uses constant. |
| Seller-share floor | **PASS** | `apply_seller_penalties` uses `max(0.0, round(seller_base - per_seller, 2))` (bonus_calc.py ~192). |
| Spotter 20% / 80% to CSG | **PASS** | `compute_job_spotter_splits` and ledger/period totals include `spotter_base`; backend and frontend Spotter badge and admin checkbox present. |
| Min margin 50% and is_upsell filter | **PASS** | `filter_eligible_period_jobs` requires status in (`verified`, `processed`), `job_gp / revenue >= 0.50`, and `is_upsell` true. BACKEND_DATABASE.md documents both. |
| BACKEND_DATABASE.md 60.7 / 60.8 | **PASS** | Cut-off 11:59 PM local, payment_date for period assignment, and voided shares reverting to CSG are documented. |
| Railway deployment | **PASS** | No new dependencies or build steps; Procfile and nixpacks.toml unchanged. Optional `BONUS_LABOUR_RATE` already documented. |

---

## 2. Pass/Fail by Category

| Category | Pass/Fail | Notes |
|----------|-----------|--------|
| **Desktop vs mobile CSS separation** | **PASS** | Mobile-only sections and “How it works” are hidden on desktop; desktop hero hidden on mobile. No bleed. |
| **Backend 60.1–60.8 (labour rate, $10, 20 min, spotter, margin, upsell, cut-off, voided shares)** | **PASS** | Implemented and documented as specified. |
| **Frontend 60.9–60.11 (How it works, Team Pool copy, Job GP formula)** | **PASS** | Mobile-only collapsible and copy; formula in “How it works”; Team Pool in mobile headings/labels/aria and delta text. |
| **Admin UI (Edit job is_upsell, Edit personnel Spotter)** | **PASS** | Checkboxes and API wiring present. |
| **Railway deployment safety** | **PASS** | No changes that would break deploy. |
| **Accessibility (labels, aria)** | **PASS** | Mobile uses “Team pool” / “Total team pool” in aria-labels; desktop keeps “team pot”. |

---

## 3. Bugs / Cleanup / Logic Gaps (no code written; for approval)

1. **Minor copy consistency (60.10)**  
   In `app.js` (~14137), when delta is zero the text is:  
   `'No team pool movement since last update.'`  
   For consistency with the chosen naming “Team Pool”, consider capitalising:  
   `'No Team Pool movement since last update.'`  
   **Severity:** Cosmetic. **Action:** Optional; await your approval.

2. **Test coverage (60.5)**  
   `test_bonus_dashboard_canonical.py` verifies that only `verified`/`processed` jobs are eligible and that draft is excluded. It does not include an explicit case that:
   - a job with Job GP / revenue &lt; 0.50 is excluded, or  
   - a job with `is_upsell` false is excluded.  
   **Severity:** Low (logic is implemented and documented). **Action:** Optional; add one or two assertions for margin and `is_upsell` if you want stronger regression coverage.

3. **No other bugs or logic gaps identified** for the Section 60 scope. No missing cleanup steps found.

---

## 4. Summary

- **Regression & conflict check:** **PASS** — No mobile layout bleed into desktop; no desktop regressions identified.
- **Oversights:** **PASS** — Estimation 20 min, $10 deduction, seller floor, spotter, margin, upsell, docs, and UI are aligned with the spec.
- **Railway:** **PASS** — Deploy path unchanged.

**Recommendation:** Section 60 implementation is suitable for production from a QA perspective. The two items above are optional follow-ups (copy consistency and extra test cases) and do not block release. Proceed with fixes only after your approval of this audit.
