#!/usr/bin/env python3
"""
One-off backfill of display_group_id on quick_quoter_part_templates.
Replicates the frontend grouping logic (stem + merge SC/CL and 65/80 pairs)
so existing rows keep the same logical-part display after migration.

Run from project root with backend/.env set:
  python scripts/backfill_display_group_id.py

Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in backend/.env
"""
import os
import re
import sys
import uuid

# Run from project root; backend on path for get_supabase
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from app.supabase_client import get_supabase


def _stem(product_id: str) -> str:
    """Mirror getMaterialRulesProductFamilyStem: strip -SC-/-CL-/-65/-80; colon fallback."""
    s = (product_id or "").strip()
    if not s:
        return s
    normalized = re.sub(r"\s+", "", s)
    stem = re.sub(r"-SC-", "", normalized, flags=re.I)
    stem = re.sub(r"-CL-", "", stem, flags=re.I)
    stem = re.sub(r"-65(-|$)", r"\1", stem)
    stem = re.sub(r"-80(-|$)", r"\1", stem)
    stem = stem.strip()
    if stem == normalized and ":" in s:
        stem = s.split(":")[0].strip() or s
    return stem


def _length_mode_for_grouping(row: dict) -> str:
    """missing_measurement vs none (fixed_mm treated as missing_measurement)."""
    raw = (row.get("length_mode") or "none").strip().lower()
    fixed = row.get("fixed_length_mm")
    if raw == "fixed_mm" and fixed is not None and int(fixed) > 0:
        return "missing_measurement"
    return "missing_measurement" if raw == "missing_measurement" else "none"


def _group_section_rows(rows):
    """Group rows by (qty, length_mode, stem) then merge SC/CL and 65/80 pairs. Returns list of groups (each group = list of rows)."""
    if not rows:
        return []

    def key_for(row: dict, index: int) -> str:
        qty = float(row.get("qty_per_unit") or 0)
        lm = _length_mode_for_grouping(row)
        stem = _stem(row.get("product_id") or "")
        if stem == "":
            stem = f"__empty_{index}"
        return f"{qty}\t{lm}\t{stem}"

    by_key: dict[str, list[dict]] = {}
    for i, row in enumerate(rows):
        k = key_for(row, i)
        by_key.setdefault(k, []).append(row)

    groups = [list(g) for g in by_key.values()]

    # Merge single-row groups that are SC/CL or 65/80 pairs
    def variant_key(group):
        if len(group) != 1:
            return None
        r = group[0]
        qty = float(r.get("qty_per_unit") or 0)
        lm = _length_mode_for_grouping(r)
        profile = (r.get("condition_profile") or "").strip().upper()
        size = str(r.get("condition_size_mm") or "").strip()
        if profile in ("SC", "CL"):
            return f"p\t{qty}\t{lm}"
        if size in ("65", "80"):
            return f"s\t{qty}\t{lm}"
        return None

    merged = []
    used = set()
    for i, g in enumerate(groups):
        if i in used:
            continue
        vk = variant_key(g)
        if vk and len(g) == 1:
            r0 = g[0]
            p0 = (r0.get("condition_profile") or "").strip().upper()
            s0 = str(r0.get("condition_size_mm") or "").strip()
            found = None
            for j in range(i + 1, len(groups)):
                if j in used:
                    continue
                g2 = groups[j]
                if len(g2) != 1 or variant_key(g2) != vk:
                    continue
                r1 = g2[0]
                p1 = (r1.get("condition_profile") or "").strip().upper()
                s1 = str(r1.get("condition_size_mm") or "").strip()
                profile_pair = (p0 == "SC" and p1 == "CL") or (p0 == "CL" and p1 == "SC")
                size_pair = (s0 == "65" and s1 == "80") or (s0 == "80" and s1 == "65")
                if profile_pair or size_pair:
                    found = j
                    break
            if found is not None:
                merged.append(g + groups[found])
                used.add(i)
                used.add(found)
                continue
        merged.append(g)
    return merged


def main() -> None:
    supabase = get_supabase()
    resp = (
        supabase.table("quick_quoter_part_templates")
        .select("id, repair_type_id, product_id, qty_per_unit, condition_profile, condition_size_mm, length_mode, fixed_length_mm")
        .order("repair_type_id")
        .order("sort_order")
        .order("id")
        .execute()
    )
    rows = list(resp.data or [])
    if not rows:
        print("No templates to backfill.")
        return

    # Partition by repair_type_id
    by_repair: dict[str, list[dict]] = {}
    for r in rows:
        rid = (r.get("repair_type_id") or "").strip()
        by_repair.setdefault(rid, []).append(dict(r))

    updates: list[tuple[str, str]] = []  # (id, display_group_id)
    for repair_type_id, section_rows in by_repair.items():
        groups = _group_section_rows(section_rows)
        for group in groups:
            group_id = str(uuid.uuid4())
            for row in group:
                row_id = row.get("id")
                if row_id:
                    updates.append((str(row_id), group_id))

    print(f"Backfilling display_group_id for {len(updates)} rows...")
    for row_id, group_id in updates:
        supabase.table("quick_quoter_part_templates").update({"display_group_id": group_id}).eq("id", row_id).execute()
    print("Done.")


if __name__ == "__main__":
    main()
