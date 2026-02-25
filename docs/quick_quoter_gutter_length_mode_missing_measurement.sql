-- Quick Quoter: gutter rows length_mode none → missing_measurement (Task 63.10)
-- Idempotent: only updates rows that still have length_mode='none' and product_id in GUT 3m.
-- Ensures gutter header shows "Metres?" (empty) instead of prefilled 1.0m for Stop-End, Outlet,
-- Straight Section, External/Internal Corner replacements.

UPDATE public.quick_quoter_part_templates
SET length_mode = 'missing_measurement', updated_at = now()
WHERE length_mode = 'none'
  AND product_id IN ('GUT-SC-MAR-3M', 'GUT-CL-MAR-3M');
