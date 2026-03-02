"""
Quick Quoter catalog and resolver service.
"""
from __future__ import annotations

from typing import Any, Optional

PROFILE_TO_TEMPLATE = {
    "storm_cloud": "SC",
    "classic": "CL",
}
VALID_SIZE_MM = {65, 80}
VALID_LENGTH_MODES = {"none", "missing_measurement", "fixed_mm"}


def _to_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_int(value: Any) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _normalize_profile(profile: Any) -> tuple[Optional[str], Optional[str]]:
    text = str(profile or "").strip().lower()
    if not text:
        return None, None
    mapped = PROFILE_TO_TEMPLATE.get(text)
    if mapped is None:
        return None, text
    return mapped, None


def _normalize_size_mm(size_mm: Any) -> tuple[Optional[int], bool]:
    if size_mm is None:
        return None, False
    if isinstance(size_mm, str) and not size_mm.strip():
        return None, False
    parsed = _to_int(size_mm)
    if parsed is None:
        return None, True
    if parsed not in VALID_SIZE_MM:
        return None, True
    return parsed, False


def _validation_error(
    code: str,
    message: str,
    field: str,
    repair_type_id: Optional[str] = None,
) -> dict[str, Any]:
    return {
        "code": code,
        "message": message,
        "repair_type_id": repair_type_id,
        "field": field,
    }


def get_quick_quoter_catalog(supabase: Any) -> list[dict[str, Any]]:
    resp = (
        supabase.table("quick_quoter_repair_types")
        .select("id, label, requires_profile, requires_size_mm, sort_order, active")
        .eq("active", True)
        .order("sort_order")
        .order("id")
        .execute()
    )
    rows = resp.data or []
    out: list[dict[str, Any]] = []
    for row in rows:
        out.append(
            {
                "id": str(row.get("id") or ""),
                "label": str(row.get("label") or ""),
                "requires_profile": bool(row.get("requires_profile")),
                "requires_size_mm": bool(row.get("requires_size_mm")),
                "sort_order": int(row.get("sort_order") or 0),
                "active": bool(row.get("active")),
            }
        )
    return out


def resolve_quick_quoter_selection(
    supabase: Any,
    profile: Any,
    size_mm: Any,
    selections: list[dict[str, Any]],
) -> dict[str, Any]:
    out = {
        "elements": [],
        "missing_measurements": [],
        "validation_errors": [],
    }
    errors: list[dict[str, Any]] = []

    profile_code, bad_profile = _normalize_profile(profile)
    if bad_profile is not None:
        errors.append(
            _validation_error(
                code="invalid_profile",
                message="profile must be one of storm_cloud or classic.",
                field="profile",
            )
        )

    size_value, bad_size = _normalize_size_mm(size_mm)
    if bad_size:
        errors.append(
            _validation_error(
                code="invalid_size_mm",
                message="size_mm must be one of 65 or 80.",
                field="size_mm",
            )
        )

    selection_qty_by_repair_type: dict[str, float] = {}
    for selection in selections or []:
        repair_type_id = str((selection or {}).get("repair_type_id") or "").strip()
        quantity = _to_float((selection or {}).get("quantity"))
        if not repair_type_id:
            errors.append(
                _validation_error(
                    code="missing_repair_type_id",
                    message="repair_type_id is required for each selection.",
                    field="selections",
                )
            )
            continue
        if quantity is None:
            errors.append(
                _validation_error(
                    code="invalid_quantity",
                    message="quantity must be a number >= 1.",
                    field="selections",
                    repair_type_id=repair_type_id,
                )
            )
            continue
        if quantity < 1:
            errors.append(
                _validation_error(
                    code="quantity_too_small",
                    message="quantity must be >= 1.",
                    field="selections",
                    repair_type_id=repair_type_id,
                )
            )
            continue
        selection_qty_by_repair_type[repair_type_id] = (
            selection_qty_by_repair_type.get(repair_type_id, 0.0) + quantity
        )

    if not selection_qty_by_repair_type:
        if not errors:
            errors.append(
                _validation_error(
                    code="selections_required",
                    message="At least one selection is required.",
                    field="selections",
                )
            )
        out["validation_errors"] = errors
        return out

    repair_type_ids = sorted(selection_qty_by_repair_type.keys())
    repair_type_rows_resp = (
        supabase.table("quick_quoter_repair_types")
        .select("id, active, requires_profile, requires_size_mm, default_time_minutes")
        .in_("id", repair_type_ids)
        .execute()
    )
    repair_type_rows = repair_type_rows_resp.data or []
    repair_type_by_id: dict[str, dict[str, Any]] = {
        str(row.get("id") or ""): row for row in repair_type_rows
    }

    for repair_type_id in repair_type_ids:
        row = repair_type_by_id.get(repair_type_id)
        if row is None:
            errors.append(
                _validation_error(
                    code="unknown_repair_type_id",
                    message=f"Unknown repair_type_id: {repair_type_id}.",
                    field="selections",
                    repair_type_id=repair_type_id,
                )
            )
            continue
        if not bool(row.get("active")):
            errors.append(
                _validation_error(
                    code="inactive_repair_type_id",
                    message=f"Repair type is inactive: {repair_type_id}.",
                    field="selections",
                    repair_type_id=repair_type_id,
                )
            )
            continue
        if bool(row.get("requires_profile")) and profile_code is None:
            errors.append(
                _validation_error(
                    code="profile_required",
                    message=f"profile is required for {repair_type_id}.",
                    field="profile",
                    repair_type_id=repair_type_id,
                )
            )
        if bool(row.get("requires_size_mm")) and size_value is None:
            errors.append(
                _validation_error(
                    code="size_mm_required",
                    message=f"size_mm is required for {repair_type_id}.",
                    field="size_mm",
                    repair_type_id=repair_type_id,
                )
            )

    if errors:
        out["validation_errors"] = errors
        return out

    template_rows_resp = (
        supabase.table("quick_quoter_part_templates")
        .select(
            "id, repair_type_id, product_id, qty_per_unit, condition_profile, "
            "condition_size_mm, length_mode, fixed_length_mm, sort_order"
        )
        .in_("repair_type_id", repair_type_ids)
        .eq("active", True)
        .order("repair_type_id")
        .order("sort_order")
        .order("id")
        .execute()
    )
    template_rows = template_rows_resp.data or []

    elements_by_key: dict[tuple[str, Optional[float]], float] = {}
    missing_by_key: dict[tuple[str, str], float] = {}

    for row in template_rows:
        repair_type_id = str(row.get("repair_type_id") or "").strip()
        if not repair_type_id:
            continue
        selection_qty = selection_qty_by_repair_type.get(repair_type_id)
        if selection_qty is None:
            continue

        condition_profile = str(row.get("condition_profile") or "").strip().upper()
        if condition_profile:
            if profile_code is None or condition_profile != profile_code:
                continue

        condition_size = row.get("condition_size_mm")
        condition_size_value = _to_int(condition_size)
        if condition_size is not None and condition_size_value is None:
            continue
        if condition_size_value is not None:
            if size_value is None or condition_size_value != size_value:
                continue

        product_id = str(row.get("product_id") or "").strip()
        if not product_id:
            continue
        qty_per_unit = _to_float(row.get("qty_per_unit"))
        if qty_per_unit is None:
            continue

        resolved_qty = selection_qty * qty_per_unit
        if resolved_qty <= 0:
            continue

        length_mode = str(row.get("length_mode") or "none").strip().lower()
        if length_mode not in VALID_LENGTH_MODES:
            length_mode = "none"

        if length_mode == "missing_measurement":
            key = (product_id, repair_type_id)
            missing_by_key[key] = missing_by_key.get(key, 0.0) + resolved_qty
            continue

        length_mm: Optional[float] = None
        if length_mode == "fixed_mm":
            fixed_length_mm = _to_int(row.get("fixed_length_mm"))
            if fixed_length_mm is None or fixed_length_mm <= 0:
                continue
            length_mm = float(fixed_length_mm)

        key = (product_id, length_mm)
        elements_by_key[key] = elements_by_key.get(key, 0.0) + resolved_qty

    elements = []
    for (asset_id, length_mm), quantity in sorted(
        elements_by_key.items(), key=lambda item: (item[0][0], item[0][1] or 0.0)
    ):
        entry = {
            "assetId": asset_id,
            "quantity": quantity,
        }
        if length_mm is not None:
            entry["length_mm"] = length_mm
        elements.append(entry)

    missing_measurements = []
    for (asset_id, repair_type_id), quantity in sorted(
        missing_by_key.items(), key=lambda item: (item[0][0], item[0][1])
    ):
        missing_measurements.append(
            {
                "assetId": asset_id,
                "quantity": quantity,
                "repair_type_id": repair_type_id,
            }
        )

    suggested_labour_minutes = 0
    for repair_type_id, qty in selection_qty_by_repair_type.items():
        row = repair_type_by_id.get(repair_type_id)
        if row is not None:
            default_mins = row.get("default_time_minutes")
            suggested_labour_minutes += (default_mins if default_mins is not None else 0) * qty

    out["elements"] = elements
    out["missing_measurements"] = missing_measurements
    out["suggested_labour_minutes"] = suggested_labour_minutes
    out["validation_errors"] = []
    return out
