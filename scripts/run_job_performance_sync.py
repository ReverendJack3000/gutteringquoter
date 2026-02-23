#!/usr/bin/env python3
"""
Run job_performance sync (Section 59.6): list Completed/Invoiced jobs from ServiceM8, resolve active quote, upsert job_performance.
Usage (from project root): python scripts/run_job_performance_sync.py (requires backend deps; or run from backend/ with venv: python -c "from app.job_performance_sync import run_sync; print(run_sync())").
Requires: backend/.env with SUPABASE_*, SERVICEM8_*, and SERVICEM8_COMPANY_USER_ID or SERVICEM8_COMPANY_EMAIL.
ServiceM8 must be connected (OAuth) for the company user so tokens exist.
"""
import json
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent / "backend"
env_file = backend_dir / ".env"
if env_file.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(env_file)
    except ImportError:
        pass
sys.path.insert(0, str(backend_dir))

from app.job_performance_sync import run_sync

if __name__ == "__main__":
    result = run_sync()
    print(json.dumps(result, indent=2))
    sys.exit(0 if result.get("success") else 1)
