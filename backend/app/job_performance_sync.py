"""
Job performance sync (Section 59.6/59.7/59.8): scheduled cron sync from ServiceM8 Completed/Invoiced jobs.
Lists jobs from ServiceM8 API, resolves active quote per job, upserts into public.job_performance
with merge-before-upsert to preserve admin-edited fields. 59.7: populates invoiced_revenue_exc_gst
and materials_cost (our DB pricing with ServiceM8 fallback). 59.8: creates job_personnel baseline
from JobActivity (filter zero-duration stubs); does not overwrite existing rows.
"""
import logging
from datetime import datetime
from typing import Any, Optional

from app.quotes import get_active_quote_for_job
from app.supabase_client import get_supabase
from app.servicem8 import (
    get_sync_user_id,
    get_tokens,
    list_jobs,
    list_job_materials,
    list_job_activities,
    get_staff_uuid_to_technician_id_map,
)

logger = logging.getLogger(__name__)

# ServiceM8 total_invoice_amount is inc GST; we store ex-GST in job_performance.
GST_DIVISOR = 1.15


def _compute_materials_cost_from_job_materials(
    supabase: Any,
    job_materials: list[dict[str, Any]],
) -> float:
    """
    Sum materials cost for job_performance.materials_cost (59.7). Prefer our DB cost per line
    (product.cost_price * quantity) where product.servicem8_material_uuid matches; else use
    ServiceM8 line cost (displayed_cost or cost). Returns 0 if job_materials is empty or on error.
    """
    if not job_materials:
        return 0.0
    material_uuids = [
        (m.get("material_uuid") or m.get("uuid") or "").strip()
        for m in job_materials
    ]
    material_uuids = [u for u in material_uuids if u]
    product_cost_by_uuid: dict[str, float] = {}
    if material_uuids:
        try:
            resp = (
                supabase.table("products")
                .select("servicem8_material_uuid, cost_price")
                .in_("servicem8_material_uuid", material_uuids)
                .execute()
            )
            for r in (resp.data or []):
                uuid_val = (r.get("servicem8_material_uuid") or "").strip()
                cost = r.get("cost_price")
                if uuid_val and cost is not None:
                    try:
                        product_cost_by_uuid[uuid_val] = float(cost)
                    except (TypeError, ValueError):
                        pass
        except Exception as e:
            logger.debug(
                "Products lookup by servicem8_material_uuid failed (using ServiceM8 cost only): %s",
                e,
            )
    total = 0.0
    for m in job_materials:
        mat_uuid = (m.get("material_uuid") or m.get("uuid") or "").strip()
        try:
            qty = float(m.get("quantity") or 0)
        except (TypeError, ValueError):
            qty = 0.0
        our_cost = product_cost_by_uuid.get(mat_uuid) if mat_uuid else None
        if our_cost is not None:
            total += our_cost * qty
        else:
            # ServiceM8 fallback: displayed_cost or cost (assume line total; API may vary)
            raw = m.get("displayed_cost") or m.get("cost")
            if raw is not None:
                try:
                    total += float(raw)
                except (TypeError, ValueError):
                    pass
    return round(total, 2)


def _minutes_from_activity(activity: dict[str, Any]) -> int:
    """
    Extract logged minutes from a JobActivity record (59.8). Returns 0 for zero or missing duration
    so callers can filter out tap-in/tap-out stubs. Tries duration, total_minutes, minutes, or
    start/end datetime diff; field names may vary by API.
    """
    # Try explicit duration fields first (ServiceM8 may use one of these)
    for key in ("duration", "total_minutes", "minutes", "duration_minutes"):
        val = activity.get(key)
        if val is not None:
            try:
                m = int(round(float(val)))
                return max(0, m)
            except (TypeError, ValueError):
                pass
    # Try start/end if present
    start_raw = activity.get("start_date_time") or activity.get("start_datetime") or activity.get("start")
    end_raw = activity.get("end_date_time") or activity.get("end_datetime") or activity.get("end")
    if start_raw and end_raw:
        try:
            start_dt = datetime.fromisoformat(str(start_raw).replace("Z", "+00:00"))
            end_dt = datetime.fromisoformat(str(end_raw).replace("Z", "+00:00"))
            delta = end_dt - start_dt
            return max(0, int(round(delta.total_seconds() / 60)))
        except Exception:
            pass
    return 0


def _aggregate_activity_minutes_by_staff(activities: list[dict[str, Any]]) -> dict[str, int]:
    """
    Sum logged minutes per staff_uuid (59.8). Filters out zero-duration activity stubs.
    Returns dict: staff_uuid -> total_minutes.
    """
    by_staff: dict[str, int] = {}
    for a in activities:
        staff_uuid = (a.get("staff_uuid") or a.get("assigned_staff_uuid") or "").strip()
        if not staff_uuid:
            continue
        minutes = _minutes_from_activity(a)
        if minutes <= 0:
            continue  # Skip zero-duration stubs
        by_staff[staff_uuid] = by_staff.get(staff_uuid, 0) + minutes
    return by_staff


# Columns the sync is allowed to set; all other columns are preserved from existing row when present.
SYNC_OWNED_COLUMNS = frozenset({
    "servicem8_job_id",
    "servicem8_job_uuid",
    "quote_id",
    "quoted_labor_minutes",
    "status",
    "invoiced_revenue_exc_gst",
    "materials_cost",
})


def run_sync() -> dict[str, Any]:
    """
    Run one pass of job_performance sync: list Completed/Invoiced jobs from ServiceM8,
    resolve active quote per job, upsert into job_performance (merge-before-upsert).
    Returns a summary dict: success (bool), jobs_processed (int), rows_upserted (int), error (str or None).
    """
    result: dict[str, Any] = {
        "success": False,
        "jobs_processed": 0,
        "rows_upserted": 0,
        "error": None,
    }
    sync_user_id = get_sync_user_id()
    if not sync_user_id:
        result["error"] = "No sync user: set SERVICEM8_COMPANY_USER_ID or SERVICEM8_COMPANY_EMAIL"
        logger.warning("job_performance_sync: %s", result["error"])
        return result
    tokens = get_tokens(sync_user_id)
    if not tokens:
        result["error"] = "No ServiceM8 tokens for sync user (connect ServiceM8 in app first)"
        logger.warning("job_performance_sync: %s", result["error"])
        return result
    access_token = tokens["access_token"]
    supabase = get_supabase()

    # List Completed and Invoiced jobs; merge and dedupe by uuid
    completed = list_jobs(access_token, "Completed")
    invoiced = list_jobs(access_token, "Invoiced")
    seen_uuids: set[str] = set()
    jobs: list[dict[str, Any]] = []
    for j in completed + invoiced:
        uid = (j.get("uuid") or "").strip()
        if uid and uid not in seen_uuids:
            seen_uuids.add(uid)
            jobs.append(j)

    result["jobs_processed"] = len(jobs)
    rows_upserted = 0
    # 59.8: staff_uuid -> technician_id once per run (reused for job_personnel baseline)
    staff_uuid_to_technician_id: dict[str, Optional[str]] = {}
    try:
        staff_uuid_to_technician_id = get_staff_uuid_to_technician_id_map(access_token)
    except Exception as e:
        logger.warning("job_personnel baseline: could not build staff map: %s", e)
    try:
        for job in jobs:
            job_uuid = (job.get("uuid") or "").strip()
            generated_job_id = (job.get("generated_job_id") or "").strip()
            if not generated_job_id:
                continue
            # Active quote
            quote_row = get_active_quote_for_job(supabase, generated_job_id)
            quote_id: Optional[str] = str(quote_row["id"]) if quote_row and quote_row.get("id") else None
            labour_hours = float(quote_row["labour_hours"]) if quote_row and quote_row.get("labour_hours") is not None else 0.0
            quoted_labor_minutes = int(round(labour_hours * 60)) if quote_row else 0

            # Merge with existing row if present (preserve admin-edited fields)
            existing = (
                supabase.table("job_performance")
                .select("*")
                .eq("servicem8_job_id", generated_job_id[:32])
                .limit(1)
                .execute()
            )
            existing_rows = (existing.data or []) if hasattr(existing, "data") else []
            if existing_rows:
                row = dict(existing_rows[0])
            else:
                row = {}
            # Overlay only sync-owned columns
            row["servicem8_job_id"] = generated_job_id[:32]
            row["servicem8_job_uuid"] = job_uuid if job_uuid else None
            row["quote_id"] = quote_id
            row["quoted_labor_minutes"] = quoted_labor_minutes
            row["status"] = "draft"
            # 59.7: invoiced_revenue_exc_gst from job total_invoice_amount (inc GST → ex-GST)
            raw_revenue = job.get("total_invoice_amount")
            if raw_revenue is None:
                row["invoiced_revenue_exc_gst"] = 0
            else:
                try:
                    row["invoiced_revenue_exc_gst"] = round(float(raw_revenue) / GST_DIVISOR, 2)
                except (TypeError, ValueError):
                    row["invoiced_revenue_exc_gst"] = 0
            # 59.7: materials_cost from JobMaterials (our DB cost with ServiceM8 fallback)
            if job_uuid:
                job_materials = list_job_materials(access_token, job_uuid)
                row["materials_cost"] = _compute_materials_cost_from_job_materials(supabase, job_materials)
            else:
                row["materials_cost"] = 0
            # Remove read-only / auto columns so Supabase doesn't complain
            row.pop("created_at", None)
            upsert_resp = supabase.table("job_performance").upsert(
                row, on_conflict="servicem8_job_id"
            ).execute()
            rows_upserted += 1
            # 59.8: job_personnel baseline from JobActivity (insert only when no row exists)
            job_performance_id = None
            if upsert_resp.data and len(upsert_resp.data) > 0:
                job_performance_id = upsert_resp.data[0].get("id")
            if job_performance_id and job_uuid and staff_uuid_to_technician_id:
                try:
                    activities = list_job_activities(access_token, job_uuid)
                    minutes_by_staff = _aggregate_activity_minutes_by_staff(activities)
                    existing_personnel = (
                        supabase.table("job_personnel")
                        .select("technician_id")
                        .eq("job_performance_id", job_performance_id)
                        .execute()
                    )
                    existing_tech_ids = {
                        str(r["technician_id"]) for r in (existing_personnel.data or []) if r.get("technician_id")
                    }
                    for staff_uuid, total_minutes in minutes_by_staff.items():
                        technician_id = staff_uuid_to_technician_id.get(staff_uuid)
                        if not technician_id or technician_id in existing_tech_ids:
                            continue
                        supabase.table("job_personnel").insert(
                            {
                                "job_performance_id": job_performance_id,
                                "technician_id": technician_id,
                                "is_seller": False,
                                "is_executor": False,
                                "onsite_minutes": total_minutes,
                                "travel_shopping_minutes": 0,
                            }
                        ).execute()
                        existing_tech_ids.add(technician_id)
                except Exception as e:
                    logger.warning(
                        "job_personnel baseline failed for job_performance_id=%s: %s",
                        job_performance_id,
                        e,
                    )
        result["rows_upserted"] = rows_upserted
        result["success"] = True
    except Exception as e:
        logger.exception("job_performance_sync failed: %s", e)
        result["error"] = str(e)
    return result
