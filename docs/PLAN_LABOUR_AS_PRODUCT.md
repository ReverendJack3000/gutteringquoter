# Plan: Treat Labour as a Product (remove labour rate dropdown)

**Goal:** Use `public.products` for labour pricing instead of `public.labour_rates`, so labour rows in the quote table need no rate dropdown—they use a single labour product’s price (e.g. cost_price = hourly rate, unit = hour).

---

## Current state (Supabase)

| Table | Purpose |
|-------|--------|
| **`public.labour_rates`** | id (UUID), rate_name, hourly_rate, active. One row (e.g. "Standard Labour" @ $100/hr). Used by GET `/api/labour-rates` and POST `/api/calculate-quote` (labour_rate_id + labour_hours). |
| **`public.products`** | id (text), name, cost_price, markup_percentage, unit, category, profile, … Used for materials; `get_product_pricing(product_ids)` returns pricing. |
| **`public.quotes`** | Has `labour_rate_id` FK → `labour_rates(id)`. Optional for quote history. |

---

## Target state

- **Labour = one (or more) product(s)** in `public.products`, e.g.:
  - `id`: `LABOUR` or `LABOUR-STANDARD`
  - `name`: `Labour`
  - `unit`: `hour`
  - `cost_price`: current effective rate (e.g. 100.00)
  - `markup_percentage`: 0 or as desired
  - `category`: `labour` (or `service`) so we can exclude from Marley panel and quote “Add item” search
- **No dropdown in the UI:** Labour row(s) always use this product’s price; no need to select a rate.
- **Optional later:** Deprecate `labour_rates` and `GET /api/labour-rates` once everything uses the labour product.

---

## What we will need to do

### 1. Supabase

- **Add labour product row(s)** to `public.products`:
  - At least one row, e.g. `id = 'LABOUR'`, `name = 'Labour'`, `unit = 'hour'`, `cost_price = <current rate>`, `markup_percentage = 0`, `category = 'labour'`, `profile = 'other'` (or NULL). Set `thumbnail_url` / `diagram_url` to a placeholder or same as another product if required by schema/UI.
  - Use a migration (e.g. `add_labour_product`) so the change is tracked.
- **`public.quotes`:** Keep `labour_rate_id` nullable for now (existing quote history). No need to drop the column immediately; we can stop writing it when we stop using labour_rates.
- **`public.labour_rates`:** Leave table in place for now; we can deprecate/remove in a later migration once the app no longer reads from it.

### 2. Backend

- **POST `/api/calculate-quote`:**
  - **Option A (recommended):** Treat labour as part of the request payload:
    - Accept **labour lines** in the same shape as materials: e.g. `labour_elements: [{ assetId: 'LABOUR', quantity: 2.5 }]` (quantity = hours), OR include labour in a single `elements` array and have the backend split “materials” vs “labour” by product id (e.g. id starts with `LABOUR` or category labour).
    - For those elements, call `get_product_pricing(['LABOUR', ...])` so labour is priced like any other product (cost × (1 + markup) × qty). No call to `labour_rates`.
    - Response: either include labour lines in `materials` (with a flag/label) or keep a separate `labour_subtotal` / `labour_hours` in the response for backward compatibility with the frontend.
  - **Option B:** Keep request shape with `labour_hours` (and optionally drop `labour_rate_id`). Backend looks up the labour product (e.g. single product with `category = 'labour'` or id `LABOUR`), uses its `cost_price` as the hourly rate, and computes labour subtotal. No `labour_rates` table read.
- **GET `/api/labour-rates`:** Can be removed or kept returning a single “rate” derived from the labour product for any legacy callers; prefer removing once frontend no longer calls it.

### 3. Frontend

- **Labour row(s) in quote table:**
  - **Remove the labour rate dropdown.** Each labour row has: product label “Labour”, qty = hours, unit price = labour product’s sell price (cost × (1 + markup)), total = qty × unit price.
  - **Source of price:** Either (a) fetch the labour product once when opening the quote modal (e.g. from `state.products` if labour is loaded there, or a small API like GET `/api/products?category=labour` or by id `LABOUR`), or (b) include labour in the response of `calculate-quote` so the labour row’s unit price and total come from the API (same as materials).
- **Exclude labour from UI where it must not appear:**
  - **Marley panel:** Exclude products with `id === 'LABOUR'` (or `category === 'labour'`) from `getPanelProducts()` so labour is not draggable onto the blueprint. Add to an exclusion list (e.g. `LABOUR_PRODUCT_IDS = ['LABOUR']` and filter in `getPanelProducts()`).
  - **Quote “Add item” (type or select product):** Exclude labour from `filterProductsForQuoteSearch` so users cannot add “Labour” as a material line; labour only appears as the dedicated labour row(s).

### 4. Data flow summary

- **Quote modal open:** Load products (including LABOUR) or fetch labour product; ensure labour row(s) use LABOUR’s pricing.
- **Calculate quote:** Send materials elements (from table) + labour elements (e.g. `[{ assetId: 'LABOUR', quantity: hours }]` per labour row). Backend returns materials + labour line(s) and subtotals; labour is computed via `get_product_pricing(['LABOUR'])`, no `labour_rates`.
- **Add to Job / job note:** Unchanged; still use summed labour hours and people count from labour rows.

### 5. Migration checklist (concise)

| Step | Action |
|------|--------|
| 1 | Migration: insert into `public.products` one row for labour (id, name, unit, cost_price, category, etc.). |
| 2 | Backend: change `calculate-quote` to price labour from `products` (by id or category) and stop using `labour_rates`; optionally remove `labour_rate_id` from request. |
| 3 | Backend: remove or repurpose GET `labour-rates` once frontend no longer uses it. |
| 4 | Frontend: labour row UI—remove rate dropdown; use single labour product for unit price and total. |
| 5 | Frontend: exclude labour product from Marley panel and from quote “Add item” search. |
| 6 | (Later) Migration: drop `quotes.labour_rate_id` if no longer needed; optionally drop `labour_rates` table. |

---

## Product row example (Supabase)

```sql
INSERT INTO public.products (
  id, name, category, unit, cost_price, markup_percentage,
  thumbnail_url, diagram_url, active, profile
) VALUES (
  'LABOUR',
  'Labour',
  'labour',
  'hour',
  100.00,
  0.00,
  '/assets/marley/placeholder.svg',  -- or existing asset if required
  '/assets/marley/placeholder.svg',
  true,
  'other'
);
```

Adjust `cost_price` to match your current labour rate (e.g. from existing `labour_rates.hourly_rate`). After this, labour is editable via the same product/cost flows as other products (e.g. Edit Pricing in quote modal or product management).

---

## Plan verification and corrections (Feb 2026)

Verified against codebase and deployment constraints. Use these values and additions so the plan is complete before implementation.

### Canonical labour product (use these, not LABOUR / “Labour”)

| Field | Value | Notes |
|-------|--------|------|
| **id** | `REP-LAB` | Item number; use as product id for exclusion lists and API. |
| **item_number** | `REP-LAB` | Matches external catalog. |
| **servicem8_material_uuid** | `6129948b-4f79-4fc1-b611-23bbc4f9726b` | Required for ServiceM8 integration; `public.products` has this column. |
| **name** | `Technician Repair Labour` | Display name. |
| **cost_price** | `35.00` | Cost exc GST. |
| **Price (sell) exc GST** | `100.00` | Backend currently uses `sell_price = cost_price * (1 + markup_percentage/100)`. So set `markup_percentage` so that 35 × (1 + m/100) = 100 (e.g. ≈ 185.71), or set `price_exc_gst = 100` and extend `get_product_pricing` to use `price_exc_gst` when present (products table already has the column). |
| **unit** | `hour` | |
| **category** | `labour` | For exclusion from Marley panel and “Add item” search. |
| **profile** | `other` | |

All exclusion logic (Marley panel, quote Add item) must use `REP-LAB` or `category === 'labour'`, not `LABOUR`.

### Labour row UI (additions)

- **Delete X:** Labour rows currently do not have the remove “×” control. Add the same `quote-row-remove-x` control to the labour row’s total cell (as in material rows). The existing table-body click/keydown handler already calls `ensureLabourRowsExist()` after remove, so at least one labour row will remain. No change to existing labour row CSS beyond making room for the X.
- **Unit price:** Replace the labour **rate dropdown** with an **inline editable unit price** (e.g. input or contenteditable) with a **default value** from the labour product’s sell price (from API or `state.products`). Default = labour product sell price; user can override per row if desired.

### Backend pricing note

- `app/pricing.py` and `main.py` use only `cost_price` and `markup_percentage`; they do not read `price_exc_gst`. To support cost 35 / price 100 without a large markup, either set `markup_percentage` to achieve 100, or add logic in `get_product_pricing` (and any callers) to use `price_exc_gst` as sell price when it is set.

### Railway

- No new environment variables or build steps required. Backend and frontend structure unchanged; deploy as today (Procfile / nixpacks.toml).
