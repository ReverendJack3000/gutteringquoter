"""
Regression tests for /api/calculate-quote accessory inference around manual metre bin-pack.

These tests lock current baseline behavior (no behavioral changes) for Section 63 audit:
- first bin-packed piece carries length_mm,
- inferred accessories remain unchanged.
"""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import main as backend_main


class TestCalculateQuoteAccessoryInferenceBaseline(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(backend_main.app)

    def _pricing_for(self, product_ids):
        return {
            pid: {"name": pid, "cost_price": 1.0, "markup_percentage": 0.0}
            for pid in product_ids
        }

    def _calculate(self, elements):
        product_ids = {str(e.get("assetId") or "") for e in elements if e.get("assetId")}
        # Include inferred IDs to satisfy pricing lookup for accessory expansion.
        product_ids.update({"BRK-SC-MAR", "SCR-SS", "SCL-65", "ACL-65"})
        with patch.object(
            backend_main,
            "get_product_pricing",
            return_value=self._pricing_for(product_ids),
        ), patch.object(
            backend_main,
            "get_supabase",
            return_value=object(),
        ), patch.object(
            backend_main,
            "get_measured_material_rules_for_quote",
            return_value=None,
        ):
            resp = self.client.post(
                "/api/calculate-quote",
                json={"elements": elements, "labour_elements": []},
            )
        self.assertEqual(resp.status_code, 200, resp.text)
        payload = resp.json() or {}
        quote = payload.get("quote") or {}
        materials = quote.get("materials") or []
        return {line.get("id"): line.get("qty") for line in materials}

    def test_gutter_manual_metre_edge_cases_keep_baseline_accessories(self):
        # Mirrors getElementsFromQuoteTable payload shape: first packed element holds length_mm.
        cases = [
            {
                "name": "1.49m",
                "elements": [{"assetId": "GUT-SC-MAR-1.5M", "quantity": 1, "length_mm": 1490}],
                "expected": {"GUT-SC-MAR-1.5M": 1.0, "BRK-SC-MAR": 4, "SCR-SS": 12},
            },
            {
                "name": "1.5m",
                "elements": [{"assetId": "GUT-SC-MAR-1.5M", "quantity": 1, "length_mm": 1500}],
                "expected": {"GUT-SC-MAR-1.5M": 1.0, "BRK-SC-MAR": 4, "SCR-SS": 12},
            },
            {
                "name": "1.51m",
                "elements": [{"assetId": "GUT-SC-MAR-3M", "quantity": 1, "length_mm": 1510}],
                "expected": {"GUT-SC-MAR-3M": 1.0, "BRK-SC-MAR": 4, "SCR-SS": 12},
            },
            {
                "name": "2.99m",
                "elements": [{"assetId": "GUT-SC-MAR-3M", "quantity": 1, "length_mm": 2990}],
                "expected": {"GUT-SC-MAR-3M": 1.0, "BRK-SC-MAR": 8, "SCR-SS": 24},
            },
            {
                "name": "3.01m",
                "elements": [
                    {"assetId": "GUT-SC-MAR-3M", "quantity": 1, "length_mm": 3010},
                    {"assetId": "GUT-SC-MAR-1.5M", "quantity": 1},
                ],
                "expected": {
                    "GUT-SC-MAR-3M": 1.0,
                    "GUT-SC-MAR-1.5M": 1.0,
                    "BRK-SC-MAR": 12,
                    "SCR-SS": 36,
                },
            },
            {
                "name": "4.99m",
                "elements": [{"assetId": "GUT-SC-MAR-5M", "quantity": 1, "length_mm": 4990}],
                "expected": {"GUT-SC-MAR-5M": 1.0, "BRK-SC-MAR": 13, "SCR-SS": 39},
            },
            {
                "name": "5.01m",
                "elements": [{"assetId": "GUT-SC-MAR-3M", "quantity": 2, "length_mm": 5010}],
                "expected": {"GUT-SC-MAR-3M": 2.0, "BRK-SC-MAR": 13, "SCR-SS": 39},
            },
        ]

        for case in cases:
            with self.subTest(case=case["name"]):
                by_id = self._calculate(case["elements"])
                for product_id, expected_qty in case["expected"].items():
                    self.assertIn(product_id, by_id, f"Missing product for {case['name']}: {product_id}")
                    self.assertAlmostEqual(by_id[product_id], expected_qty, places=6)
                self.assertNotIn("SCL-65", by_id)
                self.assertNotIn("ACL-65", by_id)

    def test_downpipe_manual_metre_edge_cases_keep_clip_and_screw_baseline(self):
        cases = [
            {
                "name": "1.49m",
                "elements": [{"assetId": "DP-65-1.5M", "quantity": 1, "length_mm": 1490}],
                "expected": {"DP-65-1.5M": 1.0, "SCL-65": 2, "SCR-SS": 4},
            },
            {
                "name": "1.5m",
                "elements": [{"assetId": "DP-65-1.5M", "quantity": 1, "length_mm": 1500}],
                "expected": {"DP-65-1.5M": 1.0, "SCL-65": 2, "SCR-SS": 4},
            },
            {
                "name": "1.51m",
                "elements": [{"assetId": "DP-65-3M", "quantity": 1, "length_mm": 1510}],
                "expected": {"DP-65-3M": 1.0, "SCL-65": 2, "SCR-SS": 4},
            },
            {
                "name": "2.99m",
                "elements": [{"assetId": "DP-65-3M", "quantity": 1, "length_mm": 2990}],
                "expected": {"DP-65-3M": 1.0, "SCL-65": 3, "SCR-SS": 6},
            },
            {
                "name": "3.01m",
                "elements": [
                    {"assetId": "DP-65-3M", "quantity": 1, "length_mm": 3010},
                    {"assetId": "DP-65-1.5M", "quantity": 1},
                ],
                "expected": {"DP-65-3M": 1.0, "DP-65-1.5M": 1.0, "SCL-65": 3, "SCR-SS": 6},
            },
            {
                "name": "4.99m",
                "elements": [{"assetId": "DP-65-3M", "quantity": 2, "length_mm": 4990}],
                "expected": {"DP-65-3M": 2.0, "SCL-65": 5, "SCR-SS": 10},
            },
            {
                "name": "5.01m",
                "elements": [{"assetId": "DP-65-3M", "quantity": 2, "length_mm": 5010}],
                "expected": {"DP-65-3M": 2.0, "SCL-65": 5, "SCR-SS": 10},
            },
        ]

        for case in cases:
            with self.subTest(case=case["name"]):
                by_id = self._calculate(case["elements"])
                for product_id, expected_qty in case["expected"].items():
                    self.assertIn(product_id, by_id, f"Missing product for {case['name']}: {product_id}")
                    self.assertAlmostEqual(by_id[product_id], expected_qty, places=6)
                self.assertNotIn("ACL-65", by_id)

    def test_downpipe_scaled_missing_measurement_baseline(self):
        cases = [
            {
                "name": "6m x 0.33",
                "elements": [{"assetId": "DP-65-3M", "quantity": 1, "length_mm": 1980}],
                "expected": {"DP-65-3M": 1.0, "SCL-65": 2, "SCR-SS": 4},
            },
            {
                "name": "6m x 2",
                "elements": [{"assetId": "DP-65-3M", "quantity": 4, "length_mm": 12000}],
                "expected": {"DP-65-3M": 4.0, "SCL-65": 10, "SCR-SS": 20},
            },
        ]

        for case in cases:
            with self.subTest(case=case["name"]):
                by_id = self._calculate(case["elements"])
                for product_id, expected_qty in case["expected"].items():
                    self.assertIn(product_id, by_id, f"Missing product for {case['name']}: {product_id}")
                    self.assertAlmostEqual(by_id[product_id], expected_qty, places=6)


if __name__ == "__main__":
    unittest.main()
