# Storm Cloud 4m + 1m -> 9.5m Investigation (No Code Changes)

## Scenario
- Input on canvas: two measured Storm Cloud gutter runs
  - Run 1: `4.0m`
  - Run 2: `1.0m`
- Expected by user: `1 x 5m` gutter.
- Observed in quote flow: `9.5m` total stock equivalent.

## What Actually Happens Today

### 1) First pass (canvas -> quote elements) does **not** choose `1 x 5m`
Current policy in `getElementsForQuote()` is **per-run optimization**, not profile-total optimization:
- Code reference: `frontend/app.js` `getElementsForQuote` and comment at lines `7368-7370`.
- For `4m`, waste-first packing picks `3m + 1.5m` (4.5m total, 0.5m waste) instead of `5m` (1.0m waste).
- For `1m`, packing picks `1.5m`.
- So first-pass packed stock becomes `3m + 1.5m + 1.5m = 6m`.

This already explains why it is not `1 x 5m` with current policy.

### 2) Second pass inflates from `6m` to `9.5m`
The same rows are later treated as manual-length rows and bin-packed again:
- Rows get `data-length-mm` and `data-manual-length=true` when quote modal opens.
  - Code reference: `frontend/app.js` lines `3299-3302`.
- `getElementsFromQuoteTable()` sees manual-length gutter rows and re-runs bin-packing per row.
  - Code reference: `frontend/app.js` lines `4373-4387`.

Because each already-packed row carries a `length_mm` that no longer matches row quantity semantics, second-pass packing over-expands:
- Example repro output:
  - First pass: `3m x1 + 1.5m x2` (6m)
  - Second pass: `5m x1 + 3m x1 + 1.5m x1` (9.5m)

## Root Causes
1. **Policy mismatch**: per-run optimization (designed behavior) vs expected combined-profile optimization (`4m + 1m -> 5m`).
2. **Structural bug**: double bin-pack across two stages with incompatible `length_mm` meaning.

## How To Fix (High Level, No Implementation Yet)

### A) Fix the inflation bug (required regardless)
Prevent second-pass re-bin-packing of rows that are already packed from canvas output.

High-level requirement:
- Preserve provenance/semantics on packed rows (e.g., a flag such as "already packed" or run payload model), and in `getElementsFromQuoteTable()` skip manual-length repacking for those rows.

Expected result:
- Stops `6m -> 9.5m` inflation.
- With existing policy, result becomes stable at `6m`.

### B) Decide policy for `4m + 1m`
If business expectation is strictly `1 x 5m`, policy must change from per-run to combined-profile optimization.

High-level requirement:
- Aggregate required length by profile first, then pack once for that total.
- For this case: `5000mm -> 1 x 5m`.

Tradeoff:
- Can imply cross-run cutting assumptions (may or may not be desired operationally).

### C) Recommended practical path
1. Ship A first (remove inflation/instability).
2. Make explicit product decision for B:
   - `Per-run cut-safe` policy (current concept): will not guarantee `1 x 5m` for `4m + 1m`.
   - `Combined profile` policy: will produce `1 x 5m` here.

## Validation Needed After Fix
- `4m + 1m` Storm Cloud should match chosen policy deterministically.
- No second-pass growth (e.g., no `6m -> 9.5m`).
- Regression checks for mixed measured/unmeasured rows and header edits.
- Accessory inference remains consistent with final `length_mm` semantics.

---
Status: investigation only, no code changes in this document.
