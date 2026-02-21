# Labour editor: enable markup editing in Modify Item/Service popup

**Date:** 2026-02-21  
**Scope:** Labour editor popup only (mobile-opened; desktop unchanged). No backend API or calculate-quote contract changes required. Railway-safe.  
**Related:** Section 50 (labour as product), Section 54 (mobile quote, labour editor 54.87.x); markup was hidden on mobile table (54.86.2) but the popup now allows re-adding the capability.

---

## 1. Investigation summary

### 1.1 Why the labour editor shows "Markup —"

- In **`renderLabourEditorRows`** (app.js ~1846–1856) the Markup row is built for both labour and material lines:
  - `markupValue.textContent = Number.isFinite(markup) ? \`${formatQuoteQtyDisplay(markup)}%\` : '—'`
  - `markup` comes from **`getQuoteLineMarkup(row)`**.
- **`getQuoteLineMarkup(row)`** (app.js 1371–1380) returns **`null` for labour rows**:
  - `if (!row || row.dataset.labourRow === 'true') return null;`
- Labour rows in the quote table do **not** store markup: **`createLabourRow`** (2128–2201) sets `tr.cells[2].textContent = '—'`, `tr.cells[3].textContent = '—'`, and **`tr.dataset.hourlyRate`** only. There is no `dataset.markupPct` or `dataset.costPrice` on labour rows.
- So for labour, the editor always shows **Markup —** because the model is “unit price only” and markup is not stored or derived.

### 1.2 Where markup was disabled on mobile

- **Quote table (not the popup):** In **styles.css** (5820–5830), on mobile the Cost and Markup **columns** are hidden for the whole quote table:
  - `body[data-viewport-mode="mobile"] #quoteModal .quote-parts-table .quote-col-cost, .quote-col-markup, th:nth-child(3), td:nth-child(3), th:nth-child(4), td:nth-child(4), …` → `display: none !important`.
- Task **54.86.2** (mobile quote summary-core-edit layout) hid these columns on mobile while keeping core interactions. The **labour editor popup** was not changed to add markup there; it simply reflects the labour row model (no markup).

### 1.3 Current labour pricing model

- **Backend:** `POST /api/calculate-quote` accepts **`labour_elements: [{ assetId, quantity }]`** only. It prices labour from **`public.products`** (e.g. REP-LAB): `sell_price = cost_price * (1 + markup_percentage / 100)`. No per-line markup or unit price is sent.
- **Frontend labour row:** Only **hours** and **unit price** (stored as `dataset.hourlyRate` and `.quote-labour-hours-input` / `.quote-labour-unit-price-input`). Totals are **hours × unit price**; no cost or markup on the row.
- **REP-LAB product:** Has `cost_price` (e.g. 35) and `markup_percentage` in DB; frontend gets product data via `state.products` and labour default rate via `getDefaultLabourUnitPrice()` (from cached labour rates / product sell price).

### 1.4 Conclusion

- Markup is **not** “disabled” in the labour editor; labour rows **never had** markup in the model. The popup shows "—" because `getQuoteLineMarkup(row)` is null for labour.
- To **enable markup in the labour editor** we can:
  - Treat labour like materials in the popup: **cost + markup % → unit price**.
  - Use **REP-LAB cost** (from `state.products`) as the labour “cost” and add an **editable Markup %** that drives **unit price** in the editor (unit price = cost × (1 + markup/100)).
  - Keep **unit price** as the single persisted value on the row (`dataset.hourlyRate`); markup in the editor is then a **derived/editable** that updates the draft unit price. No backend or API change required.

---

## 2. Goal

- In the **Modify Item/Service** popup, when editing a **labour** row:
  - Show an **editable Markup %** field (no longer "—").
  - Use labour **cost** from REP-LAB product (e.g. `state.products.find(p => p.id === 'REP-LAB')?.cost_price` or fallback 35).
  - **Unit price** = cost × (1 + markup/100); when the user changes markup, update the draft unit price; when they change unit price, optionally derive/update markup for consistency (or keep “unit price primary” and derive markup for display only—see options below).
- After Save/Apply, the **row** still only stores **unit price** (and hours); no need to persist markup on the row or in the API.
- **Desktop:** Labour editor is only opened on mobile; no desktop behaviour change. **Backend / Railway:** No new env, no API change.

---

## 3. Proposed implementation plan

### 3.1 Data and state

- **Labour cost:** Helper e.g. `getLabourCostPrice()` returning `state.products.find(p => p.id === 'REP-LAB')?.cost_price ?? 35` (or from `cachedLabourRates` / product if available). Use this whenever we need “cost” for labour in the editor.
- **In the labour editor (labour rows only):**
  - **Option A (markup drives unit price):** Add **draftMarkup** (and optionally **initialMarkup** for dirty). On open: `draftMarkup = (draftUnitPrice / cost - 1) * 100` (or 0 if cost 0). Markup row: **input** with value `draftMarkup`; on change, set `draftUnitPrice = cost * (1 + draftMarkup/100)` and update Purchase Cost / Unit Price displays and line total. Apply: write `draftUnitPrice` to row (as today); no need to store markup on row.
  - **Option B (unit price primary, markup display-only):** Keep unit price editable; show markup as **read-only** derived: `(draftUnitPrice/cost - 1)*100`. No draftMarkup; no behaviour change for Apply. Less powerful but trivial to add.
- **Recommendation:** **Option A** so users can adjust labour margin by markup in the popup; unit price remains the single source of truth on the row.

### 3.2 UI changes (app.js)

- **`renderLabourEditorRows`** (labour branch only):
  - **Cost for labour:** Use `getLabourCostPrice()` for the “Purchase Cost” display when GST is off (or show cost and derive display from cost + markup when GST on, consistent with current Purchase Cost behaviour).
  - **Markup row for labour:** Instead of a single `markupValue` span showing "—", add:
    - An **input** (e.g. `labour-editor-field-input`, `data-field="markup"`), min 0, max 1000, step 0.01, value = derived or stored draft markup (e.g. `(draftUnitPrice / cost - 1) * 100` on open).
    - Optional suffix " %" for clarity.
  - **Wiring:** On markup input change: parse value, clamp 0–1000, set `quoteLineEditorState.draftMarkup`, then `draftUnitPrice = cost * (1 + draftMarkup/100)`, update rate editor and Purchase Cost/Unit Price displays, `rerenderTotals()`, `updateLabourEditorAddButtonState()`. If we add `draftMarkup`/`initialMarkup`, include in dirty check and initial snapshot in `openLabourEditorModal` and Add Row handler.
- **`quoteLineEditorState`:** Add **draftMarkup** and **initialMarkup** (for labour only). Set **initialMarkup** when opening and when adding a new labour row (from current draftMarkup or derived from draftUnitPrice and cost).
- **Dirty tracking:** Include markup in **isLabourEditorDirty** (compare draftMarkup vs initialMarkup when labour). **Revert on Cancel:** Restore unit price from initial; no need to restore markup on row (row doesn’t store it); restoring unit price is enough.
- **Apply/Save:** Continue writing only **draftQty** and **draftUnitPrice** to the row; no change to backend or row schema.

### 3.3 Purchase Cost display for labour

- Currently Purchase Cost in the editor shows unit price (or inc/exc when GST toggle on). With markup enabled, **Purchase Cost** for labour can show the **cost** (from REP-LAB) so the relationship Cost → Markup → Unit Price is clear. So:
  - **Purchase Cost:** display `getLabourCostPrice()` (exc GST), with "exc GST" / "inc GST" when applicable to match current pattern.
  - **Markup:** editable %.
  - **Unit Price:** remains editable and derived from cost × (1 + markup/100), or keep unit price editable and derive markup from it—choose one source of truth (recommended: **markup drives unit price** for labour in the editor).

### 3.4 CSS

- Reuse existing **`.labour-editor-field-input`** for the markup input; ensure the Markup row layout matches other editor rows (label + input + optional " %"). No new classes required unless we want a specific `.labour-editor-markup-input` for styling.
- **styles.css:** No change to mobile quote table column visibility; only the popup content changes.

### 3.5 Edge cases

- **Cost = 0:** If labour cost is 0, avoid division; show markup 0 and unit price 0, or disable markup input.
- **Product not loaded:** If REP-LAB is missing from `state.products`, use a fallback cost (e.g. 35) so the editor still works.
- **Material rows:** No change; they already use `getQuoteLineMarkup(row)` and can keep current behaviour (read-only or existing material markup logic).
- **Add Labour Line:** New row gets default unit price from `getDefaultLabourUnitPrice()`; set **initialMarkup** from derived (defaultUnitPrice / cost - 1) * 100 so new row is not dirty.

### 3.6 Files to touch

| File | Changes |
|------|--------|
| **frontend/app.js** | Add `getLabourCostPrice()`; extend `quoteLineEditorState` with `draftMarkup`, `initialMarkup`; in `renderLabourEditorRows` (labour only) add markup input and handler; derive unit price from cost + markup on markup change; set initialMarkup in `openLabourEditorModal` and Add Row handler; include markup in dirty check and revert (revert still only restores unit price/hours). Optionally show Purchase Cost as labour cost. |
| **frontend/styles.css** | Optional: minor tweaks for markup input in labour editor (e.g. width, alignment). |
| **frontend/index.html** | No change. |
| **Backend / API** | No change. |

### 3.7 Verification

- Open labour editor on mobile: Markup shows a number (derived from current unit price and cost), editable; change markup → unit price and line total update; Save → row keeps new unit price; Cancel → row reverts to initial unit price.
- New labour row: Markup reflects default unit price; after Add Labour Line, markup matches new row’s default.
- Material rows in same popup: unchanged (markup still from `getQuoteLineMarkup(row)` or "—" as today).
- Desktop and Railway: unchanged.

---

## 4. Task list update (draft)

- Add a small section (e.g. **54.99** or under 54.97) in **section-54.md**: “Labour editor: editable Markup % (cost from REP-LAB, unit price = cost × (1+markup/100)); mobile popup only; no backend change.”
- Sub-tasks: (1) getLabourCostPrice + state.products REP-LAB; (2) draftMarkup/initialMarkup and markup input in labour editor; (3) markup change → update draftUnitPrice and displays; (4) dirty/revert and Apply unchanged; (5) QA and Railway-safe check.

---

**Summary:** The labour editor currently shows "Markup —" because labour rows have no markup in the model and `getQuoteLineMarkup` returns null for labour. Enabling markup in the popup means adding an editable Markup % for labour rows, using REP-LAB cost and deriving unit price from cost and markup in the editor only, while still persisting only unit price (and hours) on the row and sending no new fields to the API.
