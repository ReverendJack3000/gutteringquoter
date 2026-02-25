-- Quick Quoter Migration A
-- Creates public.quick_quoter_repair_types and catalog index.

create table if not exists public.quick_quoter_repair_types (
  id text primary key,
  label text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  requires_profile boolean not null default false,
  requires_size_mm boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_quick_quoter_repair_types_active_sort
  on public.quick_quoter_repair_types(active, sort_order, id);
