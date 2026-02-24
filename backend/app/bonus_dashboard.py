"""
Section 59 technician dashboard (prototype).

Pure helpers for:
- current period selection (open first, else processing),
- period-job membership (bonus_period_id, with created_at fallback),
- provisional GP math for prototype UI,
- provisional per-technician contribution rows for ledger transparency.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional

from app.bonus_calc import (
    ELIGIBLE_JOB_STATUSES,
    apply_callback_voids,
    apply_estimation_accuracy,
    apply_seller_penalties,
    compute_job_base_splits,
    compute_job_gp,
    compute_job_spotter_splits,
)

PROVISIONAL_TEAM_POT_PERCENT = 0.10

PENDING_REASON_MESSAGES = {
    "final_rules_not_implemented": "Final bonus rules (59.9-59.15) are not fully applied yet.",
    "expected_payout_pending": "Expected payout is pending final rule validation.",
    "payout_may_change_until_period_closed": "Payout may change until the period is closed.",
    "period_link_fallback_created_at": "Job linked to this period by created_at fallback (bonus_period_id not set).",
    "roles_unverified": "Seller/Executor roles are not verified for this job yet.",
    "quoted_labour_missing": "Quoted labour is missing, so estimation checks are provisional.",
    "job_not_verified": "Job status is not verified yet.",
}


def _to_float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _to_int(value: Any) -> int:
    try:
        return int(round(float(value)))
    except (TypeError, ValueError):
        return 0


def _normalize_id(value: Any) -> str:
    return str(value or "").strip()


def _parse_date(value: Any) -> Optional[date]:
    if value is None:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    raw = str(value).strip()
    if not raw:
        return None
    try:
        return date.fromisoformat(raw[:10])
    except ValueError:
        return None


def _parse_datetime(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    raw = str(value).strip()
    if not raw:
        return None
    normalized = raw.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


def _period_sort_key(period: dict[str, Any]) -> tuple[date, date, str]:
    end_date = _parse_date(period.get("end_date")) or date.min
    start_date = _parse_date(period.get("start_date")) or date.min
    created_at = str(period.get("created_at") or "")
    return (end_date, start_date, created_at)


def select_current_period(period_rows: list[dict[str, Any]]) -> tuple[Optional[dict[str, Any]], str]:
    """
    Select current period using locked prototype rule:
    - most recent `open`,
    - else most recent `processing`,
    - else none.
    """
    if not period_rows:
        return (None, "none_available")
    open_rows = [dict(row) for row in period_rows if str((row or {}).get("status") or "").strip().lower() == "open"]
    if open_rows:
        return (max(open_rows, key=_period_sort_key), "latest_open")
    processing_rows = [dict(row) for row in period_rows if str((row or {}).get("status") or "").strip().lower() == "processing"]
    if processing_rows:
        return (max(processing_rows, key=_period_sort_key), "latest_processing")
    return (None, "none_available")


def get_job_period_link_method(job: dict[str, Any], period: dict[str, Any]) -> Optional[str]:
    """
    Return how this job links to the period:
    - "bonus_period_id" when job.bonus_period_id matches,
    - "created_at_fallback" when bonus_period_id is missing and created_at is within period dates.
    """
    period_id = _normalize_id(period.get("id"))
    if not period_id:
        return None
    job_period_id = _normalize_id(job.get("bonus_period_id"))
    if job_period_id:
        return "bonus_period_id" if job_period_id == period_id else None
    created_dt = _parse_datetime(job.get("created_at"))
    start_date = _parse_date(period.get("start_date"))
    end_date = _parse_date(period.get("end_date"))
    if not created_dt or not start_date or not end_date:
        return None
    created_day = created_dt.date()
    if start_date <= created_day <= end_date:
        return "created_at_fallback"
    return None


def select_period_jobs(period: dict[str, Any], jobs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Filter jobs for period using bonus_period_id first, then created_at fallback."""
    selected: list[dict[str, Any]] = []
    for row in jobs or []:
        job = dict(row or {})
        link_method = get_job_period_link_method(job, period)
        if not link_method:
            continue
        job["period_link_method"] = link_method
        selected.append(job)
    return selected


MIN_GP_MARGIN = 0.50  # Section 60.5: Job GP / Price to Customer >= 50% for pot eligibility


def filter_eligible_period_jobs(period_jobs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Return only jobs with status in ('verified', 'processed') and minimum GP margin (60.5)
    for period pot and canonical ledger.
    Per BACKEND_DATABASE.md §4: only verified/processed rows in period pot.
    Section 60.5: Eligibility formula Job GP / Price to Customer (revenue) >= 0.50.
    """
    if not period_jobs:
        return []
    statuses = {s.strip().lower() for s in ELIGIBLE_JOB_STATUSES}
    out = []
    for job in period_jobs:
        if str((job or {}).get("status") or "").strip().lower() not in statuses:
            continue
        revenue = _to_float(job.get("invoiced_revenue_exc_gst"))
        if revenue <= 0:
            continue
        job_gp = compute_job_gp(job)
        if job_gp / revenue < MIN_GP_MARGIN:
            continue
        # Section 60.6: only true upsells count toward period pot
        if not (job or {}).get("is_upsell", False):
            continue
        out.append(job)
    return out


def compute_provisional_job_gp(job: dict[str, Any]) -> float:
    """Prototype GP only: invoiced_revenue_exc_gst - materials_cost."""
    revenue = _to_float(job.get("invoiced_revenue_exc_gst"))
    materials_cost = _to_float(job.get("materials_cost"))
    return round(revenue - materials_cost, 2)


def compute_provisional_team_pot(period_jobs: list[dict[str, Any]]) -> float:
    """Prototype team pot: 10% of sum(provisional job GP)."""
    total_gp = sum(compute_provisional_job_gp(job) for job in (period_jobs or []))
    return round(total_gp * PROVISIONAL_TEAM_POT_PERCENT, 2)


def group_personnel_by_job(personnel_rows: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in personnel_rows or []:
        job_id = _normalize_id((row or {}).get("job_performance_id"))
        if not job_id:
            continue
        grouped.setdefault(job_id, []).append(dict(row or {}))
    return grouped


def _build_estimation_payload(
    *,
    is_seller: bool,
    quoted_labor_minutes: int,
    actual_labor_minutes: int,
) -> Optional[dict[str, Any]]:
    if not is_seller:
        return None
    if quoted_labor_minutes <= 0:
        return {
            "status": "unknown",
            "quoted_labor_minutes": quoted_labor_minutes,
            "actual_labor_minutes": actual_labor_minutes,
            "tolerance_minutes": None,
            "message": "Quoted labour is missing.",
        }
    tolerance = max(int(round(quoted_labor_minutes * 0.15)), 20)
    within = abs(actual_labor_minutes - quoted_labor_minutes) <= tolerance
    return {
        "status": "pass" if within else "fail",
        "quoted_labor_minutes": quoted_labor_minutes,
        "actual_labor_minutes": actual_labor_minutes,
        "tolerance_minutes": tolerance,
        "message": (
            "Actual labour is within the provisional tolerance."
            if within
            else "Actual labour is outside the provisional tolerance."
        ),
    }


def build_provisional_ledger_rows(
    period_jobs: list[dict[str, Any]],
    personnel_by_job: dict[str, list[dict[str, Any]]],
    technician_id: str,
) -> list[dict[str, Any]]:
    """
    Build technician job ledger rows for prototype dashboard.
    Includes role badges, provisional contribution, estimation signal, and penalty tags.
    """
    tech_id = _normalize_id(technician_id)
    rows: list[dict[str, Any]] = []
    for job in period_jobs or []:
        job_id = _normalize_id((job or {}).get("id"))
        if not job_id:
            continue
        personnel = list(personnel_by_job.get(job_id) or [])
        if not personnel:
            continue
        personnel_by_tech: dict[str, dict[str, Any]] = {}
        for person in personnel:
            person_tech_id = _normalize_id(person.get("technician_id"))
            if not person_tech_id:
                continue
            personnel_by_tech[person_tech_id] = person
        if tech_id not in personnel_by_tech:
            continue

        seller_ids = sorted({
            _normalize_id(p.get("technician_id"))
            for p in personnel
            if p.get("is_seller") is True and _normalize_id(p.get("technician_id"))
        })
        executor_ids = sorted({
            _normalize_id(p.get("technician_id"))
            for p in personnel
            if p.get("is_executor") is True and _normalize_id(p.get("technician_id"))
        })
        is_seller = tech_id in seller_ids
        is_executor = tech_id in executor_ids
        do_it_all = (
            len(seller_ids) == 1
            and len(executor_ids) == 1
            and seller_ids[0] == executor_ids[0] == tech_id
        )
        job_gp = compute_provisional_job_gp(job)
        contribution = 0.0
        if do_it_all:
            contribution = job_gp
        else:
            if is_seller and seller_ids:
                contribution += job_gp * 0.60 / len(seller_ids)
            if is_executor and executor_ids:
                contribution += job_gp * 0.40 / len(executor_ids)
        contribution = round(contribution, 2)

        role_badges: list[str] = []
        if do_it_all:
            role_badges.append("Do-It-All")
        else:
            if is_seller:
                role_badges.append("Co-Seller" if len(seller_ids) > 1 else "Seller")
            if is_executor:
                role_badges.append("Co-Executor" if len(executor_ids) > 1 else "Executor")

        actual_labor_minutes = sum(
            _to_int(p.get("onsite_minutes")) + _to_int(p.get("travel_shopping_minutes"))
            for p in personnel
        )
        quoted_labor_minutes = _to_int(job.get("quoted_labor_minutes"))
        estimation = _build_estimation_payload(
            is_seller=is_seller,
            quoted_labor_minutes=quoted_labor_minutes,
            actual_labor_minutes=actual_labor_minutes,
        )

        pending_reasons = ["final_rules_not_implemented", "expected_payout_pending"]
        if str((job or {}).get("period_link_method") or "") == "created_at_fallback":
            pending_reasons.append("period_link_fallback_created_at")
        if (not is_seller) and (not is_executor):
            pending_reasons.append("roles_unverified")
        if is_seller and quoted_labor_minutes <= 0:
            pending_reasons.append("quoted_labour_missing")
        if str((job or {}).get("status") or "").strip().lower() != "verified":
            pending_reasons.append("job_not_verified")
        pending_reasons = sorted(set(pending_reasons))

        penalty_tags: list[dict[str, Any]] = []
        explanations: list[str] = []

        seller_fault_parts_runs = _to_int(job.get("seller_fault_parts_runs"))
        if is_seller and seller_fault_parts_runs > 0:
            amount = round(seller_fault_parts_runs * 10.0, 2)
            penalty_tags.append({
                "code": "seller_fault_parts_runs",
                "label": f"Parts Run (-${amount:.2f})",
                "amount": amount,
            })
            explanations.append(
                f"Seller fault parts runs: {seller_fault_parts_runs} x $10 provisional penalty."
            )

        missed_materials_cost = _to_float(job.get("missed_materials_cost"))
        if is_seller and missed_materials_cost > 0:
            penalty_tags.append({
                "code": "missed_materials",
                "label": f"Missed Materials (-${missed_materials_cost:.2f})",
                "amount": round(missed_materials_cost, 2),
            })
            explanations.append(
                f"Missed materials provisional penalty: ${missed_materials_cost:.2f}."
            )

        callback_reason = str((job or {}).get("callback_reason") or "").strip().lower()
        is_callback = bool(job.get("is_callback"))
        if is_callback and callback_reason == "poor_workmanship" and is_executor:
            penalty_tags.append({
                "code": "callback_poor_workmanship",
                "label": "Callback: Poor Workmanship",
                "amount": None,
            })
            explanations.append("Callback reason is poor workmanship (executor impact pending final rules).")
        if is_callback and callback_reason == "bad_scoping" and is_seller:
            penalty_tags.append({
                "code": "callback_bad_scoping",
                "label": "Callback: Bad Scoping",
                "amount": None,
            })
            explanations.append("Callback reason is bad scoping (seller impact pending final rules).")

        rows.append({
            "job_performance_id": job_id,
            "servicem8_job_id": _normalize_id(job.get("servicem8_job_id")),
            "servicem8_job_uuid": _normalize_id(job.get("servicem8_job_uuid")),
            "job_identifier": _normalize_id(job.get("servicem8_job_id")) or f"Job {job_id[:8]}",
            "created_at": job.get("created_at"),
            "status": job.get("status"),
            "period_link_method": job.get("period_link_method"),
            "is_provisional": True,
            "role_badges": role_badges,
            "seller_count": len(seller_ids),
            "executor_count": len(executor_ids),
            "truck_share_applied": (len(seller_ids) > 1) or (len(executor_ids) > 1),
            "job_gp": job_gp,
            "my_job_gp_contribution": contribution,
            "estimation": estimation,
            "penalty_tags": penalty_tags,
            "pending_reasons": pending_reasons,
            "pending_reason_messages": [PENDING_REASON_MESSAGES.get(code, code) for code in pending_reasons],
            "explanations": explanations,
        })

    rows.sort(
        key=lambda row: (
            _parse_datetime(row.get("created_at")) or datetime.min,
            _normalize_id(row.get("job_performance_id")),
        ),
        reverse=True,
    )
    return rows


def build_canonical_ledger_rows(
    eligible_jobs: list[dict[str, Any]],
    personnel_by_job: dict[str, list[dict[str, Any]]],
    technician_id: str,
) -> list[dict[str, Any]]:
    """
    Build technician job ledger rows using canonical rule engine (59.9–59.15).
    Same row shape as build_provisional_ledger_rows for drop-in replacement.
    Only includes jobs where the viewing technician is in personnel.
    Pipeline: base_splits → callback_voids → estimation_accuracy → seller_penalties.
    """
    tech_id = _normalize_id(technician_id)
    rows: list[dict[str, Any]] = []
    for job in eligible_jobs or []:
        job_id = _normalize_id((job or {}).get("id"))
        if not job_id:
            continue
        personnel = list(personnel_by_job.get(job_id) or [])
        if not personnel:
            continue
        personnel_by_tech: dict[str, dict[str, Any]] = {}
        for person in personnel:
            person_tech_id = _normalize_id(person.get("technician_id"))
            if not person_tech_id:
                continue
            personnel_by_tech[person_tech_id] = person
        if tech_id not in personnel_by_tech:
            continue

        # Section 60.4: If job has spotter(s), 20% to spotter(s), 80% to CSG; else normal 60/40.
        spotter_splits = compute_job_spotter_splits(job, personnel)
        if spotter_splits is not None:
            splits0 = spotter_splits
            splits1 = apply_callback_voids(job, splits0)
            splits2 = apply_estimation_accuracy(job, personnel, splits1)
            splits3 = apply_seller_penalties(job, personnel, splits2)
        else:
            splits0 = compute_job_base_splits(job, personnel)
            splits1 = apply_callback_voids(job, splits0)
            splits2 = apply_estimation_accuracy(job, personnel, splits1)
            splits3 = apply_seller_penalties(job, personnel, splits2)

        job_gp = compute_job_gp(job)
        amounts = splits3.get(tech_id) or {}
        my_job_gp_contribution = round(
            _to_float(amounts.get("seller_base"))
            + _to_float(amounts.get("executor_base"))
            + _to_float(amounts.get("spotter_base")),
            2,
        )

        seller_ids = sorted({
            _normalize_id(p.get("technician_id"))
            for p in personnel
            if p.get("is_seller") is True and _normalize_id(p.get("technician_id"))
        })
        executor_ids = sorted({
            _normalize_id(p.get("technician_id"))
            for p in personnel
            if p.get("is_executor") is True and _normalize_id(p.get("technician_id"))
        })
        is_seller = tech_id in seller_ids
        is_executor = tech_id in executor_ids
        is_spotter = (personnel_by_tech.get(tech_id) or {}).get("is_spotter") is True
        do_it_all = (
            len(seller_ids) == 1
            and len(executor_ids) == 1
            and seller_ids[0] == executor_ids[0] == tech_id
        )

        role_badges: list[str] = []
        if is_spotter:
            role_badges.append("Spotter")
        if do_it_all:
            role_badges.append("Do-It-All")
        else:
            if is_seller:
                role_badges.append("Co-Seller" if len(seller_ids) > 1 else "Seller")
            if is_executor:
                role_badges.append("Co-Executor" if len(executor_ids) > 1 else "Executor")

        actual_labor_minutes = sum(
            _to_int(p.get("onsite_minutes")) + _to_int(p.get("travel_shopping_minutes"))
            for p in personnel
        )
        quoted_labor_minutes = _to_int(job.get("quoted_labor_minutes"))
        estimation = _build_estimation_payload(
            is_seller=is_seller,
            quoted_labor_minutes=quoted_labor_minutes,
            actual_labor_minutes=actual_labor_minutes,
        )

        pending_reasons: list[str] = []
        if str((job or {}).get("period_link_method") or "") == "created_at_fallback":
            pending_reasons.append("period_link_fallback_created_at")
        if (not is_seller) and (not is_executor):
            pending_reasons.append("roles_unverified")
        if is_seller and quoted_labor_minutes <= 0:
            pending_reasons.append("quoted_labour_missing")
        if str((job or {}).get("status") or "").strip().lower() not in ("verified", "processed"):
            pending_reasons.append("job_not_verified")
        pending_reasons = sorted(set(pending_reasons))

        penalty_tags: list[dict[str, Any]] = []
        explanations: list[str] = []

        seller_fault_parts_runs = _to_int(job.get("seller_fault_parts_runs"))
        if is_seller and seller_fault_parts_runs > 0:
            amount = round(seller_fault_parts_runs * 10.0, 2)
            penalty_tags.append({
                "code": "seller_fault_parts_runs",
                "label": f"Parts Run (-${amount:.2f})",
                "amount": amount,
            })
            explanations.append(
                f"Seller fault parts runs: {seller_fault_parts_runs} x $10 applied."
            )

        missed_materials_cost = _to_float(job.get("missed_materials_cost"))
        if is_seller and missed_materials_cost > 0:
            penalty_tags.append({
                "code": "missed_materials",
                "label": f"Missed Materials (-${missed_materials_cost:.2f})",
                "amount": round(missed_materials_cost, 2),
            })
            explanations.append(f"Missed materials penalty: ${missed_materials_cost:.2f} applied.")

        callback_reason = str((job or {}).get("callback_reason") or "").strip().lower()
        is_callback = bool(job.get("is_callback"))
        if is_callback and callback_reason == "poor_workmanship" and is_executor:
            penalty_tags.append({
                "code": "callback_poor_workmanship",
                "label": "Callback: Poor Workmanship",
                "amount": None,
            })
            explanations.append("Callback reason is poor workmanship (executor share voided).")
        if is_callback and callback_reason == "bad_scoping" and is_seller:
            penalty_tags.append({
                "code": "callback_bad_scoping",
                "label": "Callback: Bad Scoping",
                "amount": None,
            })
            explanations.append("Callback reason is bad scoping (seller share voided).")

        rows.append({
            "job_performance_id": job_id,
            "servicem8_job_id": _normalize_id(job.get("servicem8_job_id")),
            "servicem8_job_uuid": _normalize_id(job.get("servicem8_job_uuid")),
            "job_identifier": _normalize_id(job.get("servicem8_job_id")) or f"Job {job_id[:8]}",
            "created_at": job.get("created_at"),
            "status": job.get("status"),
            "period_link_method": job.get("period_link_method"),
            "is_provisional": False,
            "role_badges": role_badges,
            "seller_count": len(seller_ids),
            "executor_count": len(executor_ids),
            "truck_share_applied": (len(seller_ids) > 1) or (len(executor_ids) > 1),
            "job_gp": job_gp,
            "my_job_gp_contribution": my_job_gp_contribution,
            "estimation": estimation,
            "penalty_tags": penalty_tags,
            "pending_reasons": pending_reasons,
            "pending_reason_messages": [PENDING_REASON_MESSAGES.get(code, code) for code in pending_reasons],
            "explanations": explanations,
        })

    rows.sort(
        key=lambda row: (
            _parse_datetime(row.get("created_at")) or datetime.min,
            _normalize_id(row.get("job_performance_id")),
        ),
        reverse=True,
    )
    return rows


def compute_total_contributed_gp(
    eligible_jobs: list[dict[str, Any]],
    personnel_by_job: dict[str, list[dict[str, Any]]],
) -> float:
    """
    Sum of all technicians' final contributions across eligible jobs (canonical pipeline).
    Used to compute my_expected_payout = period_pot * (my_gp / total_contributed_gp).
    Includes spotter_base (60.4).
    """
    total = 0.0
    for job in eligible_jobs or []:
        job_id = _normalize_id((job or {}).get("id"))
        if not job_id:
            continue
        personnel = list(personnel_by_job.get(job_id) or [])
        if not personnel:
            continue
        spotter_splits = compute_job_spotter_splits(job, personnel)
        if spotter_splits is not None:
            splits0 = spotter_splits
        else:
            splits0 = compute_job_base_splits(job, personnel)
        splits1 = apply_callback_voids(job, splits0)
        splits2 = apply_estimation_accuracy(job, personnel, splits1)
        splits3 = apply_seller_penalties(job, personnel, splits2)
        for _tech_id, amounts in splits3.items():
            total += (
                _to_float(amounts.get("seller_base"))
                + _to_float(amounts.get("executor_base"))
                + _to_float(amounts.get("spotter_base"))
            )
    return round(total, 2)


def compute_per_technician_seller_gp(
    eligible_jobs: list[dict[str, Any]],
    personnel_by_job: dict[str, list[dict[str, Any]]],
) -> dict[str, float]:
    """
    59.16.8: Per-technician total seller GP (sum of seller_base across eligible jobs).
    Same pipeline as compute_total_contributed_gp; used for leaderboard_sellers.
    Returns dict technician_id -> total seller GP (rounded to 2 decimals).
    """
    by_tech: dict[str, float] = {}
    for job in eligible_jobs or []:
        job_id = _normalize_id((job or {}).get("id"))
        if not job_id:
            continue
        personnel = list(personnel_by_job.get(job_id) or [])
        if not personnel:
            continue
        spotter_splits = compute_job_spotter_splits(job, personnel)
        if spotter_splits is not None:
            splits0 = spotter_splits
        else:
            splits0 = compute_job_base_splits(job, personnel)
        splits1 = apply_callback_voids(job, splits0)
        splits2 = apply_estimation_accuracy(job, personnel, splits1)
        splits3 = apply_seller_penalties(job, personnel, splits2)
        for tech_id, amounts in splits3.items():
            tid = _normalize_id(tech_id)
            if not tid:
                continue
            by_tech[tid] = by_tech.get(tid, 0.0) + _to_float(amounts.get("seller_base"))
    return {tid: round(val, 2) for tid, val in by_tech.items()}


def compute_per_technician_executor_gp(
    eligible_jobs: list[dict[str, Any]],
    personnel_by_job: dict[str, list[dict[str, Any]]],
) -> dict[str, float]:
    """
    59.16.8: Per-technician total executor GP (sum of executor_base across eligible jobs).
    Same pipeline as compute_total_contributed_gp; used for leaderboard_executors.
    Returns dict technician_id -> total executor GP (rounded to 2 decimals).
    """
    by_tech: dict[str, float] = {}
    for job in eligible_jobs or []:
        job_id = _normalize_id((job or {}).get("id"))
        if not job_id:
            continue
        personnel = list(personnel_by_job.get(job_id) or [])
        if not personnel:
            continue
        spotter_splits = compute_job_spotter_splits(job, personnel)
        if spotter_splits is not None:
            splits0 = spotter_splits
        else:
            splits0 = compute_job_base_splits(job, personnel)
        splits1 = apply_callback_voids(job, splits0)
        splits2 = apply_estimation_accuracy(job, personnel, splits1)
        splits3 = apply_seller_penalties(job, personnel, splits2)
        for tech_id, amounts in splits3.items():
            tid = _normalize_id(tech_id)
            if not tid:
                continue
            by_tech[tid] = by_tech.get(tid, 0.0) + _to_float(amounts.get("executor_base"))
    return {tid: round(val, 2) for tid, val in by_tech.items()}


def compute_technician_contribution_total(ledger_rows: list[dict[str, Any]]) -> float:
    total = sum(_to_float((row or {}).get("my_job_gp_contribution")) for row in (ledger_rows or []))
    return round(total, 2)


def compute_hot_streak(
    eligible_jobs: list[dict[str, Any]],
    personnel_by_job: dict[str, list[dict[str, Any]]],
    technician_id: str,
) -> dict[str, Any]:
    """
    59.16.5: Hot streak from consecutive jobs (most recent first) with zero callbacks
    and zero parts runs (standard + seller_fault). Returns hot_streak_count and hot_streak_active.
    """
    tech_id = _normalize_id(technician_id)
    jobs_for_tech: list[dict[str, Any]] = []
    for job in eligible_jobs or []:
        job_id = _normalize_id((job or {}).get("id"))
        if not job_id:
            continue
        personnel = list(personnel_by_job.get(job_id) or [])
        if not any(_normalize_id(p.get("technician_id")) == tech_id for p in personnel):
            continue
        jobs_for_tech.append(job)
    jobs_for_tech.sort(
        key=lambda j: (_parse_datetime(j.get("created_at")) or datetime.min, _normalize_id(j.get("id"))),
        reverse=True,
    )
    count = 0
    for job in jobs_for_tech:
        is_callback = (job or {}).get("is_callback") is True
        standard = _to_int((job or {}).get("standard_parts_runs"))
        seller_fault = _to_int((job or {}).get("seller_fault_parts_runs"))
        if is_callback or standard > 0 or seller_fault > 0:
            break
        count += 1
    return {
        "hot_streak_count": count,
        "hot_streak_active": count > 0,
    }


def build_badge_events(
    ledger_rows: list[dict[str, Any]],
    hero: dict[str, Any],
) -> list[dict[str, Any]]:
    """
    59.16.6: Badge evidence for tooltip-grade explanations. One entry per badge code
    with earned (bool) and evidence_text (string). Codes align with frontend effect chips.
    """
    rows = ledger_rows or []
    hero = hero or {}
    do_it_all_count = 0
    sniper_count = 0
    sniper_evidence = "You nailed the quote tolerance window."
    flat_tire_count = 0
    red_flag_count = 0
    for row in rows:
        role_badges = list((row or {}).get("role_badges") or [])
        penalty_tags = list((row or {}).get("penalty_tags") or [])
        estimation = (row or {}).get("estimation") or {}
        explanations = list((row or {}).get("explanations") or [])
        if any("do-it-all" in str(b).lower() for b in role_badges):
            do_it_all_count += 1
        if str(estimation.get("status") or "").strip().lower() == "pass":
            sniper_count += 1
            if str(estimation.get("message") or "").strip():
                sniper_evidence = str(estimation.get("message")).strip()
            if explanations:
                sniper_evidence = explanations[0]
        for tag in penalty_tags:
            code = str((tag or {}).get("code") or "").strip().lower()
            if code == "seller_fault_parts_runs":
                flat_tire_count += 1
            if code in ("callback_bad_scoping", "callback_poor_workmanship"):
                red_flag_count += 1
    hot_streak_count = int(hero.get("hot_streak_count") or 0)
    hot_streak_active = bool(hero.get("hot_streak_active"))
    events: list[dict[str, Any]] = [
        {
            "code": "do_it_all",
            "earned": do_it_all_count > 0,
            "evidence_text": (
                f"{do_it_all_count} job(s) where you sold and executed."
                if do_it_all_count > 0
                else "Unlock when you sell and execute the same job on one visit.",
            ),
        },
        {
            "code": "sniper",
            "earned": sniper_count > 0,
            "evidence_text": (
                sniper_evidence if sniper_count > 0 else "Unlock when actual labour lands inside tolerance."
            ),
        },
        {
            "code": "hot_streak",
            "earned": hot_streak_active,
            "evidence_text": (
                f"{hot_streak_count} consecutive clean jobs."
                if hot_streak_active
                else "Unlock with consecutive jobs with no callbacks and no parts runs.",
            ),
        },
        {
            "code": "flat_tire",
            "earned": flat_tire_count > 0,
            "evidence_text": (
                f"{flat_tire_count} unscheduled parts run penalties recorded."
                if flat_tire_count > 0
                else "No unscheduled parts run penalties in this period.",
            ),
        },
        {
            "code": "red_flag",
            "earned": red_flag_count > 0,
            "evidence_text": (
                f"{red_flag_count} callback-driven GP penalties recorded."
                if red_flag_count > 0
                else "No callback voids recorded in this period.",
            ),
        },
    ]
    return events
