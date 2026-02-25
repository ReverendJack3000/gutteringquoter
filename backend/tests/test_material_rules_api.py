"""API tests for admin material-rules endpoints."""
import copy
import sys
import unittest
import uuid as uuid_lib
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import main as backend_main


class FakeQuery:
    def __init__(self, supabase, table_name):
        self.supabase = supabase
        self.table_name = table_name
        self._op = "select"
        self._filters = []
        self._orders = []
        self._limit = None
        self._payload = None
        self._on_conflict = None

    def select(self, _fields):
        self._op = "select"
        return self

    def eq(self, field, value):
        self._filters.append(("eq", field, value))
        return self

    def in_(self, field, values):
        self._filters.append(("in", field, set(values or [])))
        return self

    def order(self, field, desc=False):
        self._orders.append((field, bool(desc)))
        return self

    def limit(self, n):
        self._limit = int(n)
        return self

    def upsert(self, payload, on_conflict="id"):
        self._op = "upsert"
        self._payload = payload
        self._on_conflict = on_conflict or "id"
        return self

    def insert(self, payload):
        self._op = "insert"
        self._payload = payload
        return self

    def update(self, payload):
        self._op = "update"
        self._payload = payload
        return self

    def delete(self):
        self._op = "delete"
        return self

    def _table_rows(self):
        return self.supabase.tables.setdefault(self.table_name, [])

    def _matches(self, row):
        for kind, field, value in self._filters:
            if kind == "eq" and row.get(field) != value:
                return False
            if kind == "in" and row.get(field) not in value:
                return False
        return True

    def _filtered_rows(self):
        rows = [copy.deepcopy(r) for r in self._table_rows() if self._matches(r)]
        for field, desc in reversed(self._orders):
            rows.sort(key=lambda r: r.get(field), reverse=desc)
        if self._limit is not None:
            rows = rows[: self._limit]
        return rows

    def execute(self):
        rows = self._table_rows()

        if self._op == "select":
            return SimpleNamespace(data=self._filtered_rows())

        if self._op == "insert":
            payload_rows = self._payload if isinstance(self._payload, list) else [self._payload]
            inserted = []
            for raw in payload_rows:
                row = copy.deepcopy(raw)
                rows.append(row)
                inserted.append(copy.deepcopy(row))
            return SimpleNamespace(data=inserted)

        if self._op == "upsert":
            payload_rows = self._payload if isinstance(self._payload, list) else [self._payload]
            conflict_fields = [f.strip() for f in str(self._on_conflict or "id").split(",") if f.strip()]
            if not conflict_fields:
                conflict_fields = ["id"]

            upserted = []
            for raw in payload_rows:
                incoming = copy.deepcopy(raw)
                match_index = None
                for idx, row in enumerate(rows):
                    if all(row.get(field) == incoming.get(field) for field in conflict_fields):
                        match_index = idx
                        break
                if match_index is None:
                    rows.append(copy.deepcopy(incoming))
                    upserted.append(copy.deepcopy(incoming))
                else:
                    rows[match_index].update(copy.deepcopy(incoming))
                    upserted.append(copy.deepcopy(rows[match_index]))
            return SimpleNamespace(data=upserted)

        if self._op == "update":
            updated = []
            for row in rows:
                if self._matches(row):
                    row.update(copy.deepcopy(self._payload or {}))
                    updated.append(copy.deepcopy(row))
            return SimpleNamespace(data=updated)

        if self._op == "delete":
            keep = []
            removed = []
            for row in rows:
                if self._matches(row):
                    removed.append(copy.deepcopy(row))
                else:
                    keep.append(row)
            self.supabase.tables[self.table_name] = keep
            return SimpleNamespace(data=removed)

        raise RuntimeError(f"Unsupported op: {self._op}")


class FakeSupabase:
    def __init__(self, tables):
        self.tables = {name: [copy.deepcopy(r) for r in rows] for name, rows in tables.items()}

    def table(self, name):
        return FakeQuery(self, name)


class TestMaterialRulesApi(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(backend_main.app)

    def tearDown(self):
        backend_main.app.dependency_overrides.clear()

    @staticmethod
    def _set_role(role: str, user_id: str):
        uid = uuid_lib.UUID(user_id)
        backend_main.app.dependency_overrides[backend_main.get_current_user_id_and_role] = lambda: (uid, role)

    @staticmethod
    def _validation_codes(resp_json):
        detail = (resp_json or {}).get("detail") or {}
        errors = detail.get("validation_errors") if isinstance(detail, dict) else []
        return {str(err.get("code") or "") for err in errors if isinstance(err, dict)}

    def _build_fake_supabase(self):
        return FakeSupabase(
            {
                "products": [
                    {"id": "SCR-SS"},
                    {"id": "BRK-SC-MAR"},
                    {"id": "BRK-CL-MAR"},
                    {"id": "SCL-65"},
                    {"id": "SCL-80"},
                    {"id": "ACL-65"},
                    {"id": "ACL-80"},
                    {"id": "GL-MAR"},
                    {"id": "GUT-SC-MAR-3M"},
                    {"id": "DP-65-3M"},
                ],
                "quick_quoter_repair_types": [
                    {
                        "id": "joiner_replacement",
                        "label": "Joiner Replacement",
                        "active": True,
                        "sort_order": 10,
                        "requires_profile": True,
                        "requires_size_mm": False,
                        "created_at": "2026-01-01T00:00:00Z",
                        "updated_at": "2026-01-01T00:00:00Z",
                        "updated_by": None,
                    }
                ],
                "quick_quoter_part_templates": [
                    {
                        "id": "11111111-1111-1111-1111-111111111111",
                        "repair_type_id": "joiner_replacement",
                        "product_id": "GL-MAR",
                        "qty_per_unit": 0.25,
                        "condition_profile": None,
                        "condition_size_mm": None,
                        "length_mode": "none",
                        "fixed_length_mm": None,
                        "active": True,
                        "sort_order": 10,
                        "created_at": "2026-01-01T00:00:00Z",
                        "updated_at": "2026-01-01T00:00:00Z",
                        "updated_by": None,
                    }
                ],
                "measured_material_rules": [
                    {
                        "id": 1,
                        "bracket_spacing_mm": 400,
                        "clip_spacing_mm": 1200,
                        "screws_per_bracket": 3,
                        "screws_per_dropper": 4,
                        "screws_per_saddle_clip": 2,
                        "screws_per_adjustable_clip": 2,
                        "screw_product_id": "SCR-SS",
                        "bracket_product_id_sc": "BRK-SC-MAR",
                        "bracket_product_id_cl": "BRK-CL-MAR",
                        "saddle_clip_product_id_65": "SCL-65",
                        "saddle_clip_product_id_80": "SCL-80",
                        "adjustable_clip_product_id_65": "ACL-65",
                        "adjustable_clip_product_id_80": "ACL-80",
                        "clip_selection_mode": "auto_by_acl_presence",
                        "updated_at": "2026-01-01T00:00:00Z",
                        "updated_by": None,
                    }
                ],
            }
        )

    def test_auth_gating_401_403_and_200(self):
        resp_401 = self.client.get("/api/admin/material-rules/measured")
        self.assertEqual(resp_401.status_code, 401)

        self._set_role("viewer", "00000000-0000-0000-0000-000000000001")
        resp_403 = self.client.get("/api/admin/material-rules/measured")
        self.assertEqual(resp_403.status_code, 403)

        self._set_role("admin", "00000000-0000-0000-0000-000000000002")
        supabase = self._build_fake_supabase()
        with patch.object(backend_main, "get_supabase", return_value=supabase):
            resp_200 = self.client.get("/api/admin/material-rules/measured")
        self.assertEqual(resp_200.status_code, 200, resp_200.text)
        payload = resp_200.json() or {}
        self.assertIn("rules", payload)
        self.assertEqual(payload["rules"]["clip_selection_mode"], "auto_by_acl_presence")

    def test_validation_failures_bad_product_enum_and_fixed_length(self):
        self._set_role("admin", "00000000-0000-0000-0000-000000000003")
        supabase = self._build_fake_supabase()

        with patch.object(backend_main, "get_supabase", return_value=supabase):
            bad_templates_resp = self.client.put(
                "/api/admin/material-rules/quick-quoter/templates",
                json={
                    "templates": [
                        {
                            "id": "22222222-2222-2222-2222-222222222222",
                            "repair_type_id": "joiner_replacement",
                            "product_id": "UNKNOWN-PRODUCT",
                            "qty_per_unit": 1,
                            "condition_profile": None,
                            "condition_size_mm": None,
                            "length_mode": "none",
                            "fixed_length_mm": None,
                            "active": True,
                            "sort_order": 10,
                        }
                    ]
                },
            )
            self.assertEqual(bad_templates_resp.status_code, 400, bad_templates_resp.text)
            self.assertIn("unknown_product_id", self._validation_codes(bad_templates_resp.json()))

            bad_fixed_length_resp = self.client.put(
                "/api/admin/material-rules/quick-quoter/templates",
                json={
                    "templates": [
                        {
                            "id": "33333333-3333-3333-3333-333333333333",
                            "repair_type_id": "joiner_replacement",
                            "product_id": "GL-MAR",
                            "qty_per_unit": 1,
                            "condition_profile": None,
                            "condition_size_mm": None,
                            "length_mode": "fixed_mm",
                            "fixed_length_mm": None,
                            "active": True,
                            "sort_order": 10,
                        }
                    ]
                },
            )
            self.assertEqual(bad_fixed_length_resp.status_code, 400, bad_fixed_length_resp.text)
            self.assertIn("invalid_fixed_length_mm", self._validation_codes(bad_fixed_length_resp.json()))

            bad_measured_resp = self.client.put(
                "/api/admin/material-rules/measured",
                json={
                    "rules": {
                        "bracket_spacing_mm": 400,
                        "clip_spacing_mm": 1200,
                        "screws_per_bracket": 3,
                        "screws_per_dropper": 4,
                        "screws_per_saddle_clip": 2,
                        "screws_per_adjustable_clip": 2,
                        "screw_product_id": "SCR-SS",
                        "bracket_product_id_sc": "BRK-SC-MAR",
                        "bracket_product_id_cl": "BRK-CL-MAR",
                        "saddle_clip_product_id_65": "SCL-65",
                        "saddle_clip_product_id_80": "SCL-80",
                        "adjustable_clip_product_id_65": "ACL-65",
                        "adjustable_clip_product_id_80": "ACL-80",
                        "clip_selection_mode": "invalid-mode",
                    }
                },
            )
            self.assertEqual(bad_measured_resp.status_code, 400, bad_measured_resp.text)
            self.assertIn("invalid_clip_selection_mode", self._validation_codes(bad_measured_resp.json()))

    def test_successful_writes_set_updated_by_and_updated_at(self):
        actor_user_id = "00000000-0000-0000-0000-0000000000aa"
        self._set_role("admin", actor_user_id)
        supabase = self._build_fake_supabase()

        with patch.object(backend_main, "get_supabase", return_value=supabase):
            repair_types_resp = self.client.put(
                "/api/admin/material-rules/quick-quoter/repair-types",
                json={
                    "repair_types": [
                        {
                            "id": "joiner_replacement",
                            "label": "Joiner Replacement",
                            "active": True,
                            "sort_order": 10,
                            "requires_profile": True,
                            "requires_size_mm": False,
                        }
                    ]
                },
            )
            self.assertEqual(repair_types_resp.status_code, 200, repair_types_resp.text)
            repair_rows = (repair_types_resp.json() or {}).get("repair_types") or []
            self.assertEqual(len(repair_rows), 1)
            self.assertEqual(repair_rows[0].get("updated_by"), actor_user_id)
            self.assertTrue(repair_rows[0].get("updated_at"))

            templates_resp = self.client.put(
                "/api/admin/material-rules/quick-quoter/templates",
                json={
                    "templates": [
                        {
                            "id": "11111111-1111-1111-1111-111111111111",
                            "repair_type_id": "joiner_replacement",
                            "product_id": "GL-MAR",
                            "qty_per_unit": 0.5,
                            "condition_profile": None,
                            "condition_size_mm": None,
                            "length_mode": "none",
                            "fixed_length_mm": None,
                            "active": True,
                            "sort_order": 10,
                        }
                    ]
                },
            )
            self.assertEqual(templates_resp.status_code, 200, templates_resp.text)
            templates = (templates_resp.json() or {}).get("templates") or []
            self.assertEqual(len(templates), 1)
            self.assertEqual(templates[0].get("updated_by"), actor_user_id)
            self.assertTrue(templates[0].get("updated_at"))

            measured_resp = self.client.put(
                "/api/admin/material-rules/measured",
                json={
                    "rules": {
                        "bracket_spacing_mm": 450,
                        "clip_spacing_mm": 1300,
                        "screws_per_bracket": 3,
                        "screws_per_dropper": 4,
                        "screws_per_saddle_clip": 2,
                        "screws_per_adjustable_clip": 2,
                        "screw_product_id": "SCR-SS",
                        "bracket_product_id_sc": "BRK-SC-MAR",
                        "bracket_product_id_cl": "BRK-CL-MAR",
                        "saddle_clip_product_id_65": "SCL-65",
                        "saddle_clip_product_id_80": "SCL-80",
                        "adjustable_clip_product_id_65": "ACL-65",
                        "adjustable_clip_product_id_80": "ACL-80",
                        "clip_selection_mode": "force_saddle",
                    }
                },
            )
            self.assertEqual(measured_resp.status_code, 200, measured_resp.text)
            rules = (measured_resp.json() or {}).get("rules") or {}
            self.assertEqual(rules.get("updated_by"), actor_user_id)
            self.assertTrue(rules.get("updated_at"))
            self.assertEqual(rules.get("clip_selection_mode"), "force_saddle")
            self.assertEqual(rules.get("bracket_spacing_mm"), 450)

        # Verify write persistence in fake DB rows as well.
        qq_rt_row = supabase.tables["quick_quoter_repair_types"][0]
        self.assertEqual(str(qq_rt_row.get("updated_by")), actor_user_id)
        self.assertTrue(qq_rt_row.get("updated_at"))
        measured_row = supabase.tables["measured_material_rules"][0]
        self.assertEqual(str(measured_row.get("updated_by")), actor_user_id)
        self.assertTrue(measured_row.get("updated_at"))


if __name__ == "__main__":
    unittest.main()
