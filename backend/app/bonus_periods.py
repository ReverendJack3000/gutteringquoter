"""
Bonus period management (Section 59.5).
CRUD for public.bonus_periods: period_name, start_date, end_date, status (open/processing/closed).
"""
import logging
from datetime import date
from typing import Any, Optional

logger = logging.getLogger(__name__)

BONUS_PERIOD_STATUSES = ("open", "processing", "closed")


def list_periods(supabase: Any) -> list[dict[str, Any]]:
    """Return all bonus_periods ordered by start_date descending."""
    resp = supabase.table("bonus_periods").select("id, period_name, start_date, end_date, status, created_at").order("start_date", desc=True).execute()
    rows = resp.data or []
    return [dict(r) for r in rows]


def create_period(
    supabase: Any,
    period_name: str,
    start_date: date,
    end_date: date,
    status: str = "open",
) -> dict[str, Any]:
    """Insert one bonus_period. Status must be open|processing|closed. Returns created row."""
    if status not in BONUS_PERIOD_STATUSES:
        raise ValueError(f"status must be one of {BONUS_PERIOD_STATUSES}")
    payload = {
        "period_name": period_name.strip(),
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "status": status,
    }
    resp = supabase.table("bonus_periods").insert(payload).execute()
    if not resp.data or len(resp.data) == 0:
        raise RuntimeError("bonus_periods insert returned no data")
    return dict(resp.data[0])


def update_period(
    supabase: Any,
    period_id: str,
    period_name: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    status: Optional[str] = None,
) -> dict[str, Any]:
    """Update bonus_period by id. Only provided fields are updated. Returns updated row."""
    if status is not None and status not in BONUS_PERIOD_STATUSES:
        raise ValueError(f"status must be one of {BONUS_PERIOD_STATUSES}")
    updates = {}
    if period_name is not None:
        updates["period_name"] = period_name.strip()
    if start_date is not None:
        updates["start_date"] = start_date.isoformat()
    if end_date is not None:
        updates["end_date"] = end_date.isoformat()
    if status is not None:
        updates["status"] = status
    if not updates:
        # Fetch and return existing
        resp = supabase.table("bonus_periods").select("*").eq("id", period_id).execute()
        if not resp.data or len(resp.data) == 0:
            raise LookupError("Period not found")
        return dict(resp.data[0])
    resp = supabase.table("bonus_periods").update(updates).eq("id", period_id).execute()
    if not resp.data or len(resp.data) == 0:
        raise LookupError("Period not found")
    return dict(resp.data[0])
