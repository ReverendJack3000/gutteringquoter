-- Quick Quoter Migration B
-- Creates public.quick_quoter_part_templates and indexes.

create table if not exists public.quick_quoter_part_templates (
  id uuid primary key default gen_random_uuid(),
  repair_type_id text not null references public.quick_quoter_repair_types(id) on delete cascade,
  product_id text not null references public.products(id),
  qty_per_unit numeric(12,3) not null check (qty_per_unit >= 0),
  condition_profile text null check (condition_profile in ('SC','CL')),
  condition_size_mm integer null check (condition_size_mm in (65,80)),
  length_mode text not null default 'none' check (length_mode in ('none','missing_measurement','fixed_mm')),
  fixed_length_mm integer null check (fixed_length_mm > 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quick_quoter_fixed_length_mode_chk check (
    (length_mode = 'fixed_mm' and fixed_length_mm is not null)
    or (length_mode <> 'fixed_mm' and fixed_length_mm is null)
  )
);

create index if not exists idx_quick_quoter_templates_repair_type
  on public.quick_quoter_part_templates(repair_type_id, active, sort_order);

create index if not exists idx_quick_quoter_templates_product
  on public.quick_quoter_part_templates(product_id);
