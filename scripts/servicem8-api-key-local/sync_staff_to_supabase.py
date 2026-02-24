#!/usr/bin/env python3
"""
Pull all staff from ServiceM8 API (using API key) and upsert into Supabase public.servicem8_staff.
Local/dev only: run from project root. Requires backend/.env with SERVICEM8_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
Does not modify any app code. Table is a reference cache; staff -> technician_id mapping still uses email match (59.2).
"""
import os
import sys
import uuid as uuid_module
from datetime import datetime, timezone
from pathlib import Path

# Load backend/.env
_project_root = Path(__file__).resolve().parent.parent.parent
_env_file = _project_root / "backend" / ".env"
if _env_file.exists():
    try:
        import dotenv
        dotenv.load_dotenv(_env_file)
    except ImportError:
        for line in _env_file.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                key = k.strip()
                val = v.strip().strip('"').strip("'")
                if key in ("SERVICEM8_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"):
                    os.environ.setdefault(key, val)

try:
    import httpx
except ImportError:
    print("Install httpx: pip install httpx", file=sys.stderr)
    sys.exit(1)

try:
    from supabase import create_client
except ImportError:
    print("Install supabase: pip install supabase (or run from backend venv)", file=sys.stderr)
    sys.exit(1)


BASE_URL = "https://api.servicem8.com"
STAFF_ENDPOINT = "/api_1.0/staff.json"


def main():
    api_key = os.environ.get("SERVICEM8_API_KEY", "").strip()
    if not api_key:
        print("Set SERVICEM8_API_KEY in backend/.env", file=sys.stderr)
        sys.exit(1)
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        print("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env", file=sys.stderr)
        sys.exit(1)

    # Fetch staff from ServiceM8
    try:
        resp = httpx.get(
            f"{BASE_URL}{STAFF_ENDPOINT}",
            headers={"X-API-Key": api_key, "Content-Type": "application/json"},
            timeout=30.0,
        )
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        print(f"ServiceM8 HTTP {e.response.status_code}: {e.response.text[:500]}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"ServiceM8 request failed: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        staff_list = resp.json()
    except Exception:
        print("Invalid JSON from ServiceM8", file=sys.stderr)
        sys.exit(1)
    if not isinstance(staff_list, list):
        print("ServiceM8 did not return a list", file=sys.stderr)
        sys.exit(1)

    # Build rows for servicem8_staff (only valid UUIDs)
    rows = []
    for s in staff_list:
        if not isinstance(s, dict):
            continue
        raw_uuid = (s.get("uuid") or "").strip()
        if not raw_uuid:
            continue
        try:
            staff_uuid = str(uuid_module.UUID(raw_uuid))
        except (ValueError, TypeError):
            continue
        email = (s.get("email") or "").strip() or None
        first = (s.get("first") or "").strip() or None
        last = (s.get("last") or "").strip() or None
        active = True
        if s.get("active") is not None:
            active = bool(int(s["active"]) if str(s["active"]).isdigit() else s["active"])
        job_title = (s.get("job_title") or "").strip() or None
        rows.append({
            "servicem8_staff_uuid": staff_uuid,
            "email": email,
            "first_name": first,
            "last_name": last,
            "active": active,
            "job_title": job_title,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })

    if not rows:
        print("No staff records with valid UUID to sync.")
        return

    # Upsert into Supabase
    supabase = create_client(url, key)
    try:
        supabase.table("servicem8_staff").upsert(rows, on_conflict="servicem8_staff_uuid").execute()
    except Exception as e:
        print(f"Supabase upsert failed: {e}", file=sys.stderr)
        sys.exit(1)

    print(f"Synced {len(rows)} staff records to public.servicem8_staff.")


if __name__ == "__main__":
    main()
