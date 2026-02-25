"""Tests for configurable gutter accessory inference rules."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.gutter_accessories import expand_elements_with_gutter_accessories


class TestGutterAccessoriesConfigurable(unittest.TestCase):
    @staticmethod
    def _as_map(rows):
        return {str(r.get("assetId")): float(r.get("quantity") or 0) for r in rows}

    def test_default_rules_match_existing_baseline_behavior(self):
        elements = [
            {"assetId": "GUT-SC-MAR-3M", "quantity": 1, "length_mm": 3000},
            {"assetId": "DP-65-3M", "quantity": 1, "length_mm": 2400},
        ]

        out = self._as_map(expand_elements_with_gutter_accessories(elements))

        self.assertAlmostEqual(out["GUT-SC-MAR-3M"], 1.0)
        self.assertAlmostEqual(out["BRK-SC-MAR"], 8.0)
        self.assertAlmostEqual(out["DP-65-3M"], 1.0)
        self.assertAlmostEqual(out["SCL-65"], 2.0)
        self.assertAlmostEqual(out["SCR-SS"], 28.0)

    def test_custom_rules_override_products_and_quantities(self):
        elements = [
            {"assetId": "GUT-SC-MAR-3M", "quantity": 1, "length_mm": 3000},
            {"assetId": "DP-65-3M", "quantity": 1, "length_mm": 2400},
        ]
        rules = {
            "bracket_spacing_mm": 1000,
            "clip_spacing_mm": 1000,
            "screws_per_bracket": 1,
            "screws_per_dropper": 5,
            "screws_per_saddle_clip": 4,
            "screws_per_adjustable_clip": 7,
            "screw_product_id": "SCR-CUSTOM",
            "bracket_product_id_sc": "BRK-CUSTOM-SC",
            "bracket_product_id_cl": "BRK-CUSTOM-CL",
            "saddle_clip_product_id_65": "SCL-CUSTOM-65",
            "saddle_clip_product_id_80": "SCL-CUSTOM-80",
            "adjustable_clip_product_id_65": "ACL-CUSTOM-65",
            "adjustable_clip_product_id_80": "ACL-CUSTOM-80",
            "clip_selection_mode": "force_saddle",
        }

        out = self._as_map(expand_elements_with_gutter_accessories(elements, rules_config=rules))

        self.assertAlmostEqual(out["GUT-SC-MAR-3M"], 1.0)
        self.assertAlmostEqual(out["BRK-CUSTOM-SC"], 4.0)
        self.assertAlmostEqual(out["DP-65-3M"], 1.0)
        self.assertAlmostEqual(out["SCL-CUSTOM-65"], 3.0)
        self.assertAlmostEqual(out["SCR-CUSTOM"], 16.0)

        self.assertNotIn("BRK-SC-MAR", out)
        self.assertNotIn("SCL-65", out)
        self.assertNotIn("SCR-SS", out)

    def test_force_adjustable_clip_mode_uses_adjustable_mapping(self):
        elements = [{"assetId": "DP-80-3M", "quantity": 1, "length_mm": 1200}]
        rules = {
            "clip_selection_mode": "force_adjustable",
            "screw_product_id": "SCR-X",
            "adjustable_clip_product_id_80": "ACL-X-80",
            "screws_per_adjustable_clip": 9,
        }

        out = self._as_map(expand_elements_with_gutter_accessories(elements, rules_config=rules))

        self.assertAlmostEqual(out["DP-80-3M"], 1.0)
        self.assertAlmostEqual(out["ACL-X-80"], 1.0)
        self.assertAlmostEqual(out["SCR-X"], 9.0)
        self.assertNotIn("SCL-80", out)


if __name__ == "__main__":
    unittest.main()
