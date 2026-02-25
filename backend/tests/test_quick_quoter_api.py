"""
API tests for Quick Quoter endpoints.
"""
import unittest
import sys
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import main as backend_main


class TestQuickQuoterApi(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(backend_main.app)

    def test_catalog_endpoint_success(self):
        payload = {
            "repair_types": [
                {
                    "id": "joiner_replacement",
                    "label": "Joiner Replacement",
                    "requires_profile": True,
                    "requires_size_mm": False,
                    "sort_order": 20,
                    "active": True,
                }
            ]
        }
        with patch.object(backend_main, "get_supabase", return_value=object()), patch.object(
            backend_main, "get_quick_quoter_catalog", return_value=payload["repair_types"]
        ):
            resp = self.client.get("/api/quick-quoter/catalog")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), payload)

    def test_resolve_endpoint_success_shape(self):
        resolver_payload = {
            "elements": [{"assetId": "J-SC-MAR", "quantity": 2.0}],
            "missing_measurements": [{"assetId": "DP-80-3M", "quantity": 1.0, "repair_type_id": "cutting_a_down_pipe"}],
            "validation_errors": [],
        }
        with patch.object(backend_main, "get_supabase", return_value=object()), patch.object(
            backend_main, "resolve_quick_quoter_selection", return_value=resolver_payload
        ):
            resp = self.client.post(
                "/api/quick-quoter/resolve",
                json={
                    "profile": "storm_cloud",
                    "size_mm": 80,
                    "selections": [{"repair_type_id": "joiner_replacement", "quantity": 2}],
                },
            )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), resolver_payload)

    def test_resolve_endpoint_validation_400_shape(self):
        resolver_payload = {
            "elements": [],
            "missing_measurements": [],
            "validation_errors": [
                {
                    "code": "profile_required",
                    "message": "profile is required for joiner_replacement.",
                    "repair_type_id": "joiner_replacement",
                    "field": "profile",
                }
            ],
        }
        with patch.object(backend_main, "get_supabase", return_value=object()), patch.object(
            backend_main, "resolve_quick_quoter_selection", return_value=resolver_payload
        ):
            resp = self.client.post(
                "/api/quick-quoter/resolve",
                json={
                    "profile": None,
                    "size_mm": None,
                    "selections": [{"repair_type_id": "joiner_replacement", "quantity": 1}],
                },
            )
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.json(), resolver_payload)


if __name__ == "__main__":
    unittest.main()
