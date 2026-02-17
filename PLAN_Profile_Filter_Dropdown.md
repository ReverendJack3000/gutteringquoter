# Plan: Profile Drop-Down Filter for Marley Parts Panel

## Context

**Task:** Task 24.5 in TASK_LIST.md – Add frontend profile selector (Storm Cloud | Classic | Other | All) to filter the Marley products panel by profile.

**Backend status:** 24.1–24.3 complete. GET `/api/products` already supports optional `?profile=storm_cloud|classic|other`. Products table has `profile` column; CSV import sets it.

**Requirement:** Implement the drop-down filter **without affecting existing functionality**.

---

## Existing Behaviour (Must Preserve)

| Feature | Current Behaviour | Must Not Break |
|--------|--------------------|----------------|
| **Products fetch** | `initProducts()` fetches `/api/products` (no params) → full list | ✓ |
| **state.products** | Stores all non-consumable products; used by quote modal, name lookups, Add item dropdown | Must remain full list |
| **Panel display** | `renderProducts(panelProducts)` where panelProducts = state.products minus consumables | Only this is filtered |
| **Search bar** | Filters panel products client-side by name/id | Search applies on top of profile filter |
| **Quote modal** | Uses `state.products.find(p => p.id === assetId)` for names; Add item dropdown from `state.products` | Needs full product list |
| **Drag/drop & center-click** | Product thumbnails use `p.id`, `p.diagramUrl`, etc. | Same data shape |
| **E2E tests** | Assert on `#productGrid`, product count, drag-drop | Grid must still render; tests may need minor updates |

---

## Strategy: Client-Side Filtering

Use **client-side filtering** so `state.products` stays complete and quote/name lookups never break:

1. **Backend:** Add `profile` to the products API response (DB has it; it is not currently returned).
2. **Frontend:** Add a profile dropdown. Filter the *panel display* from `state.products` by profile before excluding consumables and applying search.
3. **state.products:** Always contains the full product list (no profile param on fetch).

This avoids:
- Replacing `state.products` with filtered data (would break quote modal).
- Extra API calls on every profile change (one fetch at init is enough).

---

## Implementation Plan

### Phase 1: Backend – Expose `profile` in API Response

**File:** `backend/app/products.py`

1. Extend `Product` TypedDict with optional `profile: Optional[str]`.
2. Add `profile` to the Supabase select:  
   `select("id, name, category, thumbnail_url, diagram_url, profile")`
3. Add `profile` to `_row_to_product`:  
   `"profile": row.get("profile") or "other"`
4. Keep `get_products()` unchanged – profile param remains for future use; we will filter client-side.

**Optional:** If products without `profile` (NULL) exist, treat them as `"other"` for display.

---

### Phase 2: Frontend – Profile Dropdown UI

**File:** `frontend/index.html`

Add the dropdown in the Marley panel, between the header/tip and the search bar (or beside the search bar):

```html
<div class="panel-search">
  <label for="profileFilter" class="visually-hidden">Filter by profile</label>
  <select id="profileFilter" aria-label="Filter products by profile">
    <option value="">All</option>
    <option value="storm_cloud">Storm Cloud</option>
    <option value="classic">Classic</option>
    <option value="other">Other</option>
  </select>
  <input type="search" id="productSearch" placeholder="Search products…" />
</div>
```

Layout options:
- **A:** Dropdown above search bar (stacked).
- **B:** Dropdown and search bar on same row (flex, wrap on narrow).
- **C:** Dropdown to the left of search bar in a row.

**Recommendation:** Option A – dropdown above search, minimal layout change.

---

### Phase 3: Frontend – Filter Logic in `initProducts()`

**File:** `frontend/app.js`

1. **Add state (optional):**  
   `state.profileFilter = ''` – current profile filter; default `''` = All.

2. **Introduce `getPanelProducts()` helper** that:
   - Starts from `state.products`
   - Excludes consumables (`CONSUMABLE_PRODUCT_IDS`)
   - Filters by `state.profileFilter` when set:
     - `storm_cloud` → `p.profile === 'storm_cloud'`
     - `classic` → `p.profile === 'classic'`
     - `other` → `p.profile === 'other' || !p.profile`
     - `''` (All) → no profile filter
   - Returns the filtered list for panel display

3. **Refactor `initProducts()`:**
   - Keep existing fetch: `fetch('/api/products')` (no profile param)
   - Store full list: `state.products = data.products || []`
   - Use `getPanelProducts()` for `panelProducts` instead of filtering only consumables
   - On initial render: `renderProducts(getPanelProducts())`

4. **Profile dropdown handler:**
   - `getElementById('profileFilter').addEventListener('change', (e) => { ... })`
   - Set `state.profileFilter = e.target.value || ''`
   - Re-apply search + profile:  
     `panelProducts = getPanelProducts()`  
     then filter by search query  
     `filtered = search ? panelProducts.filter(...) : panelProducts`
   - `renderProducts(filtered)`

5. **Search handler update:**
   - Search should run on `getPanelProducts()` (profile-filtered), not on `state.products.filter(consumables)`.
   - Change from:  
     `panelProducts = state.products.filter(p => !CONSUMABLE_PRODUCT_IDS.includes(p.id))`  
     to:  
     `panelProducts = getPanelProducts()`
   - Apply search on top:  
     `filtered = search ? panelProducts.filter(...) : panelProducts`  
     then `renderProducts(filtered)`.

**Effect:** Profile and search work together; `state.products` is never altered; quote modal and other consumers keep full list.

---

### Phase 4: CSS Styling

**File:** `frontend/styles.css`

Add styles for the profile dropdown:

- Match panel/search area style (padding, border, font).
- Ensure it is visible when panel is expanded.
- If stacked above search: consistent spacing.
- If inline: flex layout so dropdown + search fit on one line where possible.

---

### Phase 5: E2E Tests and Regression

**Files:** `e2e/run.js`, any product-related specs.

1. **Existing tests:**
   - Product grid renders – still true; grid is filtered but rendered.
   - Drag-drop – unchanged; products are still in grid when profile matches.
   - Center-click – same.

2. **Profile filter tests (add if desired):**
   - Profile dropdown exists and has options All, Storm Cloud, Classic, Other.
   - Changing profile updates the product grid.
   - With "All", grid shows products from all profiles (or same count as before filter feature).
   - With "Storm Cloud", grid shows only Storm Cloud products (or subset).

3. **Regression checks:**
   - Quote modal: place products, open quote, verify names and Add item dropdown.
   - Search: type in search bar, verify products filter (and profile filter still applies).
   - Panel collapse/expand: dropdown visible when expanded, hidden when collapsed.

---

## Data Flow Summary

```
initProducts()
    │
    ├─► fetch('/api/products')  [no profile param]
    │
    ├─► state.products = full list
    │
    └─► getPanelProducts()
            │
            ├─► Exclude CONSUMABLE_PRODUCT_IDS
            ├─► Filter by state.profileFilter (if set)
            └─► return panelProducts
                    │
                    └─► search handler filters by query
                            │
                            └─► renderProducts(filtered)
```

**Quote modal / name lookups:** Use `state.products` directly – unchanged.

---

## Edge Cases and Safeguards

| Case | Handling |
|------|----------|
| Product has `profile: null` or missing | Treat as "other" in filter (`p.profile === 'other' || !p.profile`) |
| Backend doesn’t return profile yet | `getPanelProducts()` treats missing profile as "other"; "All" still shows all |
| No products for selected profile | Show empty grid; no errors |
| Search + profile both active | Apply profile filter first, then search on that subset |
| E2E runs before backend returns profile | Fallback to showing all products if profile undefined |

---

## Files to Modify

| File | Changes |
|------|---------|
| `backend/app/products.py` | Add profile to select, TypedDict, and `_row_to_product` |
| `frontend/index.html` | Add `#profileFilter` dropdown |
| `frontend/app.js` | Add `getPanelProducts()`, wire profile dropdown, update search to use it |
| `frontend/styles.css` | Style profile dropdown |
| `e2e/run.js` | Optional: add profile filter assertions; verify no regressions |
| `TASK_LIST.md` | Mark 24.5 complete when done |

---

## Verification Checklist

- [ ] Profile dropdown appears in Marley panel when expanded
- [ ] "All" shows all non-consumable products
- [ ] "Storm Cloud" / "Classic" / "Other" filter the grid correctly
- [ ] Search bar still filters products (on top of profile filter)
- [ ] Quote modal: product names resolve for all placed elements
- [ ] Quote modal: Add item dropdown lists all products
- [ ] Drag and drop still works
- [ ] Center-click still works
- [ ] Panel collapse/expand works
- [ ] Existing E2E tests pass
- [ ] No console errors

---

## Estimated Effort

- Backend (profile in response): ~15 min  
- Frontend (dropdown + logic): ~45 min  
- CSS: ~15 min  
- E2E updates/checks: ~20 min  

**Total:** ~1.5–2 hours
