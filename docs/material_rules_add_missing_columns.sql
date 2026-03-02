-- Add any missing columns required by GET /api/admin/material-rules/quick-quoter.
-- Run in Supabase SQL Editor (production project) if you see "Failed to load quick quoter material rules".
-- Safe to run multiple times (IF NOT EXISTS).

-- Audit column on repair types (required by backend select)
ALTER TABLE public.quick_quoter_repair_types
  ADD COLUMN IF NOT EXISTS updated_by uuid NULL REFERENCES auth.users(id);

-- Audit + display group on part templates (required by backend select)
ALTER TABLE public.quick_quoter_part_templates
  ADD COLUMN IF NOT EXISTS updated_by uuid NULL REFERENCES auth.users(id);

ALTER TABLE public.quick_quoter_part_templates
  ADD COLUMN IF NOT EXISTS display_group_id uuid NULL;
