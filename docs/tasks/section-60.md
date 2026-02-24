## 60. Technician bonus: spec refinements (post–Section 59)

*Context: Section 59 delivered the technician bonus dashboard (period, Team Pot gauge, ledger, 60/40, callbacks, estimation, seller penalties). This section captures **additions and refinements** from the finalized business spec: labour rate $33+GST, $10 travel fee, 20-minute estimation variance, spotter share, minimum margin 50%, true upsells only, cut-off policy, lost-shares-to-CSG documentation, and mobile-only UI/copy updates. No implementation in this section file—task list only. Scope: backend/calculation tasks affect both desktop and mobile data; UI/copy/accessibility tasks are **mobile-only** unless a task explicitly includes desktop.*

**Spec source (finalized):** Team Pool Multiplier (10% of GP from repair upsells); 60/40 Seller/Executor; do it all get 100%; truck share; spotter 20%; Standardised Bonus Labour Rate = $33+GST; Job GP = (Price − Materials) − ($33 × Man-Hours); Unscheduled Parts Run = $10 Travel Fee + time on clock; Estimation = 15% or 20-minute variance (whichever greater); minimum margin 50%; true upsells only; cut-off 11:59 PM last Sunday of fortnight; lost shares revert to CSG; conditions (payment, callbacks, schedule saver, seller shouts parts, etc.).

---

### Backend and calculation (affects both desktop and mobile)

- [x] **60.1** **Labour rate $33+GST:** Align bonus labour rate to $33+GST per finalized spec. Update `company_settings` / `BONUS_LABOUR_RATE` default and docs (e.g. BACKEND_DATABASE.md, .env.example); clarify whether the stored rate is ex-GST or inc-GST and how it is applied in Job GP. Backend + docs only; no UI string changes in this task.
- [x] **60.2** **Parts run deduction $10 and seller-share floor:** (1) Change unscheduled parts run deduction from $20 to **$10** per spec (“Flat $10 Travel Fee”). Update `PARTS_RUN_DEDUCTION_DOLLARS` (or equivalent) in `backend/app/bonus_calc.py` and any hardcoded 20 in `backend/app/bonus_dashboard.py` for base job GP and seller penalty; update tests and .env.example/BACKEND_DATABASE.md. (2) **Zero-out floor:** When deducting part costs and the $10 travel fee from the Seller’s share on a specific job, the Seller’s payout for that job cannot drop below $0. Use `max(0, seller_share - penalty)` so the fortnightly tally never goes negative for that job. Backend only.
- [x] **60.3** **Estimation variance 20 minutes:** Change estimation accuracy tolerance from **30** to **20** minutes (spec: “15% or 20-minute variance, whichever greater”). Update `backend/app/bonus_calc.py` (`_estimation_within_tolerance`: replace 30 with 20) and `backend/app/bonus_dashboard.py` (`_build_estimation_payload`: same); update tests and BACKEND_DATABASE.md. Update any frontend ledger or tooltip that displays “30 min” tolerance (e.g. estimation message) so it reflects 20 min after backend change.
- [x] **60.4** **Spotter share (20%):** Implement spotter share per spec: if a technician spots a needed repair but hands the lead to the office or a Senior Tech and that quote wins, they receive 20% of that job’s GP. **The remaining 80% of that job’s GP (the portion not allocated to the spotter) reverts to the house (CSG), not to other sellers/executors.** Requires: schema (e.g. `job_personnel.is_spotter` or equivalent), calculation step in bonus pipeline (allocate 20% job GP to spotter; remainder to CSG), API/ledger inclusion (e.g. role badge “Spotter” or “Spotter Share”), and optional Admin UI to set spotter. Backend + API + mobile ledger badge; desktop ledger if same payload.
- [x] **60.5** **Minimum margin 50%:** Add eligibility rule: a job contributes to the period pot only if it maintains a minimum Gross Profit margin of 50%. **Eligibility formula (standard margin): Job GP / Price to Customer ≥ 0.50.** Use total revenue (e.g. `invoiced_revenue_exc_gst`) as the denominator (Price to Customer), not (revenue − materials). If the business instead requires margin against profit-after-materials, that must be explicitly confirmed and the formula documented. Exclude ineligible jobs from period pot and from tech GP splits; document in BACKEND_DATABASE.md; optionally surface in ledger or explanations (e.g. “Below 50% margin – no pot credit”). Backend; affects both.
- [ ] **60.6** **True upsells only:** Define “true upsell” per spec (additional work identified and sold after arriving on-site; standard dispatch jobs already quoted/booked by the office do not count). **Data entry:** (1) Add a boolean field `is_upsell` on the job record (e.g. `job_performance.is_upsell`). (2) Add a toggle in the Admin UI (or technician close-out form) to mark a job as an upsell. (3) **ServiceM8 integration:** In ServiceM8, when a job is marked as an upsell, a “Site Sale” badge is added to the job. When syncing from ServiceM8, if the job has this badge, set `is_upsell` true (badge reference: name `"Site Sale"`, uuid `d14c817e-4ba4-43ee-b51c-219867379a2b`; full badge JSON available for API matching). Filter jobs that count toward the period pot by `is_upsell`; document. Optional: ledger or Admin indicator for “upsell” vs “dispatch”. Backend (+ Admin UI toggle); affects both.
- [ ] **60.7** **Cut-off 11:59 PM Sunday and payment-driven period assignment:** (1) **Timezone:** Ensure 11:59 PM is evaluated in the local timezone (e.g. Pacific/Auckland), not server UTC, so the tally closes at the intended local time. (2) **Payment date:** Logic must use **payment_date** (when the job was paid), not just completion or invoice date, to assign the job to the correct fortnightly `bonus_period`. Jobs paid after 11:59 PM on the last Sunday of the period roll into the next period. Document in BACKEND_DATABASE.md; implement period-assignment and cut-off logic to be timezone-aware and payment-driven. Sync or cron must have access to payment date (e.g. from ServiceM8) where applicable.
- [ ] **60.8** **Lost shares to CSG:** Document in BACKEND_DATABASE.md (and optionally one-line mobile copy) that voided shares (e.g. estimation fail, callback void) revert to CSG (House), not to other technicians. No calculation change; docs + optional mobile UI only.

---

### Technician dashboard UI (mobile-only unless specified)

- [ ] **60.9** **Technician dashboard copy (mobile):** Add or replace copy so the technician-facing rules match the finalized spec. Include: Team Pool = 10% of GP from repair upsells; 60/40 Seller/Executor; do it all get 100%; truck share; spotter 20%; conditions (payment when job completed/invoiced/paid, cut-off, minimum margin 50%, true upsells only, estimation accuracy, callbacks, clock keeps ticking, $10 travel fee, schedule saver, seller shouts parts). Deliver as mobile-only: collapsible “How it works” or tooltips; desktop layout/strings unchanged unless a follow-up task adds desktop.
- [ ] **60.10** **Naming: Team Pool vs Team Pot:** Decide final naming (spec uses “Team Pool” / “Team Pool Multiplier”; app currently uses “Team Pot”). Align headings, labels, and aria on the technician bonus dashboard. Scope: mobile-only for UI changes unless explicitly extended to desktop.
- [ ] **60.11** **Job GP formula in copy:** When adding or updating in-app formula text for technicians, use “(Price − Materials − $33×Man-Hours)” (or the configured rate once 60.1 is done). Mobile-first; can be part of 60.9 “How it works” or a dedicated formula line.

---

### Reference (60.6 – ServiceM8 “Site Sale” badge)

When a job is marked as an upsell in ServiceM8, the “Site Sale” badge is added. Use this for syncing `is_upsell` (e.g. match by `name` or `uuid`):

```json
{
  "uuid": "d14c817e-4ba4-43ee-b51c-219867379a2b",
  "edit_date": "2026-02-25 11:05:08",
  "active": 1,
  "file_name": "badges_large_010.png",
  "automatically_allocated": 0,
  "regarding_form_uuid": "",
  "name": "Site Sale",
  "regarding_asset_type_uuid": ""
}
```

---

*For the index and uncompleted table, see TASK_LIST.md. Implementation order: backend/calculation (60.1–60.8) can be done first; UI tasks (60.9–60.11) depend on spec alignment and are mobile-only unless specified.*
