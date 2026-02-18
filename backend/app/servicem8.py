"""
ServiceM8 OAuth 2.0 integration for Quote App.
See https://developer.servicem8.com/docs/authentication
"""
import base64
import hashlib
import hmac
import logging
import os
import secrets
import time
from datetime import datetime, timezone
from typing import Any, Optional
from urllib.parse import urlencode

import httpx

from app.supabase_client import get_supabase

logger = logging.getLogger(__name__)

# ServiceM8 OAuth endpoints
AUTHORIZE_URL = "https://go.servicem8.com/oauth/authorize"
TOKEN_URL = "https://go.servicem8.com/oauth/access_token"

# Scopes for quote sync (Add to Job) and future job/materials/schedule operations
DEFAULT_SCOPES = [
    "manage_job_contacts",
    "manage_schedule",
    "create_jobs",
    "read_job_categories",
    "manage_job_materials",
    "read_job_materials",
    "read_inventory",
    "read_job_payments",
    "read_job_contacts",
    "read_jobs",
    "manage_badges",
    "publish_job_notes",
    "read_customers",
    "read_job_notes",
    "read_schedule",
    "read_staff",
    "read_forms",
    "read_inbox",
    "read_messages",
    "vendor_email",
]


def _get_app_credentials() -> tuple[str, str]:
    app_id = os.environ.get("SERVICEM8_APP_ID", "").strip()
    app_secret = os.environ.get("SERVICEM8_APP_SECRET", "").strip()
    if not app_id or not app_secret or app_id == "your_app_id" or app_secret == "your_app_secret":
        raise ValueError(
            "SERVICEM8_APP_ID and SERVICEM8_APP_SECRET must be set in .env (from ServiceM8 Store Connect)"
        )
    return app_id, app_secret


def get_redirect_uri() -> str:
    """
    Get OAuth callback URL. MUST match ServiceM8 Activation URL exactly.
    
    ServiceM8 Activation URL (Return URL) is set to:
    https://quote-app-production-7897.up.railway.app/api/servicem8/oauth/callback
    
    This URL must match character-for-character in both authorize request and token exchange,
    or ServiceM8 will reject with invalid_uri error.
    """
    base = os.environ.get("APP_BASE_URL", "").strip().rstrip("/")
    if not base:
        # Default to Railway production URL (must match ServiceM8 Activation URL)
        base = "https://quote-app-production-7897.up.railway.app"
    redirect_uri = f"{base}/api/servicem8/oauth/callback"
    # Ensure exact match: https://quote-app-production-7897.up.railway.app/api/servicem8/oauth/callback
    return redirect_uri


def build_authorize_url(state: str) -> str:
    """
    Build the ServiceM8 OAuth authorize URL.
    User must be redirected here to start the OAuth flow.
    
    redirect_uri MUST match the Activation URL (Return URL) set in ServiceM8 Store Connect
    exactly, character-for-character, or ServiceM8 will reject with invalid_uri error.
    """
    app_id, _ = _get_app_credentials()
    scope = " ".join(DEFAULT_SCOPES)
    redirect_uri = get_redirect_uri()
    params = {
        "response_type": "code",
        "client_id": app_id,
        "scope": scope,
        "redirect_uri": redirect_uri,  # REQUIRED: must match ServiceM8 Activation URL exactly
        "state": state,
    }
    return f"{AUTHORIZE_URL}?{urlencode(params)}"


def exchange_code_for_tokens(code: str, redirect_uri: Optional[str] = None) -> dict[str, Any]:
    """
    Exchange authorization code for access and refresh tokens.
    POST to ServiceM8 token endpoint.
    
    Per ServiceM8 docs: redirect_uri is REQUIRED in token exchange and must match
    what was sent (or omitted) in authorize request. For internal use where redirect_uri
    was omitted in authorize, we still send it here using our Railway callback URL.
    """
    app_id, app_secret = _get_app_credentials()
    # Use provided redirect_uri or default to our callback URL
    if redirect_uri is None:
        redirect_uri = get_redirect_uri()
    data = {
        "grant_type": "authorization_code",
        "client_id": app_id,
        "client_secret": app_secret,
        "code": code,
        "redirect_uri": redirect_uri,
    }
    with httpx.Client() as client:
        resp = client.post(TOKEN_URL, data=data)
    resp.raise_for_status()
    return resp.json()


def refresh_access_token(refresh_token: str) -> dict[str, Any]:
    """
    Refresh the access token using the refresh token.
    POST to ServiceM8 token endpoint.
    """
    app_id, app_secret = _get_app_credentials()
    data = {
        "grant_type": "refresh_token",
        "client_id": app_id,
        "client_secret": app_secret,
        "refresh_token": refresh_token,
    }
    with httpx.Client() as client:
        resp = client.post(TOKEN_URL, data=data)
    resp.raise_for_status()
    return resp.json()


def store_tokens(
    user_id: str,
    access_token: str,
    refresh_token: str,
    expires_in: int,
    scope: Optional[str] = None,
) -> None:
    """Store OAuth tokens in Supabase for the given user."""
    expires_at = datetime.fromtimestamp(time.time() + expires_in, tz=timezone.utc).isoformat()
    updated_at = datetime.now(timezone.utc).isoformat()
    supabase = get_supabase()
    supabase.table("servicem8_oauth").upsert(
        {
            "user_id": user_id,
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expires_at": expires_at,
            "scope": scope,
            "updated_at": updated_at,
        },
        on_conflict="user_id",
    ).execute()


def _parse_expires_at(val: Any) -> float:
    """Parse expires_at (ISO string or number) to Unix timestamp."""
    if val is None:
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    try:
        dt = datetime.fromisoformat(val.replace("Z", "+00:00"))
        return dt.timestamp()
    except Exception:
        return 0.0


def get_tokens(user_id: str) -> Optional[dict[str, Any]]:
    """
    Get tokens for user. If access token is expired, refresh it first.
    Returns dict with access_token, refresh_token, expires_at, scope or None if not connected.
    """
    supabase = get_supabase()
    resp = (
        supabase.table("servicem8_oauth")
        .select("access_token, refresh_token, expires_at, scope")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    if not rows:
        return None

    row = rows[0]
    expires_at = _parse_expires_at(row.get("expires_at"))
    # Refresh if expires within 5 minutes
    if time.time() >= expires_at - 300:
        try:
            new = refresh_access_token(row["refresh_token"])
            store_tokens(
                user_id,
                new["access_token"],
                new["refresh_token"],
                new.get("expires_in", 3600),
                new.get("scope"),
            )
            return {
                "access_token": new["access_token"],
                "refresh_token": new["refresh_token"],
                "expires_at": time.time() + new.get("expires_in", 3600),
                "scope": new.get("scope"),
            }
        except Exception as e:
            logger.warning("ServiceM8 token refresh failed for user %s: %s", user_id, e)
            delete_tokens(user_id)
            return None

    return {
        "access_token": row["access_token"],
        "refresh_token": row["refresh_token"],
        "expires_at": expires_at,
        "scope": row.get("scope"),
    }


def delete_tokens(user_id: str) -> None:
    """Remove ServiceM8 OAuth tokens for user (disconnect)."""
    supabase = get_supabase()
    supabase.table("servicem8_oauth").delete().eq("user_id", user_id).execute()


def generate_state(user_id: str) -> str:
    """Generate a signed state for CSRF protection. Encodes user_id for callback."""
    _, app_secret = _get_app_credentials()
    nonce = secrets.token_urlsafe(16)
    payload = f"{user_id}.{nonce}"
    sig = hmac.new(
        app_secret.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    raw = f"{payload}.{sig}"
    return base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")


def verify_state(state: str) -> Optional[str]:
    """
    Verify state and return user_id. Returns None if invalid.
    """
    try:
        _, app_secret = _get_app_credentials()
        padding = 4 - len(state) % 4
        if padding != 4:
            state = state + "=" * padding
        raw = base64.urlsafe_b64decode(state).decode()
        parts = raw.rsplit(".", 1)
        if len(parts) != 2:
            return None
        payload, sig = parts
        expected = hmac.new(
            app_secret.encode("utf-8"),
            payload.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return None
        return payload.split(".")[0]
    except Exception as e:
        logger.warning("ServiceM8 state verification failed: %s", e)
        return None


def make_api_request(
    method: str,
    endpoint: str,
    access_token: str,
    params: Optional[dict[str, Any]] = None,
    json_data: Optional[dict[str, Any]] = None,
    use_bearer_header: bool = True,
) -> httpx.Response:
    """
    Make a ServiceM8 API request with access token.
    
    Per ServiceM8 docs (https://developer.servicem8.com/docs/authentication):
    - Option 1: Authorization header with "Bearer {token}" (recommended)
    - Option 2: POST parameter access_token (for POST requests)
    
    Args:
        method: HTTP method (GET, POST, PUT, DELETE)
        endpoint: API endpoint path (e.g. "/api_1.0/job.json")
        access_token: OAuth access token
        params: Query parameters (for GET) or form data (for POST)
        json_data: JSON body (for POST/PUT)
        use_bearer_header: If True, use Authorization header; else use POST param
    
    Returns:
        httpx.Response
    """
    base_url = "https://api.servicem8.com"
    url = f"{base_url}{endpoint}"
    
    headers = {"Content-Type": "application/json"}
    
    if use_bearer_header:
        headers["Authorization"] = f"Bearer {access_token}"
        data = json_data if json_data else params
    else:
        # Use POST parameter (only for POST requests)
        if method.upper() == "POST" and params:
            params = params.copy()
            params["access_token"] = access_token
        data = json_data if json_data else params
    
    with httpx.Client() as client:
        if method.upper() == "GET":
            resp = client.get(url, params=params, headers=headers)
        elif method.upper() == "POST":
            if json_data:
                resp = client.post(url, json=json_data, headers=headers)
            else:
                resp = client.post(url, data=data, headers=headers)
        elif method.upper() == "PUT":
            resp = client.put(url, json=json_data, headers=headers)
        elif method.upper() == "DELETE":
            resp = client.delete(url, params=params, headers=headers)
        else:
            raise ValueError(f"Unsupported method: {method}")
    
    return resp


def fetch_job_by_generated_id(user_id: str, generated_job_id: str) -> Optional[dict[str, Any]]:
    """
    Fetch a ServiceM8 job by generated_job_id.
    Uses filter: $filter=generated_job_id eq 'VALUE' (value must be in single quotes per ServiceM8 docs).

    Returns the first matching job or None if not found/error.
    """
    tokens = get_tokens(user_id)
    if not tokens:
        return None
    filter_value = str(generated_job_id).strip()
    if not filter_value:
        return None
    # ServiceM8 requires value in single quotes for eq operator
    filter_expr = f"generated_job_id eq '{filter_value}'"
    params = {"$filter": filter_expr}
    try:
        resp = make_api_request("GET", "/api_1.0/job.json", tokens["access_token"], params=params)
        resp.raise_for_status()
        data = resp.json()
        jobs = data if isinstance(data, list) else []
        return jobs[0] if jobs else None
    except Exception as e:
        logger.warning("ServiceM8 job lookup failed for generated_job_id=%s: %s", filter_value, e)
        return None


# Default material UUID for Add to Job bundled line. TODO: Replace with per-product/bundle mapping.
ADD_TO_JOB_DEFAULT_MATERIAL_UUID = "6129948b-4f79-4fc1-b611-23bbc4f9726b"


def add_job_material(
    access_token: str,
    job_uuid: str,
    name: str,
    quantity: str,
    price: str,
    cost: Optional[str] = None,
    material_uuid: Optional[str] = None,
) -> tuple[bool, Optional[str]]:
    """
    POST to ServiceM8 jobmaterial.json.
    Returns (success, error_message).
    """
    mat_uuid = material_uuid or ADD_TO_JOB_DEFAULT_MATERIAL_UUID
    payload = {
        "job_uuid": job_uuid,
        "material_uuid": mat_uuid,
        "name": name,
        "quantity": quantity,
        "price": price,
    }
    if cost is not None:
        payload["cost"] = cost
    try:
        resp = make_api_request("POST", "/api_1.0/jobmaterial.json", access_token, json_data=payload)
        resp.raise_for_status()
        return True, None
    except httpx.HTTPStatusError as e:
        body = e.response.text
        logger.warning("ServiceM8 add job material failed: %s %s", e.response.status_code, body)
        return False, body or str(e)
    except Exception as e:
        logger.warning("ServiceM8 add job material failed: %s", e)
        return False, str(e)


def add_job_note(access_token: str, job_uuid: str, note_text: str) -> tuple[bool, Optional[str]]:
    """
    POST to ServiceM8 note.json. Links note to job via related_object.
    Returns (success, error_message).
    """
    payload = {
        "related_object": "job",
        "related_object_uuid": job_uuid,
        "note": note_text,
    }
    try:
        resp = make_api_request("POST", "/api_1.0/note.json", access_token, json_data=payload)
        resp.raise_for_status()
        return True, None
    except httpx.HTTPStatusError as e:
        body = e.response.text
        logger.warning("ServiceM8 add job note failed: %s %s", e.response.status_code, body)
        return False, body or str(e)
    except Exception as e:
        logger.warning("ServiceM8 add job note failed: %s", e)
        return False, str(e)
