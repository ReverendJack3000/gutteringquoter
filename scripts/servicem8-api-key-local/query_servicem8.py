#!/usr/bin/env python3
"""
Query ServiceM8 API using an API key (X-API-Key header).
Use for ad-hoc inspection of jobs, staff, job activities, etc.

Requires: SERVICEM8_API_KEY in backend/.env (from ServiceM8 → Settings → API Keys).
Usage (from project root):
  python scripts/servicem8-api-key-local/query_servicem8.py                    # list first 10 jobs
  python scripts/servicem8-api-key-local/query_servicem8.py jobs
  python scripts/servicem8-api-key-local/query_servicem8.py staff
  python scripts/servicem8-api-key-local/query_servicem8.py jobactivities
  python scripts/servicem8-api-key-local/query_servicem8.py jobpayments
  python scripts/servicem8-api-key-local/query_servicem8.py jobmaterials
  python scripts/servicem8-api-key-local/query_servicem8.py jobs --filter "status eq 'Complete'"
"""
import argparse
import json
import os
import sys
from pathlib import Path

# Project root: this script lives in scripts/servicem8-api-key-local/
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
                if k.strip() == "SERVICEM8_API_KEY":
                    os.environ.setdefault("SERVICEM8_API_KEY", v.strip().strip('"').strip("'"))
                    break

try:
    import httpx
except ImportError:
    print("Install httpx: pip install httpx", file=sys.stderr)
    sys.exit(1)

BASE_URL = "https://api.servicem8.com"
ENDPOINTS = {
    "jobs": "/api_1.0/job.json",
    "staff": "/api_1.0/staff.json",
    "jobactivities": "/api_1.0/jobactivity.json",
    "jobpayments": "/api_1.0/jobpayment.json",
    "jobmaterials": "/api_1.0/jobmaterial.json",
}


def main():
    ap = argparse.ArgumentParser(description="Query ServiceM8 API with API key")
    ap.add_argument(
        "resource",
        nargs="?",
        default="jobs",
        choices=list(ENDPOINTS.keys()),
        help="Resource to list (default: jobs)",
    )
    ap.add_argument("--filter", "-f", help="OData $filter (e.g. \"status eq 'Complete'\")")
    ap.add_argument("--limit", "-n", type=int, default=10, help="Max records to show (default 10)")
    ap.add_argument("--raw", action="store_true", help="Print raw JSON")
    args = ap.parse_args()

    api_key = os.environ.get("SERVICEM8_API_KEY", "").strip()
    if not api_key:
        print(
            "Set SERVICEM8_API_KEY in backend/.env (from ServiceM8 → Settings → API Keys).",
            file=sys.stderr,
        )
        sys.exit(1)

    endpoint = ENDPOINTS[args.resource]
    url = f"{BASE_URL}{endpoint}"
    headers = {
        "X-API-Key": api_key,
        "Content-Type": "application/json",
    }
    params = {}
    if args.filter:
        params["$filter"] = args.filter

    try:
        resp = httpx.get(url, headers=headers, params=params, timeout=30.0)
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        print(f"HTTP {e.response.status_code}: {e.response.text[:500]}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Request failed: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        data = resp.json()
    except Exception:
        print(resp.text[:2000], file=sys.stderr)
        sys.exit(1)

    if not isinstance(data, list):
        print(json.dumps(data, indent=2))
        return

    if args.raw:
        print(json.dumps(data, indent=2))
        return

    shown = data[: args.limit]
    print(f"# {args.resource} (showing {len(shown)} of {len(data)} total)")
    for i, row in enumerate(shown, 1):
        print(f"\n--- {i} ---")
        if isinstance(row, dict):
            for k, v in sorted(row.items()):
                if v is not None and v != "":
                    print(f"  {k}: {v}")
        else:
            print(row)
    if len(data) > args.limit:
        print(f"\n... and {len(data) - args.limit} more (use --limit N or --raw)")


if __name__ == "__main__":
    main()
