# Quick Quoter – Mobile UI smoke test (Done → quote modal)

**Purpose:** Quick check that the Quick Quoter Done flow opens the quote modal with merged elements, shows Metres? rows for `missing_measurements`, and applies quantity-scaling when the user enters metres.

**Prerequisites:** Backend running (`./scripts/run-server.sh`), Supabase migrations A/B + seed applied (catalog + templates in DB).

---

## 1. Setup (mobile viewport)

- Open **http://127.0.0.1:8000/?viewport=mobile** (or use DevTools device toolbar / real device).
- Ensure you’re in **canvas view** (diagram area visible).

---

## 2. Quick Quoter Done → quote modal

| Step | Action | Expected |
|------|--------|----------|
| 2.1 | Tap **Quick Quoter** entry (card/button on canvas). | Quick Quoter modal opens with Profile and Size (mm) selectors and repair list. |
| 2.2 | Select **Profile** (e.g. Storm Cloud) and **Size** if required by chosen rows. | No inline validation errors for profile/size. |
| 2.3 | Select one or more repair types (e.g. **Expansion Joiner Replacement**, **Cutting a Down Pipe**). | Rows show stepper; validation clears when required fields are set. |
| 2.4 | Tap **Done**. | Quick Quoter modal closes; **quote modal** opens with a materials table. |
| 2.5 | Inspect quote table. | Rows from resolved **elements** (e.g. expansion joiner, glue) appear with quantities. Rows from **missing_measurements** (e.g. Cutting a Down Pipe → downpipe length) appear with **“Metres?”** placeholder in the qty column. |

---

## 3. Metres? rows and quantity-scaling

| Step | Action | Expected |
|------|--------|----------|
| 3.1 | Find a row that shows **Metres?** (e.g. 65mm or 80mm downpipe from “Cutting a Down Pipe”). | Row has a numeric input (or “Metres?”) in the qty cell; row is treated as incomplete until length is entered. |
| 3.2 | Enter a length in metres (e.g. **6**). | Input accepts value; on blur/commit the row is no longer incomplete. |
| 3.3 | Trigger quote recalc (e.g. blur, or another edit). | Qty cell updates from **effective length**: `effective_metres = entered_metres × resolver_quantity` (e.g. 6 × 0.33 = 1.98 m for elbow downpipe, or 6 × 1 = 6 m for cutting). Bin-pack uses effective length; displayed qty matches that (e.g. 2 × 3 m lengths for 6 m). |
| 3.4 | (Optional) Change the metres value or add another QQ repair and **Done** again. | Quote table updates; no duplicate or clobbered rows from canvas elements; totals recalc. |

---

## 4. Quick pass/fail

- **Pass:** Done opens quote modal; resolved elements and missing_measurements rows appear; Metres? rows accept metres and recalc with **effective_metres = entered × resolver quantity**; no console errors; desktop unchanged (test without `?viewport=mobile` that QQ entry is not required and quote flow still works from Generate Quote).
- **Fail:** Catalog doesn’t load (check network/DB), Done doesn’t open quote or merge, no Metres? rows, or scaling is wrong (e.g. qty ignores resolver quantity).

---

**Reference:** `docs/QUICK_QUOTER_BACKEND_DATABASE_INTEGRATION.md` (§5.2 response shape, “How missing_measurements[].quantity affects the quote (scale entered metres)”).
