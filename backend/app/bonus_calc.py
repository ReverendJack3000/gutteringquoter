"""
Bonus calculation helpers (Section 59.9–59.10, 60.2). Base Job GP; period pot (59.10).
"""
PARTS_RUN_DEDUCTION_DOLLARS = 10  # Section 60.2: Flat $10 Travel Fee per unscheduled parts run
PERIOD_POT_PERCENT = 0.10
ELIGIBLE_JOB_STATUSES = ("verified", "processed")


def _to_float(value: object) -> float:
    """Coerce to float; None or invalid → 0."""
    if value is None:
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def compute_job_gp(job: dict) -> float:
    """
    Base Job GP (Step 1, 59.9, 60.2): revenue − materials − (standard_parts_runs × $10).
    Uses only invoiced_revenue_exc_gst, materials_cost, standard_parts_runs.
    Does NOT subtract missed_materials_cost, callback_cost, or seller_fault_parts_runs.
    Pure function: no DB or env access. Treats None/missing as 0.
    """
    revenue = _to_float(job.get("invoiced_revenue_exc_gst"))
    materials = _to_float(job.get("materials_cost"))
    standard_runs = _to_float(job.get("standard_parts_runs"))
    deduction = standard_runs * PARTS_RUN_DEDUCTION_DOLLARS
    return round(revenue - materials - deduction, 2)


def compute_period_pot(eligible_jobs: list[dict]) -> float:
    """
    Period Pot (Step 2, 59.10): Sum(Job GP × 0.10) for eligible jobs − global_callback_costs.
    Caller must pass only jobs with status in ('verified', 'processed') and linked to the period.
    """
    total_contrib = 0.0
    total_callback = 0.0
    for job in eligible_jobs or []:
        total_contrib += compute_job_gp(job) * PERIOD_POT_PERCENT
        total_callback += _to_float(job.get("callback_cost"))
    return round(total_contrib - total_callback, 2)


SELLER_SHARE = 0.60
EXECUTOR_SHARE = 0.40
SPOTTER_SHARE = 0.20  # Section 60.4: 20% of job GP to spotter; remaining 80% to CSG (house)


def _normalize_tech_id(p: dict) -> str:
    return str(p.get("technician_id") or "").strip()


def compute_job_spotter_splits(job: dict, personnel: list[dict]):
    # Returns Optional[dict[str, dict]]; type hint as comment for Python 3.9
    """
    Section 60.4: If any personnel is_spotter, allocate 20% of Job GP to spotter(s);
    remaining 80% reverts to CSG (not allocated to anyone). Returns split dict or None if no spotters.
    """
    personnel = personnel or []
    spotters = [p for p in personnel if p.get("is_spotter") is True]
    if not spotters:
        return None
    job_gp = compute_job_gp(job)
    spotter_ids = sorted({_normalize_tech_id(p) for p in spotters if _normalize_tech_id(p)})
    if not spotter_ids:
        return None
    amount_per_spotter = round(job_gp * SPOTTER_SHARE / len(spotter_ids), 2)
    out: dict[str, dict] = {}
    for tech_id in spotter_ids:
        out[tech_id] = {
            "seller_base": 0.0,
            "executor_base": 0.0,
            "spotter_base": amount_per_spotter,
        }
    # Anyone else on the job (non-spotter) gets 0; 80% to CSG
    for p in personnel:
        tid = _normalize_tech_id(p)
        if tid and tid not in out:
            out[tid] = {"seller_base": 0.0, "executor_base": 0.0, "spotter_base": 0.0}
    return out


def compute_job_base_splits(
    job: dict,
    personnel: list[dict],
) -> dict[str, dict]:
    """
    Base splits (Step 3, 59.11): Seller Base = Job GP × 0.60, Executor Base = Job GP × 0.40;
    do-it-all (single tech both seller and executor) → 100% to that tech; truck share by headcount.
    Returns { technician_id: { "seller_base": float, "executor_base": float [, "spotter_base": 0] } }.
    Does NOT apply callbacks (59.12), estimation (59.13), or seller penalties (59.14).
    When job has spotters (60.4), use compute_job_spotter_splits instead (caller's responsibility).
    """
    job_gp = compute_job_gp(job)
    personnel = personnel or []
    sellers = [p for p in personnel if p.get("is_seller") is True]
    executors = [p for p in personnel if p.get("is_executor") is True]
    seller_ids = sorted({_normalize_tech_id(p) for p in sellers if _normalize_tech_id(p)})
    executor_ids = sorted({_normalize_tech_id(p) for p in executors if _normalize_tech_id(p)})

    do_it_all = (
        len(seller_ids) == 1
        and len(executor_ids) == 1
        and seller_ids[0] == executor_ids[0]
    )
    tech_ids = sorted(set(seller_ids) | set(executor_ids))
    out: dict[str, dict] = {}
    for tech_id in tech_ids:
        seller_base = 0.0
        executor_base = 0.0
        if do_it_all and tech_id == seller_ids[0]:
            seller_base = job_gp
        else:
            if tech_id in seller_ids:
                seller_base = job_gp * SELLER_SHARE / len(seller_ids)
            if tech_id in executor_ids:
                executor_base = job_gp * EXECUTOR_SHARE / len(executor_ids)
        out[tech_id] = {
            "seller_base": round(seller_base, 2),
            "executor_base": round(executor_base, 2),
            "spotter_base": 0.0,
        }
    return out


def _estimation_within_tolerance(quoted_labor_minutes: int, actual_labor_minutes: int) -> bool:
    """
    Estimation accuracy (59.13, 60.3): within 15% of quoted or 20 minutes, whichever is greater.
    Edge: quoted_labor_minutes <= 0 → tolerance = 20 (max(0, 20)).
    """
    quoted = int(quoted_labor_minutes) if quoted_labor_minutes is not None else 0
    actual = int(actual_labor_minutes) if actual_labor_minutes is not None else 0
    tolerance = max(int(round(quoted * 0.15)), 20)
    return abs(actual - quoted) <= tolerance


def apply_estimation_accuracy(
    job: dict,
    personnel: list[dict],
    splits: dict[str, dict],
) -> dict[str, dict]:
    """
    Estimation accuracy (59.13, 60.3): Seller share applies only if actual labour is within
    15% of quoted_labor_minutes or 20 minutes, whichever is greater. Zeros seller_base
    for each seller when outside tolerance. Actual labour = sum(onsite_minutes + travel_shopping_minutes)
    across personnel for this job.
    """
    quoted = int(_to_float(job.get("quoted_labor_minutes")))
    actual = sum(
        int(_to_float(p.get("onsite_minutes"))) + int(_to_float(p.get("travel_shopping_minutes")))
        for p in (personnel or [])
    )
    within = _estimation_within_tolerance(quoted, actual)
    seller_ids = {_normalize_tech_id(p) for p in (personnel or []) if p.get("is_seller") is True}
    out = {}
    for tech_id, amounts in splits.items():
        seller_base = amounts.get("seller_base") or 0.0
        executor_base = amounts.get("executor_base") or 0.0
        spotter_base = amounts.get("spotter_base") or 0.0
        if tech_id in seller_ids and not within:
            seller_base = 0.0
        out[tech_id] = {"seller_base": seller_base, "executor_base": executor_base, "spotter_base": spotter_base}
    return out


def apply_seller_penalties(
    job: dict,
    personnel: list[dict],
    splits: dict[str, dict],
) -> dict[str, dict]:
    """
    Post-split penalties (59.14, 60.2): Seller Final = Seller Base − missed_materials_cost
    − (seller_fault_parts_runs × $10). Penalty is per job; split equally across sellers.
    Uses PARTS_RUN_DEDUCTION_DOLLARS (10). Van-stock missed materials are already in
    materials_cost and thus in Base Job GP; missed_materials_cost here is Parts Run only.
    Zero-out floor (60.2): Seller's payout for that job cannot drop below $0 (max(0, seller_share - penalty)).
    """
    missed = _to_float(job.get("missed_materials_cost"))
    seller_fault_runs = int(_to_float(job.get("seller_fault_parts_runs")))
    penalty_total = missed + (seller_fault_runs * PARTS_RUN_DEDUCTION_DOLLARS)
    seller_ids = [t for t in splits if (splits.get(t) or {}).get("seller_base", 0) != 0]
    if not seller_ids or penalty_total <= 0:
        return dict(splits)
    per_seller = round(penalty_total / len(seller_ids), 2)
    out = {}
    for tech_id, amounts in splits.items():
        seller_base = amounts.get("seller_base") or 0.0
        executor_base = amounts.get("executor_base") or 0.0
        spotter_base = amounts.get("spotter_base") or 0.0
        if tech_id in seller_ids:
            seller_base = max(0.0, round(seller_base - per_seller, 2))
        out[tech_id] = {"seller_base": seller_base, "executor_base": executor_base, "spotter_base": spotter_base}
    return out


def apply_callback_voids(job: dict, splits: dict[str, dict]) -> dict[str, dict]:
    """
    Callback rules (59.12): poor_workmanship → void Executor GP for that job;
    bad_scoping → void Seller GP for that job. Returns a copy of splits with amounts zeroed.
    Preserves spotter_base (60.4).
    """
    is_callback = bool(job.get("is_callback"))
    reason = str((job.get("callback_reason") or "")).strip().lower()
    if not is_callback or not reason:
        return dict(splits)
    out = {}
    for tech_id, amounts in splits.items():
        seller_base = amounts.get("seller_base") or 0.0
        executor_base = amounts.get("executor_base") or 0.0
        spotter_base = amounts.get("spotter_base") or 0.0
        if reason == "poor_workmanship":
            executor_base = 0.0
        if reason == "bad_scoping":
            seller_base = 0.0
        out[tech_id] = {"seller_base": seller_base, "executor_base": executor_base, "spotter_base": spotter_base}
    return out
