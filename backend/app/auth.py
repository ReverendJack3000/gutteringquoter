"""
Optional JWT auth for Quote App. Validates Supabase access token and returns user_id (auth.users.id).
Used by /api/diagrams endpoints. Requires SUPABASE_JWT_SECRET in backend/.env (from Supabase → Settings → API → JWT Secret).
"""
import os
from typing import Optional
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

try:
    from dotenv import load_dotenv
    from pathlib import Path
    _env_path = Path(__file__).resolve().parent.parent / ".env"
    load_dotenv(_env_path)
except Exception:
    pass

HTTP_BEARER = HTTPBearer(auto_error=False)


def get_jwt_secret() -> Optional[str]:
    """Return JWT secret for verifying Supabase tokens. None if not configured."""
    return os.environ.get("SUPABASE_JWT_SECRET", "").strip() or None


def get_current_user_id(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTP_BEARER),
) -> UUID:
    """
    Verify Supabase JWT and return user_id. Raises 401 if missing or invalid.
    Use for routes that require authentication (e.g. saved diagrams).
    """
    secret = get_jwt_secret()
    if not secret:
        raise HTTPException(
            status_code=503,
            detail="Auth not configured (SUPABASE_JWT_SECRET missing). Cannot access saved diagrams.",
        )
    if not credentials or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Authorization required (Bearer token)")
    try:
        payload = jwt.decode(
            credentials.credentials,
            secret,
            audience="authenticated",
            algorithms=["HS256"],
        )
    except jwt.PyJWTError as e:
        raise HTTPException(status_code=401, detail="Invalid or expired token") from e
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Invalid token (no sub)")
    try:
        return UUID(sub)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid token (invalid user id)") from None
