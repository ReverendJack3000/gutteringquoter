"""
Supabase client for Quote App backend.
Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in environment (backend/.env).
Used for all data (e.g. products); local server testing uses the same Supabase project.
"""
import os


def _load_dotenv() -> None:
    try:
        from dotenv import load_dotenv
        backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        load_dotenv(os.path.join(backend_dir, ".env"))
    except Exception:
        pass


_load_dotenv()

_supabase_client = None


def get_supabase():
    """Return the Supabase client. Uses service_role key if set, else anon key (read-only). Raises if URL and at least one key are missing."""
    global _supabase_client
    if _supabase_client is not None:
        return _supabase_client
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = (
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        or os.environ.get("SUPABASE_ANON_KEY", "").strip()
    )
    if not url or not key:
        raise ValueError(
            "Supabase is required. In backend/.env set SUPABASE_URL and either "
            "SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY (anon is enough for products). "
            "Get keys from: Supabase dashboard → Jacks Quote App → Settings → API."
        )
    from supabase import create_client
    client = create_client(url, key)
    _supabase_client = client
    return _supabase_client
