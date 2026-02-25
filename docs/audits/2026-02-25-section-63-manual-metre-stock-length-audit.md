# QA Audit Report: Section 63 Manual-Metre Stock-Length + Accessory Baseline

**Date:** 2026-02-25  
**Scope:** Manual metre entry bin-pack selection (gutter/downpipe), Quick Quoter missing-measurement multiplier scaling, and `/api/calculate-quote` accessory inference regression lock.

---

## 1) Test matrix: manual metres (minimum waste, then minimum pieces)

| Required metres | Required mm | Expected gutter stock | Observed gutter stock | Expected downpipe stock | Observed downpipe stock | Result |
|---|---:|---|---|---|---|---|
| 1.49 | 1490 | 1500 x1 | 1500 x1 | 1500 x1 | 1500 x1 | Pass |
| 1.5 | 1500 | 1500 x1 | 1500 x1 | 1500 x1 | 1500 x1 | Pass |
| 1.51 | 1510 | 3000 x1 | 3000 x1 | 3000 x1 | 3000 x1 | Pass |
| 2.99 | 2990 | 3000 x1 | 3000 x1 | 3000 x1 | 3000 x1 | Pass |
| 3.01 | 3010 | 3000 x1 + 1500 x1 | 3000 x1 + 1500 x1 | 3000 x1 + 1500 x1 | 3000 x1 + 1500 x1 | Pass |
| 4.99 | 4990 | 5000 x1 | 5000 x1 | 3000 x2 | 3000 x2 | Pass |
| 5.01 | 5010 | 3000 x2 | 3000 x2 | 3000 x2 | 3000 x2 | Pass |

---

## 2) Missing-measurement multiplier scaling (before bin-pack)

| Entered metres | Multiplier | Effective metres | Effective mm | Expected packed stock | Observed packed stock | Result |
|---:|---:|---:|---:|---|---|---|
| 6 | 0.33 | 1.98 | 1980 | 3000 x1 | 3000 x1 | Pass |
| 6 | 2 | 12 | 12000 | 3000 x4 | 3000 x4 | Pass |

Notes:
- Verified through `getElementsFromQuoteTable()` on synthetic quote rows with `data-missing-measurement-multiplier`.
- Verified `commitMetresInput()` path separately: row `data-length-mm` updated to scaled mm and subsequent `getElementsFromQuoteTable()` bin-pack output matched expected stock IDs/quantities.

---

## 3) `/api/calculate-quote` accessory inference baseline lock

### 3.1 Downpipe clip/screw outputs (baseline preserved)

| Metres | Input packed stock payload | Expected inferred | Observed inferred | Result |
|---:|---|---|---|---|
| 1.49 / 1.5 / 1.51 | first packed element carries `length_mm` | `SCL-65=2`, `SCR-SS=4` | `SCL-65=2`, `SCR-SS=4` | Pass |
| 2.99 / 3.01 | first packed element carries `length_mm` | `SCL-65=3`, `SCR-SS=6` | `SCL-65=3`, `SCR-SS=6` | Pass |
| 4.99 / 5.01 | first packed element carries `length_mm` | `SCL-65=5`, `SCR-SS=10` | `SCL-65=5`, `SCR-SS=10` | Pass |

### 3.2 Gutter accessory outputs (baseline preserved)

- For `3.01m` packed as `3m + 1.5m`, observed baseline remains:
  - `BRK-SC-MAR=12`
  - `SCR-SS=36`
- This is intentionally locked for this task (no behavioral change).

---

## 4) Commands run

1. `./scripts/run-backend-tests.sh`
2. `npm run test:manual-metre`

---

## 5) Pass/fail summary

- **Pass:** Stock-length selection across required manual metre edge cases.
- **Pass:** Missing-measurement multiplier scaling before bin-pack.
- **Pass:** `/api/calculate-quote` accessory inference baseline unchanged.
- **Intentional baseline lock:** mixed-length gutter accessory quirk is **not fixed** in this task.

---

## 6) Follow-up (tracked)

- Add follow-up task in Section 63:
  - For mixed-length gutter runs, accessory inference should use consistently aggregated measured length across packed pieces (instead of first-piece-only `length_mm` influence).
