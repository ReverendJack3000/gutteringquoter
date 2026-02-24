# Section 59.7: Populate job_performance.invoiced_revenue_exc_gst and materials_cost (plan)

**Status:** Plan only. No code changes until approved.  
**Branch:** feature/section-59-cron-sync (based on main).  
**Prerequisite:** 59.6 done (cron sync creates/upserts job_performance with quote_id, quoted_labor_minutes; revenue and materials currently 0).

**Goal:** In the existing cron sync (or same pass), set `job_performance.invoiced_revenue_exc_gst` from ServiceM8 job `total_invoice_amount` and `job_performance.materials_cost` from ServiceM8 JobMaterial endpoint using our DB pricing with ServiceM8 fallback. Keep merge-before-upsert and all existing sync-owned columns.

---

## 1. Scope (59.7 only)

| Field | Source | Notes |
|-------|--------|-------|
| **invoiced_revenue_exc_gst** | ServiceM8 job `total_invoice_amount` | Convert to ex-GST (see §2). |
| **materials_cost** | ServiceM8 JobMaterial list for job + our DB | Our product cost first; ServiceM8 fallback (see §3). |
| **quote_id**, **quoted_labor_minutes** | Already set by 59.6 | No change. |
| **bonus_period_id** | Admin/System | Not in 59.7. |
| **callbacks, parts runs, missed_materials_cost** | Tech/Admin manual | Not in 59.7. |

---

## 2. invoiced_revenue_exc_gst

- **Source:** `job["total_invoice_amount"]` from the job object already fetched in the sync loop (no extra API call).
- **GST:** Frontend and docs state ServiceM8 `total_invoice_amount` is **inc GST**. Column is `invoiced_revenue_exc_gst`, so store **ex-GST**:
  - `revenue_exc_gst = float(total_invoice_amount) / 1.15` (or use a shared constant e.g. `GST_DIVISOR = 1.15`).
- **Type:** ServiceM8 may return string or number; normalise to float. If missing or invalid, use `0` so NOT NULL is satisfied.
- **Where:** In `job_performance_sync.run_sync()`, in the same `for job in jobs:` loop, read `job.get("total_invoice_amount")`, normalise, divide by 1.15, set `row["invoiced_revenue_exc_gst"]` (replace the current `= 0`).

---

## 3. materials_cost

- **Source:** ServiceM8 **JobMaterial** list for the job. Filter: `GET /api_1.0/jobmaterial.json` with `$filter=job_uuid eq '<job_uuid>'` (per SERVICEM8_API_REFERENCE.md §4). We have `job_uuid` in the loop.
- **Decision (data flow):** “Pull pricing/GP from our database; fall back to ServiceM8 if price or cost is missing.” So for each JobMaterial line, prefer **our** cost; if we have no product or no cost, use ServiceM8 cost for that line.
- **Matching our DB:**
  - JobMaterial has `material_uuid` (ServiceM8 material UUID).
  - Our `public.products` has `servicem8_material_uuid` (and `cost_price`); CSV import and docs confirm this. Match by `servicem8_material_uuid == material_uuid`.
  - If a product is found and has `cost_price`, use **our** line cost = `cost_price * quantity` (quantity from JobMaterial). If product has no `cost_price` (None), treat as “missing” and use ServiceM8.
  - If no product matches, use ServiceM8 line cost for that line.
- **ServiceM8 line cost:** Doc says “sum **cost** (and optionally **price**)”; “confirm exact field names (cost vs displayed_cost, tax handling) via Try It!”. Implementation: read `cost` or `displayed_cost` (whichever is present and numeric); if both, prefer one consistently (e.g. `displayed_cost` if it represents actual cost). If ServiceM8 returns **line total** cost, use it as-is; if **per-unit**, multiply by quantity. (Confirm from API response shape when implementing.)
- **Sum:** Sum all line costs (our or ServiceM8 fallback) → `materials_cost`. If no JobMaterials or API error, use `0`.
- **Where:** In the same sync loop, for each job with `job_uuid`: call a new helper to list JobMaterials and compute total materials cost; set `row["materials_cost"]` (replace the current `= 0`).

---

## 4. Backend changes (implementation order)

1. **servicem8.py**
   - Add **list_job_materials(access_token: str, job_uuid: str) -> list[dict]**.  
   - GET `/api_1.0/jobmaterial.json` with `$filter=job_uuid eq '<job_uuid>'`. Use `make_api_request`; handle pagination if ServiceM8 uses cursor for this endpoint (confirm; if no cursor, single request may suffice). Return list of raw JobMaterial dicts.

2. **Products / pricing (our DB cost for materials)**
   - Add a small helper (e.g. in `job_performance_sync.py` or in `app/pricing.py`) to resolve **line cost** for one JobMaterial: given `material_uuid`, `quantity`, and ServiceM8 line dict:
     - Query `public.products` for row where `servicem8_material_uuid = material_uuid` (and optionally limit to columns needed).
     - If row exists and `cost_price` is not None: return `float(cost_price) * float(quantity)`.
     - Else: return ServiceM8 line cost (from `cost` or `displayed_cost`; normalise type and multiply by quantity if per-unit).
   - Bulk option: fetch all products that have `servicem8_material_uuid` in the set of JobMaterial `material_uuid` values for the job, then resolve in memory to avoid N+1.

3. **job_performance_sync.py**
   - In `run_sync()`, inside the existing `for job in jobs:` loop:
     - **Revenue:** `raw = job.get("total_invoice_amount")`; normalise to float; `row["invoiced_revenue_exc_gst"] = (raw / 1.15) if raw else 0` (guard for zero/None).
     - **Materials:** `job_uuid = job.get("uuid")`; if present, call `list_job_materials(access_token, job_uuid)`; compute total materials cost using our-DB-first helper above; set `row["materials_cost"] = total` (or 0 on error/empty).
   - Keep merge-before-upsert: only sync-owned columns (already include `invoiced_revenue_exc_gst`, `materials_cost`) are updated; admin-edited fields remain untouched.
   - No change to quote resolution, quoted_labor_minutes, or upsert key.

4. **Token scope**  
   Cron already runs with company user token. Plan (59.6) requires `read_job_materials` for 59.7; ensure OAuth app has `read_job_materials` scope so the token includes it. No code change if already requested; document in README/deployment if new.

---

## 5. Edge cases and validation

- **total_invoice_amount missing or zero:** Set `invoiced_revenue_exc_gst = 0`. No exception.
- **total_invoice_amount string:** `float(x)`; on ValueError use 0.
- **Job has no job_uuid:** Skip JobMaterials fetch; set `materials_cost = 0`.
- **list_job_materials fails (network/403):** Log; set `materials_cost = 0` for that job so sync continues.
- **JobMaterial missing cost and no product match:** Use 0 for that line (do not fail the job).
- **Products table missing servicem8_material_uuid column:** If schema was never extended, match by `item_number` only where ServiceM8 exposes something mappable, or use ServiceM8 cost only for all lines until schema is added. Prefer checking current schema (Supabase MCP or migrations) before implementing.

---

## 6. Files to touch (summary)

| File | Change |
|------|--------|
| `backend/app/servicem8.py` | Add `list_job_materials(access_token, job_uuid)` (GET jobmaterial.json with $filter=job_uuid eq '...'). |
| `backend/app/job_performance_sync.py` | In loop: set invoiced_revenue_exc_gst from job total_invoice_amount (÷1.15); call list_job_materials + new helper to compute materials_cost; set row["materials_cost"]. |
| New or existing module | Helper: given JobMaterial list + Supabase, return total materials cost (our DB cost with ServiceM8 fallback per line). Optionally in `job_performance_sync.py` or `pricing.py`. |
| `docs/SERVICEM8_API_REFERENCE.md` | Optional: note JobMaterial response fields used (cost/displayed_cost, quantity, material_uuid) after confirming. |
| `TROUBLESHOOTING.md` | If we discover GST or JobMaterial quirks, add an entry. |

---

## 7. Out of scope for 59.7

- bonus_period_id (Admin/System).
- callbacks, parts runs, missed_materials_cost (Tech/Admin manual).
- job_personnel (59.8).
- Any change to Add to Job / Create New Job or quote persistence.
- E2E tests (can be added in 59.21 or follow-up).

---

## 8. Task list update (when 59.7 is done)

- In **docs/tasks/section-59.md**: change 59.7 checkbox from `[ ]` to `[x]`.
- In **TASK_LIST.md**: in the uncompleted table row for section 59, update description to show 59.7 done and 59.8 next (e.g. “59.8–59.23 …” or leave “59.7–59.23” and remove 59.7 from remainder text once completed).

---

## 9. References

- Task: `docs/tasks/section-59.md` lines 93–94 (59.7).
- Decisions: `docs/tasks/section-59.md` 47–65; `docs/plans/2026-02-23-section-59-data-flow-decisions.md` (revenue §4, Job Materials §5).
- Schema: `docs/BACKEND_DATABASE.md` §4 job_performance (107–116), Section 59 decisions (200–218); `docs/plans/2026-02-23-bonus-periods-job-performance-schema.md` 50–76.
- ServiceM8: `docs/SERVICEM8_API_REFERENCE.md` Jobs (12–35, total_invoice_amount), Job Materials §4 (list, filter by job_uuid).
- Cron flow: `docs/plans/2026-02-24-section-59-cron-sync-job-performance.md` step 4, “Open questions” (59.7 in same pass).
- Current sync: `backend/app/job_performance_sync.py` run_sync() 27–107; lines 95–96 set revenue/materials to 0.
- Products: `backend/app/pricing.py` (cost_price); `backend/app/csv_import.py` (item_number, servicem8_material_uuid). Confirm `public.products` columns via Supabase MCP or migrations.
