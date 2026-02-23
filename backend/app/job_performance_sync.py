"""
Job performance sync (Section 59.6): scheduled cron sync from ServiceM8 Completed/Invoiced jobs.
Lists jobs from ServiceM8 API, resolves active quote per job, upserts into public.job_performance
with merge-before-upsert to preserve admin-edited fields.
"""
import logging
from typing import Any, Optional

from app.quotes import get_active_quote_for_job
from app.supabase_client import get_supabase
from app.servicem8 import get_sync_user_id, get_tokens, list_jobs

logger = logging.getLogger(__name__)

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
            row["invoiced_revenue_exc_gst"] = 0  # 59.7 will populate
            row["materials_cost"] = 0  # 59.7 will populate
            # Remove read-only / auto columns so Supabase doesn't complain
            row.pop("created_at", None)
            supabase.table("job_performance").upsert(row, on_conflict="servicem8_job_id").execute()
            rows_upserted += 1
        result["rows_upserted"] = rows_upserted
        result["success"] = True
    except Exception as e:
        logger.exception("job_performance_sync failed: %s", e)
        result["error"] = str(e)
    return result
