# QA Audit: Section 59.9 calculation order and task list (docs-only)

**Date:** 2026-02-24  
**Role:** Strict Senior QA Engineer  
**Scope:** Recent documentation and task-list changes for 59.9–59.14 (Van Stock vs Parts Run, calculation order, Base Job GP formula).  
**Constraints checked:** Desktop vs. Mobile production, Railway deployment safety, UI/UX best practices, single source of truth, internal consistency.

---

## 1. Executive summary

| Verdict | Summary |
|--------|----------|
| **PASS** | The changes are **documentation and task-list only**. No application code, frontend, or backend routes were added or modified. Desktop and mobile production behaviour is unchanged. Railway deployment is unaffected. |
| **PASS** | Formula and calculation order (Steps 1–4) are clearly separated; Van Stock vs Parts Run is explicit; Executor 40% and Team Pool 10% are protected from Seller-only penalties. |
| **RESOLVED** | Plan section numbering was corrected: §6 Bonus labour rate, §7 Implementation steps (7.1–7.6), §8 Files to touch, §9 Edge cases, §10 Task list update, §11 References. |

**Recommendation:** Approve the current doc/task state for Dev 1. When 59.9 is implemented in code, re-run Railway/run-server and desktop-vs-mobile checks per existing audit pattern.

---

## 2. What was actually changed (scope)

| Artefact | Change type | Files |
|----------|-------------|--------|
| **Plan** | Updated formula, added Van Stock vs Parts Run (§3), calculation order (§4), Base Job GP only (§5). Removed `missed_materials_cost` and `callback_cost` from 59.9 formula. | `docs/plans/2026-02-24-section-59-9-job-gp-calculation-plan.md` |
| **Task list** | 59.9–59.14 rewritten to match Steps 1–4; 59.9 sub-tasks 59.9.1–59.9.3 aligned to rate reader, formula (Base Job GP only), and wire. | `docs/tasks/section-59.md` |

**No changes to:** `backend/`, `frontend/`, `scripts/run-server.sh`, `Procfile`, `railway.json`, `.env.example`, `TASK_LIST.md` index row (59.9–59.23 already correct), or any migration.

---

## 3. Desktop vs. mobile production

| Check | Result | Evidence |
|-------|--------|----------|
| **UI / viewport** | **PASS** | Plan §2: “Backend-only. No frontend, no `data-viewport-mode`, no mobile UI or accessibility changes.” No frontend files were edited. |
| **Behaviour parity** | **PASS** | “Desktop and mobile production behaviour unchanged. Any future Admin UI (59.17) or technician UI (59.18) will call the same APIs.” |
| **Single codebase** | **PASS** | README and RAILWAY_DEPLOYMENT state the same deployment serves both desktop and mobile; docs do not introduce separate code paths. |
| **59.17 / 59.18** | **PASS** | section-59.md: “Admin UI: … Desktop-first; mobile later if needed.” Aligns with project rules; no conflict with calculation-order docs. |

**Conclusion:** Documentation explicitly scopes 59.9 as backend-only and preserves desktop/mobile parity. No regression risk from this change set.

---

## 4. Railway deployment safety

| Check | Result | Evidence |
|-------|--------|----------|
| **Codebase delta** | **N/A** | No application code changed. Only markdown under `docs/`. |
| **run-server.sh / Procfile** | **Unchanged** | Not touched. Plan states “No change to job_performance_sync.py”; sync remains out-of-process. |
| **Env vars** | **Future** | Plan says add *optional* `BONUS_LABOUR_RATE` to `.env.example` at implementation time. No new required env for current doc state. |
| **Startup / imports** | **N/A** | No new modules or routes until Dev 1 implements 59.9. |

**Conclusion:** Current changes cannot affect Railway or `./scripts/run-server.sh`. When 59.9 is implemented, existing audit pattern (e.g. 59.6, 59.8) should be followed: confirm no startup import of sync, optional env only, run-server/Procfile unchanged.

---

## 5. UI/UX best practices

| Check | Result | Evidence |
|-------|--------|----------|
| **UI in this release** | **N/A** | No UI was built or specified in this round. |
| **Future Admin UI** | **PASS** | 59.17: “Desktop-first; mobile later if needed.” Plan §2: same APIs for both. No contradiction. |
| **Accessibility** | **N/A** | No frontend or component changes. |
| **Clarity for implementers** | **PASS** | Steps 1–4 and Van Stock vs Parts Run table give a clear order of operations and where each field is applied (Base Job GP vs period pot vs post-split). |

**Conclusion:** Docs support consistent API behaviour for future UI; no UI/UX regression or conflict.

---

## 6. Internal consistency and single source of truth

| Check | Result | Evidence |
|-------|--------|----------|
| **TASK_LIST.md** | **PASS** | Row 59: “59.9–59.23 … **Next: 59.9** (Job GP calculation). See section-59.md.” Uncompleted table and “Where to look” point to section-59.md. |
| **section-59.md** | **PASS** | 59.9–59.14 text matches plan: Base Job GP (Step 1), Period Pot (Step 2), base splits (Step 3), post-split penalties (Step 4). Van stock = no column; `missed_materials_cost` = Parts Run only, Seller penalty. |
| **Proposed plan (top of section-59)** | **PASS** | Line 10: “Missed materials (van stock): cost added to job materials (reduces shared GP). Missed materials (parts run): $20 + parts cost deducted from Seller’s 60%.” Aligns with §3–§4 of the plan and Step 4. “Unscheduled parts run: $20 deduction against job GP” aligns with Step 1 (standard_parts_runs). |
| **Data ownership** | **PASS** | section-59 “Data ownership” still lists Tech/Admin manual: callbacks, seller_fault_parts_runs, standard_parts_runs, missed_materials_cost. We only changed *where* in the pipeline they are applied, not who populates them. |
| **BACKEND_DATABASE.md** | **PASS** | No “Job GP calculation (59.9)” subsection yet; plan says to add it at implementation time. No conflict. |

**Conclusion:** Single source of truth (TASK_LIST + section-59) is consistent. Calculation order and Van Stock vs Parts Run are aligned across plan and tasks.

---

## 7. Plan document quality

| Issue | Status | Detail |
|-------|--------|--------|
| **Section numbering** | **Fixed** | Plan renumbered: §6 Bonus labour rate, §7 Implementation steps (subs 7.1–7.6), §8 Files to touch, §9 Edge cases, §10 Task list update, §11 References. |

---

## 8. Formula and calculation-order verification

| Rule | Plan / tasks | Verified |
|------|----------------|----------|
| Base Job GP uses only revenue, materials, standard_parts_runs×$20 | §5, §7.2, 59.9, 59.9.2 | Yes |
| `missed_materials_cost` NOT in Base Job GP; post-split Seller only | §3, §4 Step 4, §5 “NOT in Base Job GP”, 59.14 | Yes |
| `callback_cost` NOT in Base Job GP; period-level (Step 2) | §4 Step 2, §5, 59.10, 59.12 | Yes |
| `seller_fault_parts_runs` NOT in Base Job GP; post-split Seller only | §4 Step 4, §5, 59.14 | Yes |
| Van stock: no column; materials_cost from API already reflects it | §3 table, 59.14 “Van stock: no column” | Yes |
| Period Pot = Sum(Job GP × 0.10) − global_callback_costs | §4 Step 2, 59.10 | Yes |
| Seller Final = Seller Base − missed_materials_cost − (seller_fault_parts_runs×$20) | §4 Step 4, 59.14 | Yes |

**Conclusion:** Formula and pipeline are consistent and protect Executor 40% and Team Pool 10% from Seller-only penalties.

---

## 9. Checklist for when 59.9 is implemented in code

Before merge or production:

- [ ] **Desktop:** No unintended layout or behaviour change; bonus routes are admin-only, no new public UI.
- [ ] **Mobile:** Same as desktop for bonus feature; no new viewport or touch logic in this task.
- [ ] **Railway:** `./scripts/run-server.sh` and Procfile unchanged; no new required env (only optional `BONUS_LABOUR_RATE`); `main.py` does not import or run job_performance_sync at startup.
- [ ] **UI/UX:** If any read-only admin view is added (e.g. job with job_gp), follow desktop-first and existing admin patterns; 59.17 is the main Admin UI scope.
- [ ] **Docs:** Add “Job GP calculation (59.9)” subsection to BACKEND_DATABASE.md per plan §7.6; document formula and rate source (company_settings / BONUS_LABOUR_RATE).

---

## 10. Sign-off

| Area | Status |
|------|--------|
| Desktop vs. mobile | **PASS** |
| Railway deployment safety | **PASS** (N/A for docs-only; checklist for implementation) |
| UI/UX best practices | **PASS** (no UI in scope) |
| Single source of truth / consistency | **PASS** |
| Formula and calculation order | **PASS** |
| Plan doc numbering | **Fixed** – §6–§11 and 7.1–7.6 corrected |

**Overall:** **PASS.** Documentation and task list are fit for Dev 1 to implement 59.9–59.14 per the locked calculation order.
