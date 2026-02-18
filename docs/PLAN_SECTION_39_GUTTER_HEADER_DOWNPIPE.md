# Plan: Section 39 – Gutter System Header & Downpipe-Only / Mixed Repairs

**Date:** Feb 2026  
**Purpose:** Re-verify analysis and task list for Section 39; produce an implementation plan with no assumptions or oversights. **No implementation in this step.**

---

## 1. Verification of analysis and tasks

### 1.1 Root cause (analysis and 39.1)

**Verified correct.** Code trace:

- **`getProfileFromAssetId`** (app.js 109–117): Returns profile for GUT-*-MAR and BRK-SC-/BRK-CL-; otherwise `null`. So `getProfileFromAssetId('SCR-SS')` → `null`. ✓
- **`isGutterSystemItem`** (app.js 1648–1651): True for `GUTTER_PATTERN`, `BRK-*`, or `id === 'SCR-SS'`. So SCR-SS is treated as a gutter system item. ✓
- **Profile fallback** (app.js 1659–1666): When `!profile` and `u(line.id) === 'SCR-SS'`, `profile = Object.keys(gutterGroups)[0] || 'SC'`. When there are no gutters/brackets, `gutterGroups` is empty → `Object.keys(gutterGroups)[0]` is `undefined` → `profile = 'SC'`. Then `gutterGroups['SC']` is created and the screw line is pushed to `children`. ✓
- **Header render** (app.js 1776–1820): For each profile in `['SC','CL']`, if `group && group.children.length > 0`, a "Gutter System: [Profile]" header row is rendered. A group with only screws therefore still gets a header. ✓

**Conclusion:** The analysis and 39.1 description of the root cause are accurate. 39.1 can be phrased as **confirm** (not “investigate”) root cause, since the analysis already documents it.

### 1.2 Task 39.2 – When to show "Gutter System" header

**Verified and scoped.** Desired behaviour: only show the "Gutter System" header when there are gutter or bracket parts.

- **Implementation approach:** Do **not** add SCR-SS into `gutterGroups` when that would create a **screws-only** group. Concretely: when `!profile` and line is SCR-SS, if `Object.keys(gutterGroups).length === 0`, push the line to `ungrouped` instead of using the fallback `profile = 'SC'`. So SCR-SS only joins an existing gutter group (when there is at least one GUT-* or BRK-* already), and never creates a new group by itself.
- **Rendering safeguard (optional):** When rendering gutter groups, only output a "Gutter System" header for a profile group that has at least one child matching GUT-* or BRK-*. This guards against any other path that might create a group with only screws.

**No oversight:** 39.2 is correctly stated; the above is the minimal, non-assumption fix.

### 1.3 Task 39.3 – Downpipe-only: screws under "Downpipe" sub-header

**Verified; one clarification.**

- **Scenario detection:** Infer from `quote.materials` (we do not have the original request in the grouping loop). **Downpipe-only** = materials include DP-* and/or SCL-*/ACL-* and/or SCR-SS, and **no** GUT-* and **no** BRK-*.
- **Behaviour:** Show a "Downpipe" (or "Downpipe accessories") **sub-header** row, then render screws (and optionally clips) as rows under it. After the 39.2 change, SCR-SS in downpipe-only will already be in `ungrouped`; we need a dedicated **Downpipe section**: a header row + children (at least SCR-SS; optionally SCL/ACL in the same block for consistency).
- **Clarification:** Task says "show screws (and optionally clips)". Decide explicitly:
  - **Option A:** Downpipe section = header + SCR-SS row only; SCL/ACL stay as current ungrouped rows (no structural change for clips).
  - **Option B:** Downpipe section = header + SCR-SS + SCL/ACL rows (all downpipe accessories under one header).

Recommendation: state in the task or implementation notes which option is chosen so there is no assumption.

- **Order:** Define where the Downpipe block appears relative to other ungrouped content (e.g. before other ungrouped lines, or after gutter groups and before ungrouped). Currently ungrouped is a single flat list; introducing a Downpipe header implies either (a) splitting ungrouped into "downpipe-related" vs "other" and rendering Downpipe header + downpipe-related first, or (b) iterating ungrouped and inserting the Downpipe header when we reach the first downpipe-related line. (a) is clearer.

**Minor doc correction:** Analysis "Implementation considerations" mentions inferring "from the **request**". In `calculateAndDisplayQuote` we only have `quote.materials`. Scenario should be inferred from the **materials list** (presence/absence of GUT-*, BRK-*, DP-*, SCL-*, ACL-*, SCR-SS), not from the request payload.

### 1.4 Task 39.4 – Mixed repair: screws as standalone row with "(brackets & clips)"

**Verified.**

- **Scenario:** **Mixed** = materials include at least one of GUT-* or BRK-* **and** at least one of DP-*, SCL-*, ACL-*, or SCR-SS.
- **Behaviour:** Screws (SCR-SS) must appear as a **single standalone row**; product column label must be **(brackets & clips)** (or equivalent), not the product name. After 39.2, in mixed jobs SCR-SS will either be in an existing gutter group (when we have gutters/brackets) or in ungrouped. For 39.4 we want screws **not** nested under the gutter header but as their own row with the special label. So we need to:
  - Either: do **not** put SCR-SS into gutter groups in the mixed case either (send to ungrouped), and when rendering ungrouped in the mixed scenario, render the SCR-SS line with display label "(brackets & clips)" instead of the product name.
  - Or: keep current grouping (SCR-SS in gutter group when gutters exist) but in the **render** step, for SCR-SS rows that are children of a gutter group, render them **outside** the gutter block as a separate row with label "(brackets & clips)".

The analysis says "Screws from brackets and clips should appear as a **standalone row**" with product column "(brackets & clips)". So one row, one quantity (backend’s aggregated screw qty), display text "(brackets & clips)". The first option (SCR-SS in ungrouped when mixed, with special label) is consistent and avoids double-handling in the gutter render loop.

**Implementation implication:** For **mixed** scenario, do not add SCR-SS to `gutterGroups` at all: always push SCR-SS to a dedicated bucket (e.g. "standalone screws" or ungrouped). Then:
- **Downpipe-only:** render that bucket under the "Downpipe" sub-header (39.3).
- **Mixed:** render that bucket as a single row with product column "(brackets & clips)" (39.4).
- **Gutter-only:** if we have only GUT/BRK (no DP/SCL/ACL), we might still have SCR-SS from brackets; then either (i) keep current behaviour (SCR-SS under gutter header) or (ii) show as standalone "(brackets & clips)" for consistency. The analysis only specifies mixed as "standalone row ... (brackets & clips)". Gutter-only with brackets currently has screws under the gutter header; that can remain unless we want one global rule: "screws always as standalone (brackets & clips) when present". The plan should state the choice.

### 1.5 Backend and screw aggregation

**No change required for this section.** Backend (gutter_accessories.py 98–164) aggregates all screws into one SCR-SS quantity and does not expose source. All behaviour changes are frontend display and grouping; we do not split quantities by source.

### 1.6 Edge cases

- **Droppers / manual clips:** Backend adds screws for droppers and manually placed clips. The single SCR-SS line is the sum of all sources. We are only changing **where** that one line is shown (Downpipe section vs standalone row), not splitting the number.
- **Gutter-only (no downpipes):** After 39.2, SCR-SS would still join existing gutter group (fallback `Object.keys(gutterGroups)[0]`). So gutter-only + brackets + screws continues to show screws under the gutter header unless we explicitly decide to show screws as "(brackets & clips)" in all cases (see 1.4).
- **BRK-only (brackets, no gutters):** Materials could have BRK-SC-MAR and SCR-SS only. Then `gutterGroups['SC']` would have brackets + screws; header would show. That is correct (brackets are gutter system).

---

## 2. Suggested updates to TASK_LIST.md and analysis

### 2.1 TASK_LIST.md Section 39

- **39.1:** Change "Investigate root cause" to **"Confirm root cause"** so it matches the fact that the analysis is already done; the task is to confirm (e.g. by code trace or quick test) that the documented cause is correct.
- **39.2:** Keep as-is; it already says "Do not show 'Gutter System' header when there are no gutter or bracket parts" and "Only create/render gutter groups when the group contains at least one GUT-* or BRK-*".
- **39.3:** Add an explicit note: "Clarify whether the Downpipe sub-header includes only screws or also SCL/ACL rows (option A vs B above)."
- **39.4:** Already correct. Optionally add: "In mixed scenario, SCR-SS is not placed under the gutter header; it is rendered as a single row with product column label '(brackets & clips)'."

### 2.2 docs/ANALYSIS_GUTTER_HEADER_DOWNPIPE_ONLY.md

- **Implementation considerations:** Change "Infer from the **request**" to "Infer from the **materials list** (presence of GUT-*/BRK-* vs DP-*/SCL/ACL/SCR-SS) in the backend response", since `calculateAndDisplayQuote` only has `quote.materials`.
- **Key file references:** Line ranges are accurate (1648–1651, 1657–1666, 1653–1672, 1777–1820, 109–117, backend 98–164). No change needed.

---

## 3. Implementation plan (high level, no code yet)

1. **39.1 – Confirm root cause**  
   - Trace or run a downpipe-only quote and confirm: SCR-SS in materials → isGutterSystemItem → null profile → fallback 'SC' → gutterGroups['SC'] = { children: [SCR-SS] } → header "Gutter System: Storm Cloud" rendered. Mark 39.1 complete after confirmation.

2. **39.2 – Gutter header only when gutter/bracket parts exist**  
   - In the grouping loop (app.js ~1657–1670): when `!profile` and line is SCR-SS, if `Object.keys(gutterGroups).length === 0`, push line to `ungrouped` (or a dedicated list) instead of setting `profile = 'SC'` and adding to `gutterGroups`.  
   - Optionally: in the gutter header render loop, only render a profile header if the group has at least one child with `GUTTER_PATTERN.test(id) || id.startsWith('BRK-')`.

3. **Scenario detection**  
   - Before or inside the grouping/rendering logic, compute from `materialsToProcess`:
     - `hasGutterOrBracket` = any line with GUT-* or BRK-*
     - `hasDownpipeOrClip` = any line with DP-*, SCL-*, ACL-*
     - `hasScrews` = any line with id SCR-SS  
   - **Downpipe-only:** `hasDownpipeOrClip && !hasGutterOrBracket` (screws may or may not be present).  
   - **Mixed:** `hasGutterOrBracket && (hasDownpipeOrClip || hasScrews)`.

4. **39.3 – Downpipe-only: Downpipe sub-header**  
   - After 39.2, in downpipe-only, SCR-SS will be in ungrouped (or in a dedicated "screws" list).  
   - Before rendering ungrouped (or in a dedicated pass): if downpipe-only and we have SCR-SS (and optionally SCL/ACL), insert a "Downpipe" (or "Downpipe accessories") section header row, then render screws (and optionally SCL/ACL) as child rows.  
   - Decide and document: Downpipe section = screws only (A) or screws + clips (B).  
   - Ensure order of sections: e.g. Gutter groups (if any) → Downpipe section (if downpipe-only and has screws/clips) → remaining ungrouped.

5. **39.4 – Mixed: standalone screw row with "(brackets & clips)"**  
   - In mixed scenario, do not add SCR-SS to `gutterGroups` (same as 39.2 when gutterGroups is empty; when gutterGroups is non-empty, choose: either still send SCR-SS to ungrouped/special bucket so it always renders as standalone, or only send to ungrouped when mixed). Cleanest: **always** send SCR-SS to a dedicated bucket (not into gutterGroups); then:
     - Gutter-only: render that bucket under gutter header (current behaviour) **or** as standalone "(brackets & clips)" row (if we want one rule for all).
     - Downpipe-only: render under Downpipe sub-header (39.3).
     - Mixed: render as standalone row with label "(brackets & clips)" (39.4).  
   - So the rule can be: SCR-SS is **never** added to `gutterGroups`. It goes to a "screws" list. Then:
     - If downpipe-only → render screws under "Downpipe" sub-header.
     - If mixed → render screws as one row, product column "(brackets & clips)".
     - If gutter-only → render screws under the existing gutter header (so we need to know "which profile" for that row, or we show one standalone "(brackets & clips)" row after gutter groups).  
   - Re-reading the analysis: "Mixed" = both gutters and downpipes; screws as standalone "(brackets & clips)". It does not say gutter-only must change. So: **Only in mixed** do we show SCR-SS as standalone "(brackets & clips)". In gutter-only we keep current (screws under gutter header). So we need: (1) 39.2: don’t create a gutter group from screws alone (send SCR-SS to ungrouped when gutterGroups is empty). (2) When gutterGroups is non-empty and we have SCR-SS, we can keep adding SCR-SS to the first profile (current behaviour) for gutter-only. (3) When we have both gutterGroups non-empty **and** downpipe/clip presence (mixed), we should **not** put SCR-SS in gutter groups but show as standalone "(brackets & clips)". So the logic is: if **mixed**, SCR-SS goes to a special bucket and is rendered as standalone row with "(brackets & clips)"; if **downpipe-only**, SCR-SS goes to ungrouped (or Downpipe bucket) and is rendered under Downpipe sub-header; if **gutter-only**, SCR-SS goes to gutter group (current behaviour). So we need scenario first, then:
   - Downpipe-only: SCR-SS → ungrouped / Downpipe bucket → render under "Downpipe" header.
   - Mixed: SCR-SS → standalone bucket → render one row "(brackets & clips)".
   - Gutter-only: SCR-SS → gutter group (fallback to first profile) → render under gutter header.

   This keeps the plan consistent and avoids assumptions.

6. **Regression**  
   - Gutter-only with brackets and screws: still shows "Gutter System" header and screws under it.  
   - Downpipe-only: no gutter header; Downpipe sub-header + screws (and optionally clips).  
   - Mixed: gutter header(s) for profile(s); screws as one row "(brackets & clips)"; downpipes/clips in ungrouped as today.

---

## 4. Summary

| Item | Status | Action |
|------|--------|--------|
| Root cause (39.1) | Correct | Confirm only; optionally reword 39.1 to "Confirm root cause". |
| 39.2 (no header when no gutter/bracket) | Correct | Implement by not creating gutter group from SCR-SS when gutterGroups is empty; optional render guard. |
| 39.3 (Downpipe sub-header) | Correct | Implement Downpipe section; decide screws-only vs screws+clips; fix scenario inference from materials. |
| 39.4 (Mixed standalone row) | Correct | In mixed scenario, render SCR-SS as single row with label "(brackets & clips)". |
| Analysis line refs | Correct | No change. |
| Analysis "infer from request" | Inaccurate | Update to "infer from materials list". |
| Scenario detection | — | Use `quote.materials` only (no request); define hasGutterOrBracket, hasDownpipeOrClip, hasScrews. |
| Gutter-only behaviour | — | Leave as-is (screws under gutter header) unless product explicitly wants screws always as "(brackets & clips)". |

No implementation was done; this is a plan and verification only.
