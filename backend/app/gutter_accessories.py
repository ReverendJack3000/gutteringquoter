"""
Gutter accessory auto-calculation.

Domain rules (billing):
- Brackets: 1 bracket for any length + 1 per spacing mm after 0 mm
- Every bracket/dropper/clip contributes screws
- 1 clip per downpipe spacing mm of measured downpipe
- Downpipe stock lengths: 1.5m and 3m only (DP-65-1.5M, DP-65-3M, DP-80-1.5M, DP-80-3M)

Rules are configurable via optional rules_config and default to the existing constants.
Inferred quantities are merged with manually placed items (summed by assetId).
"""
import math
import re
from typing import Any, Optional, Tuple

# Gutter pattern: GUT-{SC|CL}-MAR-{1.5|3|5}M
GUTTER_PATTERN = re.compile(r"^GUT-(SC|CL)-MAR-(\d+(?:\.\d+)?)M$", re.IGNORECASE)

VALID_CLIP_SELECTION_MODES = {
    "auto_by_acl_presence",
    "force_saddle",
    "force_adjustable",
}

DEFAULT_GUTTER_ACCESSORY_RULES: dict[str, Any] = {
    "bracket_spacing_mm": 400,
    "clip_spacing_mm": 1200,
    "screws_per_bracket": 3,
    "screws_per_dropper": 4,
    "screws_per_saddle_clip": 2,
    "screws_per_adjustable_clip": 2,
    "screw_product_id": "SCR-SS",
    "bracket_product_id_sc": "BRK-SC-MAR",
    "bracket_product_id_cl": "BRK-CL-MAR",
    "saddle_clip_product_id_65": "SCL-65",
    "saddle_clip_product_id_80": "SCL-80",
    "adjustable_clip_product_id_65": "ACL-65",
    "adjustable_clip_product_id_80": "ACL-80",
    "clip_selection_mode": "auto_by_acl_presence",
}

# Backward-compatible aliases for existing tests/docs.
BRACKET_SPACING_MM = DEFAULT_GUTTER_ACCESSORY_RULES["bracket_spacing_mm"]
SCREWS_PER_BRACKET = DEFAULT_GUTTER_ACCESSORY_RULES["screws_per_bracket"]
SCREWS_PER_DROPPER = DEFAULT_GUTTER_ACCESSORY_RULES["screws_per_dropper"]
SCREWS_PER_SADDLE_CLIP = DEFAULT_GUTTER_ACCESSORY_RULES["screws_per_saddle_clip"]
SCREWS_PER_ADJUSTABLE_CLIP = DEFAULT_GUTTER_ACCESSORY_RULES["screws_per_adjustable_clip"]
SCREW_PRODUCT_ID = DEFAULT_GUTTER_ACCESSORY_RULES["screw_product_id"]
CLIP_PER_DOWNPIPE_MM = DEFAULT_GUTTER_ACCESSORY_RULES["clip_spacing_mm"]


def get_default_gutter_accessory_rules() -> dict[str, Any]:
    return dict(DEFAULT_GUTTER_ACCESSORY_RULES)


def _to_int(value: Any) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _normalize_rules_config(rules_config: Optional[dict[str, Any]]) -> dict[str, Any]:
    rules = get_default_gutter_accessory_rules()
    if not isinstance(rules_config, dict):
        return rules

    positive_int_fields = {"bracket_spacing_mm", "clip_spacing_mm"}
    non_negative_int_fields = {
        "screws_per_bracket",
        "screws_per_dropper",
        "screws_per_saddle_clip",
        "screws_per_adjustable_clip",
    }
    text_fields = {
        "screw_product_id",
        "bracket_product_id_sc",
        "bracket_product_id_cl",
        "saddle_clip_product_id_65",
        "saddle_clip_product_id_80",
        "adjustable_clip_product_id_65",
        "adjustable_clip_product_id_80",
    }

    for key in positive_int_fields | non_negative_int_fields:
        parsed = _to_int(rules_config.get(key))
        if parsed is None:
            continue
        if key in positive_int_fields and parsed <= 0:
            continue
        if key in non_negative_int_fields and parsed < 0:
            continue
        rules[key] = parsed

    for key in text_fields:
        text = str(rules_config.get(key) or "").strip()
        if text:
            rules[key] = text

    mode = str(rules_config.get("clip_selection_mode") or "").strip().lower()
    if mode in VALID_CLIP_SELECTION_MODES:
        rules["clip_selection_mode"] = mode

    return rules


def _parse_gutter(asset_id: str) -> Optional[Tuple[str, float]]:
    """Extract (profile_code, length_m) from gutter asset_id, or None if not a gutter."""
    m = GUTTER_PATTERN.match(asset_id.strip())
    if not m:
        return None
    profile = m.group(1).upper()  # SC or CL
    length_m = float(m.group(2))
    return (profile, length_m)


def _bracket_product_id(profile: str, rules: dict[str, Any]) -> str:
    """Map profile code to bracket product id (rule-driven with fallback)."""
    if profile == "SC":
        return str(rules["bracket_product_id_sc"])
    if profile == "CL":
        return str(rules["bracket_product_id_cl"])
    return f"BRK-{profile}-MAR"


def _saddle_clip_product_id(size: str, rules: dict[str, Any]) -> str:
    if size == "80":
        return str(rules["saddle_clip_product_id_80"])
    return str(rules["saddle_clip_product_id_65"])


def _adjustable_clip_product_id(size: str, rules: dict[str, Any]) -> str:
    if size == "80":
        return str(rules["adjustable_clip_product_id_80"])
    return str(rules["adjustable_clip_product_id_65"])


def _is_dropper(asset_id: str) -> bool:
    """True if asset is a dropper (id 'dropper' or starts with 'DRP-')."""
    a = (asset_id or "").strip().upper()
    return a == "DROPPER" or a.startswith("DRP-")


def _is_saddle_clip(asset_id: str, rules: Optional[dict[str, Any]] = None) -> bool:
    """True if asset is a saddle clip (SCL-*, or configured saddle product id)."""
    a = (asset_id or "").strip().upper()
    if a.startswith("SCL-"):
        return True
    if isinstance(rules, dict):
        mapped = {
            str(rules.get("saddle_clip_product_id_65") or "").strip().upper(),
            str(rules.get("saddle_clip_product_id_80") or "").strip().upper(),
        }
        mapped.discard("")
        if a in mapped:
            return True
    return False


def _is_adjustable_clip(asset_id: str, rules: Optional[dict[str, Any]] = None) -> bool:
    """True if asset is an adjustable clip (ACL-*, or configured adjustable product id)."""
    a = (asset_id or "").strip().upper()
    if a.startswith("ACL-"):
        return True
    if isinstance(rules, dict):
        mapped = {
            str(rules.get("adjustable_clip_product_id_65") or "").strip().upper(),
            str(rules.get("adjustable_clip_product_id_80") or "").strip().upper(),
        }
        mapped.discard("")
        if a in mapped:
            return True
    return False


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


def _is_downpipe_main(asset_id: str) -> bool:
    """True if asset is a main downpipe (DP-65-*, DP-80-*), not a joiner (DPJ-*)."""
    a = (asset_id or "").strip().upper()
    return (a.startswith("DP-65-") or a.startswith("DP-80-")) and not a.startswith("DPJ-")


def _use_adjustable_clips(elements: list[dict[str, Any]], rules: dict[str, Any]) -> bool:
    mode = str(rules.get("clip_selection_mode") or "auto_by_acl_presence").strip().lower()
    if mode == "force_adjustable":
        return True
    if mode == "force_saddle":
        return False
    return any(_is_adjustable_clip(e.get("assetId", ""), rules) for e in elements)


def expand_elements_with_gutter_accessories(
    elements: list[dict],
    rules_config: Optional[dict[str, Any]] = None,
) -> list[dict]:
    """
    Expand elements to include inferred brackets, screws, and downpipe clips.
    - Gutters: 1 bracket for any length + 1 per bracket spacing.
      Use length_mm when provided (manual lengths), else stock length × qty.
    - Downpipes: 1 clip per clip spacing.
      Clip type comes from clip_selection_mode:
      * auto_by_acl_presence (existing behavior)
      * force_saddle
      * force_adjustable
      When bin-packed, only elements with length_mm drive clips;
      sub-pieces without length_mm add no clips when that size already has measured length.

    elements: list of {assetId, quantity, length_mm?: number}
    Returns: merged list with same shape, quantities summed by assetId.
    """
    rules = _normalize_rules_config(rules_config)
    by_id: dict[str, float] = {}
    has_adjustable_clip = _use_adjustable_clips(elements, rules)

    sizes_with_length: set[str] = set()
    for e in elements:
        if _is_downpipe_main(e.get("assetId", "")):
            lm = e.get("length_mm")
            if lm is not None:
                try:
                    if float(lm) > 0:
                        size = _downpipe_clip_size(e.get("assetId", "")) or "65"
                        sizes_with_length.add(size)
                except (TypeError, ValueError):
                    pass

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
            if length_mm_arg is not None and length_mm_arg >= 0:
                total_mm = length_mm_arg
            else:
                total_mm = length_m * 1000 * qty

            bracket_spacing_mm = int(rules["bracket_spacing_mm"])
            brackets_total = 1 + int(total_mm // bracket_spacing_mm)
            screws_total = brackets_total * int(rules["screws_per_bracket"])
            bracket_id = _bracket_product_id(profile, rules)
            screw_product_id = str(rules["screw_product_id"])

            by_id[asset_id] = by_id.get(asset_id, 0) + qty
            by_id[bracket_id] = by_id.get(bracket_id, 0) + brackets_total
            by_id[screw_product_id] = by_id.get(screw_product_id, 0) + screws_total
        elif _is_downpipe(asset_id):
            by_id[asset_id] = by_id.get(asset_id, 0) + qty
            size = _downpipe_clip_size(asset_id) or "65"

            if has_adjustable_clip:
                clip_id = _adjustable_clip_product_id(size, rules)
                screws_per_clip = int(rules["screws_per_adjustable_clip"])
            else:
                clip_id = _saddle_clip_product_id(size, rules)
                screws_per_clip = int(rules["screws_per_saddle_clip"])

            screw_product_id = str(rules["screw_product_id"])
            clip_spacing_mm = int(rules["clip_spacing_mm"])
            if length_mm_arg is not None and length_mm_arg > 0:
                clips = max(1, math.ceil(length_mm_arg / clip_spacing_mm))
                by_id[clip_id] = by_id.get(clip_id, 0) + clips
                by_id[screw_product_id] = by_id.get(screw_product_id, 0) + clips * screws_per_clip
            elif qty > 0 and size not in sizes_with_length:
                by_id[clip_id] = by_id.get(clip_id, 0) + qty
                by_id[screw_product_id] = by_id.get(screw_product_id, 0) + qty * screws_per_clip
        elif _is_dropper(asset_id):
            by_id[asset_id] = by_id.get(asset_id, 0) + qty
            screw_product_id = str(rules["screw_product_id"])
            by_id[screw_product_id] = by_id.get(screw_product_id, 0) + int(rules["screws_per_dropper"]) * qty
        elif _is_saddle_clip(asset_id, rules):
            by_id[asset_id] = by_id.get(asset_id, 0) + qty
            screw_product_id = str(rules["screw_product_id"])
            by_id[screw_product_id] = by_id.get(screw_product_id, 0) + int(rules["screws_per_saddle_clip"]) * qty
        elif _is_adjustable_clip(asset_id, rules):
            by_id[asset_id] = by_id.get(asset_id, 0) + qty
            screw_product_id = str(rules["screw_product_id"])
            by_id[screw_product_id] = by_id.get(screw_product_id, 0) + int(rules["screws_per_adjustable_clip"]) * qty
        else:
            by_id[asset_id] = by_id.get(asset_id, 0) + qty

    return [{"assetId": aid, "quantity": qty} for aid, qty in by_id.items() if qty > 0]
