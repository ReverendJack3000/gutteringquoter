"""
Gutter accessory auto-calculation.

Domain rules (billing):
- Brackets: 1 bracket for any length + 1 per 400 mm after 0 mm (formula: 1 + floor(length_mm / 400))
  Use manual length_mm when provided; else stock length × qty from asset_id.
- Every bracket used includes 3 Stainless Steel Screws (SCR-SS)
- Every dropper used requires 4 screws (SCR-SS)
- Every saddle clip (SCL-65, SCL-80) requires 2 screws (SCR-SS)
- Every adjustable clip (ACL-65, ACL-80) requires 2 screws (SCR-SS)
- 1 clip per 1.2m of downpipe; use adjustable clips if any on canvas, else saddle clips

Inferred quantities are merged with manually placed items (summed by assetId).
"""
import math
import re
from typing import List, Optional, Tuple

# Gutter pattern: GUT-{SC|CL}-MAR-{1.5|3|5}M
GUTTER_PATTERN = re.compile(r"^GUT-(SC|CL)-MAR-(\d+(?:\.\d+)?)M$", re.IGNORECASE)
BRACKET_SPACING_MM = 400  # 1 bracket at 0 mm, +1 per 400 mm thereafter
SCREWS_PER_BRACKET = 3
SCREWS_PER_DROPPER = 4
SCREWS_PER_SADDLE_CLIP = 2
SCREWS_PER_ADJUSTABLE_CLIP = 2
SCREW_PRODUCT_ID = "SCR-SS"
CLIP_PER_DOWNPIPE_MM = 1200  # 1 clip per 1.2m of downpipe


def _parse_gutter(asset_id: str) -> Optional[Tuple[str, float]]:
    """Extract (profile_code, length_m) from gutter asset_id, or None if not a gutter."""
    m = GUTTER_PATTERN.match(asset_id.strip())
    if not m:
        return None
    profile = m.group(1).upper()  # SC or CL
    length_m = float(m.group(2))
    return (profile, length_m)


def _bracket_product_id(profile: str) -> str:
    """Map profile code to bracket product id."""
    return f"BRK-{profile}-MAR"


def _is_dropper(asset_id: str) -> bool:
    """True if asset is a dropper (id 'dropper' or starts with 'DRP-')."""
    a = (asset_id or "").strip().upper()
    return a == "DROPPER" or a.startswith("DRP-")


def _is_saddle_clip(asset_id: str) -> bool:
    """True if asset is a saddle clip (SCL-65, SCL-80, etc.)."""
    a = (asset_id or "").strip().upper()
    return a.startswith("SCL-")


def _is_adjustable_clip(asset_id: str) -> bool:
    """True if asset is an adjustable clip (ACL-65, ACL-80, etc.)."""
    a = (asset_id or "").strip().upper()
    return a.startswith("ACL-")


def _is_downpipe(asset_id: str) -> bool:
    """True if asset is a downpipe (DP-65-*, DP-80-*, DPJ-65, DPJ-80, etc.)."""
    a = (asset_id or "").strip().upper()
    return a.startswith("DP-") or a.startswith("DPJ-")


def _downpipe_clip_size(asset_id: str) -> Optional[str]:
    """Return '65' or '80' for downpipe size from asset_id, else None."""
    a = (asset_id or "").strip().upper()
    if "65" in a:
        return "65"
    if "80" in a:
        return "80"
    return None


def expand_elements_with_gutter_accessories(
    elements: List[dict],
) -> List[dict]:
    """
    Expand elements to include inferred brackets, screws, and downpipe clips.
    - Gutters: 1 bracket for any length + 1 per 400 mm (formula 1 + floor(length_mm/400)); use length_mm when provided (manual lengths), else product length × qty.
    - Downpipes: 1 clip per 1.2m; use adjustable clips if any ACL-* in request, else saddle clips.
    elements: list of {assetId, quantity, length_mm?: number}
    Returns: merged list with same shape, quantities summed by assetId.
    """
    by_id: dict[str, float] = {}
    has_adjustable_clip = any(_is_adjustable_clip(e.get("assetId", "")) for e in elements)

    for e in elements:
        asset_id = e.get("assetId", "")
        qty = float(e.get("quantity", 0))
        if qty <= 0:
            continue
        length_mm_arg = e.get("length_mm")
        if length_mm_arg is not None:
            try:
                length_mm_arg = float(length_mm_arg)
            except (TypeError, ValueError):
                length_mm_arg = None

        parsed = _parse_gutter(asset_id)
        if parsed:
            profile, length_m = parsed
            # Use manual length for bracket/screw when provided; else stock length × qty
            if length_mm_arg is not None and length_mm_arg >= 0:
                total_mm = length_mm_arg
            else:
                total_mm = length_m * 1000 * qty
            # 1 bracket for any length + 1 per 400 mm after 0 mm
            brackets_total = 1 + int(total_mm // BRACKET_SPACING_MM)
            screws_total = brackets_total * SCREWS_PER_BRACKET
            bracket_id = _bracket_product_id(profile)
            by_id[asset_id] = by_id.get(asset_id, 0) + qty
            by_id[bracket_id] = by_id.get(bracket_id, 0) + brackets_total
            by_id[SCREW_PRODUCT_ID] = by_id.get(SCREW_PRODUCT_ID, 0) + screws_total
        elif _is_downpipe(asset_id):
            by_id[asset_id] = by_id.get(asset_id, 0) + qty
            # 1 clip per 1.2m of downpipe; use ACL if any on canvas else SCL
            size = _downpipe_clip_size(asset_id) or "65"
            clip_id = f"ACL-{size}" if has_adjustable_clip else f"SCL-{size}"
            screws_per_clip = SCREWS_PER_ADJUSTABLE_CLIP if has_adjustable_clip else SCREWS_PER_SADDLE_CLIP
            if length_mm_arg is not None and length_mm_arg > 0:
                clips = max(1, math.ceil(length_mm_arg / CLIP_PER_DOWNPIPE_MM))
                by_id[clip_id] = by_id.get(clip_id, 0) + clips
                by_id[SCREW_PRODUCT_ID] = by_id.get(SCREW_PRODUCT_ID, 0) + clips * screws_per_clip
            # If no length_mm, still ensure at least 1 clip per downpipe run
            elif qty > 0:
                by_id[clip_id] = by_id.get(clip_id, 0) + qty
                by_id[SCREW_PRODUCT_ID] = by_id.get(SCREW_PRODUCT_ID, 0) + qty * screws_per_clip
        elif _is_dropper(asset_id):
            by_id[asset_id] = by_id.get(asset_id, 0) + qty
            by_id[SCREW_PRODUCT_ID] = by_id.get(SCREW_PRODUCT_ID, 0) + SCREWS_PER_DROPPER * qty
        elif _is_saddle_clip(asset_id):
            by_id[asset_id] = by_id.get(asset_id, 0) + qty
            by_id[SCREW_PRODUCT_ID] = by_id.get(SCREW_PRODUCT_ID, 0) + SCREWS_PER_SADDLE_CLIP * qty
        elif _is_adjustable_clip(asset_id):
            by_id[asset_id] = by_id.get(asset_id, 0) + qty
            by_id[SCREW_PRODUCT_ID] = by_id.get(SCREW_PRODUCT_ID, 0) + SCREWS_PER_ADJUSTABLE_CLIP * qty
        else:
            by_id[asset_id] = by_id.get(asset_id, 0) + qty

    return [{"assetId": aid, "quantity": qty} for aid, qty in by_id.items() if qty > 0]
