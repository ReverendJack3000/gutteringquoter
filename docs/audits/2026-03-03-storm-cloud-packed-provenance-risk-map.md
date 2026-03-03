# Storm Cloud Packed-Row Provenance: Risk Map and Guard Checks (2026-03-03)

## Context
- The 6m -> 9.5m bug came from re-bin-packing rows that were already packed from canvas.
- The fix uses a row provenance marker: `data-packed-from-canvas="true"`.
- Residual concern: some quote-table flows rebuild rows and can drop this marker.

## User actions that can drop the marker

1. Open Quote modal (initial auto-calculate)
- Practical user action: click **Generate Quote**.
- What happens: quote rows are rebuilt from backend materials in `calculateAndDisplayQuote()`, so original row dataset attributes are not preserved on rebuilt child rows.

2. Change Gutter header metres
- Practical user action: edit the SC/CL header metres input.
- What happens: triggers `calculateAndDisplayQuote()` rebuild, which re-renders child rows and does not copy prior dataset provenance attributes.

3. Edit gutter child quantity after rebuild
- Practical user action: type in a gutter child qty input (line row).
- What happens: row-level recalc path runs while table is already in rebuilt mode (header + children). Marker is absent on rebuilt child rows.

## Why this is safe in current behavior
- After rebuild, serialization is header-driven for gutters:
  - `getElementsFromQuoteTable()` emits gutter elements from section header metres first.
  - Child gutter rows are skipped when that header is present.
- So even when marker is absent on rebuilt child rows, current logic does not re-pack those child rows.

## Guard checks added
- `e2e/manual-metre-audit.js` now includes explicit checks for these post-rebuild states:
  - `storm cloud rebuilt table uses header metres (tags dropped)`
  - `storm cloud rebuilt child qty edit still header-driven`
  - `storm cloud rebuilt table cleared header emits no child gutters`

## Remaining future risk
- A future save/restore/import path that recreates manual-length gutter rows (piece-qty + `length_mm`) **without** marker and **without** header-driven section context could re-introduce second-pass growth.
- This is not happening in the current tested UI flows above, but should be considered for any new quote-row reconstruction feature.
