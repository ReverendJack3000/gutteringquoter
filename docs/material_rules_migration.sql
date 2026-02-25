-- Material Rules migration (Desktop Admin Material Rules Console)
-- Creates measured-length accessory rules table and audit columns for quick quoter tables.

-- 1) Single-row global measured accessory rules.
create table if not exists public.measured_material_rules (
  id integer primary key default 1,
  bracket_spacing_mm integer not null check (bracket_spacing_mm > 0),
  clip_spacing_mm integer not null check (clip_spacing_mm > 0),
  screws_per_bracket integer not null check (screws_per_bracket >= 0),
  screws_per_dropper integer not null check (screws_per_dropper >= 0),
  screws_per_saddle_clip integer not null check (screws_per_saddle_clip >= 0),
  screws_per_adjustable_clip integer not null check (screws_per_adjustable_clip >= 0),
  screw_product_id text not null references public.products(id),
  bracket_product_id_sc text not null references public.products(id),
  bracket_product_id_cl text not null references public.products(id),
  saddle_clip_product_id_65 text not null references public.products(id),
  saddle_clip_product_id_80 text not null references public.products(id),
  adjustable_clip_product_id_65 text not null references public.products(id),
  adjustable_clip_product_id_80 text not null references public.products(id),
  clip_selection_mode text not null check (clip_selection_mode in ('auto_by_acl_presence', 'force_saddle', 'force_adjustable')),
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id),
  constraint measured_material_rules_singleton check (id = 1)
);

-- Seed default row to match current gutter_accessories.py constants.
insert into public.measured_material_rules (
  id,
  bracket_spacing_mm,
  clip_spacing_mm,
  screws_per_bracket,
  screws_per_dropper,
  screws_per_saddle_clip,
  screws_per_adjustable_clip,
  screw_product_id,
  bracket_product_id_sc,
  bracket_product_id_cl,
  saddle_clip_product_id_65,
  saddle_clip_product_id_80,
  adjustable_clip_product_id_65,
  adjustable_clip_product_id_80,
  clip_selection_mode,
  updated_at,
  updated_by
) values (
  1,
  400,
  1200,
  3,
  4,
  2,
  2,
  'SCR-SS',
  'BRK-SC-MAR',
  'BRK-CL-MAR',
  'SCL-65',
  'SCL-80',
  'ACL-65',
  'ACL-80',
  'auto_by_acl_presence',
  now(),
  null
)
on conflict (id) do update set
  bracket_spacing_mm = excluded.bracket_spacing_mm,
  clip_spacing_mm = excluded.clip_spacing_mm,
  screws_per_bracket = excluded.screws_per_bracket,
  screws_per_dropper = excluded.screws_per_dropper,
  screws_per_saddle_clip = excluded.screws_per_saddle_clip,
  screws_per_adjustable_clip = excluded.screws_per_adjustable_clip,
  screw_product_id = excluded.screw_product_id,
  bracket_product_id_sc = excluded.bracket_product_id_sc,
  bracket_product_id_cl = excluded.bracket_product_id_cl,
  saddle_clip_product_id_65 = excluded.saddle_clip_product_id_65,
  saddle_clip_product_id_80 = excluded.saddle_clip_product_id_80,
  adjustable_clip_product_id_65 = excluded.adjustable_clip_product_id_65,
  adjustable_clip_product_id_80 = excluded.adjustable_clip_product_id_80,
  clip_selection_mode = excluded.clip_selection_mode,
  updated_at = now();

-- 2) Audit metadata on quick quoter tables.
alter table public.quick_quoter_repair_types
  add column if not exists updated_by uuid null references auth.users(id);

alter table public.quick_quoter_part_templates
  add column if not exists updated_by uuid null references auth.users(id);
