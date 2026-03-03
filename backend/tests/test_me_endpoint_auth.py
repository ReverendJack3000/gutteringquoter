"""
Auth regression tests for GET /api/me role verification behavior.
"""
import os
import sys
import unittest
import uuid as uuid_lib
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import main as backend_main


class _ProfilesQuery:
    def __init__(self, rows):
        self._rows = rows

    def select(self, _fields):
        return self

    def eq(self, _field, _value):
        return self

    def limit(self, _n):
        return self

    def execute(self):
        return SimpleNamespace(data=self._rows)


class _FakeSupabase:
    def __init__(self, profile_rows):
        self._profile_rows = profile_rows

    def table(self, name):
        if name != "profiles":
            raise AssertionError(f"Unexpected table: {name}")
        return _ProfilesQuery(self._profile_rows)


class TestMeEndpointAuth(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(backend_main.app)

    def tearDown(self):
        backend_main.app.dependency_overrides.clear()

    @staticmethod
    def _set_auth_overrides(*, user_id: str, jwt_role: str, email: str):
        uid = uuid_lib.UUID(user_id)
        backend_main.app.dependency_overrides[backend_main.get_current_user_id_and_role] = lambda: (uid, jwt_role)
        backend_main.app.dependency_overrides[backend_main.get_validated_payload] = lambda: {
            "sub": str(uid),
            "email": email,
            "app_metadata": {"role": jwt_role},
        }

    def test_profile_role_overrides_jwt_admin_claim(self):
        self._set_auth_overrides(
            user_id="68c835ff-a4f1-46da-bdc0-cbcee8fbfac6",
            jwt_role="admin",
            email="jack2002buchanan@gmail.com",
        )
        supabase = _FakeSupabase([{"role": "technician"}])
        with patch.object(backend_main, "get_supabase", return_value=supabase):
            resp = self.client.get("/api/me")
        self.assertEqual(resp.status_code, 200)
        payload = resp.json()
        self.assertEqual(payload.get("role"), "technician")
        self.assertFalse(payload.get("is_super_admin"))

    def test_missing_profile_row_defaults_to_viewer(self):
        self._set_auth_overrides(
            user_id="10000000-0000-0000-0000-000000000001",
            jwt_role="admin",
            email="qa-viewer@example.com",
        )
        supabase = _FakeSupabase([])
        with patch.object(backend_main, "get_supabase", return_value=supabase):
            resp = self.client.get("/api/me")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json().get("role"), "viewer")

    def test_invalid_profile_role_defaults_to_viewer(self):
        self._set_auth_overrides(
            user_id="10000000-0000-0000-0000-000000000002",
            jwt_role="admin",
            email="qa-invalid-role@example.com",
        )
        supabase = _FakeSupabase([{"role": "owner"}])
        with patch.object(backend_main, "get_supabase", return_value=supabase):
            resp = self.client.get("/api/me")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json().get("role"), "viewer")

    def test_profile_lookup_failure_returns_503(self):
        self._set_auth_overrides(
            user_id="10000000-0000-0000-0000-000000000003",
            jwt_role="admin",
            email="qa-lookup-failure@example.com",
        )
        with patch.object(backend_main, "get_supabase", side_effect=RuntimeError("forced profiles read failure")):
            resp = self.client.get("/api/me")
        self.assertEqual(resp.status_code, 503)
        detail = str((resp.json() or {}).get("detail") or "")
        self.assertIn("Could not verify current user role", detail)

    def test_super_admin_still_forces_admin_role(self):
        self._set_auth_overrides(
            user_id="10000000-0000-0000-0000-000000000004",
            jwt_role="technician",
            email="super-admin-e2e@example.com",
        )
        supabase = _FakeSupabase([{"role": "technician"}])
        with patch.dict(os.environ, {"SUPER_ADMIN_EMAIL": "super-admin-e2e@example.com"}, clear=False):
            with patch.object(backend_main, "get_supabase", return_value=supabase):
                resp = self.client.get("/api/me")
        self.assertEqual(resp.status_code, 200)
        payload = resp.json()
        self.assertEqual(payload.get("role"), "admin")
        self.assertTrue(payload.get("is_super_admin"))


if __name__ == "__main__":
    unittest.main()
