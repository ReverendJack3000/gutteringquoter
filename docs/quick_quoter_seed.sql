-- Quick Quoter seed: repair_types (16 rows) + part_templates.
-- Run as Migration C after migrations A and B (create quick_quoter_repair_types and quick_quoter_part_templates).
-- Product mapping: docs/quick_quoter_seed_part_templates.md
-- Note: "Rivets" is not in public.products; add product and template for sealing_and_riveting_a_metal_gutter when ready.

-- Repair types (match frontend QUICK_QUOTER_REPAIR_TYPES)
INSERT INTO public.quick_quoter_repair_types (id, label, active, sort_order, requires_profile, requires_size_mm) VALUES
  ('expansion_joiner_replacement', 'Expansion Joiner Replacement', true, 10, true, false),
  ('joiner_replacement', 'Joiner Replacement', true, 20, true, false),
  ('stop_end_replacement', 'Stop-End Replacement', true, 30, true, false),
  ('bracket_replacement', 'Bracket Replacement', true, 40, true, false),
  ('outlet_replacement', 'Outlet Replacement', true, 50, true, false),
  ('straight_section_replacement', 'Straight Section Replacement', true, 60, true, false),
  ('external_corner_replacement', 'External Corner Replacement', true, 70, true, false),
  ('internal_corner_replacement', 'Internal Corner Replacement', true, 80, true, false),
  ('replacing_pipe_clips_with_new_parts', 'Replacing Pipe Clips With New Parts', true, 90, false, true),
  ('replacing_pipe_elbow_bends_with_new_parts', 'Replacing Pipe Elbow Bends With New Parts', true, 100, false, true),
  ('cutting_a_down_pipe', 'Cutting a Down Pipe', true, 110, false, true),
  ('sealing_a_plastic_gutter', 'Sealing a Plastic Gutter', true, 120, true, false),
  ('sealing_and_riveting_a_metal_gutter', 'Sealing & Riveting a Metal Gutter', true, 130, true, false),
  ('screwing_top_of_a_downpipe_back_into_place', 'Screwing Top of a Downpipe back into Place', true, 140, false, true),
  ('screwing_clips_brackets_back_into_place', 'Screwing Clips/Brackets Back into Place', true, 150, false, false),
  ('other', 'Other', true, 160, false, false)
ON CONFLICT (id) DO NOTHING;

-- Part templates (consumables per repair type; metre measurements → missing_measurement)
-- Columns: repair_type_id, product_id, qty_per_unit, condition_profile, condition_size_mm, length_mode, sort_order
INSERT INTO public.quick_quoter_part_templates (repair_type_id, product_id, qty_per_unit, condition_profile, condition_size_mm, length_mode, sort_order) VALUES
  -- cutting_a_down_pipe: downpipe length (missing_measurement) per size
  ('cutting_a_down_pipe', 'DP-65-3M', 1, NULL, 65, 'missing_measurement', 10),
  ('cutting_a_down_pipe', 'DP-80-3M', 1, NULL, 80, 'missing_measurement', 20),
  -- sealing_a_plastic_gutter
  ('sealing_a_plastic_gutter', 'GL-MAR', 0.25, NULL, NULL, 'none', 10),
  -- replacing_pipe_clips_with_new_parts
  ('replacing_pipe_clips_with_new_parts', 'SCR-SS', 4, NULL, NULL, 'none', 10),
  ('replacing_pipe_clips_with_new_parts', 'ACL-65', 2, NULL, 65, 'none', 20),
  ('replacing_pipe_clips_with_new_parts', 'ACL-80', 2, NULL, 80, 'none', 30),
  -- screwing_top_of_a_downpipe_back_into_place
  ('screwing_top_of_a_downpipe_back_into_place', 'SCR-SS', 2, NULL, NULL, 'none', 10),
  -- expansion_joiner_replacement
  ('expansion_joiner_replacement', 'EJ-SC-MAR', 1, 'SC', NULL, 'none', 10),
  ('expansion_joiner_replacement', 'EJ-CL-MAR', 1, 'CL', NULL, 'none', 20),
  ('expansion_joiner_replacement', 'GL-MAR', 0.25, NULL, NULL, 'none', 30),
  -- stop_end_replacement
  ('stop_end_replacement', 'GL-MAR', 0.25, NULL, NULL, 'none', 10),
  ('stop_end_replacement', 'J-SC-MAR', 1, 'SC', NULL, 'none', 20),
  ('stop_end_replacement', 'J-CL-MAR', 1, 'CL', NULL, 'none', 30),
  ('stop_end_replacement', 'GUT-SC-MAR-3M', 0.33, 'SC', NULL, 'missing_measurement', 40),
  ('stop_end_replacement', 'GUT-CL-MAR-3M', 0.33, 'CL', NULL, 'missing_measurement', 50),
  ('stop_end_replacement', 'LSE-SC-MAR', 1, 'SC', NULL, 'none', 60),
  ('stop_end_replacement', 'LSE-CL-MAR', 1, 'CL', NULL, 'none', 70),
  -- sealing_and_riveting_a_metal_gutter (Rivets 4 omitted – no product yet)
  ('sealing_and_riveting_a_metal_gutter', 'MS-GRY', 0.33, NULL, NULL, 'none', 10),
  -- bracket_replacement
  ('bracket_replacement', 'SCR-SS', 6, NULL, NULL, 'none', 10),
  ('bracket_replacement', 'BRK-SC-MAR', 1, 'SC', NULL, 'none', 20),
  ('bracket_replacement', 'BRK-CL-MAR', 1, 'CL', NULL, 'none', 30),
  -- replacing_pipe_elbow_bends_with_new_parts
  ('replacing_pipe_elbow_bends_with_new_parts', 'EL95-65', 2, NULL, 65, 'none', 10),
  ('replacing_pipe_elbow_bends_with_new_parts', 'EL95-80', 2, NULL, 80, 'none', 20),
  ('replacing_pipe_elbow_bends_with_new_parts', 'DP-65-3M', 0.33, NULL, 65, 'missing_measurement', 30),
  ('replacing_pipe_elbow_bends_with_new_parts', 'DP-80-3M', 0.33, NULL, 80, 'missing_measurement', 40),
  ('replacing_pipe_elbow_bends_with_new_parts', 'DPJ-65', 1, NULL, 65, 'none', 50),
  ('replacing_pipe_elbow_bends_with_new_parts', 'DPJ-80', 1, NULL, 80, 'none', 60),
  ('replacing_pipe_elbow_bends_with_new_parts', 'GL-MAR', 0.25, NULL, NULL, 'none', 70),
  -- outlet_replacement
  ('outlet_replacement', 'J-SC-MAR', 2, 'SC', NULL, 'none', 10),
  ('outlet_replacement', 'J-CL-MAR', 2, 'CL', NULL, 'none', 20),
  ('outlet_replacement', 'EO-SC-MAR-65', 1, 'SC', 65, 'none', 30),
  ('outlet_replacement', 'EO-SC-MAR-80', 1, 'SC', 80, 'none', 40),
  ('outlet_replacement', 'EO-CL-MAR-65', 1, 'CL', 65, 'none', 50),
  ('outlet_replacement', 'EO-CL-MAR-80', 1, 'CL', 80, 'none', 60),
  ('outlet_replacement', 'SCR-SS', 8, NULL, NULL, 'none', 70),
  ('outlet_replacement', 'GL-MAR', 0.33, NULL, NULL, 'none', 80),
  ('outlet_replacement', 'GUT-SC-MAR-3M', 0.33, 'SC', NULL, 'missing_measurement', 90),
  ('outlet_replacement', 'GUT-CL-MAR-3M', 0.33, 'CL', NULL, 'missing_measurement', 100),
  ('outlet_replacement', 'DPJ-65', 1, NULL, 65, 'none', 110),
  ('outlet_replacement', 'DPJ-80', 1, NULL, 80, 'none', 120),
  -- straight_section_replacement
  ('straight_section_replacement', 'GUT-SC-MAR-3M', 0.33, 'SC', NULL, 'missing_measurement', 10),
  ('straight_section_replacement', 'GUT-CL-MAR-3M', 0.33, 'CL', NULL, 'missing_measurement', 20),
  ('straight_section_replacement', 'J-SC-MAR', 1, 'SC', NULL, 'none', 30),
  ('straight_section_replacement', 'J-CL-MAR', 1, 'CL', NULL, 'none', 40),
  ('straight_section_replacement', 'EJ-SC-MAR', 1, 'SC', NULL, 'none', 50),
  ('straight_section_replacement', 'EJ-CL-MAR', 1, 'CL', NULL, 'none', 60),
  ('straight_section_replacement', 'GL-MAR', 0.33, NULL, NULL, 'none', 70),
  ('straight_section_replacement', 'SCR-SS', 6, NULL, NULL, 'none', 80),
  ('straight_section_replacement', 'BRK-SC-MAR', 2, 'SC', NULL, 'none', 90),
  ('straight_section_replacement', 'BRK-CL-MAR', 2, 'CL', NULL, 'none', 100),
  -- external_corner_replacement
  ('external_corner_replacement', 'EC-SC-MAR', 1, 'SC', NULL, 'none', 10),
  ('external_corner_replacement', 'EC-CL-MAR', 1, 'CL', NULL, 'none', 20),
  ('external_corner_replacement', 'GUT-SC-MAR-3M', 0.33, 'SC', NULL, 'missing_measurement', 30),
  ('external_corner_replacement', 'GUT-CL-MAR-3M', 0.33, 'CL', NULL, 'missing_measurement', 40),
  ('external_corner_replacement', 'J-SC-MAR', 1, 'SC', NULL, 'none', 50),
  ('external_corner_replacement', 'J-CL-MAR', 1, 'CL', NULL, 'none', 60),
  ('external_corner_replacement', 'EJ-SC-MAR', 1, 'SC', NULL, 'none', 70),
  ('external_corner_replacement', 'EJ-CL-MAR', 1, 'CL', NULL, 'none', 80),
  ('external_corner_replacement', 'GL-MAR', 0.33, NULL, NULL, 'none', 90),
  ('external_corner_replacement', 'GL-MAR', 0.50, NULL, NULL, 'none', 100),
  ('external_corner_replacement', 'SCR-SS', 6, NULL, NULL, 'none', 110),
  ('external_corner_replacement', 'BRK-SC-MAR', 2, 'SC', NULL, 'none', 120),
  ('external_corner_replacement', 'BRK-CL-MAR', 2, 'CL', NULL, 'none', 130),
  -- internal_corner_replacement
  ('internal_corner_replacement', 'IC-SC-MAR', 1, 'SC', NULL, 'none', 10),
  ('internal_corner_replacement', 'IC-CL-MAR', 1, 'CL', NULL, 'none', 20),
  ('internal_corner_replacement', 'GUT-SC-MAR-3M', 0.33, 'SC', NULL, 'missing_measurement', 30),
  ('internal_corner_replacement', 'GUT-CL-MAR-3M', 0.33, 'CL', NULL, 'missing_measurement', 40),
  ('internal_corner_replacement', 'J-SC-MAR', 1, 'SC', NULL, 'none', 50),
  ('internal_corner_replacement', 'J-CL-MAR', 1, 'CL', NULL, 'none', 60),
  ('internal_corner_replacement', 'EJ-SC-MAR', 1, 'SC', NULL, 'none', 70),
  ('internal_corner_replacement', 'EJ-CL-MAR', 1, 'CL', NULL, 'none', 80),
  ('internal_corner_replacement', 'GL-MAR', 0.33, NULL, NULL, 'none', 90),
  ('internal_corner_replacement', 'GL-MAR', 0.50, NULL, NULL, 'none', 100),
  ('internal_corner_replacement', 'SCR-SS', 6, NULL, NULL, 'none', 110),
  ('internal_corner_replacement', 'BRK-SC-MAR', 2, 'SC', NULL, 'none', 120),
  ('internal_corner_replacement', 'BRK-CL-MAR', 2, 'CL', NULL, 'none', 130);
