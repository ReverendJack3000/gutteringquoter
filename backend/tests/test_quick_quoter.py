"""
Unit tests for Quick Quoter resolver/catalog service.
"""
import unittest
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.quick_quoter import get_quick_quoter_catalog, resolve_quick_quoter_selection


class FakeQuery:
    def __init__(self, rows):
        self._rows = rows
        self._eq_filters = []
        self._in_filters = []
        self._order_fields = []

    def select(self, _fields):
        return self

    def eq(self, field, value):
        self._eq_filters.append((field, value))
        return self

    def in_(self, field, values):
        self._in_filters.append((field, set(values or [])))
        return self

    def order(self, field, desc=False):
        self._order_fields.append((field, bool(desc)))
        return self

    def execute(self):
        rows = [dict(r) for r in self._rows]
        for field, value in self._eq_filters:
            rows = [r for r in rows if r.get(field) == value]
        for field, values in self._in_filters:
            rows = [r for r in rows if r.get(field) in values]
        # Apply stable sort from last order key to first.
        for field, desc in reversed(self._order_fields):
            rows.sort(key=lambda r: r.get(field), reverse=desc)
        return SimpleNamespace(data=rows)


class FakeSupabase:
    def __init__(self, tables):
        self._tables = tables

    def table(self, name):
        return FakeQuery(self._tables.get(name, []))


class TestQuickQuoterCatalog(unittest.TestCase):
    def test_catalog_returns_active_sorted(self):
        supabase = FakeSupabase(
            {
                "quick_quoter_repair_types": [
                    {"id": "b", "label": "B", "active": True, "sort_order": 20, "requires_profile": False, "requires_size_mm": False},
                    {"id": "z", "label": "Z", "active": False, "sort_order": 1, "requires_profile": False, "requires_size_mm": False},
                    {"id": "a", "label": "A", "active": True, "sort_order": 20, "requires_profile": True, "requires_size_mm": False},
                ]
            }
        )

        catalog = get_quick_quoter_catalog(supabase)
        self.assertEqual([item["id"] for item in catalog], ["a", "b"])
        self.assertTrue(all(item["active"] for item in catalog))


class TestQuickQuoterResolve(unittest.TestCase):
    def test_rejects_unknown_or_inactive_repair_types(self):
        supabase = FakeSupabase(
            {
                "quick_quoter_repair_types": [
                    {"id": "known_active", "active": True, "requires_profile": False, "requires_size_mm": False},
                    {"id": "known_inactive", "active": False, "requires_profile": False, "requires_size_mm": False},
                ],
                "quick_quoter_part_templates": [],
            }
        )
        payload = resolve_quick_quoter_selection(
            supabase,
            profile=None,
            size_mm=None,
            selections=[
                {"repair_type_id": "known_inactive", "quantity": 1},
                {"repair_type_id": "unknown", "quantity": 1},
            ],
        )
        codes = {err["code"] for err in payload["validation_errors"]}
        self.assertIn("inactive_repair_type_id", codes)
        self.assertIn("unknown_repair_type_id", codes)
        self.assertEqual(payload["elements"], [])
        self.assertEqual(payload["missing_measurements"], [])

    def test_requires_profile_and_size_from_catalog_flags(self):
        supabase = FakeSupabase(
            {
                "quick_quoter_repair_types": [
                    {"id": "profile_req", "active": True, "requires_profile": True, "requires_size_mm": False},
                    {"id": "size_req", "active": True, "requires_profile": False, "requires_size_mm": True},
                ],
                "quick_quoter_part_templates": [],
            }
        )
        payload = resolve_quick_quoter_selection(
            supabase,
            profile=None,
            size_mm=None,
            selections=[
                {"repair_type_id": "profile_req", "quantity": 1},
                {"repair_type_id": "size_req", "quantity": 1},
            ],
        )
        codes = {err["code"] for err in payload["validation_errors"]}
        self.assertIn("profile_required", codes)
        self.assertIn("size_mm_required", codes)

    def test_maps_profile_and_filters_template_profile_conditions(self):
        supabase = FakeSupabase(
            {
                "quick_quoter_repair_types": [
                    {"id": "joiner", "active": True, "requires_profile": True, "requires_size_mm": False},
                ],
                "quick_quoter_part_templates": [
                    {"id": "1", "repair_type_id": "joiner", "product_id": "J-SC-MAR", "qty_per_unit": 1, "condition_profile": "SC", "condition_size_mm": None, "length_mode": "none", "fixed_length_mm": None, "active": True, "sort_order": 10},
                    {"id": "2", "repair_type_id": "joiner", "product_id": "J-CL-MAR", "qty_per_unit": 1, "condition_profile": "CL", "condition_size_mm": None, "length_mode": "none", "fixed_length_mm": None, "active": True, "sort_order": 20},
                    {"id": "3", "repair_type_id": "joiner", "product_id": "GL-MAR", "qty_per_unit": 0.25, "condition_profile": None, "condition_size_mm": None, "length_mode": "none", "fixed_length_mm": None, "active": True, "sort_order": 30},
                ],
            }
        )
        payload = resolve_quick_quoter_selection(
            supabase,
            profile="storm_cloud",
            size_mm=None,
            selections=[{"repair_type_id": "joiner", "quantity": 2}],
        )
        self.assertEqual(payload["validation_errors"], [])
        by_asset = {item["assetId"]: item["quantity"] for item in payload["elements"]}
        self.assertEqual(by_asset["J-SC-MAR"], 2.0)
        self.assertEqual(by_asset["GL-MAR"], 0.5)
        self.assertNotIn("J-CL-MAR", by_asset)

    def test_filters_template_size_conditions(self):
        supabase = FakeSupabase(
            {
                "quick_quoter_repair_types": [
                    {"id": "clip", "active": True, "requires_profile": False, "requires_size_mm": True},
                ],
                "quick_quoter_part_templates": [
                    {"id": "1", "repair_type_id": "clip", "product_id": "ACL-65", "qty_per_unit": 2, "condition_profile": None, "condition_size_mm": 65, "length_mode": "none", "fixed_length_mm": None, "active": True, "sort_order": 10},
                    {"id": "2", "repair_type_id": "clip", "product_id": "ACL-80", "qty_per_unit": 2, "condition_profile": None, "condition_size_mm": 80, "length_mode": "none", "fixed_length_mm": None, "active": True, "sort_order": 20},
                ],
            }
        )
        payload = resolve_quick_quoter_selection(
            supabase,
            profile=None,
            size_mm=80,
            selections=[{"repair_type_id": "clip", "quantity": 3}],
        )
        self.assertEqual(payload["validation_errors"], [])
        self.assertEqual(payload["elements"], [{"assetId": "ACL-80", "quantity": 6.0}])

    def test_routes_length_modes_and_aggregates_duplicates(self):
        supabase = FakeSupabase(
            {
                "quick_quoter_repair_types": [
                    {"id": "mixed", "active": True, "requires_profile": False, "requires_size_mm": False},
                ],
                "quick_quoter_part_templates": [
                    {"id": "1", "repair_type_id": "mixed", "product_id": "GL-MAR", "qty_per_unit": 0.33, "condition_profile": None, "condition_size_mm": None, "length_mode": "none", "fixed_length_mm": None, "active": True, "sort_order": 10},
                    {"id": "2", "repair_type_id": "mixed", "product_id": "GL-MAR", "qty_per_unit": 0.5, "condition_profile": None, "condition_size_mm": None, "length_mode": "none", "fixed_length_mm": None, "active": True, "sort_order": 20},
                    {"id": "3", "repair_type_id": "mixed", "product_id": "DP-80-3M", "qty_per_unit": 1, "condition_profile": None, "condition_size_mm": None, "length_mode": "missing_measurement", "fixed_length_mm": None, "active": True, "sort_order": 30},
                    {"id": "4", "repair_type_id": "mixed", "product_id": "DP-80-3M", "qty_per_unit": 2, "condition_profile": None, "condition_size_mm": None, "length_mode": "missing_measurement", "fixed_length_mm": None, "active": True, "sort_order": 40},
                    {"id": "5", "repair_type_id": "mixed", "product_id": "GUT-SC-MAR-3M", "qty_per_unit": 1, "condition_profile": None, "condition_size_mm": None, "length_mode": "fixed_mm", "fixed_length_mm": 1500, "active": True, "sort_order": 50},
                ],
            }
        )
        payload = resolve_quick_quoter_selection(
            supabase,
            profile=None,
            size_mm=None,
            selections=[{"repair_type_id": "mixed", "quantity": 2}],
        )

        self.assertEqual(payload["validation_errors"], [])

        elements_by_asset = {item["assetId"]: item for item in payload["elements"]}
        self.assertAlmostEqual(elements_by_asset["GL-MAR"]["quantity"], 1.66, places=6)
        self.assertEqual(elements_by_asset["GUT-SC-MAR-3M"]["length_mm"], 1500.0)
        self.assertEqual(elements_by_asset["GUT-SC-MAR-3M"]["quantity"], 2.0)

        missing = payload["missing_measurements"]
        self.assertEqual(len(missing), 1)
        self.assertEqual(missing[0]["assetId"], "DP-80-3M")
        self.assertEqual(missing[0]["repair_type_id"], "mixed")
        self.assertEqual(missing[0]["quantity"], 6.0)

    def test_resolve_returns_suggested_labour_minutes_from_default_time(self):
        supabase = FakeSupabase(
            {
                "quick_quoter_repair_types": [
                    {"id": "rt_a", "active": True, "requires_profile": False, "requires_size_mm": False, "default_time_minutes": 30},
                    {"id": "rt_b", "active": True, "requires_profile": False, "requires_size_mm": False, "default_time_minutes": 15},
                    {"id": "rt_c", "active": True, "requires_profile": False, "requires_size_mm": False, "default_time_minutes": None},
                ],
                "quick_quoter_part_templates": [
                    {"id": "1", "repair_type_id": "rt_a", "product_id": "P1", "qty_per_unit": 1, "condition_profile": None, "condition_size_mm": None, "length_mode": "none", "fixed_length_mm": None, "active": True, "sort_order": 10},
                    {"id": "2", "repair_type_id": "rt_b", "product_id": "P2", "qty_per_unit": 1, "condition_profile": None, "condition_size_mm": None, "length_mode": "none", "fixed_length_mm": None, "active": True, "sort_order": 10},
                    {"id": "3", "repair_type_id": "rt_c", "product_id": "P3", "qty_per_unit": 1, "condition_profile": None, "condition_size_mm": None, "length_mode": "none", "fixed_length_mm": None, "active": True, "sort_order": 10},
                ],
            }
        )
        payload = resolve_quick_quoter_selection(
            supabase,
            profile=None,
            size_mm=None,
            selections=[
                {"repair_type_id": "rt_a", "quantity": 2},
                {"repair_type_id": "rt_b", "quantity": 4},
                {"repair_type_id": "rt_c", "quantity": 1},
            ],
        )
        self.assertEqual(payload["validation_errors"], [])
        self.assertIn("suggested_labour_minutes", payload)
        self.assertEqual(payload["suggested_labour_minutes"], 30 * 2 + 15 * 4 + 0)


if __name__ == "__main__":
    unittest.main()
