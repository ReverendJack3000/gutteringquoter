-- Quick Quoter: default time (minutes) per repair type (Task 63.20)
-- Adds default_time_minutes to public.quick_quoter_repair_types for suggested labour in resolve and optional quote modal prefill.

alter table public.quick_quoter_repair_types
  add column if not exists default_time_minutes integer null;

alter table public.quick_quoter_repair_types
  drop constraint if exists quick_quoter_repair_types_default_time_minutes_check;

alter table public.quick_quoter_repair_types
  add constraint quick_quoter_repair_types_default_time_minutes_check
  check (default_time_minutes is null or default_time_minutes >= 0);
