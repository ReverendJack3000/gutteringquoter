"""
Quote persistence for Section 59.19.
Insert into public.quotes when Add to Job or Create New Job succeeds.
"""
import logging
from typing import Any, Optional

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class QuoteMaterialLine(BaseModel):
    """One material line for quote items (exclude labour)."""

    id: str = Field(..., min_length=1, description="Product id")
    qty: float = Field(..., ge=0)
    name: Optional[str] = None
    item_number: Optional[str] = None
    servicem8_material_uuid: Optional[str] = None


def _material_lines_to_jsonb(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Build JSONB-safe list: each at least { id, qty }; include optional name, item_number, servicem8_material_uuid."""
    out = []
    for m in items:
        line = {"id": str(m.get("id", "")), "qty": float(m.get("qty", 0))}
        if m.get("name") is not None:
            line["name"] = str(m["name"])
        if m.get("item_number") is not None:
            line["item_number"] = str(m["item_number"])
        if m.get("servicem8_material_uuid") is not None:
            line["servicem8_material_uuid"] = str(m["servicem8_material_uuid"])
        out.append(line)
    return out


def insert_quote_for_job(
    supabase: Any,
    servicem8_job_id: str,
    servicem8_job_uuid: Optional[str],
    labour_hours: float,
    quote_total: float,
    material_cost: float,
    items: list[dict[str, Any]],
    *,
    created_by: Optional[str] = None,
    co_seller_user_id: Optional[str] = None,
) -> str:
    """
    Insert one row into public.quotes for a completed Add to Job or Create New Job.
    Stores job identifiers, labour_hours, total, materials_subtotal, items.
    Section 59.25: created_by (auth.users.id) for seller attribution when job is completed.
    Section 59.28: co_seller_user_id optional for Create New Job co-seller.
    Returns the new quote id (uuid string).
    """
    payload = {
        "servicem8_job_id": servicem8_job_id[:32] if servicem8_job_id else None,
        "servicem8_job_uuid": servicem8_job_uuid if servicem8_job_uuid else None,
        "labour_hours": labour_hours,
        "total": quote_total,
        "materials_subtotal": material_cost,
        "items": _material_lines_to_jsonb(items),
        "is_final_quote": False,
    }
    if created_by is not None:
        payload["created_by"] = created_by
    if co_seller_user_id is not None:
        payload["co_seller_user_id"] = co_seller_user_id
    resp = supabase.table("quotes").insert(payload).execute()
    if not resp.data or len(resp.data) == 0:
        raise RuntimeError("Supabase quotes insert returned no data")
    row = resp.data[0]
    quote_id = row.get("id")
    if not quote_id:
        raise RuntimeError("Supabase quotes insert did not return id")
    return str(quote_id)


def get_active_quote_for_job(supabase: Any, servicem8_job_id: str) -> Optional[dict[str, Any]]:
    """
    Return the active quote for a ServiceM8 job: latest by is_final_quote (true first) then updated_at.
    Used by job_performance sync (59.6) and future webhook. Returns row with id, labour_hours,
    and optionally created_by, co_seller_user_id (59.25/59.28 for seller attribution).
    """
    if not servicem8_job_id or not str(servicem8_job_id).strip():
        return None
    job_id = str(servicem8_job_id).strip()[:32]
    try:
        resp = (
            supabase.table("quotes")
            .select("id, labour_hours, created_by, co_seller_user_id")
            .eq("servicem8_job_id", job_id)
            .order("is_final_quote", desc=True)
            .order("updated_at", desc=True)
            .limit(1)
            .execute()
        )
        rows = (resp.data or []) if hasattr(resp, "data") else []
        return rows[0] if rows else None
    except Exception as e:
        logger.warning("get_active_quote_for_job failed for servicem8_job_id=%s: %s", job_id, e)
        return None
