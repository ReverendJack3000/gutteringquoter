"""
CSV product import. Parses cost/price CSV, derives profile, and upserts into public.products.
"""
import csv
import logging
import re
from io import StringIO
from typing import List, Optional, Tuple

from app.supabase_client import get_supabase

logger = logging.getLogger(__name__)

REQUIRED_HEADERS = frozenset({"Item Number", "Servicem8 Material_uuid", "Item Name", "Purchase Cost", "Price"})

# Map product type keywords (in name) to category
CATEGORY_MAP = [
    (r"\bgutter\b", "channel"),
    (r"\bbracket\b", "fixing"),
    (r"\bstopend\b", "fitting"),
    (r"\boutlet\b", "fitting"),
    (r"\bcorner\b", "fitting"),
    (r"\bjoiner\b", "fitting"),
    (r"\bdownpipe\b", "pipe"),
    (r"\bclip\b", "fixing"),
    (r"\belbow\b", "fitting"),
    (r"\bscrew\b", "fixing"),
    (r"\bglue\b", "consumable"),
    (r"\bsealant\b", "consumable"),
    (r"\bexpansion\b", "fitting"),
    (r"\bdropper\b", "fitting"),
]
DEFAULT_CATEGORY = "material"
CONSUMABLE_IDS = frozenset({"SCR-SS", "GL-MAR", "MS-GRY"})
PLACEHOLDER_ASSET = "/assets/marley/gutter.svg"

# Map product id (item_number) to diagram/thumbnail path. Order matters: more specific first.
# Consumables use placeholder (not shown on canvas).
DIAGRAM_MAP = [
    ("GUT-SC-MAR", "/assets/marley/gutter-storm-cloud.svg"),
    ("GUT-CL-MAR", "/assets/marley/gutter-classic.svg"),
    ("EC-SC-MAR", "/assets/marley/corner-external-storm-cloud.svg"),
    ("EC-CL-MAR", "/assets/marley/corner-external-classic.svg"),
    ("IC-SC-MAR", "/assets/marley/corner-internal-storm-cloud.svg"),
    ("IC-CL-MAR", "/assets/marley/corner-internal-classic.svg"),
    ("EJ-SC-MAR", "/assets/marley/joiner-expansion-storm-cloud.svg"),
    ("EJ-CL-MAR", "/assets/marley/joiner-expansion-classic.svg"),
    ("J-SC-MAR", "/assets/marley/joiner-storm-cloud.svg"),
    ("J-CL-MAR", "/assets/marley/joiner-classic.svg"),
    ("LSE-SC-MAR", "/assets/marley/stopend-left-storm-cloud.svg"),
    ("RSE-SC-MAR", "/assets/marley/stopend-right-storm-cloud.svg"),
    ("LSE-CL-MAR", "/assets/marley/stopend-left-classic.svg"),
    ("RSE-CL-MAR", "/assets/marley/stopend-right-classic.svg"),
    ("EO-SC-MAR-65", "/assets/marley/outlet-65-storm-cloud.svg"),
    ("EO-SC-MAR-80", "/assets/marley/outlet-80-storm-cloud.svg"),
    ("EO-CL-MAR-65", "/assets/marley/outlet-65-classic.svg"),
    ("EO-CL-MAR-80", "/assets/marley/outlet-80-classic.svg"),
    ("BRK-SC-MAR", "/assets/marley/bracket-storm-cloud.svg"),
    ("BRK-CL-MAR", "/assets/marley/bracket-classic.svg"),
    ("DPJ-65", "/assets/marley/downpipe-joiner-65.svg"),
    ("DPJ-80", "/assets/marley/downpipe-joiner-80.svg"),
    ("DP-65-", "/assets/marley/downpipe-65.svg"),
    ("DP-80-", "/assets/marley/downpipe-80.svg"),
    ("EL43-65", "/assets/marley/elbow-43-65.svg"),
    ("EL43-80", "/assets/marley/elbow-43-80.svg"),
    ("EL95-65", "/assets/marley/elbow-95-65.svg"),
    ("EL95-80", "/assets/marley/elbow-95-80.svg"),
    ("ACL-65", "/assets/marley/clip-adjustable-65.svg"),
    ("ACL-80", "/assets/marley/clip-adjustable-80.svg"),
    ("SCL-65", "/assets/marley/clip-saddle-65.svg"),
    ("SCL-80", "/assets/marley/clip-saddle-80.svg"),
]


def _diagram_url_for_product(item_number: str) -> str:
    """Return diagram/thumbnail URL for product. Consumables use placeholder."""
    if item_number in CONSUMABLE_IDS:
        return PLACEHOLDER_ASSET
    for prefix, path in DIAGRAM_MAP:
        if item_number.startswith(prefix) or item_number == prefix.rstrip("-"):
            return path
    return PLACEHOLDER_ASSET


def _parse_price(s: str) -> Optional[float]:
    """Extract numeric value from '0.16$ exc GST' or '23.51$ exc GST'."""
    if not s or not isinstance(s, str):
        return None
    s = s.strip()
    m = re.search(r"([\d.]+)", s)
    return float(m.group(1)) if m else None


def _derive_profile(item_number: str, name: str) -> str:
    """Derive profile from item_number or name. Returns 'storm_cloud' | 'classic' | 'other'."""
    name_lower = (name or "").lower()
    if "storm cloud" in name_lower:
        return "storm_cloud"
    if "classic" in name_lower:
        return "classic"
    # Check for SC/CL as tokens (avoid SCL->storm_cloud, ACL->classic)
    tokens = re.split(r"[-_]", (item_number or "").upper())
    if "SC" in tokens:
        return "storm_cloud"
    if "CL" in tokens:
        return "classic"
    return "other"


def _derive_category(name: str) -> str:
    """Derive category from product name."""
    name_lower = (name or "").lower()
    for pattern, cat in CATEGORY_MAP:
        if re.search(pattern, name_lower):
            return cat
    return DEFAULT_CATEGORY


def _parse_csv_rows(content: str) -> Tuple[List[dict], List[str]]:
    """
    Parse CSV content. Returns (rows, errors).
    Rows are dicts with keys: item_number, servicem8_material_uuid, name, cost_price, price_exc_gst, profile, category.
    """
    errors = []
    rows = []
    try:
        reader = csv.DictReader(StringIO(content))
        raw_headers = reader.fieldnames or []
        headers = [h.strip() for h in raw_headers] if raw_headers else []
        missing = REQUIRED_HEADERS - frozenset(headers)
        if missing:
            errors.append(f"Missing required columns: {', '.join(sorted(missing))}")
            return rows, errors

        for i, raw_row in enumerate(reader):
            row_num = i + 2  # 1-based, skip header
            try:
                item_number = (raw_row.get("Item Number") or "").strip()
                if not item_number:
                    errors.append(f"Row {row_num}: Item Number is empty")
                    continue
                name = (raw_row.get("Item Name") or "").strip()
                if not name:
                    errors.append(f"Row {row_num}: Item Name is empty")
                    continue
                cost = _parse_price(raw_row.get("Purchase Cost") or "")
                price = _parse_price(raw_row.get("Price") or "")
                if cost is None:
                    errors.append(f"Row {row_num}: Invalid Purchase Cost '{raw_row.get('Purchase Cost')}'")
                    continue
                if price is None:
                    errors.append(f"Row {row_num}: Invalid Price '{raw_row.get('Price')}'")
                    continue
                profile = _derive_profile(item_number, name)
                category = _derive_category(name)
                rows.append({
                    "item_number": item_number,
                    "servicem8_material_uuid": (raw_row.get("Servicem8 Material_uuid") or "").strip() or None,
                    "name": name,
                    "cost_price": cost,
                    "price_exc_gst": price,
                    "profile": profile,
                    "category": category,
                })
            except Exception as e:
                errors.append(f"Row {row_num}: {e}")
    except csv.Error as e:
        errors.append(f"CSV parse error: {e}")
    return rows, errors


def import_products_from_csv(content: str) -> dict:
    """
    Parse CSV and upsert products into Supabase.
    Returns {success: bool, imported: int, updated: int, failed: int, errors: list[str]}.
    """
    rows, parse_errors = _parse_csv_rows(content)
    if parse_errors and not rows:
        return {"success": False, "imported": 0, "updated": 0, "failed": 0, "errors": parse_errors}

    errors = list(parse_errors)
    imported = 0
    updated = 0
    failed = 0

    supabase = get_supabase()
    for r in rows:
        try:
            # Use item_number as id for CSV products (no collision with gutter, downpipe, etc.)
            diagram_path = _diagram_url_for_product(r["item_number"])
            record = {
                "id": r["item_number"],
                "name": r["name"],
                "category": r["category"],
                "thumbnail_url": diagram_path,
                "diagram_url": diagram_path,
                "cost_price": r["cost_price"],
                "price_exc_gst": r["price_exc_gst"],
                "item_number": r["item_number"],
                "servicem8_material_uuid": r["servicem8_material_uuid"],
                "profile": r["profile"],
                "active": True,
            }
            # Upsert on id (item_number)
            resp = supabase.table("products").upsert(record, on_conflict="id").execute()
            if resp.data and len(resp.data) > 0:
                # Upsert returns the row; we can't easily tell insert vs update from response
                imported += 1
        except Exception as e:
            failed += 1
            errors.append(f"{r['item_number']}: {e}")
            logger.warning("Failed to upsert product %s: %s", r["item_number"], e)

    return {
        "success": len(errors) == 0,
        "imported": imported,
        "updated": 0,  # Supabase upsert doesn't distinguish; we count all as imported
        "failed": failed,
        "errors": errors,
    }
