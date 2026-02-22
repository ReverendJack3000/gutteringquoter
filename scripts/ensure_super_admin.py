#!/usr/bin/env python3
"""
Ensure the SUPER_ADMIN_EMAIL user has role=admin in public.profiles.
Run once after setting SUPER_ADMIN_EMAIL (e.g. in Railway or backend/.env).
Usage (from project root): python scripts/ensure_super_admin.py
Requires: backend/.env or environment with SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPER_ADMIN_EMAIL.
"""
import os
import sys
from pathlib import Path

# Load backend/.env
_backend_dir = Path(__file__).resolve().parent.parent / "backend"
_env_file = _backend_dir / ".env"
if _env_file.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(_env_file)
    except ImportError:
        pass

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").strip()
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
SUPER_ADMIN_EMAIL = os.environ.get("SUPER_ADMIN_EMAIL", "").strip().lower()

if not SUPER_ADMIN_EMAIL:
    print("SUPER_ADMIN_EMAIL is not set. Set it in backend/.env or the environment.", file=sys.stderr)
    sys.exit(1)
if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    print("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required. Set them in backend/.env.", file=sys.stderr)
    sys.exit(1)

def _extract_users(resp):
    if resp is None:
        return []
    if isinstance(resp, list):
        return resp
    if isinstance(resp, dict):
        u = resp.get("users")
        if isinstance(u, list):
            return u
    u = getattr(resp, "users", None)
    if isinstance(u, list):
        return u
    return []


def _user_email(u):
    return (getattr(u, "email", None) or (u.get("email") if isinstance(u, dict) else None) or "").strip().lower()


def _user_id(u):
    return str(getattr(u, "id", None) or (u.get("id") if isinstance(u, dict) else None) or "").strip()


def main():
    from supabase import create_client
    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    target_email = SUPER_ADMIN_EMAIL
    user_id = None
    page = 1
    per_page = 200
    while page <= 100:
        try:
            resp = client.auth.admin.list_users(page=page, per_page=per_page)
        except TypeError:
            resp = client.auth.admin.list_users()
        users = _extract_users(resp)
        for u in users:
            if _user_email(u) == target_email:
                user_id = _user_id(u)
                break
        if user_id or len(users) < per_page:
            break
        page += 1

    if not user_id:
        print(f"No Supabase Auth user found with email {SUPER_ADMIN_EMAIL}. Sign up or use the exact email.", file=sys.stderr)
        sys.exit(1)

    try:
        client.table("profiles").upsert({"user_id": user_id, "role": "admin"}, on_conflict="user_id").execute()
    except Exception as e:
        print(f"Failed to upsert profiles: {e}", file=sys.stderr)
        sys.exit(1)

    print(f"Super admin set: {SUPER_ADMIN_EMAIL} (user_id={user_id}) has role=admin in public.profiles.")
    print("Sign out and sign in again for the JWT to include the new role.")


if __name__ == "__main__":
    main()
