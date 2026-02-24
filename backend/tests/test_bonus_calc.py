"""
Tests for bonus_calc (Section 59.9–59.15).

Run from project root:  ./scripts/run-backend-tests.sh
Or from backend/:       python3 -m unittest discover -s tests -p "test_*.py" -v
This file only:         python3 -m unittest tests.test_bonus_calc -v
"""
import unittest
import sys
from pathlib import Path

# Allow importing app from backend
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.bonus_calc import (
    compute_job_gp,
    compute_job_base_splits,
    PARTS_RUN_DEDUCTION_DOLLARS,
    SELLER_SHARE,
    EXECUTOR_SHARE,
)


class TestComputeJobGp(unittest.TestCase):
    def test_basic(self):
        job = {
            "invoiced_revenue_exc_gst": 1000,
            "materials_cost": 200,
            "standard_parts_runs": 0,
        }
        self.assertEqual(compute_job_gp(job), 800.0)

    def test_parts_run_deduction(self):
        job = {
            "invoiced_revenue_exc_gst": 1000,
            "materials_cost": 200,
            "standard_parts_runs": 2,
        }
        self.assertEqual(compute_job_gp(job), 800.0 - 2 * PARTS_RUN_DEDUCTION_DOLLARS)


class TestScheduleSaver(unittest.TestCase):
    """
    Schedule Saver (59.15): Seller who did not execute (is_seller true, is_executor false)
    keeps full 60% credit with no extra penalty.
    """

    def test_seller_only_gets_full_60_percent(self):
        job = {
            "invoiced_revenue_exc_gst": 1000,
            "materials_cost": 200,
            "standard_parts_runs": 0,
        }
        # One tech: seller only (did not execute)
        personnel = [
            {"technician_id": "tech-seller-only", "is_seller": True, "is_executor": False},
        ]
        splits = compute_job_base_splits(job, personnel)
        job_gp = compute_job_gp(job)
        expected_seller_share = round(job_gp * SELLER_SHARE, 2)
        self.assertIn("tech-seller-only", splits)
        self.assertEqual(splits["tech-seller-only"]["seller_base"], expected_seller_share)
        self.assertEqual(splits["tech-seller-only"]["executor_base"], 0.0)

    def test_seller_only_with_separate_executor_gets_60_percent(self):
        job = {
            "invoiced_revenue_exc_gst": 1000,
            "materials_cost": 200,
            "standard_parts_runs": 0,
        }
        personnel = [
            {"technician_id": "seller", "is_seller": True, "is_executor": False},
            {"technician_id": "executor", "is_seller": False, "is_executor": True},
        ]
        splits = compute_job_base_splits(job, personnel)
        job_gp = compute_job_gp(job)
        self.assertEqual(splits["seller"]["seller_base"], round(job_gp * SELLER_SHARE, 2))
        self.assertEqual(splits["seller"]["executor_base"], 0.0)
        self.assertEqual(splits["executor"]["executor_base"], round(job_gp * EXECUTOR_SHARE, 2))
        self.assertEqual(splits["executor"]["seller_base"], 0.0)


if __name__ == "__main__":
    unittest.main()
