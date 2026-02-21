# Quote Form Product Selection Inconsistencies Investigation

Date: 2026-02-21

## Context
User report:
- In quote form Add item flow, selecting **5m Stormcloud gutter** resulted in **1.5m Stormcloud gutter** being added.
- Issue appears mainly on parts that have conditional additional materials (gutter/downpipe systems with inferred brackets/screws/clips).

This note documents inconsistencies found from code-path investigation in `frontend/app.js`.

## Key Findings

### 1. Critical: Add-item quantity is treated as metres for conditional products
- Code path: `commitEmptyRow(...)`.
- Reference: `frontend/app.js:1819-1821`, `frontend/app.js:1857-1861`.
- Behavior:
  - For gutter/downpipe SKUs, `isManualLengthProduct` is true.
  - The empty-row qty input (default `1`) is interpreted as **metres**, not **piece count**.
  - Result: selecting a stock SKU with default qty `1` creates `lengthMm = 1000`.

Why this produces 1.5m:
- Later logic bin-packs by length and rounds up to available stock lengths.
- 1000mm rounds to one 1500mm piece.

### 2. Critical: Selected stock SKU is not preserved for conditional products
- Code path: `getElementsFromQuoteTable()`.
- Reference: `frontend/app.js:2840-2856` (gutters), `frontend/app.js:2860-2877` (downpipes).
- Behavior:
  - If a gutter/downpipe row has `lengthMm`, it is converted through bin-packing.
  - Output `assetId` is rebuilt via `gutterProductIdForLength(...)` / `downpipeProductIdForLength(...)`, not preserved from the selected row SKU.

Impact:
- Even if user selected a specific stock product (e.g., 5m), the final emitted items can change to other stock lengths.
- This directly affects products with inferred accessories (the exact scope user reported).

### 3. Medium: Pressing Enter chooses first filtered option, not exact match
- Code path: `initEmptyQuoteRow(...)` keydown handler.
- Reference: `frontend/app.js:1909-1914`.
- Behavior:
  - Enter commits `first` option from current filtered list.
  - No exact-match selection logic.

Impact:
- If filtered ordering has 1.5m before 5m, Enter can commit 1.5m even when user typed for 5m.

### 4. Newly introduced in current iOS-style pass: labour editor GST toggle is display-only
- Code path: `renderLabourEditorRows()`.
- Reference: `frontend/app.js:1526-1533`, `frontend/app.js:1578-1584`.
- Behavior:
  - Toggle changes only modal line total display.
  - Underlying row totals / quote totals remain existing ex-GST calculation path.

Impact:
- UI inconsistency risk: editor total may not match persisted quote totals when GST toggle is ON.
- This is separate from the product selection bug but is an inconsistency introduced in the latest UI pass.

## Why the reported 5m -> 1.5m case happens
Deterministic chain:
1. User selects gutter SKU in Add item row.
2. Empty-row qty default `1` is interpreted as `1m` for gutter/downpipe (`commitEmptyRow`).
3. Row stores `lengthMm = 1000`.
4. `getElementsFromQuoteTable()` bin-packs 1000mm with stock lengths `[5000, 3000, 1500]`.
5. Best fit is one 1500mm gutter piece.
6. Emitted `assetId` becomes `GUT-SC-MAR-1.5M`.

## Scope of affected products
- Gutters matching `GUT-(SC|CL)-MAR-*M`.
- Downpipes matching `DP-(65|80)-*M`.
- Any quote row path that triggers inferred accessories and bin-packing.

## Recommended fix sequence (not implemented in this investigation)
1. Decide Add-item semantics for conditional products:
   - Option A: Add-item qty for these SKUs means **pieces** (preserve selected SKU).
   - Option B: Add-item qty means **metres** (current behavior), but UI must stop presenting stock SKU selection as if fixed-length products are being added.
2. If preserving selected SKU:
   - In `commitEmptyRow`, store piece qty for selected stock SKU instead of converting to `lengthMm`.
   - In `getElementsFromQuoteTable`, skip bin-packing for rows explicitly added as stock SKUs.
3. Improve Enter behavior:
   - Prefer exact match (item number/name) before defaulting to first option.
4. Align GST toggle behavior with quote total model (either fully functional or explicitly display-only with label).

## Confidence
High (code-path level). The 5m -> 1.5m conversion is directly explained by current deterministic logic in referenced lines.
