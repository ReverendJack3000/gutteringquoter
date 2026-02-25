"""
Admin material-rules service.

Covers:
- Quick Quoter repair types and part templates (catalog tables)
- Measured-length accessory inference rules for /api/calculate-quote
"""
from __future__ import annotations

from datetime import datetime, timezone
import uuid as uuid_lib
from typing import Any, Optional

from app.gutter_accessories import DEFAULT_GUTTER_ACCESSORY_RULES, VALID_CLIP_SELECTION_MODES

VALID_QUICK_QUOTER_PROFILES = {"SC", "CL"}
VALID_QUICK_QUOTER_SIZES = {65, 80}
VALID_QUICK_QUOTER_LENGTH_MODES = {"none", "missing_measurement", "fixed_mm"}

MEASURED_RULE_PRODUCT_FIELDS = (
    "screw_product_id",
    "bracket_product_id_sc",
    "bracket_product_id_cl",
    "saddle_clip_product_id_65",
    "saddle_clip_product_id_80",
    "adjustable_clip_product_id_65",
    "adjustable_clip_product_id_80",
)


class MaterialRulesValidationError(ValueError):
    """Raised when an admin payload is invalid."""

    def __init__(self, errors: list[dict[str, Any]]):
        super().__init__("Invalid material rules payload")
        self.errors = errors


def _validation_error(code: str, message: str, field: str, index: Optional[int] = None) -> dict[str, Any]:
    payload = {
        "code": code,
        "message": message,
        "field": field,
    }
    if index is not None:
        payload["index"] = index
    return payload


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _to_bool(value: Any) -> Optional[bool]:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if value == 1:
            return True
        if value == 0:
            return False
    if isinstance(value, str):
        text = value.strip().lower()
        if text in {"true", "1", "yes", "on"}:
            return True
        if text in {"false", "0", "no", "off"}:
            return False
    return None


def _to_int(value: Any) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, str) and not value.strip():
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _to_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, str) and not value.strip():
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_clean_str(value: Any) -> str:
    return str(value or "").strip()


def _to_optional_profile(value: Any) -> Optional[str]:
    text = _to_clean_str(value).upper()
    if not text:
        return None
    return text


def _to_optional_updated_by(value: Any) -> Optional[str]:
    text = _to_clean_str(value)
    if not text:
        return None
    return text


def _fetch_existing_ids(supabase: Any, table: str, ids: set[str]) -> set[str]:
    if not ids:
        return set()
    resp = (
        supabase.table(table)
        .select("id")
        .in_("id", sorted(ids))
        .execute()
    )
    rows = resp.data or []
    out: set[str] = set()
    for row in rows:
        rid = _to_clean_str((row or {}).get("id"))
        if rid:
            out.add(rid)
    return out


def _serialize_quick_quoter_repair_type(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": _to_clean_str(row.get("id")),
        "label": _to_clean_str(row.get("label")),
        "active": bool(row.get("active")),
        "sort_order": int(row.get("sort_order") or 0),
        "requires_profile": bool(row.get("requires_profile")),
        "requires_size_mm": bool(row.get("requires_size_mm")),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
        "updated_by": _to_optional_updated_by(row.get("updated_by")),
    }


def _serialize_quick_quoter_template(row: dict[str, Any]) -> dict[str, Any]:
    qty_per_unit = _to_float(row.get("qty_per_unit"))
    return {
        "id": _to_clean_str(row.get("id")),
        "repair_type_id": _to_clean_str(row.get("repair_type_id")),
        "product_id": _to_clean_str(row.get("product_id")),
        "qty_per_unit": 0.0 if qty_per_unit is None else qty_per_unit,
        "condition_profile": _to_optional_profile(row.get("condition_profile")),
        "condition_size_mm": _to_int(row.get("condition_size_mm")),
        "length_mode": _to_clean_str(row.get("length_mode") or "none").lower() or "none",
        "fixed_length_mm": _to_int(row.get("fixed_length_mm")),
        "active": bool(row.get("active")),
        "sort_order": int(row.get("sort_order") or 0),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
        "updated_by": _to_optional_updated_by(row.get("updated_by")),
    }


def _list_quick_quoter_repair_types(supabase: Any) -> list[dict[str, Any]]:
    resp = (
        supabase.table("quick_quoter_repair_types")
        .select("id, label, active, sort_order, requires_profile, requires_size_mm, created_at, updated_at, updated_by")
        .order("sort_order")
        .order("id")
        .execute()
    )
    return [_serialize_quick_quoter_repair_type(dict(row)) for row in (resp.data or [])]


def _list_quick_quoter_templates(supabase: Any) -> list[dict[str, Any]]:
    resp = (
        supabase.table("quick_quoter_part_templates")
        .select(
            "id, repair_type_id, product_id, qty_per_unit, condition_profile, "
            "condition_size_mm, length_mode, fixed_length_mm, active, sort_order, "
            "created_at, updated_at, updated_by"
        )
        .order("repair_type_id")
        .order("sort_order")
        .order("id")
        .execute()
    )
    return [_serialize_quick_quoter_template(dict(row)) for row in (resp.data or [])]


def get_quick_quoter_material_rules(supabase: Any) -> dict[str, Any]:
    return {
        "repair_types": _list_quick_quoter_repair_types(supabase),
        "templates": _list_quick_quoter_templates(supabase),
    }


def _normalize_quick_quoter_repair_types(payload: Any) -> list[dict[str, Any]]:
    errors: list[dict[str, Any]] = []
    if not isinstance(payload, list):
        raise MaterialRulesValidationError([
            _validation_error("invalid_payload", "repair_types must be an array.", "repair_types"),
        ])
    if len(payload) == 0:
        raise MaterialRulesValidationError([
            _validation_error("empty_payload", "repair_types cannot be empty.", "repair_types"),
        ])

    out: list[dict[str, Any]] = []
    seen_ids: set[str] = set()

    for index, raw in enumerate(payload):
        if not isinstance(raw, dict):
            errors.append(_validation_error("invalid_row", "Each repair type must be an object.", "repair_types", index))
            continue

        repair_type_id = _to_clean_str(raw.get("id"))
        label = _to_clean_str(raw.get("label"))
        active = _to_bool(raw.get("active"))
        sort_order = _to_int(raw.get("sort_order"))
        requires_profile = _to_bool(raw.get("requires_profile"))
        requires_size_mm = _to_bool(raw.get("requires_size_mm"))

        if not repair_type_id:
            errors.append(_validation_error("missing_id", "id is required.", "repair_types.id", index))
        elif repair_type_id in seen_ids:
            errors.append(_validation_error("duplicate_id", f"Duplicate id: {repair_type_id}", "repair_types.id", index))

        if not label:
            errors.append(_validation_error("missing_label", "label is required.", "repair_types.label", index))

        if active is None:
            errors.append(_validation_error("invalid_active", "active must be true or false.", "repair_types.active", index))

        if sort_order is None:
            errors.append(_validation_error("invalid_sort_order", "sort_order must be an integer.", "repair_types.sort_order", index))

        if requires_profile is None:
            errors.append(
                _validation_error(
                    "invalid_requires_profile",
                    "requires_profile must be true or false.",
                    "repair_types.requires_profile",
                    index,
                )
            )

        if requires_size_mm is None:
            errors.append(
                _validation_error(
                    "invalid_requires_size_mm",
                    "requires_size_mm must be true or false.",
                    "repair_types.requires_size_mm",
                    index,
                )
            )

        if repair_type_id and label and active is not None and sort_order is not None and requires_profile is not None and requires_size_mm is not None:
            seen_ids.add(repair_type_id)
            out.append(
                {
                    "id": repair_type_id,
                    "label": label,
                    "active": active,
                    "sort_order": sort_order,
                    "requires_profile": requires_profile,
                    "requires_size_mm": requires_size_mm,
                }
            )

    if errors:
        raise MaterialRulesValidationError(errors)
    return out


def _normalize_quick_quoter_templates(payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, list):
        raise MaterialRulesValidationError([
            _validation_error("invalid_payload", "templates must be an array.", "templates"),
        ])

    errors: list[dict[str, Any]] = []
    out: list[dict[str, Any]] = []
    seen_ids: set[str] = set()

    for index, raw in enumerate(payload):
        if not isinstance(raw, dict):
            errors.append(_validation_error("invalid_row", "Each template must be an object.", "templates", index))
            continue

        template_id = _to_clean_str(raw.get("id"))
        if template_id:
            try:
                template_id = str(uuid_lib.UUID(template_id))
            except ValueError:
                errors.append(_validation_error("invalid_id", "id must be a UUID.", "templates.id", index))
                template_id = ""
        else:
            template_id = str(uuid_lib.uuid4())

        repair_type_id = _to_clean_str(raw.get("repair_type_id"))
        product_id = _to_clean_str(raw.get("product_id"))
        qty_per_unit = _to_float(raw.get("qty_per_unit"))
        condition_profile = _to_optional_profile(raw.get("condition_profile"))
        condition_size_mm = _to_int(raw.get("condition_size_mm"))
        length_mode = _to_clean_str(raw.get("length_mode") or "none").lower()
        fixed_length_mm_raw = raw.get("fixed_length_mm")
        active = _to_bool(raw.get("active"))
        sort_order = _to_int(raw.get("sort_order"))

        if template_id in seen_ids:
            errors.append(_validation_error("duplicate_id", f"Duplicate id: {template_id}", "templates.id", index))

        if not repair_type_id:
            errors.append(_validation_error("missing_repair_type_id", "repair_type_id is required.", "templates.repair_type_id", index))

        if not product_id:
            errors.append(_validation_error("missing_product_id", "product_id is required.", "templates.product_id", index))

        if qty_per_unit is None or qty_per_unit < 0:
            errors.append(_validation_error("invalid_qty_per_unit", "qty_per_unit must be a number >= 0.", "templates.qty_per_unit", index))

        if condition_profile is not None and condition_profile not in VALID_QUICK_QUOTER_PROFILES:
            errors.append(
                _validation_error(
                    "invalid_condition_profile",
                    "condition_profile must be SC, CL, or empty.",
                    "templates.condition_profile",
                    index,
                )
            )

        if condition_size_mm is not None and condition_size_mm not in VALID_QUICK_QUOTER_SIZES:
            errors.append(
                _validation_error(
                    "invalid_condition_size_mm",
                    "condition_size_mm must be 65, 80, or empty.",
                    "templates.condition_size_mm",
                    index,
                )
            )

        if length_mode not in VALID_QUICK_QUOTER_LENGTH_MODES:
            errors.append(
                _validation_error(
                    "invalid_length_mode",
                    "length_mode must be none, missing_measurement, or fixed_mm.",
                    "templates.length_mode",
                    index,
                )
            )

        fixed_length_mm: Optional[int] = None
        if length_mode == "fixed_mm":
            fixed_length_mm = _to_int(fixed_length_mm_raw)
            if fixed_length_mm is None or fixed_length_mm <= 0:
                errors.append(
                    _validation_error(
                        "invalid_fixed_length_mm",
                        "fixed_length_mm must be a positive integer when length_mode=fixed_mm.",
                        "templates.fixed_length_mm",
                        index,
                    )
                )
        else:
            if fixed_length_mm_raw not in (None, ""):
                errors.append(
                    _validation_error(
                        "fixed_length_mm_not_allowed",
                        "fixed_length_mm must be empty unless length_mode=fixed_mm.",
                        "templates.fixed_length_mm",
                        index,
                    )
                )

        if active is None:
            errors.append(_validation_error("invalid_active", "active must be true or false.", "templates.active", index))

        if sort_order is None:
            errors.append(_validation_error("invalid_sort_order", "sort_order must be an integer.", "templates.sort_order", index))

        if (
            template_id
            and template_id not in seen_ids
            and repair_type_id
            and product_id
            and qty_per_unit is not None
            and qty_per_unit >= 0
            and (condition_profile is None or condition_profile in VALID_QUICK_QUOTER_PROFILES)
            and (condition_size_mm is None or condition_size_mm in VALID_QUICK_QUOTER_SIZES)
            and length_mode in VALID_QUICK_QUOTER_LENGTH_MODES
            and active is not None
            and sort_order is not None
            and (length_mode != "fixed_mm" or (fixed_length_mm is not None and fixed_length_mm > 0))
            and (length_mode == "fixed_mm" or fixed_length_mm_raw in (None, ""))
        ):
            seen_ids.add(template_id)
            out.append(
                {
                    "id": template_id,
                    "repair_type_id": repair_type_id,
                    "product_id": product_id,
                    "qty_per_unit": qty_per_unit,
                    "condition_profile": condition_profile,
                    "condition_size_mm": condition_size_mm,
                    "length_mode": length_mode,
                    "fixed_length_mm": fixed_length_mm,
                    "active": active,
                    "sort_order": sort_order,
                }
            )

    if errors:
        raise MaterialRulesValidationError(errors)

    return out


def save_quick_quoter_repair_types(
    supabase: Any,
    payload: Any,
    *,
    actor_user_id: str,
) -> list[dict[str, Any]]:
    rows = _normalize_quick_quoter_repair_types(payload)

    existing_resp = supabase.table("quick_quoter_repair_types").select("id").execute()
    existing_ids = {
        _to_clean_str((row or {}).get("id"))
        for row in (existing_resp.data or [])
        if _to_clean_str((row or {}).get("id"))
    }

    now_iso = _now_iso()
    to_upsert = [
        {
            **row,
            "updated_at": now_iso,
            "updated_by": actor_user_id,
        }
        for row in rows
    ]
    supabase.table("quick_quoter_repair_types").upsert(to_upsert, on_conflict="id").execute()

    incoming_ids = {row["id"] for row in rows}
    stale_ids = sorted(existing_ids - incoming_ids)
    for stale_id in stale_ids:
        supabase.table("quick_quoter_repair_types").delete().eq("id", stale_id).execute()

    return _list_quick_quoter_repair_types(supabase)


def save_quick_quoter_templates(
    supabase: Any,
    payload: Any,
    *,
    actor_user_id: str,
) -> list[dict[str, Any]]:
    rows = _normalize_quick_quoter_templates(payload)

    repair_type_ids = {row["repair_type_id"] for row in rows}
    existing_repair_type_ids = _fetch_existing_ids(supabase, "quick_quoter_repair_types", repair_type_ids)
    missing_repair_type_ids = sorted(repair_type_ids - existing_repair_type_ids)
    if missing_repair_type_ids:
        raise MaterialRulesValidationError(
            [
                _validation_error(
                    "unknown_repair_type_id",
                    f"Unknown repair_type_id: {rid}",
                    "templates.repair_type_id",
                )
                for rid in missing_repair_type_ids
            ]
        )

    product_ids = {row["product_id"] for row in rows}
    existing_product_ids = _fetch_existing_ids(supabase, "products", product_ids)
    missing_product_ids = sorted(product_ids - existing_product_ids)
    if missing_product_ids:
        raise MaterialRulesValidationError(
            [
                _validation_error(
                    "unknown_product_id",
                    f"Unknown product_id: {pid}",
                    "templates.product_id",
                )
                for pid in missing_product_ids
            ]
        )

    existing_resp = supabase.table("quick_quoter_part_templates").select("id").execute()
    existing_ids = {
        _to_clean_str((row or {}).get("id"))
        for row in (existing_resp.data or [])
        if _to_clean_str((row or {}).get("id"))
    }

    now_iso = _now_iso()
    to_upsert = [
        {
            **row,
            "updated_at": now_iso,
            "updated_by": actor_user_id,
        }
        for row in rows
    ]
    if to_upsert:
        supabase.table("quick_quoter_part_templates").upsert(to_upsert, on_conflict="id").execute()

    incoming_ids = {row["id"] for row in rows}
    stale_ids = sorted(existing_ids - incoming_ids)
    for stale_id in stale_ids:
        supabase.table("quick_quoter_part_templates").delete().eq("id", stale_id).execute()

    return _list_quick_quoter_templates(supabase)


def _default_measured_rules_payload() -> dict[str, Any]:
    return {
        "id": 1,
        **{key: DEFAULT_GUTTER_ACCESSORY_RULES[key] for key in DEFAULT_GUTTER_ACCESSORY_RULES},
        "updated_at": None,
        "updated_by": None,
    }


def _serialize_measured_rules(row: dict[str, Any]) -> dict[str, Any]:
    defaults = _default_measured_rules_payload()
    out = {"id": 1}

    for key in (
        "bracket_spacing_mm",
        "clip_spacing_mm",
        "screws_per_bracket",
        "screws_per_dropper",
        "screws_per_saddle_clip",
        "screws_per_adjustable_clip",
    ):
        parsed = _to_int(row.get(key))
        out[key] = parsed if parsed is not None else defaults[key]

    for key in MEASURED_RULE_PRODUCT_FIELDS:
        text = _to_clean_str(row.get(key))
        out[key] = text or defaults[key]

    mode = _to_clean_str(row.get("clip_selection_mode") or defaults["clip_selection_mode"]).lower()
    if mode not in VALID_CLIP_SELECTION_MODES:
        mode = defaults["clip_selection_mode"]
    out["clip_selection_mode"] = mode

    out["updated_at"] = row.get("updated_at")
    out["updated_by"] = _to_optional_updated_by(row.get("updated_by"))
    return out


def get_measured_material_rules(supabase: Any) -> Optional[dict[str, Any]]:
    resp = (
        supabase.table("measured_material_rules")
        .select(
            "id, bracket_spacing_mm, clip_spacing_mm, screws_per_bracket, "
            "screws_per_dropper, screws_per_saddle_clip, screws_per_adjustable_clip, "
            "screw_product_id, bracket_product_id_sc, bracket_product_id_cl, "
            "saddle_clip_product_id_65, saddle_clip_product_id_80, "
            "adjustable_clip_product_id_65, adjustable_clip_product_id_80, "
            "clip_selection_mode, updated_at, updated_by"
        )
        .eq("id", 1)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    if not rows:
        return None
    return _serialize_measured_rules(dict(rows[0]))


def get_measured_material_rules_or_defaults(supabase: Any) -> dict[str, Any]:
    rules = get_measured_material_rules(supabase)
    if rules:
        return rules
    return _default_measured_rules_payload()


def get_measured_material_rules_for_quote(supabase: Any) -> Optional[dict[str, Any]]:
    rules = get_measured_material_rules(supabase)
    if not rules:
        return None
    return {key: rules.get(key) for key in DEFAULT_GUTTER_ACCESSORY_RULES}


def _normalize_measured_rules(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise MaterialRulesValidationError([
            _validation_error("invalid_payload", "rules must be an object.", "rules"),
        ])

    errors: list[dict[str, Any]] = []
    out: dict[str, Any] = {}

    positive_int_fields = {
        "bracket_spacing_mm",
        "clip_spacing_mm",
    }
    non_negative_int_fields = {
        "screws_per_bracket",
        "screws_per_dropper",
        "screws_per_saddle_clip",
        "screws_per_adjustable_clip",
    }

    for field in sorted(positive_int_fields | non_negative_int_fields):
        parsed = _to_int(payload.get(field))
        if parsed is None:
            errors.append(_validation_error("invalid_integer", f"{field} must be an integer.", f"rules.{field}"))
            continue
        if field in positive_int_fields and parsed <= 0:
            errors.append(_validation_error("must_be_positive", f"{field} must be > 0.", f"rules.{field}"))
            continue
        if field in non_negative_int_fields and parsed < 0:
            errors.append(_validation_error("must_be_non_negative", f"{field} must be >= 0.", f"rules.{field}"))
            continue
        out[field] = parsed

    for field in MEASURED_RULE_PRODUCT_FIELDS:
        text = _to_clean_str(payload.get(field))
        if not text:
            errors.append(_validation_error("missing_product_id", f"{field} is required.", f"rules.{field}"))
            continue
        out[field] = text

    mode = _to_clean_str(payload.get("clip_selection_mode")).lower()
    if mode not in VALID_CLIP_SELECTION_MODES:
        errors.append(
            _validation_error(
                "invalid_clip_selection_mode",
                "clip_selection_mode must be auto_by_acl_presence, force_saddle, or force_adjustable.",
                "rules.clip_selection_mode",
            )
        )
    else:
        out["clip_selection_mode"] = mode

    if errors:
        raise MaterialRulesValidationError(errors)

    product_ids = {out[field] for field in MEASURED_RULE_PRODUCT_FIELDS}
    return out | {"_product_ids": product_ids}


def save_measured_material_rules(
    supabase: Any,
    payload: Any,
    *,
    actor_user_id: str,
) -> dict[str, Any]:
    normalized = _normalize_measured_rules(payload)
    product_ids = set(normalized.pop("_product_ids", set()))

    existing_product_ids = _fetch_existing_ids(supabase, "products", product_ids)
    missing_product_ids = sorted(product_ids - existing_product_ids)
    if missing_product_ids:
        raise MaterialRulesValidationError(
            [
                _validation_error(
                    "unknown_product_id",
                    f"Unknown product_id: {pid}",
                    "rules.product_id",
                )
                for pid in missing_product_ids
            ]
        )

    payload_to_save = {
        "id": 1,
        **normalized,
        "updated_at": _now_iso(),
        "updated_by": actor_user_id,
    }
    supabase.table("measured_material_rules").upsert(payload_to_save, on_conflict="id").execute()

    return get_measured_material_rules_or_defaults(supabase)
