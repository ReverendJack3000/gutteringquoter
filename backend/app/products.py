"""
Marley product definitions. Always reads from Supabase (public.products).
"""
import logging
from pathlib import Path
from typing import Optional, TypedDict

from app.supabase_client import get_supabase

logger = logging.getLogger(__name__)

# Diagram assets normalized to horizontal + tight crop (PNG). Use .png URL so selection box aligns with length.
NORMALIZED_DIAGRAM_STEMS = frozenset({
    "gutter-storm-cloud", "gutter-classic",
    "downpipe-65", "downpipe-80", "downpipe-joiner-65", "downpipe-joiner-80",
    "dropper",
})


def _diagram_url_with_normalized(diagram_url: str) -> str:
    """Use .png for assets that have been normalized (horizontal, tight crop)."""
    if not diagram_url or ".svg" not in diagram_url:
        return diagram_url
    stem = Path(diagram_url).stem
    if stem in NORMALIZED_DIAGRAM_STEMS:
        return diagram_url.replace(".svg", ".png")
    return diagram_url


class Product(TypedDict):
    id: str
    name: str
    category: str
    thumbnailUrl: str
    diagramUrl: str
    profile: Optional[str]


def _row_to_product(row: dict) -> Product:
    """Map DB row (snake_case) to API shape (camelCase)."""
    diagram_url = row.get("diagram_url", "")
    return {
        "id": row["id"],
        "name": row["name"],
        "category": row["category"],
        "thumbnailUrl": row.get("thumbnail_url", ""),
        "diagramUrl": _diagram_url_with_normalized(diagram_url),
        "profile": row.get("profile") or "other",
    }


def get_products(
    search: Optional[str] = None,
    category: Optional[str] = None,
    profile: Optional[str] = None,
) -> list[Product]:
    """Return products from Supabase (public.products). Optional search, category, profile filter."""
    supabase = get_supabase()
    try:
        query = supabase.table("products").select("id, name, category, thumbnail_url, diagram_url, profile")
        if profile and profile in ("storm_cloud", "classic", "other"):
            query = query.eq("profile", profile)
        resp = query.execute()
        rows = resp.data or []
        out = [_row_to_product(r) for r in rows]
    except Exception as e:
        logger.exception("Failed to fetch products from Supabase: %s", e)
        out = []

    if search:
        q = search.lower()
        out = [p for p in out if q in p["name"].lower() or q in p["id"].lower()]
    if category:
        out = [p for p in out if p["category"] == category]
    return out
