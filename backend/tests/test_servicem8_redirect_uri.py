import os
import unittest
from unittest.mock import patch

from app.servicem8 import get_redirect_uri


class TestServiceM8RedirectUri(unittest.TestCase):
    def test_prefers_app_base_url_when_set(self):
        with patch.dict(
            os.environ,
            {
                "APP_BASE_URL": "https://custom.example.com/",
                "RAILWAY_PUBLIC_DOMAIN": "quote-app-production.up.railway.app",
            },
            clear=False,
        ):
            self.assertEqual(
                get_redirect_uri(),
                "https://custom.example.com/api/servicem8/oauth/callback",
            )

    def test_uses_railway_public_domain_when_app_base_url_missing(self):
        with patch.dict(
            os.environ,
            {
                "APP_BASE_URL": "",
                "RAILWAY_PUBLIC_DOMAIN": "quote-app-production.up.railway.app",
            },
            clear=False,
        ):
            self.assertEqual(
                get_redirect_uri(),
                "https://quote-app-production.up.railway.app/api/servicem8/oauth/callback",
            )

    def test_falls_back_to_localhost_when_no_base_env_vars(self):
        with patch.dict(
            os.environ,
            {
                "APP_BASE_URL": "",
                "RAILWAY_PUBLIC_DOMAIN": "",
            },
            clear=False,
        ):
            self.assertEqual(
                get_redirect_uri(),
                "http://127.0.0.1:8000/api/servicem8/oauth/callback",
            )


if __name__ == "__main__":
    unittest.main()
