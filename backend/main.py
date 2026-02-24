"""
Quote App API – FastAPI backend.
Blueprint processing, product list, static frontend. API-ready for future integrations.
"""
import base64
import logging
import os
import uuid as uuid_lib
from datetime import date, datetime
from pathlib import Path
from typing import Any, Optional

from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile
from starlette.responses import RedirectResponse
from pydantic import BaseModel, Field

from app.auth import get_current_user_id, get_current_user_id_and_role, get_validated_payload, is_super_admin_from_payload, require_role
from app.bonus_dashboard import (
    build_badge_events,
    build_canonical_ledger_rows,
    compute_hot_streak,
    compute_per_technician_executor_gp,
    compute_per_technician_seller_gp,
    compute_technician_contribution_total,
    compute_total_contributed_gp,
    filter_eligible_period_jobs,
    group_personnel_by_job,
    select_current_period,
    select_period_jobs,
)
from app.blueprint_processor import process_blueprint
from app.csv_import import import_products_from_csv
from app.diagrams import (
    create_diagram,
    delete_diagram,
    get_diagram,
    list_diagrams,
    update_diagram,
)
from app.gutter_accessories import expand_elements_with_gutter_accessories
from app.pricing import get_product_pricing
from app.products import get_products
from app.bonus_periods import create_period, list_periods, update_period
from app.bonus_calc import compute_job_gp, compute_period_pot
from app.quotes import QuoteMaterialLine, insert_quote_for_job
from app.supabase_client import get_supabase
from app import servicem8 as sm8
from fastapi.middleware.cors import CORSMiddleware
import httpx
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

logger = logging.getLogger(__name__)

ALLOWED_APP_ROLES = {"viewer", "editor", "admin", "technician"}
ADMIN_USERS_PAGE_SIZE = 200


def _env_flag(name: str, default: bool = False) -> bool:
    """Parse environment flag from common truthy values."""
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _normalize_app_role(role: Any) -> str:
    value = str(role or "").strip().lower()
    if value in ALLOWED_APP_ROLES:
        return value
    return "viewer"


def _require_service_role_for_admin_permissions() -> None:
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if key:
        return
    raise HTTPException(
        503,
        "Admin user-permissions endpoints require SUPABASE_SERVICE_ROLE_KEY in backend environment.",
    )


def _to_iso8601(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, datetime):
        return value.isoformat()
    iso = getattr(value, "isoformat", None)
    if callable(iso):
        try:
            return iso()
        except Exception:
            return str(value)
    return str(value)


def _extract_auth_user_field(user: Any, field: str) -> Any:
    if user is None:
        return None
    if isinstance(user, dict):
        return user.get(field)
    return getattr(user, field, None)


def _extract_auth_users_from_list_response(response: Any) -> list[Any]:
    if response is None:
        return []
    if isinstance(response, list):
        return response
    if isinstance(response, dict):
        users = response.get("users")
        if isinstance(users, list):
            return users
        data = response.get("data")
        if isinstance(data, dict) and isinstance(data.get("users"), list):
            return data.get("users") or []
    users_attr = getattr(response, "users", None)
    if isinstance(users_attr, list):
        return users_attr
    data_attr = getattr(response, "data", None)
    if isinstance(data_attr, dict) and isinstance(data_attr.get("users"), list):
        return data_attr.get("users") or []
    nested_users = getattr(data_attr, "users", None) if data_attr is not None else None
    if isinstance(nested_users, list):
        return nested_users
    return []


def _get_super_admin_email() -> Optional[str]:
    """Super admin email from env (case-insensitive match). Protected from role change and removal."""
    raw = os.environ.get("SUPER_ADMIN_EMAIL", "").strip()
    return raw.lower() if raw else None


def _is_super_admin(auth_user: Any) -> bool:
    super_email = _get_super_admin_email()
    if not super_email:
        return False
    email = _extract_auth_user_field(auth_user, "email")
    if not email or not isinstance(email, str):
        return False
    return email.strip().lower() == super_email


def _serialize_auth_user_for_permissions(auth_user: Any, role: str) -> dict[str, Any]:
    user_id = str(_extract_auth_user_field(auth_user, "id") or "").strip()
    return {
        "user_id": user_id,
        "email": _extract_auth_user_field(auth_user, "email"),
        "role": _normalize_app_role(role),
        "is_super_admin": _is_super_admin(auth_user),
        "created_at": _to_iso8601(_extract_auth_user_field(auth_user, "created_at")),
        "last_sign_in_at": _to_iso8601(_extract_auth_user_field(auth_user, "last_sign_in_at")),
    }


def _is_admin_api_unavailable_error(exc: Exception) -> bool:
    msg = str(exc or "").lower()
    return any(
        marker in msg
        for marker in (
            "user not allowed",
            "not authorized",
            "insufficient",
            "service_role",
            "invalid api key",
            "permission denied",
            "forbidden",
        )
    )


def _is_auth_user_not_found_error(exc: Exception) -> bool:
    msg = str(exc or "").lower()
    return any(marker in msg for marker in ("not found", "no rows", "does not exist"))


def _list_auth_users_via_admin_api(supabase: Any) -> list[Any]:
    _require_service_role_for_admin_permissions()
    users: list[Any] = []
    page = 1
    use_pagination = True
    while True:
        try:
            if use_pagination:
                resp = supabase.auth.admin.list_users(
                    page=page,
                    per_page=ADMIN_USERS_PAGE_SIZE,
                )
            else:
                resp = supabase.auth.admin.list_users()
            batch = _extract_auth_users_from_list_response(resp)
        except TypeError:
            if not use_pagination:
                raise
            # Older client signatures may not accept page/per_page.
            use_pagination = False
            continue
        except Exception as e:
            if _is_admin_api_unavailable_error(e):
                raise HTTPException(
                    503,
                    "Admin user listing is unavailable. Ensure SUPABASE_SERVICE_ROLE_KEY is set and valid.",
                ) from e
            raise
        users.extend(batch)
        if not use_pagination:
            break
        if len(batch) < ADMIN_USERS_PAGE_SIZE:
            break
        page += 1
        if page > 1000:
            logger.warning("Stopping auth user pagination at page %s (safety cap).", page)
            break
    return users


def _load_profile_roles(supabase: Any) -> dict[str, str]:
    try:
        resp = supabase.table("profiles").select("user_id, role").execute()
    except Exception as e:
        logger.exception("Failed to read profiles for admin permissions listing: %s", e)
        raise
    roles: dict[str, str] = {}
    for row in resp.data or []:
        uid = str((row or {}).get("user_id") or "").strip()
        if not uid:
            continue
        roles[uid] = _normalize_app_role((row or {}).get("role"))
    return roles


def _get_profile_role_for_user(supabase: Any, user_id: str) -> str:
    try:
        resp = (
            supabase.table("profiles")
            .select("role")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
    except Exception as e:
        logger.exception("Failed to read profile role for user %s: %s", user_id, e)
        raise
    rows = resp.data or []
    if not rows:
        return "viewer"
    return _normalize_app_role(rows[0].get("role"))


def _ensure_not_demoting_last_admin(
    supabase: Any,
    *,
    target_user_id: str,
    current_role: str,
    next_role: str,
) -> None:
    if current_role != "admin" or next_role == "admin":
        return
    try:
        resp = supabase.table("profiles").select("user_id").eq("role", "admin").execute()
    except Exception as e:
        logger.exception("Failed to count admins while updating role for %s: %s", target_user_id, e)
        raise
    admin_user_ids = {
        str((row or {}).get("user_id") or "").strip()
        for row in (resp.data or [])
        if str((row or {}).get("user_id") or "").strip()
    }
    if target_user_id in admin_user_ids and len(admin_user_ids) <= 1:
        raise HTTPException(
            400,
            "Cannot change role: at least one admin must remain in public.profiles.",
        )


def _ensure_not_removing_last_admin(supabase: Any, target_user_id: str) -> None:
    """Raise 403 if target is an admin and is the only admin."""
    try:
        resp = supabase.table("profiles").select("user_id").eq("role", "admin").execute()
    except Exception as e:
        logger.exception("Failed to count admins before delete for %s: %s", target_user_id, e)
        raise
    admin_user_ids = {
        str((row or {}).get("user_id") or "").strip()
        for row in (resp.data or [])
        if str((row or {}).get("user_id") or "").strip()
    }
    if target_user_id in admin_user_ids and len(admin_user_ids) <= 1:
        raise HTTPException(
            403,
            "Cannot remove the last admin. At least one admin must remain.",
        )


BONUS_DASHBOARD_ALLOWED_ROLES = {"admin", "editor", "technician"}
BONUS_PERIOD_READ_STATUSES = ("open", "processing")
BONUS_JOB_PERFORMANCE_COLUMNS = (
    "id, servicem8_job_id, servicem8_job_uuid, bonus_period_id, status, created_at, "
    "invoiced_revenue_exc_gst, materials_cost, quoted_labor_minutes, "
    "is_callback, callback_reason, callback_cost, standard_parts_runs, "
    "seller_fault_parts_runs, missed_materials_cost, is_upsell"
)
BONUS_JOB_PERSONNEL_COLUMNS = (
    "id, job_performance_id, technician_id, is_seller, is_executor, is_spotter, "
    "onsite_minutes, travel_shopping_minutes"
)


def _require_bonus_dashboard_reader(
    user_id_and_role: tuple[uuid_lib.UUID, str] = Depends(get_current_user_id_and_role),
) -> tuple[str, str]:
    user_id, role = user_id_and_role
    normalized_role = _normalize_app_role(role)
    if normalized_role not in BONUS_DASHBOARD_ALLOWED_ROLES:
        raise HTTPException(
            403,
            "Insufficient permissions (required role: one of admin, editor, technician)",
        )
    return (str(user_id), normalized_role)


def _resolve_bonus_dashboard_technician_id(
    *,
    requested_technician_id: Optional[str],
    actor_user_id: str,
    actor_role: str,
) -> tuple[str, bool, bool]:
    """
    Resolve technician context for dashboard reads.
    - admin can override technician_id,
    - non-admin users are forced to self context.
    """
    requested = str(requested_technician_id or "").strip()
    is_admin = actor_role == "admin"
    if is_admin and requested:
        try:
            parsed = uuid_lib.UUID(requested)
        except (ValueError, TypeError):
            raise HTTPException(400, "technician_id must be a valid UUID")
        return (str(parsed), True, False)
    forced_self = (not is_admin) and bool(requested) and requested != actor_user_id
    return (actor_user_id, False, forced_self)


def _fetch_bonus_dashboard_period_rows(supabase: Any) -> list[dict[str, Any]]:
    resp = (
        supabase.table("bonus_periods")
        .select("id, period_name, start_date, end_date, status, created_at")
        .in_("status", list(BONUS_PERIOD_READ_STATUSES))
        .order("end_date", desc=True)
        .execute()
    )
    return [dict(row or {}) for row in (resp.data or [])]


def _resolve_bonus_dashboard_period(
    *,
    supabase: Any,
    period_rows: list[dict[str, Any]],
    requested_period_id: Optional[str],
) -> tuple[Optional[dict[str, Any]], str]:
    requested = str(requested_period_id or "").strip()
    if not requested:
        return select_current_period(period_rows)
    try:
        parsed_period_id = str(uuid_lib.UUID(requested))
    except (ValueError, TypeError):
        raise HTTPException(400, "period_id must be a valid UUID")
    resp = (
        supabase.table("bonus_periods")
        .select("id, period_name, start_date, end_date, status, created_at")
        .eq("id", parsed_period_id)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    if not rows:
        raise HTTPException(404, "Bonus period not found")
    period = dict(rows[0] or {})
    status = str(period.get("status") or "").strip().lower()
    if status not in ("open", "processing", "closed"):
        raise HTTPException(400, "period_id must reference an open, processing, or closed period")
    return (period, "explicit_period_id")


def _fetch_period_jobs_with_fallback(
    *,
    supabase: Any,
    period: dict[str, Any],
) -> list[dict[str, Any]]:
    period_id = str((period or {}).get("id") or "").strip()
    if not period_id:
        return []
    linked_resp = (
        supabase.table("job_performance")
        .select(BONUS_JOB_PERFORMANCE_COLUMNS)
        .eq("bonus_period_id", period_id)
        .order("created_at", desc=True)
        .execute()
    )
    start_date = str((period or {}).get("start_date") or "").strip()
    end_date = str((period or {}).get("end_date") or "").strip()
    fallback_rows: list[dict[str, Any]] = []
    if start_date and end_date:
        start_ts = f"{start_date}T00:00:00+00:00"
        end_ts = f"{end_date}T23:59:59.999999+00:00"
        fallback_resp = (
            supabase.table("job_performance")
            .select(BONUS_JOB_PERFORMANCE_COLUMNS)
            .is_("bonus_period_id", "null")
            .gte("created_at", start_ts)
            .lte("created_at", end_ts)
            .order("created_at", desc=True)
            .execute()
        )
        fallback_rows = [dict(row or {}) for row in (fallback_resp.data or [])]
    merged_by_id: dict[str, dict[str, Any]] = {}
    for row in (linked_resp.data or []):
        row_dict = dict(row or {})
        row_id = str(row_dict.get("id") or "").strip()
        if row_id:
            merged_by_id[row_id] = row_dict
    for row_dict in fallback_rows:
        row_id = str(row_dict.get("id") or "").strip()
        if row_id and row_id not in merged_by_id:
            merged_by_id[row_id] = row_dict
    return list(merged_by_id.values())


def _fetch_job_personnel_rows_for_jobs(
    *,
    supabase: Any,
    job_performance_ids: list[str],
) -> list[dict[str, Any]]:
    ids = [str(v or "").strip() for v in job_performance_ids if str(v or "").strip()]
    if not ids:
        return []
    resp = (
        supabase.table("job_personnel")
        .select(BONUS_JOB_PERSONNEL_COLUMNS)
        .in_("job_performance_id", ids)
        .execute()
    )
    return [dict(row or {}) for row in (resp.data or [])]


def _leaderboard_initials_from_display_name(display_name: str) -> str:
    """Derive two-character initials from display name (59.16.3)."""
    clean = (display_name or "").strip()
    if not clean:
        return "??"
    parts = clean.split()
    if len(parts) >= 2:
        return ((parts[0][:1] + parts[1][:1]).upper())[:2]
    return (clean[:2].upper())[:2] if len(clean) >= 2 else (clean[:1].upper() + "?")[:2]


def _resolve_technician_display_names(
    supabase: Any,
    technician_ids: list[str],
) -> dict[str, dict[str, str]]:
    """
    Resolve display_name and avatar_initials for technician IDs (59.16.3).
    Returns dict technician_id -> { "display_name", "avatar_initials" }.
    On auth unavailability or error, returns placeholders so dashboard never fails.
    """
    result: dict[str, dict[str, str]] = {}
    ids = [str(tid or "").strip() for tid in technician_ids if str(tid or "").strip()]
    if not ids:
        return result
    try:
        _require_service_role_for_admin_permissions()
        auth_users = _list_auth_users_via_admin_api(supabase)
        id_set = set(ids)
        for user in auth_users or []:
            uid = str(_extract_auth_user_field(user, "id") or "").strip()
            if uid not in id_set:
                continue
            meta = _extract_auth_user_field(user, "user_metadata")
            full_name = (meta.get("full_name") if isinstance(meta, dict) else None) or ""
            full_name = str(full_name).strip() if full_name else ""
            email = _extract_auth_user_field(user, "email")
            email = str(email).strip() if email else ""
            display_name = full_name or email or "Tech"
            result[uid] = {
                "display_name": display_name,
                "avatar_initials": _leaderboard_initials_from_display_name(display_name),
            }
    except HTTPException:
        pass
    except Exception:
        pass
    for tid in ids:
        if tid not in result:
            result[tid] = {"display_name": "Tech", "avatar_initials": "??"}
    placeholder_count = sum(
        1 for tid in ids
        if result.get(tid, {}).get("display_name") == "Tech" and result.get(tid, {}).get("avatar_initials") == "??"
    )
    if placeholder_count > 0:
        logger.debug(
            "Leaderboard display names: using placeholders for %d of %d technician(s)",
            placeholder_count,
            len(ids),
        )
    return result


def _build_provisional_technician_dashboard_payload(
    *,
    supabase: Any,
    period: Optional[dict[str, Any]],
    selection_reason: str,
    technician_id: str,
    actor_user_id: str,
    actor_role: str,
    forced_self_context: bool,
) -> dict[str, Any]:
    _now_iso = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    if not period:
        return {
            "is_provisional": True,
            "selection_reason": selection_reason,
            "expected_payout_status": "pending_final_rules",
            "period": None,
            "updated_at": _now_iso,
            "technician_context": {
                "technician_id": technician_id,
                "actor_user_id": actor_user_id,
                "actor_role": actor_role,
                "is_admin_override": False,
                "forced_self_context": forced_self_context,
            },
            "hero": {
                "total_team_pot": 0.0,
                "team_pot_delta": 0.0,
                "team_pot_delta_reason": None,
                "as_of": _now_iso,
                "hot_streak_count": 0,
                "hot_streak_active": False,
                "my_total_gp_contributed": 0.0,
                "my_expected_payout": None,
                "pending_reasons": [
                    "expected_payout_pending",
                    "final_rules_not_implemented",
                ],
            },
            "ledger": {
                "jobs": [],
                "job_count": 0,
                "empty_state": "No open or processing bonus period was found.",
            },
            "leaderboard": [],
            "leaderboard_sellers": [],
            "leaderboard_executors": [],
            "badge_events": build_badge_events([], {"hot_streak_count": 0, "hot_streak_active": False}),
            "streak": {"hot_streak_count": 0, "hot_streak_active": False},
        }
    period_jobs_source = _fetch_period_jobs_with_fallback(supabase=supabase, period=period)
    period_jobs = select_period_jobs(period, period_jobs_source)
    eligible_jobs = filter_eligible_period_jobs(period_jobs)
    period_job_ids = [
        str((job or {}).get("id") or "").strip()
        for job in eligible_jobs
        if str((job or {}).get("id") or "").strip()
    ]
    personnel_rows = _fetch_job_personnel_rows_for_jobs(
        supabase=supabase,
        job_performance_ids=period_job_ids,
    )
    personnel_by_job = group_personnel_by_job(personnel_rows)
    team_pot = compute_period_pot(eligible_jobs)
    ledger_rows = build_canonical_ledger_rows(
        eligible_jobs=eligible_jobs,
        personnel_by_job=personnel_by_job,
        technician_id=technician_id,
    )
    technician_gp = compute_technician_contribution_total(ledger_rows)
    total_contributed_gp = compute_total_contributed_gp(eligible_jobs, personnel_by_job)
    my_expected_payout = (
        round(team_pot * (technician_gp / total_contributed_gp), 2)
        if total_contributed_gp > 0
        else 0.0
    )
    callback_cost_total = round(
        sum(float((job or {}).get("callback_cost") or 0.0) for job in eligible_jobs),
        2,
    )
    period_status = str((period or {}).get("status") or "").strip().lower()
    expected_payout_status = "final" if period_status == "closed" else "computed"
    hero_pending_reasons = (
        [] if period_status == "closed" else ["payout_may_change_until_period_closed"]
    )
    # 59.16.3: build leaderboard (technician_id, display_name, avatar_initials, gp_contributed, share_of_team_pot, rank)
    technician_ids_leaderboard: list[str] = []
    for rows in personnel_by_job.values():
        for r in rows or []:
            tid = str((r or {}).get("technician_id") or "").strip()
            if tid and tid not in technician_ids_leaderboard:
                technician_ids_leaderboard.append(tid)
    leaderboard_rows: list[dict[str, Any]] = []
    for tid in technician_ids_leaderboard:
        ledger_for_tech = build_canonical_ledger_rows(
            eligible_jobs=eligible_jobs,
            personnel_by_job=personnel_by_job,
            technician_id=tid,
        )
        gp_contributed = compute_technician_contribution_total(ledger_for_tech)
        share_of_team_pot = (
            round(team_pot * (gp_contributed / total_contributed_gp), 2)
            if total_contributed_gp > 0
            else 0.0
        )
        leaderboard_rows.append({
            "technician_id": tid,
            "gp_contributed": gp_contributed,
            "share_of_team_pot": share_of_team_pot,
        })
    leaderboard_rows.sort(key=lambda row: (row["gp_contributed"], row["technician_id"]), reverse=True)
    for rank_one_based, row in enumerate(leaderboard_rows, start=1):
        row["rank"] = rank_one_based
    display_map = _resolve_technician_display_names(supabase, [r["technician_id"] for r in leaderboard_rows])
    leaderboard = []
    for row in leaderboard_rows:
        tid = row["technician_id"]
        info = display_map.get(tid) or {"display_name": "Tech", "avatar_initials": "??"}
        leaderboard.append({
            "technician_id": tid,
            "display_name": info["display_name"],
            "avatar_initials": info["avatar_initials"],
            "gp_contributed": row["gp_contributed"],
            "share_of_team_pot": row["share_of_team_pot"],
            "rank": row["rank"],
        })
    # 59.16.8: seller and executor leaderboards (same tech set, ranked by seller_base / executor_base)
    seller_gp_by_tech = compute_per_technician_seller_gp(eligible_jobs, personnel_by_job)
    executor_gp_by_tech = compute_per_technician_executor_gp(eligible_jobs, personnel_by_job)
    tech_ids = [r["technician_id"] for r in leaderboard_rows]
    seller_rows = [
        {"technician_id": tid, "gp_contributed": seller_gp_by_tech.get(tid, 0.0)}
        for tid in tech_ids
    ]
    seller_rows.sort(key=lambda r: (r["gp_contributed"], r["technician_id"]), reverse=True)
    for rank_one_based, row in enumerate(seller_rows, start=1):
        row["rank"] = rank_one_based
    leaderboard_sellers = []
    for row in seller_rows:
        tid = row["technician_id"]
        info = display_map.get(tid) or {"display_name": "Tech", "avatar_initials": "??"}
        gp = row["gp_contributed"]
        share = (
            round(team_pot * (gp / total_contributed_gp), 2)
            if total_contributed_gp > 0
            else 0.0
        )
        leaderboard_sellers.append({
            "technician_id": tid,
            "display_name": info["display_name"],
            "avatar_initials": info["avatar_initials"],
            "gp_contributed": gp,
            "share_of_team_pot": share,
            "rank": row["rank"],
        })
    executor_rows = [
        {"technician_id": tid, "gp_contributed": executor_gp_by_tech.get(tid, 0.0)}
        for tid in tech_ids
    ]
    executor_rows.sort(key=lambda r: (r["gp_contributed"], r["technician_id"]), reverse=True)
    for rank_one_based, row in enumerate(executor_rows, start=1):
        row["rank"] = rank_one_based
    leaderboard_executors = []
    for row in executor_rows:
        tid = row["technician_id"]
        info = display_map.get(tid) or {"display_name": "Tech", "avatar_initials": "??"}
        gp = row["gp_contributed"]
        share = (
            round(team_pot * (gp / total_contributed_gp), 2)
            if total_contributed_gp > 0
            else 0.0
        )
        leaderboard_executors.append({
            "technician_id": tid,
            "display_name": info["display_name"],
            "avatar_initials": info["avatar_initials"],
            "gp_contributed": gp,
            "share_of_team_pot": share,
            "rank": row["rank"],
        })
    streak = compute_hot_streak(
        eligible_jobs=eligible_jobs,
        personnel_by_job=personnel_by_job,
        technician_id=technician_id,
    )
    hero_dict = {
        "total_team_pot": team_pot,
        "team_pot_delta": 0.0,
        "team_pot_delta_reason": None,
        "as_of": _now_iso,
        "hot_streak_count": streak["hot_streak_count"],
        "hot_streak_active": streak["hot_streak_active"],
        "my_total_gp_contributed": technician_gp,
        "my_expected_payout": my_expected_payout,
        "period_job_count": len(eligible_jobs),
        "technician_job_count": len(ledger_rows),
        "callback_cost_total_raw": callback_cost_total,
        "pending_reasons": hero_pending_reasons,
    }
    badge_events = build_badge_events(ledger_rows, hero_dict)
    return {
        "is_provisional": False,
        "selection_reason": selection_reason,
        "expected_payout_status": expected_payout_status,
        "period": period,
        "updated_at": _now_iso,
        "technician_context": {
            "technician_id": technician_id,
            "actor_user_id": actor_user_id,
            "actor_role": actor_role,
            "is_admin_override": actor_role == "admin" and technician_id != actor_user_id,
            "forced_self_context": forced_self_context,
        },
        "hero": hero_dict,
        "ledger": {
            "jobs": ledger_rows,
            "job_count": len(ledger_rows),
            "empty_state": (
                "No jobs linked to this technician in the current period."
                if not ledger_rows
                else None
            ),
        },
        "leaderboard": leaderboard,
        "leaderboard_sellers": leaderboard_sellers,
        "leaderboard_executors": leaderboard_executors,
        "badge_events": badge_events,
        "streak": {"hot_streak_count": streak["hot_streak_count"], "hot_streak_active": streak["hot_streak_active"]},
    }


class QuoteElement(BaseModel):
    assetId: str = Field(..., min_length=1, description="Product ID (e.g. gutter, bracket)")
    quantity: float = Field(..., ge=0, description="Quantity for this product")
    length_mm: Optional[float] = Field(None, ge=0, description="Optional measured length in mm (used for bracket/screw and downpipe clip calculation)")


class CalculateQuoteRequest(BaseModel):
    elements: list[QuoteElement] = Field(default_factory=list, description="Material elements (assetId + quantity)")
    labour_elements: list[QuoteElement] = Field(default_factory=list, description="Labour lines (assetId e.g. REP-LAB, quantity = hours)")


class UpdatePricingItem(BaseModel):
    id: str = Field(..., min_length=1, description="Product ID")
    cost_price: float = Field(..., ge=0, description="Cost price (>= 0)")
    markup_percentage: float = Field(..., ge=0, le=1000, description="Markup percentage (0-1000)")


class UpdateUserPermissionRoleRequest(BaseModel):
    role: str = Field(..., min_length=1, description="Role: viewer | editor | admin | technician")


class InviteUserRequest(BaseModel):
    email: str = Field(..., min_length=1, description="Email address to invite")
    role: Optional[str] = Field("viewer", description="Default role: viewer | editor | admin | technician")


class SaveDiagramRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    data: dict[str, Any] = Field(..., description="Canvas state: elements, blueprintTransform, groups")
    blueprintImageBase64: Optional[str] = Field(None, description="PNG image as base64 data URL or raw base64")
    blueprintImageUrl: Optional[str] = Field(None, description="When base64 not sent (e.g. tainted canvas), copy from this storage URL to persist blueprint")
    thumbnailBase64: Optional[str] = Field(None, description="Thumbnail PNG as base64")
    servicem8JobId: Optional[str] = Field(None, max_length=32, description="ServiceM8 job number to stamp on the saved project")
    servicem8JobUuid: Optional[str] = Field(None, description="ServiceM8 job UUID for API lookups")


class UpdateDiagramRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    data: Optional[dict[str, Any]] = Field(None)
    blueprintImageBase64: Optional[str] = None
    blueprintImageUrl: Optional[str] = Field(None, description="Copy from this storage URL when base64 not sent")
    thumbnailBase64: Optional[str] = None
    servicem8JobId: Optional[str] = Field(None, max_length=32)
    servicem8JobUuid: Optional[str] = Field(None, description="ServiceM8 job UUID for API lookups")


class AddToJobElement(BaseModel):
    name: str = Field(..., min_length=1)
    qty: float = Field(..., ge=0)


class AddToJobRequest(BaseModel):
    job_uuid: str = Field(..., min_length=1)
    elements: list[AddToJobElement] = Field(..., min_length=1)
    quote_total: float = Field(..., ge=0)
    labour_hours: float = Field(..., ge=0)
    material_cost: float = Field(..., ge=0)
    user_name: str = Field("", description="Name of app user for note")
    profile: str = Field("spouting", description="stormcloud | classic | spouting for material line name")
    people_count: int = Field(1, ge=1, description="Number of labour lines / people (for job note: People Req)")
    quote_materials: Optional[list[QuoteMaterialLine]] = Field(None, description="Material lines (id, qty) for quote items; exclude labour (REP-LAB)")


class UploadJobAttachmentRequest(BaseModel):
    job_uuid: str = Field(..., min_length=1, description="ServiceM8 job UUID to attach the file to")
    image_base64: str = Field(..., min_length=1, description="PNG image as base64 string (no data URL prefix)")
    attachment_name: Optional[str] = Field(None, max_length=127, description="Optional filename for the attachment (default: Blueprint_Design.png)")


class CreateNewJobRequest(BaseModel):
    """Request for Create New Job Instead: original job UUID + same quote payload as add-to-job + optional blueprint PNG."""
    original_job_uuid: str = Field(..., min_length=1, description="ServiceM8 UUID of the job we looked up (to copy fields and add note/diagram to both)")
    elements: list[AddToJobElement] = Field(..., min_length=1)
    quote_total: float = Field(..., ge=0)
    labour_hours: float = Field(..., ge=0)
    material_cost: float = Field(..., ge=0)
    user_name: str = Field("", description="Name of app user for note")
    profile: str = Field("spouting", description="stormcloud | classic | spouting for material line name")
    people_count: int = Field(1, ge=1, description="Number of labour lines / people (for job note: People Req)")
    quote_materials: Optional[list[QuoteMaterialLine]] = Field(None, description="Material lines (id, qty) for quote items; exclude labour (REP-LAB)")
    image_base64: Optional[str] = Field(None, description="PNG blueprint image as base64 (no data URL prefix); attached to both original and new job")


class CreateBonusPeriodRequest(BaseModel):
    """Create a bonus period (admin only). Status defaults to open."""

    period_name: str = Field(..., min_length=1, max_length=255)
    start_date: date = Field(...)
    end_date: date = Field(...)
    status: str = Field("open", description="open | processing | closed")


class UpdateBonusPeriodRequest(BaseModel):
    """Update bonus period (admin only). Omitted fields unchanged."""

    period_name: Optional[str] = Field(None, min_length=1, max_length=255)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    status: Optional[str] = Field(None, description="open | processing | closed")


class UpdateJobPersonnelRequest(BaseModel):
    """Update job_personnel row (admin only, 59.8, 60.4). Admin verify/split onsite vs travel; assign seller/executor/spotter."""

    onsite_minutes: Optional[int] = Field(None, ge=0)
    travel_shopping_minutes: Optional[int] = Field(None, ge=0)
    is_seller: Optional[bool] = None
    is_executor: Optional[bool] = None
    is_spotter: Optional[bool] = None


class UpdateJobPerformanceRequest(BaseModel):
    """Update job_performance row (admin only, 59.16.2, 60.6). Only provided fields are updated."""

    status: Optional[str] = Field(None, description="draft | verified | processed")
    bonus_period_id: Optional[str] = Field(None, description="UUID of bonus period")
    is_callback: Optional[bool] = None
    callback_reason: Optional[str] = None
    callback_cost: Optional[float] = Field(None, ge=0)
    standard_parts_runs: Optional[int] = Field(None, ge=0)
    seller_fault_parts_runs: Optional[int] = Field(None, ge=0)
    missed_materials_cost: Optional[float] = Field(None, ge=0)
    is_upsell: Optional[bool] = Field(None, description="True if job is a true upsell (counts toward period pot, 60.6)")


app = FastAPI(
    title="Quote App API",
    description="Property photo → blueprint; Marley guttering repair plans. API-ready for integrations.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    """Health check for local dev and future API consumers."""
    return {"status": "ok"}


@app.get("/api/config")
def api_config():
    """Public frontend config (Supabase auth values + PWA rollout flag). Safe to expose."""
    url = os.environ.get("SUPABASE_URL", "").strip()
    anon = os.environ.get("SUPABASE_ANON_KEY", "").strip()
    pwa_enabled = _env_flag("PWA_ENABLED", True)
    return {"supabaseUrl": url or None, "anonKey": anon or None, "pwaEnabled": pwa_enabled}


@app.get("/api/me")
def api_me(
    user_id_and_role: tuple[uuid_lib.UUID, str] = Depends(get_current_user_id_and_role),
    payload: dict = Depends(get_validated_payload),
):
    """Current user info (Bearer required). Used so frontend can show bonus/admin entry for super admin."""
    user_id, role = user_id_and_role
    return {
        "user_id": str(user_id),
        "email": payload.get("email"),
        "role": role,
        "is_super_admin": is_super_admin_from_payload(payload),
    }


@app.get("/api/products")
def api_products(
    search: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    profile: Optional[str] = Query(None, description="Filter by profile: storm_cloud | classic | other"),
):
    """List Marley products; optional search, category, and profile filter."""
    return {"products": get_products(search=search, category=category, profile=profile)}


@app.post("/api/products/update-pricing")
def api_update_pricing(
    body: list[UpdatePricingItem],
    user_id: Any = Depends(require_role(["admin"])),
):
    """
    Update cost_price and markup_percentage for products. Accepts array of {id, cost_price, markup_percentage}.
    Requires Bearer token and role admin (task 34.3). Returns {success: true, updated: count}. 400 if validation fails; 500 on DB error.
    """
    if not body:
        raise HTTPException(400, "At least one product update is required")
    for item in body:
        if item.cost_price < 0:
            raise HTTPException(400, f"Product {item.id}: cost_price must be >= 0")
        if not (0 <= item.markup_percentage <= 1000):
            raise HTTPException(400, f"Product {item.id}: markup_percentage must be between 0 and 1000")
    try:
        supabase = get_supabase()
        updated = 0
        for item in body:
            resp = (
                supabase.table("products")
                .update({"cost_price": item.cost_price, "markup_percentage": item.markup_percentage})
                .eq("id", item.id)
                .execute()
            )
            if resp.data and len(resp.data) > 0:
                updated += len(resp.data)
        return {"success": True, "updated": updated}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to update product pricing in Supabase: %s", e)
        raise HTTPException(500, "Failed to update pricing")


@app.post("/api/products/import-csv")
async def api_import_csv(
    file: UploadFile = File(...),
    user_id: Any = Depends(require_role(["admin"])),
):
    """
    Import products from CSV. Expected columns: Item Number, Servicem8 Material_uuid, Item Name,
    Purchase Cost, Price. Profile is derived from item number (SC/CL) or name (Storm Cloud/Classic).
    Requires Bearer token and role admin (task 34.3). Returns {success, imported, failed, errors}.
    """
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(400, "File must be a CSV")
    content = (await file.read()).decode("utf-8", errors="replace")
    try:
        result = import_products_from_csv(content)
    except Exception as e:
        logger.exception("CSV import failed: %s", e)
        raise HTTPException(500, str(e))
    if not result["success"] and result["imported"] == 0 and result["failed"] == 0:
        raise HTTPException(400, "; ".join(result["errors"][:5]))
    return result


@app.get("/api/admin/user-permissions")
def api_admin_user_permissions(
    user_id: Any = Depends(require_role(["admin"])),
):
    """
    List auth users with current app role from public.profiles.
    Admin only. Requires service-role key for Supabase Auth admin list users.
    """
    _ = user_id
    try:
        supabase = get_supabase()
        auth_users = _list_auth_users_via_admin_api(supabase)
        profile_roles = _load_profile_roles(supabase)
        users = []
        seen_user_ids = set()
        for auth_user in auth_users:
            uid = str(_extract_auth_user_field(auth_user, "id") or "").strip()
            if not uid or uid in seen_user_ids:
                continue
            seen_user_ids.add(uid)
            role = profile_roles.get(uid, "viewer")
            users.append(_serialize_auth_user_for_permissions(auth_user, role))
        users.sort(key=lambda row: ((row.get("email") or "").lower(), row.get("user_id") or ""))
        return {"users": users}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to list admin user permissions: %s", e)
        raise HTTPException(500, "Failed to list user permissions")


@app.post("/api/admin/user-permissions/invite")
def api_admin_invite_user(
    body: InviteUserRequest,
    user_id: Any = Depends(require_role(["admin"])),
):
    """
    Invite a user by email. Creates auth user (invited) and profile row with role.
    Admin only. Requires SUPABASE_SERVICE_ROLE_KEY.
    """
    _ = user_id
    email = (body.email or "").strip()
    if not email or "@" not in email:
        raise HTTPException(400, "Valid email is required")
    requested_role = _normalize_app_role(body.role or "viewer")

    try:
        supabase = get_supabase()
        _require_service_role_for_admin_permissions()
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to initialize Supabase for invite: %s", e)
        raise HTTPException(500, "Failed to initialize invite")

    try:
        invite_resp = supabase.auth.admin.invite_user_by_email(email)
        invited_user = getattr(invite_resp, "user", None)
        if invited_user is None and isinstance(invite_resp, dict):
            invited_user = invite_resp.get("user")
        invited_uid = _extract_auth_user_field(invited_user, "id") if invited_user else None
        if invited_uid:
            invited_uid = str(invited_uid).strip()
        if invited_uid:
            (
                supabase.table("profiles")
                .upsert({"user_id": invited_uid, "role": requested_role}, on_conflict="user_id")
                .execute()
            )
        return {
            "message": "Invite sent.",
            "user": _serialize_auth_user_for_permissions(invited_user, requested_role)
            if invited_user
            else {"email": email, "user_id": invited_uid or "", "role": requested_role},
        }
    except HTTPException:
        raise
    except Exception as e:
        err_msg = str(e).lower()
        if "already" in err_msg or "exists" in err_msg or "duplicate" in err_msg:
            raise HTTPException(400, "A user with this email already exists.") from e
        if _is_admin_api_unavailable_error(e):
            raise HTTPException(
                503,
                "Invite is unavailable. Ensure SUPABASE_SERVICE_ROLE_KEY is set and valid.",
            ) from e
        logger.exception("Failed to invite user by email %s: %s", email, e)
        safe_msg = (str(e) or "").strip()[:200]
        raise HTTPException(
            500,
            detail=f"Failed to send invite.{f' {safe_msg}' if safe_msg else ''}",
        )


@app.patch("/api/admin/user-permissions/{target_user_id}")
def api_update_admin_user_permission(
    target_user_id: str,
    body: UpdateUserPermissionRoleRequest,
    user_id: Any = Depends(require_role(["admin"])),
):
    """
    Update a user's app role in public.profiles.
    Admin only. Role must be viewer|editor|admin.
    """
    _ = user_id
    requested_role = str(body.role or "").strip().lower()
    if requested_role not in ALLOWED_APP_ROLES:
        raise HTTPException(400, "Invalid role. Allowed roles: viewer, editor, admin, technician")
    try:
        target_uuid = uuid_lib.UUID(target_user_id)
    except ValueError:
        raise HTTPException(400, "Invalid user_id UUID")
    target_uid = str(target_uuid)

    try:
        supabase = get_supabase()
        _require_service_role_for_admin_permissions()
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to initialize Supabase client for admin role update: %s", e)
        raise HTTPException(500, "Failed to initialize role update")

    auth_user = None
    try:
        auth_user_resp = supabase.auth.admin.get_user_by_id(target_uid)
        auth_user = getattr(auth_user_resp, "user", None)
        if auth_user is None and isinstance(auth_user_resp, dict):
            auth_user = auth_user_resp.get("user")
        if auth_user is None:
            raise HTTPException(404, "User not found")
    except HTTPException:
        raise
    except Exception as e:
        if _is_auth_user_not_found_error(e):
            raise HTTPException(404, "User not found") from e
        if _is_admin_api_unavailable_error(e):
            raise HTTPException(
                503,
                "User lookup is unavailable. Ensure SUPABASE_SERVICE_ROLE_KEY is set and valid.",
            ) from e
        logger.exception("Failed to verify target user %s before role update: %s", target_uid, e)
        raise HTTPException(500, "Failed to verify target user")

    if _is_super_admin(auth_user):
        raise HTTPException(403, "Super admin cannot be modified.")

    try:
        current_role = _get_profile_role_for_user(supabase, target_uid)
        _ensure_not_demoting_last_admin(
            supabase,
            target_user_id=target_uid,
            current_role=current_role,
            next_role=requested_role,
        )
        (
            supabase.table("profiles")
            .upsert({"user_id": target_uid, "role": requested_role}, on_conflict="user_id")
            .execute()
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to update role for user %s: %s", target_uid, e)
        raise HTTPException(500, "Failed to update user role")

    return {"user": _serialize_auth_user_for_permissions(auth_user, requested_role)}


@app.delete("/api/admin/user-permissions/{target_user_id}")
def api_admin_remove_user(
    target_user_id: str,
    user_id: Any = Depends(require_role(["admin"])),
):
    """
    Remove a user (delete from auth and optionally profiles). Cannot remove self or last admin.
    Admin only. Requires SUPABASE_SERVICE_ROLE_KEY.
    """
    caller_uid = str(user_id).strip() if user_id else ""
    target_uid = target_user_id.strip()
    if caller_uid and target_uid and caller_uid == target_uid:
        raise HTTPException(400, "You cannot remove yourself.")

    try:
        target_uuid = uuid_lib.UUID(target_uid)
    except ValueError:
        raise HTTPException(400, "Invalid user_id UUID")
    target_uid = str(target_uuid)

    try:
        supabase = get_supabase()
        _require_service_role_for_admin_permissions()
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to initialize Supabase for remove user: %s", e)
        raise HTTPException(500, "Failed to initialize remove user")

    auth_user = None
    try:
        auth_user_resp = supabase.auth.admin.get_user_by_id(target_uid)
        auth_user = getattr(auth_user_resp, "user", None)
        if auth_user is None and isinstance(auth_user_resp, dict):
            auth_user = auth_user_resp.get("user")
        if auth_user is None:
            raise HTTPException(404, "User not found")
    except HTTPException:
        raise
    except Exception as e:
        if _is_auth_user_not_found_error(e):
            raise HTTPException(404, "User not found") from e
        if _is_admin_api_unavailable_error(e):
            raise HTTPException(
                503,
                "User lookup is unavailable. Ensure SUPABASE_SERVICE_ROLE_KEY is set and valid.",
            ) from e
        logger.exception("Failed to verify target user %s before remove: %s", target_uid, e)
        raise HTTPException(500, "Failed to verify user")

    if _is_super_admin(auth_user):
        raise HTTPException(403, "Super admin cannot be removed.")

    try:
        current_role = _get_profile_role_for_user(supabase, target_uid)
        _ensure_not_removing_last_admin(supabase, target_uid)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to check last-admin before remove %s: %s", target_uid, e)
        raise HTTPException(500, "Cannot remove user")

    try:
        supabase.auth.admin.delete_user(target_uid)
    except HTTPException:
        raise
    except Exception as e:
        if _is_admin_api_unavailable_error(e):
            raise HTTPException(
                503,
                "Remove user is unavailable. Ensure SUPABASE_SERVICE_ROLE_KEY is set and valid.",
            ) from e
        logger.exception("Failed to delete user %s: %s", target_uid, e)
        raise HTTPException(500, "Failed to remove user")

    try:
        supabase.table("profiles").delete().eq("user_id", target_uid).execute()
    except Exception as e:
        logger.warning("Failed to delete profile row for %s (auth user already removed): %s", target_uid, e)

    return {"message": "User removed."}


# --- Bonus periods (Section 59.5): admin-only create/update/list ---

@app.get("/api/bonus/periods")
def api_bonus_periods_list(
    user_id: Any = Depends(require_role(["admin"])),
):
    """List all bonus periods (admin only). Ordered by start_date descending."""
    try:
        supabase = get_supabase()
        periods = list_periods(supabase)
        return {"periods": periods}
    except Exception as e:
        logger.exception("Failed to list bonus periods: %s", e)
        raise HTTPException(500, "Failed to list bonus periods")


@app.post("/api/bonus/periods")
def api_bonus_periods_create(
    body: CreateBonusPeriodRequest,
    user_id: Any = Depends(require_role(["admin"])),
):
    """Create a bonus period (admin only). Status defaults to open."""
    if body.status not in ("open", "processing", "closed"):
        raise HTTPException(400, "status must be open, processing, or closed")
    if body.start_date > body.end_date:
        raise HTTPException(400, "start_date must be before or equal to end_date")
    try:
        supabase = get_supabase()
        row = create_period(
            supabase,
            period_name=body.period_name,
            start_date=body.start_date,
            end_date=body.end_date,
            status=body.status,
        )
        return row
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.exception("Failed to create bonus period: %s", e)
        raise HTTPException(500, "Failed to create bonus period")


@app.patch("/api/bonus/periods/{period_id}")
def api_bonus_periods_update(
    period_id: str,
    body: UpdateBonusPeriodRequest,
    user_id: Any = Depends(require_role(["admin"])),
):
    """Update a bonus period (admin only). Only provided fields are updated."""
    if body.status is not None and body.status not in ("open", "processing", "closed"):
        raise HTTPException(400, "status must be open, processing, or closed")
    if body.start_date is not None and body.end_date is not None and body.start_date > body.end_date:
        raise HTTPException(400, "start_date must be before or equal to end_date")
    try:
        supabase = get_supabase()
        row = update_period(
            supabase,
            period_id=period_id,
            period_name=body.period_name,
            start_date=body.start_date,
            end_date=body.end_date,
            status=body.status,
        )
        return row
    except LookupError:
        raise HTTPException(404, "Period not found")
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.exception("Failed to update bonus period %s: %s", period_id, e)
        raise HTTPException(500, "Failed to update bonus period")


@app.patch("/api/bonus/job-personnel/{personnel_id}")
def api_bonus_job_personnel_update(
    personnel_id: str,
    body: UpdateJobPersonnelRequest,
    user_id: Any = Depends(require_role(["admin"])),
):
    """Update a job_personnel row (admin only, 59.8). For verify/split onsite vs travel and assign is_seller/is_executor."""
    try:
        uuid_lib.UUID(personnel_id)
    except (ValueError, TypeError):
        raise HTTPException(400, "personnel_id must be a valid UUID")
    payload = body.model_dump(exclude_unset=True)
    if not payload:
        raise HTTPException(400, "At least one field required: onsite_minutes, travel_shopping_minutes, is_seller, is_executor, is_spotter")
    try:
        supabase = get_supabase()
        resp = (
            supabase.table("job_personnel")
            .update(payload)
            .eq("id", personnel_id)
            .execute()
        )
        if not resp.data or len(resp.data) == 0:
            raise HTTPException(404, "Job personnel row not found")
        return resp.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to update job_personnel %s: %s", personnel_id, e)
        raise HTTPException(500, "Failed to update job personnel")


# --- Admin bonus API (59.16.2): period jobs, personnel, summary, breakdown, PATCH job_performance ---


@app.get("/api/bonus/admin/periods/{period_id}/jobs")
def api_bonus_admin_period_jobs(
    period_id: str,
    user_id: Any = Depends(require_role(["admin"])),
):
    """List all job_performance rows for a period with job_gp and personnel (admin only, 59.16.2). Includes draft/unverified jobs."""
    _ = user_id
    try:
        parsed_period_id = str(uuid_lib.UUID(period_id))
    except (ValueError, TypeError):
        raise HTTPException(400, "period_id must be a valid UUID")
    try:
        supabase = get_supabase()
        period, _ = _resolve_bonus_dashboard_period(
            supabase=supabase,
            period_rows=[],
            requested_period_id=parsed_period_id,
        )
        if not period:
            raise HTTPException(404, "Bonus period not found")
        period_jobs_source = _fetch_period_jobs_with_fallback(supabase=supabase, period=period)
        period_jobs = select_period_jobs(period, period_jobs_source)
        job_ids = [str((j or {}).get("id") or "").strip() for j in period_jobs if str((j or {}).get("id") or "").strip()]
        personnel_rows = _fetch_job_personnel_rows_for_jobs(supabase=supabase, job_performance_ids=job_ids)
        personnel_by_job = group_personnel_by_job(personnel_rows)
        jobs_with_gp = []
        for job in period_jobs:
            row = dict(job)
            row["job_gp"] = compute_job_gp(row)
            jid = str((job or {}).get("id") or "").strip()
            row["personnel"] = list(personnel_by_job.get(jid) or [])
            jobs_with_gp.append(row)
        return {"period": period, "jobs": jobs_with_gp}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to list period jobs for %s: %s", period_id, e)
        raise HTTPException(500, "Failed to list period jobs")


@app.get("/api/bonus/admin/periods/{period_id}/summary")
def api_bonus_admin_period_summary(
    period_id: str,
    user_id: Any = Depends(require_role(["admin"])),
):
    """Period summary: period meta, total_team_pot, eligible_job_count, callback_cost_total (admin only, 59.16.2)."""
    _ = user_id
    try:
        parsed_period_id = str(uuid_lib.UUID(period_id))
    except (ValueError, TypeError):
        raise HTTPException(400, "period_id must be a valid UUID")
    try:
        supabase = get_supabase()
        period, _ = _resolve_bonus_dashboard_period(
            supabase=supabase,
            period_rows=[],
            requested_period_id=parsed_period_id,
        )
        if not period:
            raise HTTPException(404, "Bonus period not found")
        period_jobs_source = _fetch_period_jobs_with_fallback(supabase=supabase, period=period)
        period_jobs = select_period_jobs(period, period_jobs_source)
        eligible_jobs = filter_eligible_period_jobs(period_jobs)
        total_team_pot = compute_period_pot(eligible_jobs)
        callback_cost_total = round(
            sum(float((j or {}).get("callback_cost") or 0.0) for j in eligible_jobs),
            2,
        )
        return {
            "period": period,
            "total_team_pot": total_team_pot,
            "eligible_job_count": len(eligible_jobs),
            "callback_cost_total": callback_cost_total,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to get period summary for %s: %s", period_id, e)
        raise HTTPException(500, "Failed to get period summary")


@app.get("/api/bonus/admin/periods/{period_id}/breakdown")
def api_bonus_admin_period_breakdown(
    period_id: str,
    user_id: Any = Depends(require_role(["admin"])),
):
    """Per-tech breakdown for period: gp_contributed, share_of_team_pot, expected_payout (admin only, 59.16.2)."""
    _ = user_id
    try:
        parsed_period_id = str(uuid_lib.UUID(period_id))
    except (ValueError, TypeError):
        raise HTTPException(400, "period_id must be a valid UUID")
    try:
        supabase = get_supabase()
        period, _ = _resolve_bonus_dashboard_period(
            supabase=supabase,
            period_rows=[],
            requested_period_id=parsed_period_id,
        )
        if not period:
            raise HTTPException(404, "Bonus period not found")
        period_jobs_source = _fetch_period_jobs_with_fallback(supabase=supabase, period=period)
        period_jobs = select_period_jobs(period, period_jobs_source)
        eligible_jobs = filter_eligible_period_jobs(period_jobs)
        team_pot = compute_period_pot(eligible_jobs)
        job_ids = [str((j or {}).get("id") or "").strip() for j in eligible_jobs if str((j or {}).get("id") or "").strip()]
        personnel_rows = _fetch_job_personnel_rows_for_jobs(supabase=supabase, job_performance_ids=job_ids)
        personnel_by_job = group_personnel_by_job(personnel_rows)
        total_contributed_gp = compute_total_contributed_gp(eligible_jobs, personnel_by_job)
        technician_ids = set()
        for rows in personnel_by_job.values():
            for r in rows or []:
                tid = str((r or {}).get("technician_id") or "").strip()
                if tid:
                    technician_ids.add(tid)
        breakdown = []
        for tech_id in sorted(technician_ids):
            ledger_rows = build_canonical_ledger_rows(
                eligible_jobs=eligible_jobs,
                personnel_by_job=personnel_by_job,
                technician_id=tech_id,
            )
            gp_contributed = compute_technician_contribution_total(ledger_rows)
            if total_contributed_gp > 0:
                share_of_team_pot = round(team_pot * (gp_contributed / total_contributed_gp), 2)
            else:
                share_of_team_pot = 0.0
            breakdown.append({
                "technician_id": tech_id,
                "gp_contributed": gp_contributed,
                "share_of_team_pot": share_of_team_pot,
                "expected_payout": share_of_team_pot,
                "display_name": None,
            })
        return {"period": period, "total_team_pot": team_pot, "breakdown": breakdown}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to get period breakdown for %s: %s", period_id, e)
        raise HTTPException(500, "Failed to get period breakdown")


@app.get("/api/bonus/job-performance/{job_performance_id}/personnel")
def api_bonus_job_performance_personnel(
    job_performance_id: str,
    user_id: Any = Depends(require_role(["admin"])),
):
    """List job_personnel for one job_performance (admin only, 59.16.2)."""
    _ = user_id
    try:
        parsed_id = str(uuid_lib.UUID(job_performance_id))
    except (ValueError, TypeError):
        raise HTTPException(400, "job_performance_id must be a valid UUID")
    try:
        supabase = get_supabase()
        personnel_rows = _fetch_job_personnel_rows_for_jobs(
            supabase=supabase,
            job_performance_ids=[parsed_id],
        )
        return {"job_performance_id": parsed_id, "personnel": personnel_rows}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to list personnel for job %s: %s", job_performance_id, e)
        raise HTTPException(500, "Failed to list job personnel")


@app.get("/api/bonus/job-performance/{job_performance_id}")
def api_bonus_job_performance_get(
    job_performance_id: str,
    user_id: Any = Depends(require_role(["admin"])),
):
    """Get one job_performance row with computed job_gp (admin only, 59.9)."""
    try:
        parsed_id = str(uuid_lib.UUID(job_performance_id))
    except (ValueError, TypeError):
        raise HTTPException(400, "job_performance_id must be a valid UUID")
    try:
        supabase = get_supabase()
        resp = (
            supabase.table("job_performance")
            .select(BONUS_JOB_PERFORMANCE_COLUMNS)
            .eq("id", parsed_id)
            .limit(1)
            .execute()
        )
        rows = resp.data or []
        if not rows:
            raise HTTPException(404, "Job performance not found")
        row = dict(rows[0])
        row["job_gp"] = compute_job_gp(row)
        return row
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to get job performance %s: %s", job_performance_id, e)
        raise HTTPException(500, "Failed to get job performance")


@app.patch("/api/bonus/job-performance/{job_performance_id}")
def api_bonus_job_performance_update(
    job_performance_id: str,
    body: UpdateJobPerformanceRequest,
    user_id: Any = Depends(require_role(["admin"])),
):
    """Update job_performance row (admin only, 59.16.2). Status, bonus_period_id, callbacks, parts runs, missed_materials_cost."""
    _ = user_id
    try:
        parsed_id = str(uuid_lib.UUID(job_performance_id))
    except (ValueError, TypeError):
        raise HTTPException(400, "job_performance_id must be a valid UUID")
    if body.status is not None and body.status not in ("draft", "verified", "processed"):
        raise HTTPException(400, "status must be draft, verified, or processed")
    if body.bonus_period_id is not None:
        try:
            uuid_lib.UUID(body.bonus_period_id)
        except (ValueError, TypeError):
            raise HTTPException(400, "bonus_period_id must be a valid UUID")
    payload = body.model_dump(exclude_unset=True)
    if not payload:
        raise HTTPException(400, "At least one field required to update")
    try:
        supabase = get_supabase()
        resp = (
            supabase.table("job_performance")
            .update(payload)
            .eq("id", parsed_id)
            .execute()
        )
        if not resp.data or len(resp.data) == 0:
            raise HTTPException(404, "Job performance not found")
        row = dict(resp.data[0])
        row["job_gp"] = compute_job_gp(row)
        return row
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to update job performance %s: %s", job_performance_id, e)
        raise HTTPException(500, "Failed to update job performance")


@app.get("/api/bonus/technician/period-current")
def api_bonus_technician_period_current(
    period_id: Optional[str] = Query(
        None,
        description="Optional explicit period UUID. Must be open or processing.",
    ),
    actor_context: tuple[str, str] = Depends(_require_bonus_dashboard_reader),
):
    """Technician dashboard period selection (open first, else processing)."""
    actor_user_id, actor_role = actor_context
    try:
        supabase = get_supabase()
        period_rows = _fetch_bonus_dashboard_period_rows(supabase)
        period, selection_reason = _resolve_bonus_dashboard_period(
            supabase=supabase,
            period_rows=period_rows,
            requested_period_id=period_id,
        )
        return {
            "is_provisional": True,
            "selection_reason": selection_reason,
            "allowed_statuses": list(BONUS_PERIOD_READ_STATUSES),
            "period": period,
            "reader": {
                "actor_user_id": actor_user_id,
                "actor_role": actor_role,
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to read technician current period: %s", e)
        raise HTTPException(500, "Failed to read current bonus period")


@app.get("/api/bonus/technician/dashboard")
def api_bonus_technician_dashboard(
    period_id: Optional[str] = Query(
        None,
        description="Optional explicit period UUID (open or processing).",
    ),
    technician_id: Optional[str] = Query(
        None,
        description="Admin-only override to view another technician UUID.",
    ),
    actor_context: tuple[str, str] = Depends(_require_bonus_dashboard_reader),
):
    """
    Technician-facing dashboard payload (prototype/provisional).
    Non-admin users are forced to self technician context.
    """
    actor_user_id, actor_role = actor_context
    resolved_technician_id, _, forced_self_context = _resolve_bonus_dashboard_technician_id(
        requested_technician_id=technician_id,
        actor_user_id=actor_user_id,
        actor_role=actor_role,
    )
    try:
        supabase = get_supabase()
        period_rows = _fetch_bonus_dashboard_period_rows(supabase)
        period, selection_reason = _resolve_bonus_dashboard_period(
            supabase=supabase,
            period_rows=period_rows,
            requested_period_id=period_id,
        )
        return _build_provisional_technician_dashboard_payload(
            supabase=supabase,
            period=period,
            selection_reason=selection_reason,
            technician_id=resolved_technician_id,
            actor_user_id=actor_user_id,
            actor_role=actor_role,
            forced_self_context=forced_self_context,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to read technician dashboard: %s", e)
        raise HTTPException(500, "Failed to read technician dashboard")


@app.get("/api/bonus/technician/jobs")
def api_bonus_technician_jobs(
    period_id: Optional[str] = Query(
        None,
        description="Optional explicit period UUID (open or processing).",
    ),
    technician_id: Optional[str] = Query(
        None,
        description="Admin-only override to view another technician UUID.",
    ),
    actor_context: tuple[str, str] = Depends(_require_bonus_dashboard_reader),
):
    """Technician period jobs ledger rows (prototype/provisional)."""
    actor_user_id, actor_role = actor_context
    resolved_technician_id, _, forced_self_context = _resolve_bonus_dashboard_technician_id(
        requested_technician_id=technician_id,
        actor_user_id=actor_user_id,
        actor_role=actor_role,
    )
    try:
        supabase = get_supabase()
        period_rows = _fetch_bonus_dashboard_period_rows(supabase)
        period, selection_reason = _resolve_bonus_dashboard_period(
            supabase=supabase,
            period_rows=period_rows,
            requested_period_id=period_id,
        )
        payload = _build_provisional_technician_dashboard_payload(
            supabase=supabase,
            period=period,
            selection_reason=selection_reason,
            technician_id=resolved_technician_id,
            actor_user_id=actor_user_id,
            actor_role=actor_role,
            forced_self_context=forced_self_context,
        )
        return {
            "is_provisional": True,
            "selection_reason": payload.get("selection_reason"),
            "expected_payout_status": payload.get("expected_payout_status"),
            "period": payload.get("period"),
            "technician_context": payload.get("technician_context"),
            "jobs": (payload.get("ledger") or {}).get("jobs", []),
            "job_count": (payload.get("ledger") or {}).get("job_count", 0),
            "empty_state": (payload.get("ledger") or {}).get("empty_state"),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to read technician jobs: %s", e)
        raise HTTPException(500, "Failed to read technician jobs")


@app.get("/api/labour-rates")
def api_labour_rates():
    """Return labour product as a single 'rate' for backward compatibility. Frontend should use products (REP-LAB) instead."""
    try:
        pricing = get_product_pricing(["REP-LAB"])
        if "REP-LAB" not in pricing:
            return {"labour_rates": []}
        p = pricing["REP-LAB"]
        sell_price = round(p["cost_price"] * (1 + p["markup_percentage"] / 100), 2)
        return {
            "labour_rates": [
                {"id": "REP-LAB", "rateName": p["name"], "hourlyRate": sell_price}
            ]
        }
    except Exception as e:
        logger.exception("Failed to fetch labour product for labour-rates: %s", e)
        return {"labour_rates": []}


@app.post("/api/calculate-quote")
def api_calculate_quote(body: CalculateQuoteRequest):
    """
    Calculate quote from materials (elements) and labour (labour_elements).
    Materials: assetId + quantity; auto-adds brackets/screws for gutters.
    Labour: labour_elements with assetId e.g. REP-LAB, quantity = hours; priced from public.products.
    Returns 400 if any product not found or missing pricing; 500 on DB errors.
    """
    # Expand material elements with inferred brackets and screws from gutters
    raw_elements = [
        {"assetId": e.assetId, "quantity": e.quantity, "length_mm": getattr(e, "length_mm", None)}
        for e in body.elements
    ]
    elements_for_quote = expand_elements_with_gutter_accessories(raw_elements)

    all_product_ids = list({e["assetId"] for e in elements_for_quote} | {e.assetId for e in body.labour_elements})
    try:
        pricing = get_product_pricing(all_product_ids) if all_product_ids else {}
    except Exception as e:
        logger.exception("Database error while fetching product pricing: %s", e)
        raise HTTPException(500, "Failed to load product pricing")

    # Build materials lines
    materials = []
    materials_subtotal = 0.0
    for e in elements_for_quote:
        pid = e["assetId"]
        if pid not in pricing:
            logger.warning("Product not found or missing pricing: %s", pid)
            raise HTTPException(400, f"Product {pid} not found or missing pricing")
        p = pricing[pid]
        cost_price = p["cost_price"]
        markup_pct = p["markup_percentage"]
        sell_price = round(cost_price * (1 + markup_pct / 100), 2)
        qty = e["quantity"]
        line_total = round(sell_price * qty, 2)
        materials.append({
            "id": pid,
            "name": p["name"],
            "qty": qty,
            "cost_price": cost_price,
            "markup_percentage": markup_pct,
            "sell_price": sell_price,
            "line_total": line_total,
        })
        materials_subtotal += line_total
    materials_subtotal = round(materials_subtotal, 2)

    # Labour from labour_elements (priced via products, e.g. REP-LAB)
    labour_hours = 0.0
    labour_subtotal = 0.0
    labour_rate = 0.0  # sell price per hour for display
    for e in body.labour_elements:
        pid = e.assetId
        if pid not in pricing:
            logger.warning("Labour product not found or missing pricing: %s", pid)
            raise HTTPException(400, f"Labour product {pid} not found or missing pricing")
        p = pricing[pid]
        cost_price = p["cost_price"]
        markup_pct = p["markup_percentage"]
        sell_price = round(cost_price * (1 + markup_pct / 100), 2)
        hours = e.quantity
        line_total = round(sell_price * hours, 2)
        labour_hours += hours
        labour_subtotal += line_total
        if labour_rate == 0:
            labour_rate = sell_price
    labour_subtotal = round(labour_subtotal, 2)

    total = round(materials_subtotal + labour_subtotal, 2)

    quote = {
        "materials": materials,
        "materials_subtotal": materials_subtotal,
        "labour_hours": labour_hours,
        "labour_rate": labour_rate,
        "labour_subtotal": labour_subtotal,
        "total": total,
    }
    logger.debug("Quote calculated: total=%.2f, materials=%.2f, labour=%.2f", total, materials_subtotal, labour_subtotal)
    return {"quote": quote}


@app.post("/api/process-blueprint")
async def api_process_blueprint(
    file: UploadFile = File(...),
    technical_drawing: bool = Query(True),
):
    """
    Upload a property photo; returns PNG blueprint (technical drawing or grayscale).
    Toggle technical_drawing on/off for filter effect.
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "File must be an image")
    content = await file.read()
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(400, "File too large (max 20MB)")
    mode = "technical_drawing" if technical_drawing else "grayscale"
    try:
        png_bytes = process_blueprint(content, mode=mode)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return Response(content=png_bytes, media_type="image/png")


def _decode_base64_image(value: str) -> Optional[bytes]:
    """Decode base64 image; supports data URL (data:image/png;base64,...) or raw base64."""
    if not value or not value.strip():
        return None
    s = value.strip()
    if s.startswith("data:"):
        idx = s.find("base64,")
        if idx == -1:
            return None
        s = s[idx + 7 :]
    try:
        return base64.b64decode(s)
    except Exception:
        return None


@app.get("/api/diagrams")
def api_list_diagrams(user_id: Any = Depends(get_current_user_id)):
    """List saved diagrams for the current user. Requires Bearer token."""
    return {"diagrams": list_diagrams(user_id)}


@app.post("/api/diagrams")
def api_create_diagram(body: SaveDiagramRequest, user_id: Any = Depends(get_current_user_id)):
    """Save a new diagram. Requires Bearer token."""
    blueprint_bytes = _decode_base64_image(body.blueprintImageBase64) if body.blueprintImageBase64 else None
    thumbnail_bytes = _decode_base64_image(body.thumbnailBase64) if body.thumbnailBase64 else None
    try:
        created = create_diagram(
            user_id,
            body.name,
            body.data,
            blueprint_bytes=blueprint_bytes,
            blueprint_image_source_url=body.blueprintImageUrl,
            thumbnail_bytes=thumbnail_bytes,
            servicem8_job_id=body.servicem8JobId,
            servicem8_job_uuid=body.servicem8JobUuid,
        )
        return created
    except RuntimeError as e:
        logger.exception("Create diagram failed: %s", e)
        raise HTTPException(500, str(e))
    except Exception as e:
        logger.exception("Create diagram failed: %s", e)
        raise HTTPException(500, "Failed to save diagram")


@app.get("/api/diagrams/{diagram_id}")
def api_get_diagram(diagram_id: str, user_id: Any = Depends(get_current_user_id)):
    """Get full diagram by id. Requires Bearer token; returns 404 if not found or not owned."""
    from uuid import UUID
    try:
        did = UUID(diagram_id)
    except ValueError:
        raise HTTPException(404, "Diagram not found")
    diagram = get_diagram(user_id, did)
    if not diagram:
        raise HTTPException(404, "Diagram not found")
    return diagram


@app.patch("/api/diagrams/{diagram_id}")
def api_update_diagram(
    diagram_id: str,
    body: UpdateDiagramRequest,
    user_id: Any = Depends(get_current_user_id),
):
    """Update diagram name/data/images. Requires Bearer token."""
    from uuid import UUID
    try:
        did = UUID(diagram_id)
    except ValueError:
        raise HTTPException(404, "Diagram not found")
    blueprint_bytes = _decode_base64_image(body.blueprintImageBase64) if body.blueprintImageBase64 else None
    thumbnail_bytes = _decode_base64_image(body.thumbnailBase64) if body.thumbnailBase64 else None
    try:
        updated = update_diagram(
            user_id,
            did,
            name=body.name,
            data=body.data,
            blueprint_bytes=blueprint_bytes,
            blueprint_image_source_url=body.blueprintImageUrl,
            thumbnail_bytes=thumbnail_bytes,
            servicem8_job_id=body.servicem8JobId,
            servicem8_job_uuid=body.servicem8JobUuid,
        )
    except RuntimeError as e:
        logger.exception("Update diagram failed: %s", e)
        raise HTTPException(500, str(e))
    if not updated:
        raise HTTPException(404, "Diagram not found")
    return updated


@app.delete("/api/diagrams/{diagram_id}")
def api_delete_diagram(diagram_id: str, user_id: Any = Depends(get_current_user_id)):
    """Delete a diagram. Requires Bearer token."""
    from uuid import UUID
    try:
        did = UUID(diagram_id)
    except ValueError:
        raise HTTPException(404, "Diagram not found")
    if not delete_diagram(user_id, did):
        raise HTTPException(404, "Diagram not found")
    return {"success": True}


# --- ServiceM8 OAuth 2.0 ---


@app.get("/api/servicem8/oauth/authorize")
def api_servicem8_authorize(user_id: Any = Depends(get_current_user_id)):
    """
    Return the ServiceM8 OAuth authorize URL. Requires Bearer token.
    Frontend must fetch this with Authorization header, then redirect the user to the returned URL.
    (Browser navigation to this endpoint does not send Bearer token, so we return JSON, not a redirect.)
    
    When SERVICEM8_COMPANY_USER_ID is set, only that user can connect (others get 403).
    redirect_uri in the authorize URL MUST match the Activation URL set in ServiceM8 Store Connect
    exactly: https://quote-app-production-7897.up.railway.app/api/servicem8/oauth/callback
    """
    if not sm8.can_disconnect_servicem8(str(user_id)):
        raise HTTPException(
            403,
            "Only the organization's ServiceM8 account can connect here.",
        )
    try:
        state = sm8.generate_state(str(user_id))
        url = sm8.build_authorize_url(state)
        return {"url": url}
    except ValueError as e:
        raise HTTPException(503, str(e))


@app.get("/api/servicem8/oauth/callback")
def api_servicem8_callback(
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
):
    """
    ServiceM8 OAuth callback. Receives code and state, exchanges for tokens, stores per user.
    Redirects to frontend with ?servicem8=connected or ?servicem8=error.
    """
    if error:
        logger.warning("ServiceM8 OAuth error: %s", error)
        base = sm8.get_redirect_uri().replace("/api/servicem8/oauth/callback", "")
        return RedirectResponse(url=f"{base}/?servicem8=error", status_code=302)

    if not code or not state:
        raise HTTPException(400, "Missing code or state")

    user_id = sm8.verify_state(state)
    if not user_id:
        raise HTTPException(400, "Invalid or expired state")

    try:
        # redirect_uri required in token exchange (even if omitted in authorize)
        # Use our Railway callback URL
        redirect_uri = sm8.get_redirect_uri()
        tokens = sm8.exchange_code_for_tokens(code, redirect_uri)
    except httpx.HTTPStatusError as e:
        logger.exception("ServiceM8 token exchange failed: %s", e)
        base = sm8.get_redirect_uri().replace("/api/servicem8/oauth/callback", "")
        return RedirectResponse(url=f"{base}/?servicem8=error", status_code=302)

    sm8.store_tokens(
        user_id,
        tokens["access_token"],
        tokens["refresh_token"],
        tokens.get("expires_in", 3600),
        tokens.get("scope"),
    )

    base = sm8.get_redirect_uri().replace("/api/servicem8/oauth/callback", "")
    return RedirectResponse(url=f"{base}/?servicem8=connected", status_code=302)


@app.get("/api/servicem8/oauth/status")
def api_servicem8_status(user_id: Any = Depends(get_current_user_id)):
    """Check if user has connected ServiceM8. Requires Bearer token. When company mode is on, uses company token for connected; disconnect_allowed only for company user."""
    try:
        effective_id = sm8.get_effective_servicem8_user_id(str(user_id))
        tokens = sm8.get_tokens(effective_id)
        disconnect_allowed = sm8.can_disconnect_servicem8(str(user_id))
        return {"connected": tokens is not None, "disconnect_allowed": disconnect_allowed}
    except ValueError:
        return {"connected": False, "config": "ServiceM8 OAuth not configured", "disconnect_allowed": True}


@app.post("/api/servicem8/oauth/disconnect")
def api_servicem8_disconnect(user_id: Any = Depends(get_current_user_id)):
    """Disconnect ServiceM8. Remove stored tokens. Requires Bearer token. When company mode is on, only the company user can disconnect (others get 403)."""
    if not sm8.can_disconnect_servicem8(str(user_id)):
        raise HTTPException(
            403,
            "Only the organization's ServiceM8 account can disconnect.",
        )
    sm8.delete_tokens(str(user_id))
    return {"success": True}


@app.get("/api/servicem8/jobs")
def api_servicem8_job_by_generated_id(
    generated_job_id: str = Query(..., min_length=1, max_length=20),
    user_id: Any = Depends(get_current_user_id),
):
    """
    Fetch a ServiceM8 job by generated_job_id (job number).
    Returns job_address, total_invoice_amount, and uuid for confirmation UI.
    When SERVICEM8_COMPANY_USER_ID is set, uses that user's token for lookup.
    """
    effective_id = sm8.get_effective_servicem8_user_id(str(user_id))
    job = sm8.fetch_job_by_generated_id(effective_id, generated_job_id)
    if job is None:
        raise HTTPException(404, "Job not found")
    return {
        "uuid": job.get("uuid"),
        "generated_job_id": job.get("generated_job_id"),
        "job_address": job.get("job_address") or "",
        "total_invoice_amount": job.get("total_invoice_amount"),
    }


@app.post("/api/servicem8/add-to-job")
def api_servicem8_add_to_job(
    body: AddToJobRequest,
    user_id: Any = Depends(get_current_user_id),
):
    """
    Add materials and note to a ServiceM8 job.
    POSTs job material (bundled line) and job note via ServiceM8 API.
    When SERVICEM8_COMPANY_USER_ID is set, uses that user's token.
    """
    effective_id = sm8.get_effective_servicem8_user_id(str(user_id))
    tokens = sm8.get_tokens(effective_id)
    if not tokens:
        raise HTTPException(401, "ServiceM8 not connected")
    profile_label = "spouting"
    if body.profile and body.profile.lower() == "stormcloud":
        profile_label = "Stormcloud"
    elif body.profile and body.profile.lower() == "classic":
        profile_label = "Classic"
    material_name = f"{profile_label} repairs, labour & materials"
    qty_str = "1"
    price_str = f"{body.quote_total:.2f}"
    cost_str = f"{body.material_cost:.2f}"
    # price and displayed_amount must match; cost and displayed_cost must match (do not send displayed_amount_is_tax_inclusive)
    displayed_amount_str = price_str
    displayed_cost_str = cost_str
    ok, err = sm8.add_job_material(
        tokens["access_token"],
        body.job_uuid,
        material_name,
        qty_str,
        price_str,
        cost=cost_str,
        displayed_amount=displayed_amount_str,
        displayed_cost=displayed_cost_str,
    )
    if not ok:
        raise HTTPException(502, f"Failed to add job material: {err or 'unknown'}")

    note_text = _build_job_note_text(
        body.user_name,
        body.elements,
        body.quote_total,
        body.labour_hours,
        body.people_count,
        body.material_cost,
    )
    ok, err = sm8.add_job_note(tokens["access_token"], body.job_uuid, note_text)
    if not ok:
        raise HTTPException(502, f"Failed to add job note: {err or 'unknown'}")

    # Persist quote for bonus/ledger (59.19); fail request if DB insert fails so we don't silently miss quotes
    job = sm8.fetch_job_by_uuid(tokens["access_token"], body.job_uuid)
    generated_job_id = job.get("generated_job_id") if job else None
    try:
        supabase = get_supabase()
        items = [m.model_dump() for m in (body.quote_materials or [])]
        insert_quote_for_job(
            supabase,
            servicem8_job_id=generated_job_id or "",
            servicem8_job_uuid=body.job_uuid,
            labour_hours=body.labour_hours,
            quote_total=body.quote_total,
            material_cost=body.material_cost,
            items=items,
        )
    except Exception as e:
        logger.exception("Failed to persist quote for Add to Job: %s", e)
        raise HTTPException(503, "Quote was added to the job in ServiceM8, but we couldn't save a copy for bonus tracking. Please don't add to this job again; contact support if you need this recorded.")

    return {
        "success": True,
        "uuid": body.job_uuid,
        "generated_job_id": generated_job_id,
    }


@app.post("/api/servicem8/upload-job-attachment")
def api_servicem8_upload_job_attachment(
    body: UploadJobAttachmentRequest,
    user_id: Any = Depends(get_current_user_id),
):
    """
    Upload the blueprint + elements PNG as an attachment to a ServiceM8 job.
    Requires OAuth scope manage_attachments. Accepts base64-encoded PNG from the frontend.
    When SERVICEM8_COMPANY_USER_ID is set, uses that user's token.
    """
    effective_id = sm8.get_effective_servicem8_user_id(str(user_id))
    tokens = sm8.get_tokens(effective_id)
    if not tokens:
        raise HTTPException(401, "ServiceM8 not connected")
    try:
        image_bytes = base64.b64decode(body.image_base64, validate=True)
    except Exception as e:
        logger.warning("Upload job attachment: invalid base64: %s", e)
        raise HTTPException(400, "Invalid image_base64")
    if len(image_bytes) > 10 * 1024 * 1024:
        logger.warning("Upload job attachment: image too large (%s bytes, max 10MB)", len(image_bytes))
        raise HTTPException(400, "Image too large (max 10MB)")
    attachment_name = (body.attachment_name or "Blueprint_Design.png").strip() or "Blueprint_Design.png"
    if not attachment_name.lower().endswith(".png"):
        attachment_name = attachment_name + ".png"
    ok, err, sm8_response = sm8.upload_job_attachment(
        tokens["access_token"],
        body.job_uuid,
        image_bytes,
        attachment_name=attachment_name,
        file_type=".png",
    )
    if not ok:
        raise HTTPException(502, f"Failed to upload attachment: {err or 'unknown'}")
    return {
        "success": True,
        "servicem8": sm8_response,
    }


def _build_job_note_text(
    user_name: str,
    elements: list,
    quote_total: float,
    labour_hours: float,
    people_count: int,
    material_cost: float,
) -> str:
    """
    Build the note text used for add-to-job, create-new-job (both notes), and new job description.
    Format matches: user/email, then "- Name x qty" lines, blank line, Total Price, Total Time used,
    People Req, Material Cost (all exc gst).
    """
    def _fmt_qty(q: float) -> str:
        return f"{q:g}"

    def _fmt_hours(h: float) -> str:
        h_fmt = f"{h:g}" if h == int(h) else f"{h}"
        return f"{h_fmt} hour" if h == 1 else f"{h_fmt} hours"

    lines = [f"- {e.name} x {_fmt_qty(e.qty)}" for e in elements]
    note_body = [
        user_name or "Quote App User",
        *lines,
        "",
        f"Total Price = ${quote_total:.2f} exc gst",
        f"- Total Time used = {_fmt_hours(labour_hours)}",
    ]
    if people_count:
        note_body.append(f"    - People Req = {people_count}")
    note_body.append(f"- Material Cost = ${material_cost:.2f} exc gst")
    return "\n".join(note_body)


@app.post("/api/servicem8/create-new-job")
def api_servicem8_create_new_job(
    body: CreateNewJobRequest,
    user_id: Any = Depends(get_current_user_id),
):
    """
    Create a new ServiceM8 job from the confirm popup (Create New Job Instead).
    Uses our generated UUID; copies fields from original job; adds materials to new job only;
    adds same note and diagram to both original and new job; copies job contact to new job.
    When SERVICEM8_COMPANY_USER_ID is set, uses that user's token.
    """
    effective_id = sm8.get_effective_servicem8_user_id(str(user_id))
    tokens = sm8.get_tokens(effective_id)
    if not tokens:
        raise HTTPException(401, "ServiceM8 not connected")
    access_token = tokens["access_token"]

    # Fetch original job (re-fetch by UUID so we have full body for copy)
    original_job = sm8.fetch_job_by_uuid(access_token, body.original_job_uuid)
    if not original_job:
        raise HTTPException(400, "Original job not found")
    if not original_job.get("company_uuid"):
        raise HTTPException(400, "company_uuid missing — cannot create new job for this job")

    new_job_uuid = str(uuid_lib.uuid4())

    # Job description = same content as note (parts list, totals, etc.)
    job_description = _build_job_note_text(
        body.user_name,
        body.elements,
        body.quote_total,
        body.labour_hours,
        body.people_count,
        body.material_cost,
    )
    job_description = "New job created via Jacks app for repairs.\n\n" + job_description

    # Build create-job payload from original job (required: company_uuid; copy optional fields)
    create_payload = {
        "uuid": new_job_uuid,
        "job_description": job_description,
        "status": "Quote",
        "company_uuid": original_job["company_uuid"],
    }
    for key in ("job_address", "lat", "lng", "billing_address", "geo_is_valid", "category_uuid", "badges"):
        if key in original_job and original_job[key] is not None:
            create_payload[key] = original_job[key]

    ok, err = sm8.create_job(access_token, create_payload)
    if not ok:
        raise HTTPException(502, f"Failed to create job: {err or 'unknown'}")

    # Add materials to new job (same format as add-to-job)
    profile_label = "spouting"
    if body.profile and body.profile.lower() == "stormcloud":
        profile_label = "Stormcloud"
    elif body.profile and body.profile.lower() == "classic":
        profile_label = "Classic"
    material_name = f"{profile_label} repairs, labour & materials"
    price_str = f"{body.quote_total:.2f}"
    cost_str = f"{body.material_cost:.2f}"
    ok, err = sm8.add_job_material(
        access_token,
        new_job_uuid,
        material_name,
        "1",
        price_str,
        cost=cost_str,
        displayed_amount=price_str,
        displayed_cost=cost_str,
    )
    if not ok:
        raise HTTPException(502, f"Failed to add materials to new job: {err or 'unknown'}")

    # Add note to both jobs (identical content)
    note_text = _build_job_note_text(
        body.user_name,
        body.elements,
        body.quote_total,
        body.labour_hours,
        body.people_count,
        body.material_cost,
    )
    ok, err = sm8.add_job_note(access_token, body.original_job_uuid, note_text)
    if not ok:
        raise HTTPException(502, f"Failed to add note to original job: {err or 'unknown'}")
    ok, err = sm8.add_job_note(access_token, new_job_uuid, note_text)
    if not ok:
        raise HTTPException(502, f"Failed to add note to new job: {err or 'unknown'}")

    # Add diagram to both jobs (same PNG)
    if body.image_base64:
        try:
            image_bytes = base64.b64decode(body.image_base64, validate=True)
        except Exception as e:
            logger.warning("Create new job: invalid image_base64: %s", e)
            raise HTTPException(400, "Invalid image_base64")
        if len(image_bytes) > 10 * 1024 * 1024:
            raise HTTPException(400, "Image too large (max 10MB)")
        attachment_name = "Blueprint_Design.png"
        for jid in (body.original_job_uuid, new_job_uuid):
            ok, err, _ = sm8.upload_job_attachment(
                access_token, jid, image_bytes, attachment_name=attachment_name, file_type=".png"
            )
            if not ok:
                raise HTTPException(502, f"Failed to attach blueprint to job: {err or 'unknown'}")

    # Job contact: get from original, create BILLING on new job (skip if no contact)
    contacts = sm8.get_job_contacts(access_token, body.original_job_uuid)
    if contacts:
        # Prefer first BILLING; else first contact
        contact = None
        for c in contacts:
            if (c.get("type") or "").upper() == "BILLING":
                contact = c
                break
        if contact is None:
            contact = contacts[0]
        contact_payload = {
            "job_uuid": new_job_uuid,
            "type": "BILLING",
            "first": contact.get("first") or "",
            "last": contact.get("last") or "",
            "phone": contact.get("phone") or "",
            "mobile": contact.get("mobile") or "",
            "email": contact.get("email") or "",
        }
        ok, err = sm8.create_job_contact(access_token, contact_payload)
        if not ok:
            raise HTTPException(502, f"Failed to create job contact: {err or 'unknown'}")

    new_job = sm8.fetch_job_by_uuid(access_token, new_job_uuid)
    generated_job_id = new_job.get("generated_job_id") if new_job else None

    # Persist quote for new job (59.19); fail request if DB insert fails
    try:
        supabase = get_supabase()
        items = [m.model_dump() for m in (body.quote_materials or [])]
        insert_quote_for_job(
            supabase,
            servicem8_job_id=generated_job_id or "",
            servicem8_job_uuid=new_job_uuid,
            labour_hours=body.labour_hours,
            quote_total=body.quote_total,
            material_cost=body.material_cost,
            items=items,
        )
    except Exception as e:
        logger.exception("Failed to persist quote for Create New Job: %s", e)
        raise HTTPException(503, "New job was created in ServiceM8, but we couldn't save a copy for bonus tracking. Please don't create another copy of this job; contact support if you need this recorded.")

    return {"success": True, "new_job_uuid": new_job_uuid, "generated_job_id": generated_job_id}


# Serve static frontend and assets (must be after API routes)
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
INDEX_HTML = FRONTEND_DIR / "index.html"
MANIFEST_FILE = FRONTEND_DIR / "manifest.webmanifest"
SERVICE_WORKER_FILE = FRONTEND_DIR / "service-worker.js"
NO_CACHE_STATIC_HEADERS = {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
}


@app.on_event("startup")
def startup():
    """Require Supabase and log how to load the app on a local server."""
    try:
        from app.supabase_client import get_supabase
        get_supabase()
    except ValueError as e:
        print("ERROR:", e)
        raise
    if FRONTEND_DIR.exists() and INDEX_HTML.exists():
        print("Quote App frontend: serve at http://127.0.0.1:8000/ (or your host:port)")
    else:
        print("WARNING: frontend not found at", FRONTEND_DIR, "- app will not load at /")


if FRONTEND_DIR.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIR / "assets"), name="assets")
    app.mount("/icons", StaticFiles(directory=FRONTEND_DIR / "icons"), name="icons")

    @app.get("/manifest.webmanifest")
    def manifest():
        """Serve manifest with no-cache so clients can pick up updates quickly."""
        if MANIFEST_FILE.exists():
            return FileResponse(
                MANIFEST_FILE,
                media_type="application/manifest+json",
                headers=NO_CACHE_STATIC_HEADERS,
            )
        raise HTTPException(404, "Manifest not found")

    @app.get("/service-worker.js")
    def service_worker():
        """Serve service worker with no-cache so browser can update it."""
        if SERVICE_WORKER_FILE.exists():
            return FileResponse(
                SERVICE_WORKER_FILE,
                media_type="text/javascript",
                headers=NO_CACHE_STATIC_HEADERS,
            )
        raise HTTPException(404, "Service worker not found")

    @app.get("/")
    def index():
        """Ensure the app loads at the root on a local server."""
        if INDEX_HTML.exists():
            return FileResponse(INDEX_HTML, media_type="text/html")
        from fastapi.responses import HTMLResponse
        return HTMLResponse("<h1>Quote App</h1><p>index.html not found in frontend/.</p>", status_code=404)

    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
else:
    @app.get("/")
    def index_missing():
        from fastapi.responses import HTMLResponse
        return HTMLResponse(
            "<h1>Quote App</h1><p>Frontend directory not found. Run from project root with <code>frontend/</code> present.</p>",
            status_code=503,
        )
