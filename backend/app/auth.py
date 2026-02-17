"""
Optional JWT auth for Quote App. Validates Supabase access token and returns user_id (auth.users.id).
Used by /api/diagrams endpoints.

Supports:
- Legacy: SUPABASE_JWT_SECRET (HS256) if set.
- ECC (P-256): JWKS from SUPABASE_URL/auth/v1/.well-known/jwks.json (ES256). No secret needed.
"""
import logging
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

logger = logging.getLogger(__name__)

HTTP_BEARER = HTTPBearer(auto_error=False)

# JWKS client for ECC (ES256) – created lazily when SUPABASE_URL is set and no legacy secret
_jwks_client = None


def _get_jwks_client():
    global _jwks_client
    if _jwks_client is not None:
        return _jwks_client
    url = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
    if not url:
        return None
    jwks_uri = url + "/auth/v1/.well-known/jwks.json"
    try:
        from jwt import PyJWKClient
        _jwks_client = PyJWKClient(jwks_uri, cache_keys=True, lifespan=3600)
        return _jwks_client
    except Exception as e:
        logger.warning("Could not create JWKS client: %s", e)
        return None


def get_jwt_secret() -> Optional[str]:
    """Return legacy JWT secret (HS256) if set. None for ECC-only projects."""
    return os.environ.get("SUPABASE_JWT_SECRET", "").strip() or None


def get_current_user_id(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTP_BEARER),
) -> UUID:
    """
    Verify Supabase JWT and return user_id. Raises 401 if missing or invalid.
    Uses SUPABASE_JWT_SECRET (HS256) if set, else JWKS (ES256) from SUPABASE_URL.
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Authorization required (Bearer token)")

    token = credentials.credentials
    payload = None

    # 1) Legacy: symmetric secret (HS256)
    secret = get_jwt_secret()
    if secret:
        try:
            payload = jwt.decode(
                token,
                secret,
                audience="authenticated",
                algorithms=["HS256"],
            )
        except jwt.PyJWTError:
            payload = None

    # 2) ECC (P-256): JWKS (ES256) – no secret needed
    if payload is None:
        client = _get_jwks_client()
        if client:
            try:
                signing_key = client.get_signing_key_from_jwt(token)
                payload = jwt.decode(
                    token,
                    signing_key.key,
                    audience="authenticated",
                    algorithms=["ES256"],
                )
            except jwt.PyJWTError as e:
                logger.debug("JWKS verification failed: %s", e)
                raise HTTPException(status_code=401, detail="Invalid or expired token") from e
        else:
            raise HTTPException(
                status_code=503,
                detail="Auth not configured (set SUPABASE_URL for ECC JWTs, or SUPABASE_JWT_SECRET for legacy). Cannot access saved diagrams.",
            )

    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Invalid token (no sub)")
    try:
        return UUID(sub)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid token (invalid user id)") from None
