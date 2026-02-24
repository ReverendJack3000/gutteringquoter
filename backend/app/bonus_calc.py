"""
Bonus calculation helpers (Section 59.9). Base Job GP only; period pot and splits in 59.10+.
"""
PARTS_RUN_DEDUCTION_DOLLARS = 20


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
    Base Job GP (Step 1, 59.9): revenue − materials − (standard_parts_runs × $20).
    Uses only invoiced_revenue_exc_gst, materials_cost, standard_parts_runs.
    Does NOT subtract missed_materials_cost, callback_cost, or seller_fault_parts_runs.
    Pure function: no DB or env access. Treats None/missing as 0.
    """
    revenue = _to_float(job.get("invoiced_revenue_exc_gst"))
    materials = _to_float(job.get("materials_cost"))
    standard_runs = _to_float(job.get("standard_parts_runs"))
    deduction = standard_runs * PARTS_RUN_DEDUCTION_DOLLARS
    return round(revenue - materials - deduction, 2)
