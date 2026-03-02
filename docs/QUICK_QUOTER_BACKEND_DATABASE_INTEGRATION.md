# Quick Quoter Backend + Database Integration Spec

Status: Backend/frontend wiring is implemented in code. Supabase schema migrations (A/B/C) must still be applied in project `rlptjmkejfykisaefkeh` before runtime catalog/resolve calls will return data.

---

## 1) Objective

Enable Quick Quoter selections to resolve into quote-ready materials while preserving existing quote behavior:

- Keep measured canvas elements authoritative.
- Add Quick Quoter rows as additive inputs.
- Route gutter/downpipe items requiring measurements into existing "missing measurements" behavior in the quote modal.
- Keep existing accessory inference (`expand_elements_with_gutter_accessories`) authoritative.

---

## 2) Existing Integration Anchors (Current Code)

Backend anchors:

- `backend/main.py:799` `QuoteElement`
- `backend/main.py:805` `CalculateQuoteRequest`
- `backend/main.py:1827` `POST /api/calculate-quote`
- `backend/app/gutter_accessories.py:86` `expand_elements_with_gutter_accessories`
- `backend/main.py:2171` and `backend/main.py:2361` ServiceM8 profile label branches
- `backend/app/quotes.py:13` `QuoteMaterialLine` persistence shape

Frontend anchors for future merge:

- `frontend/app.js:6505` `getElementsForQuote()`
- `frontend/app.js:2953` Generate Quote open flow
- `frontend/app.js:3773` `getElementsFromQuoteTable()`
- `frontend/app.js:4141` `calculateAndDisplayQuote()`
- `frontend/app.js:5744`+ Quick Quoter local UI state (current UI-only implementation)

---

## 3) Database Schema (Planned)

## 3.1 `public.quick_quoter_repair_types`

Purpose: catalog of selectable repair rows shown in Quick Quoter.

Proposed columns:

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `text` | PK | stable key (`expansion_joiner_replacement`) |
| `label` | `text` | NOT NULL | UI label |
| `active` | `boolean` | NOT NULL DEFAULT `true` | soft-toggle in catalog |
| `sort_order` | `integer` | NOT NULL DEFAULT `0` | deterministic display order |
| `requires_profile` | `boolean` | NOT NULL DEFAULT `false` | local/API validation |
| `requires_size_mm` | `boolean` | NOT NULL DEFAULT `false` | local/API validation |
| `default_time_minutes` | `integer` | NULL CHECK `>= 0` | optional default labour minutes per repair; used for resolve `suggested_labour_minutes` and quote modal prefill |
| `created_at` | `timestamptz` | NOT NULL DEFAULT `now()` | audit |
| `updated_at` | `timestamptz` | NOT NULL DEFAULT `now()` | audit |

Indexes:

- `idx_quick_quoter_repair_types_active_sort` on `(active, sort_order, id)`

---

## 3.2 `public.quick_quoter_part_templates`

Purpose: template rules that map a repair type to products and conditional parts.

Proposed columns:

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK DEFAULT `gen_random_uuid()` | row id |
| `repair_type_id` | `text` | NOT NULL FK -> `quick_quoter_repair_types.id` ON DELETE CASCADE | owner repair type |
| `product_id` | `text` | NOT NULL FK -> `products.id` | product to include |
| `qty_per_unit` | `numeric(12,3)` | NOT NULL CHECK `qty_per_unit >= 0` | multiplier per selected row qty |
| `condition_profile` | `text` | NULL CHECK in (`SC`,`CL`) | optional profile filter |
| `condition_size_mm` | `integer` | NULL CHECK in (`65`,`80`) | optional size filter |
| `length_mode` | `text` | NOT NULL DEFAULT `'none'` CHECK in (`none`,`missing_measurement`,`fixed_mm`) | how to emit quantities |
| `fixed_length_mm` | `integer` | NULL CHECK `fixed_length_mm > 0` | used only when `length_mode='fixed_mm'` |
| `active` | `boolean` | NOT NULL DEFAULT `true` | soft-toggle |
| `sort_order` | `integer` | NOT NULL DEFAULT `0` | deterministic rule order |
| `created_at` | `timestamptz` | NOT NULL DEFAULT `now()` | audit |
| `updated_at` | `timestamptz` | NOT NULL DEFAULT `now()` | audit |

Constraints:

- `fixed_length_mm` must be non-null only for `length_mode='fixed_mm'`.
- Optional unique key to avoid duplicate active rules for same condition tuple:
  - `(repair_type_id, product_id, coalesce(condition_profile,''), coalesce(condition_size_mm,0), length_mode, coalesce(fixed_length_mm,0))`

Indexes:

- `idx_quick_quoter_templates_repair_type` on `(repair_type_id, active, sort_order)`
- `idx_quick_quoter_templates_product` on `(product_id)`

---

## 3.3 RLS and Access

- Keep RLS off for both tables initially (same pattern as existing server-side service-role writes).
- Backend reads with `SUPABASE_SERVICE_ROLE_KEY`.
- No frontend direct DB access required.

---

## 4) Seed Data (Planned)

Seed `quick_quoter_repair_types` with the current UI list:

1. Expansion Joiner Replacement
2. Joiner Replacement
3. Stop-End Replacement
4. Bracket Replacement
5. Outlet Replacement
6. Straight Section Replacement
7. External Corner Replacement
8. Internal Corner Replacement
9. Replacing Pipe Clips With New Parts
10. Replacing Pipe Elbow Bends With New Parts
11. Cutting a Down Pipe
12. Sealing a Plastic Gutter
13. Sealing & Riveting a Metal Gutter
14. Screwing Top of a Downpipe back into Place
15. Screwing Clips/Brackets Back into Place
16. Other

Validation flags for initial seed should match current UI rules.

---

## 5) Backend API (Planned)

## 5.1 `GET /api/quick-quoter/catalog`

Purpose: return repair types with validation flags and display order.

Response shape:

```json
{
  "repair_types": [
    {
      "id": "joiner_replacement",
      "label": "Joiner Replacement",
      "requires_profile": true,
      "requires_size_mm": false,
      "sort_order": 20,
      "active": true
    }
  ]
}
```

---

## 5.2 `POST /api/quick-quoter/resolve`

Purpose: resolve selected repair rows into quote-consumable payload.

Request shape:

```json
{
  "profile": "storm_cloud",
  "size_mm": 80,
  "selections": [
    { "repair_type_id": "joiner_replacement", "quantity": 2 }
  ]
}
```

Response shape:

```json
{
  "elements": [
    { "assetId": "JNR-SC-MAR", "quantity": 2 }
  ],
  "missing_measurements": [
    {
      "assetId": "DP-80-3M",
      "quantity": 1,
      "repair_type_id": "cutting_a_down_pipe"
    }
  ],
  "suggested_labour_minutes": 60,
  "validation_errors": []
}
```

- `suggested_labour_minutes`: sum of `(default_time_minutes × selection quantity)` for each selected repair type (null/0 on repair type counts as 0). Frontend may use this to prefill labour hours in the quote modal (minutes ÷ 60).

Rules:

- Validate `requires_profile` and `requires_size_mm` from DB flags.
- Multiply each template `qty_per_unit * selection.quantity`.
- Apply `condition_profile`/`condition_size_mm` filters.
- `length_mode` behavior:
  - `none`: emit to `elements`.
  - `missing_measurement`: emit to `missing_measurements` (for quote modal metres flow).
  - `fixed_mm`: emit to `elements` with `length_mm`.
- Do not mutate existing quote rows directly in backend.

### How `missing_measurements[].quantity` affects the quote once the user enters metres (scale entered metres)

**Chosen behaviour: scale entered metres.**

The resolver sends each `missing_measurements` item with a `quantity` (e.g. `0.33` or `2`) equal to `qty_per_unit × selection_quantity` for that template line.

- **One row per item:** Each entry in `missing_measurements` becomes **one** incomplete row in the quote table (one “Metres?” input per entry). The frontend does **not** create multiple rows based on `quantity` (e.g. `quantity: 2` does not mean two separate Metres? rows).
- **After the user enters metres:** Before converting to line quantity, **scale the user-entered metres by the resolver `quantity`**:
  - **effective_metres = entered_metres × `quantity`**
  - Then convert **effective_metres** to line quantity using existing logic (bin-pack for downpipe/gutter, or 1:1 for other measurable products). No extra scaling of the resulting quantity.
- **Examples:** User enters 6 m, `quantity` 0.33 → effective 1.98 m → bin-pack gives line qty (e.g. 1 × 1.5 m). User enters 6 m, `quantity` 2 → effective 12 m → bin-pack gives line qty (e.g. 4 × 3 m).

**Implementation note:** The frontend must store the resolver `quantity` on the row (e.g. `data-resolver-qty`) when injecting `missing_measurements` rows. In `getElementsFromQuoteTable()` (and any path that turns "Metres?" + value into elements), use **effective_metres = entered_metres × resolver_qty** before bin-pack or length→quantity conversion.


---

## 6) Resolver Service (Planned Internal Backend)

Create new module: `backend/app/quick_quoter.py`

Suggested functions:

- `get_quick_quoter_catalog(supabase) -> list[dict]`
- `resolve_quick_quoter_selection(supabase, profile, size_mm, selections) -> dict`

Resolver output must remain compatible with existing `QuoteElement` usage (`assetId`, `quantity`, optional `length_mm`).

---

## 7) Frontend Merge Strategy (Planned, Not Implemented)

1. User confirms Quick Quoter selection.
2. Frontend calls `POST /api/quick-quoter/resolve`.
3. Merge resolved output into quote open flow:
   - Combine current measured canvas elements (`getElementsForQuote`) + resolved `elements`.
   - Inject resolved `missing_measurements` so they appear as existing incomplete measurement rows in quote modal.
4. Pass merged list through existing quote calculation path unchanged.

Important:

- Keep `getElementsForQuote()` behavior intact.
- Keep `getElementsFromQuoteTable()` and `calculateAndDisplayQuote()` behavior intact.
- Continue relying on backend `expand_elements_with_gutter_accessories` for inferred accessories.

---

## 8) Migrations (Planned SQL, Not Applied)

Migration A: create catalog table

```sql
create table if not exists public.quick_quoter_repair_types (
  id text primary key,
  label text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  requires_profile boolean not null default false,
  requires_size_mm boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_quick_quoter_repair_types_active_sort
  on public.quick_quoter_repair_types(active, sort_order, id);
```

Migration B: create template table

```sql
create table if not exists public.quick_quoter_part_templates (
  id uuid primary key default gen_random_uuid(),
  repair_type_id text not null references public.quick_quoter_repair_types(id) on delete cascade,
  product_id text not null references public.products(id),
  qty_per_unit numeric(12,3) not null check (qty_per_unit >= 0),
  condition_profile text null check (condition_profile in ('SC','CL')),
  condition_size_mm integer null check (condition_size_mm in (65,80)),
  length_mode text not null default 'none' check (length_mode in ('none','missing_measurement','fixed_mm')),
  fixed_length_mm integer null check (fixed_length_mm > 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quick_quoter_fixed_length_mode_chk check (
    (length_mode = 'fixed_mm' and fixed_length_mm is not null)
    or (length_mode <> 'fixed_mm' and fixed_length_mm is null)
  )
);

create index if not exists idx_quick_quoter_templates_repair_type
  on public.quick_quoter_part_templates(repair_type_id, active, sort_order);

create index if not exists idx_quick_quoter_templates_product
  on public.quick_quoter_part_templates(product_id);
```

In-repo SQL files:

- Migration A file: `docs/quick_quoter_migration_a.sql`
- Migration B file: `docs/quick_quoter_migration_b.sql`
- Migration C seed file: `docs/quick_quoter_seed.sql`
- Task→product mapping reference: `docs/quick_quoter_seed_part_templates.md`

Migration C: seed repair type rows and initial template mappings. **In-repo:** `docs/quick_quoter_seed.sql` (run after A and B); task→product mapping in `docs/quick_quoter_seed_part_templates.md`.

---

## 9) Validation and Error Behavior (Planned)

- Backend returns `400` with structured `validation_errors` when required profile/size missing.
- Unknown `repair_type_id` values are rejected.
- Inactive catalog rows are ignored/rejected.
- Quantity must be `>= 1` for each selection.

---

## 10) Test Coverage Required When Wiring

Backend unit tests:

- Resolver condition filtering by profile/size.
- `length_mode` mapping to `elements` vs `missing_measurements`.
- Quantity multiplication and aggregation.

API tests:

- Catalog endpoint ordering and active filtering.
- Resolve endpoint validation failures and success payload.

Integration tests:

- Quick Quoter + measured elements merged without clobbering measured rows.
- Existing inferred accessory behavior unchanged.

---

## 11) Remaining Deployment Steps

- Apply DB Migration A using `docs/quick_quoter_migration_a.sql`.
- Apply DB Migration B using `docs/quick_quoter_migration_b.sql`.
- Apply DB Migration C using `docs/quick_quoter_seed.sql`.
- Verify counts and FK integrity in Supabase after migrations.
- No Railway deploy config changes are required.
