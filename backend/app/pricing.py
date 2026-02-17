"""
Product pricing for quote generation. Reads cost_price, markup_percentage, unit from Supabase (public.products).
"""
import logging
from typing import TypedDict

from app.supabase_client import get_supabase

logger = logging.getLogger(__name__)


class ProductPricing(TypedDict):
    id: str
    name: str
    cost_price: float
    markup_percentage: float
    unit: str


def get_product_pricing(product_ids: list[str]) -> dict[str, ProductPricing]:
    """
    Return pricing for the given product IDs. Queries public.products for
    id, name, cost_price, markup_percentage, unit. Missing products are logged
    and omitted from the result.
    """
    if not product_ids:
        return {}
    supabase = get_supabase()
    try:
        query = supabase.table("products").select(
            "id, name, cost_price, markup_percentage, unit"
        ).in_("id", product_ids)
        resp = query.execute()
        rows = resp.data or []
    except Exception as e:
        logger.exception("Failed to fetch product pricing from Supabase: %s", e)
        raise

    found_ids = set()
    result = {}
    for r in rows:
        pid = r.get("id")
        if not pid:
            continue
        found_ids.add(pid)
        cost = r.get("cost_price")
        # Allow 0; treat None as missing for quote calculation
        if cost is None:
            logger.warning("Product %s has no cost_price; skipping for pricing.", pid)
            continue
        result[str(pid)] = {
            "id": str(pid),
            "name": r.get("name", ""),
            "cost_price": float(cost),
            "markup_percentage": float(r.get("markup_percentage") or 0),
            "unit": r.get("unit") or "each",
        }
    missing = set(product_ids) - found_ids
    if missing:
        logger.warning("Products not found for pricing: %s", missing)
    return result
