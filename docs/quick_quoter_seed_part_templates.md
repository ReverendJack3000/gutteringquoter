# Quick Quoter part_templates seed mapping

This document defines the exact seed mapping for `public.quick_quoter_part_templates` used in Migration C. It maps your task/consumable list to repair_type_ids (Section 62 frontend) and `public.products.id` (Supabase).

**Metre measurements:** Ignored as requested; items that would require length (e.g. downpipe 3m, gutter 3m as measured length) use `length_mode = 'missing_measurement'` so they appear in the quote modal "Metres?" flow. Fixed-qty consumables use `length_mode = 'none'`.

**Missing product:** "Rivets" (4 per Metal Join & Rivet) is not in `public.products`. Add a Rivets product and one template row for `sealing_and_riveting_a_metal_gutter` when ready.

---

## Task → repair_type_id

| Your task name | repair_type_id |
|----------------|----------------|
| CUTTING DOWN PIPES | `cutting_a_down_pipe` |
| PLASTIC JOINER RE-SEALS | `sealing_a_plastic_gutter` |
| DOWNPIPE CLIP REPLACEMENTS | `replacing_pipe_clips_with_new_parts` |
| REATTACHING DOWNPIPES | `screwing_top_of_a_downpipe_back_into_place` |
| EXPANSION JOINER REPLACEMENT | `expansion_joiner_replacement` |
| STOPEND REPLACEMENTS | `stop_end_replacement` |
| METAL JOIN & RIVET | `sealing_and_riveting_a_metal_gutter` |
| BRACKET REPLACEMENT | `bracket_replacement` |
| ELBOW BEND INSTALLATION | `replacing_pipe_elbow_bends_with_new_parts` |
| OUTLET REPLACEMENT | `outlet_replacement` |
| MARLEY SECTION REPLACEMENT | `straight_section_replacement` |
| EXTERNAL CORNER REPLACEMENT | `external_corner_replacement` |
| INTERNAL CORNER REPLACEMENT | `internal_corner_replacement` |

---

## Consumable name → product_id (Supabase)

| Your name | product_id | Notes |
|-----------|------------|--------|
| Marley Glue | `GL-MAR` | profile-agnostic |
| Stainless Steel Screws | `SCR-SS` | |
| Adjustable Saddle Clips | `ACL-65`, `ACL-80` | 65mm / 80mm variants; use condition_size_mm |
| MS Sika | `MS-GRY` | |
| Rivets | *(not in products)* | Add product + template later |
| Bracket(s) / Bracket / Marley Bracket | `BRK-SC-MAR`, `BRK-CL-MAR` | Storm Cloud / Classic |
| Downpipe Elbows | `EL95-65`, `EL95-80` | 95° elbow; condition_size_mm |
| Downpipe Length (3m) | `DP-65-3M`, `DP-80-3M` | length_mode = missing_measurement |
| Downpipe Joiner (spare) | `DPJ-65`, `DPJ-80` | condition_size_mm |
| Marley Joiner | `J-SC-MAR`, `J-CL-MAR` | condition_profile SC / CL |
| 3m Marley Gutter | `GUT-SC-MAR-3M`, `GUT-CL-MAR-3M` | condition_profile |
| Stopend | `LSE-SC-MAR`, `LSE-CL-MAR` | Left-hand stopend |
| Marley Expansion Outlet | `EO-SC-MAR-65`, `EO-SC-MAR-80`, `EO-CL-MAR-65`, `EO-CL-MAR-80` | profile + size |
| Marley Expansion Joiner | `EJ-SC-MAR`, `EJ-CL-MAR` | condition_profile |
| Marley External Corner | `EC-SC-MAR`, `EC-CL-MAR` | |
| Marley Internal Corner | `IC-SC-MAR`, `IC-CL-MAR` | |
| Cutting down pipes (length) | `DP-65-3M`, `DP-80-3M` | 1 per unit, missing_measurement, condition_size_mm |

---

## Template rows (summary)

- **cutting_a_down_pipe:** DP-65-3M, DP-80-3M (qty 1, missing_measurement, condition_size_mm 65/80).
- **sealing_a_plastic_gutter:** GL-MAR 0.25.
- **replacing_pipe_clips_with_new_parts:** SCR-SS 4; ACL-65 2 (size 65); ACL-80 2 (size 80).
- **screwing_top_of_a_downpipe_back_into_place:** SCR-SS 2.
- **expansion_joiner_replacement:** EJ-SC-MAR 1, EJ-CL-MAR 1; GL-MAR 0.25.
- **stop_end_replacement:** GL-MAR 0.25; J-SC/CL 1; GUT-SC/CL-3M 0.33; LSE-SC/CL 1.
- **sealing_and_riveting_a_metal_gutter:** MS-GRY 0.33. (Rivets 4 omitted until product exists.)
- **bracket_replacement:** SCR-SS 6; BRK-SC-MAR 1, BRK-CL-MAR 1.
- **replacing_pipe_elbow_bends_with_new_parts:** EL95-65 2, EL95-80 2; DP-65-3M 0.33, DP-80-3M 0.33 (missing_measurement); DPJ-65 1, DPJ-80 1; GL-MAR 0.25.
- **outlet_replacement:** J-SC/CL 2; EO-SC/CL-65/80 1 each (4 rows); SCR-SS 8; GL-MAR 0.33; GUT-SC/CL-3M 0.33; DPJ-65 1, DPJ-80 1.
- **straight_section_replacement:** GUT-SC/CL-3M 0.33; J-SC/CL 1; EJ-SC/CL 1; GL-MAR 0.33; SCR-SS 6; BRK-SC/CL 2.
- **external_corner_replacement:** EC-SC/CL 1; GUT-SC/CL-3M 0.33; J-SC/CL 1; EJ-SC/CL 1; GL-MAR 0.33 and 0.50; SCR-SS 6; BRK-SC/CL 2.
- **internal_corner_replacement:** IC-SC/CL 1; same as external for gutter, joiner, expansion joiner, glue, screws, brackets.

The executable seed SQL is in `docs/quick_quoter_seed.sql` (run as Migration C after creating the two quick_quoter tables).
