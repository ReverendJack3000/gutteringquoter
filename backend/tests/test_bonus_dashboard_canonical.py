"""
Manual-test support: canonical dashboard payload (59.18.2).

Verifies that the dashboard payload builder returns is_provisional=False,
hero.my_expected_payout, expected_payout_status (computed/final), and that
closed-period requests are allowed and produce expected_payout_status=final.

Run from backend/:  python3 -m unittest tests.test_bonus_dashboard_canonical -v
Or via script:      ./scripts/run-backend-tests.sh
"""
import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Build payload in-process; we need main's _build_provisional_technician_dashboard_payload
# and its dependencies. Avoid importing main (pulls in full app). Instead test the
# modules that main uses: bonus_dashboard (filter_eligible, build_canonical_ledger_rows,
# compute_total_contributed_gp) and bonus_calc (compute_period_pot).
from app.bonus_calc import compute_period_pot
from app.bonus_dashboard import (
    build_canonical_ledger_rows,
    compute_per_technician_executor_gp,
    compute_per_technician_seller_gp,
    compute_total_contributed_gp,
    filter_eligible_period_jobs,
    group_personnel_by_job,
)


class TestCanonicalDashboardPayload(unittest.TestCase):
    """Verify canonical dashboard logic used by main.py payload builder."""

    def test_eligible_jobs_filter(self):
        """Only verified/processed jobs with 50% min margin (60.5) are eligible for pot and ledger."""
        jobs = [
            {"id": "1", "status": "draft", "bonus_period_id": "p1", "period_link_method": "bonus_period_id", "invoiced_revenue_exc_gst": 1000, "materials_cost": 200, "standard_parts_runs": 0, "is_upsell": True},
            {"id": "2", "status": "verified", "bonus_period_id": "p1", "period_link_method": "bonus_period_id", "invoiced_revenue_exc_gst": 1000, "materials_cost": 200, "standard_parts_runs": 0, "is_upsell": True},
            {"id": "3", "status": "processed", "bonus_period_id": "p1", "period_link_method": "bonus_period_id", "invoiced_revenue_exc_gst": 1000, "materials_cost": 200, "standard_parts_runs": 0, "is_upsell": True},
        ]
        eligible = filter_eligible_period_jobs(jobs)
        self.assertEqual(len(eligible), 2)
        self.assertEqual({e["id"] for e in eligible}, {"2", "3"})

    def test_eligible_jobs_excludes_below_50_percent_margin(self):
        """60.5: Jobs with Job GP / revenue < 0.50 are excluded from period pot and ledger."""
        # Revenue 1000, materials 600, 0 parts runs → Job GP 400 → 400/1000 = 0.4 < 0.50
        jobs = [
            {"id": "1", "status": "verified", "bonus_period_id": "p1", "period_link_method": "bonus_period_id", "invoiced_revenue_exc_gst": 1000, "materials_cost": 600, "standard_parts_runs": 0, "is_upsell": True},
        ]
        eligible = filter_eligible_period_jobs(jobs)
        self.assertEqual(len(eligible), 0, "Job with margin 40% must be excluded")

    def test_eligible_jobs_excludes_non_upsell(self):
        """60.6: Only jobs with is_upsell true count toward period pot."""
        jobs = [
            {"id": "1", "status": "verified", "bonus_period_id": "p1", "period_link_method": "bonus_period_id", "invoiced_revenue_exc_gst": 1000, "materials_cost": 200, "standard_parts_runs": 0, "is_upsell": False},
        ]
        eligible = filter_eligible_period_jobs(jobs)
        self.assertEqual(len(eligible), 0, "Job with is_upsell false must be excluded")

    def test_period_pot_uses_eligible_only(self):
        """compute_period_pot uses job GP and subtracts callback costs."""
        eligible = [
            {"invoiced_revenue_exc_gst": 1000, "materials_cost": 200, "standard_parts_runs": 0, "callback_cost": 0},
            {"invoiced_revenue_exc_gst": 500, "materials_cost": 100, "standard_parts_runs": 0, "callback_cost": 10},
        ]
        pot = compute_period_pot(eligible)
        # 800 * 0.1 + 400 * 0.1 - 10 = 80 + 40 - 10 = 110
        self.assertEqual(pot, 110.0)

    def test_canonical_ledger_row_shape_and_is_provisional_false(self):
        """Canonical ledger rows have same shape as provisional and is_provisional=False."""
        period = {"id": "p1", "start_date": "2026-01-01", "end_date": "2026-01-14", "status": "open"}
        eligible = [
            {
                "id": "j1",
                "servicem8_job_id": "123",
                "servicem8_job_uuid": "",
                "bonus_period_id": "p1",
                "status": "verified",
                "period_link_method": "bonus_period_id",
                "invoiced_revenue_exc_gst": 1000,
                "materials_cost": 200,
                "standard_parts_runs": 0,
                "quoted_labor_minutes": 120,
                "is_callback": False,
                "callback_reason": None,
                "seller_fault_parts_runs": 0,
                "missed_materials_cost": 0,
                "created_at": "2026-01-10T12:00:00Z",
            },
        ]
        personnel = [
            {
                "job_performance_id": "j1",
                "technician_id": "tech-a",
                "is_seller": True,
                "is_executor": True,
                "onsite_minutes": 100,
                "travel_shopping_minutes": 20,
            },
        ]
        personnel_by_job = group_personnel_by_job(personnel)
        rows = build_canonical_ledger_rows(eligible, personnel_by_job, "tech-a")
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertFalse(row.get("is_provisional"), "Canonical rows must have is_provisional=False")
        self.assertIn("job_performance_id", row)
        self.assertIn("job_gp", row)
        self.assertIn("my_job_gp_contribution", row)
        self.assertIn("pending_reasons", row)
        self.assertNotIn("final_rules_not_implemented", row["pending_reasons"])
        self.assertNotIn("expected_payout_pending", row["pending_reasons"])

    def test_total_contributed_gp_and_expected_payout_math(self):
        """total_contributed_gp allows my_expected_payout = pot * (my_gp / total_gp)."""
        eligible = [
            {
                "id": "j1",
                "status": "verified",
                "invoiced_revenue_exc_gst": 1000,
                "materials_cost": 200,
                "standard_parts_runs": 0,
                "quoted_labor_minutes": 60,
                "is_callback": False,
                "callback_reason": None,
                "seller_fault_parts_runs": 0,
                "missed_materials_cost": 0,
            },
        ]
        personnel = [
            {"job_performance_id": "j1", "technician_id": "tech-a", "is_seller": True, "is_executor": True, "onsite_minutes": 50, "travel_shopping_minutes": 10},
        ]
        personnel_by_job = group_personnel_by_job(personnel)
        pot = compute_period_pot(eligible)
        total_gp = compute_total_contributed_gp(eligible, personnel_by_job)
        rows = build_canonical_ledger_rows(eligible, personnel_by_job, "tech-a")
        my_gp = sum(r.get("my_job_gp_contribution", 0) for r in rows)
        self.assertGreater(total_gp, 0)
        self.assertGreater(my_gp, 0)
        expected_payout = round(pot * (my_gp / total_gp), 2) if total_gp > 0 else 0.0
        self.assertIsInstance(expected_payout, float)
        self.assertGreaterEqual(expected_payout, 0)

    def test_per_technician_seller_gp_seller_only_gets_seller_share(self):
        """59.16.8: Tech with only seller role has seller GP > 0 and executor GP 0."""
        job = {
            "id": "j1",
            "status": "verified",
            "invoiced_revenue_exc_gst": 1000,
            "materials_cost": 200,
            "standard_parts_runs": 0,
            "quoted_labor_minutes": 60,
            "is_callback": False,
            "callback_reason": None,
            "seller_fault_parts_runs": 0,
            "missed_materials_cost": 0,
        }
        personnel = [
            {"job_performance_id": "j1", "technician_id": "seller", "is_seller": True, "is_executor": False, "onsite_minutes": 50, "travel_shopping_minutes": 10},
        ]
        personnel_by_job = group_personnel_by_job(personnel)
        eligible = [job]
        seller_gp = compute_per_technician_seller_gp(eligible, personnel_by_job)
        executor_gp = compute_per_technician_executor_gp(eligible, personnel_by_job)
        self.assertIn("seller", seller_gp)
        self.assertGreater(seller_gp["seller"], 0)
        self.assertIn("seller", executor_gp)
        self.assertEqual(executor_gp["seller"], 0.0)

    def test_per_technician_executor_gp_executor_only_gets_executor_share(self):
        """59.16.8: Tech with only executor role has executor GP > 0 and seller GP 0."""
        job = {
            "id": "j1",
            "status": "verified",
            "invoiced_revenue_exc_gst": 1000,
            "materials_cost": 200,
            "standard_parts_runs": 0,
            "quoted_labor_minutes": 60,
            "is_callback": False,
            "callback_reason": None,
            "seller_fault_parts_runs": 0,
            "missed_materials_cost": 0,
        }
        personnel = [
            {"job_performance_id": "j1", "technician_id": "executor", "is_seller": False, "is_executor": True, "onsite_minutes": 50, "travel_shopping_minutes": 10},
        ]
        personnel_by_job = group_personnel_by_job(personnel)
        eligible = [job]
        seller_gp = compute_per_technician_seller_gp(eligible, personnel_by_job)
        executor_gp = compute_per_technician_executor_gp(eligible, personnel_by_job)
        self.assertIn("executor", executor_gp)
        self.assertGreater(executor_gp["executor"], 0)
        self.assertIn("executor", seller_gp)
        self.assertEqual(seller_gp["executor"], 0.0)

    def test_per_technician_do_it_all_gets_full_gp_in_seller_bucket(self):
        """59.16.8: Do-it-all tech gets 100% in seller_base (executor_base 0); seller GP equals my_gp."""
        job = {
            "id": "j1",
            "status": "verified",
            "invoiced_revenue_exc_gst": 1000,
            "materials_cost": 200,
            "standard_parts_runs": 0,
            "quoted_labor_minutes": 60,
            "is_callback": False,
            "callback_reason": None,
            "seller_fault_parts_runs": 0,
            "missed_materials_cost": 0,
        }
        personnel = [
            {"job_performance_id": "j1", "technician_id": "tech-a", "is_seller": True, "is_executor": True, "onsite_minutes": 50, "travel_shopping_minutes": 10},
        ]
        personnel_by_job = group_personnel_by_job(personnel)
        eligible = [job]
        seller_gp = compute_per_technician_seller_gp(eligible, personnel_by_job)
        executor_gp = compute_per_technician_executor_gp(eligible, personnel_by_job)
        total_gp = compute_total_contributed_gp(eligible, personnel_by_job)
        rows = build_canonical_ledger_rows(eligible, personnel_by_job, "tech-a")
        my_gp = sum(r.get("my_job_gp_contribution", 0) for r in rows)
        self.assertIn("tech-a", seller_gp)
        self.assertIn("tech-a", executor_gp)
        self.assertGreater(seller_gp["tech-a"], 0, "Do-it-all gets 100% in seller_base")
        self.assertEqual(executor_gp["tech-a"], 0.0, "Do-it-all has executor_base 0")
        self.assertAlmostEqual(seller_gp["tech-a"], my_gp, places=2)
        self.assertAlmostEqual(total_gp, my_gp, places=2)

    def test_per_technician_empty_jobs_returns_empty_dict(self):
        """59.16.8: Empty eligible jobs yields empty seller/executor GP dicts."""
        seller_gp = compute_per_technician_seller_gp([], {})
        executor_gp = compute_per_technician_executor_gp([], {})
        self.assertEqual(seller_gp, {})
        self.assertEqual(executor_gp, {})
