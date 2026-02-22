"""
Optional JWT auth for Quote App. Validates Supabase access token and returns user_id (auth.users.id).
Used by /api/diagrams endpoints. Role-based permissions (task 34.3): role from JWT app_metadata.role
(via Supabase Custom Access Token Hook from public.profiles); require_role() for protected routes.
Supports:
- Legacy: SUPABASE_JWT_SECRET (HS256) if set.
- ECC (P-256): JWKS from SUPABASE_URL/auth/v1/.well-known/jwks.json (ES256). No secret needed.
"""
import logging
import os
from typing import List, Optional, Tuple
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


def get_validated_payload(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTP_BEARER),
) -> dict:
    """
    Verify Supabase JWT and return the decoded payload. Raises 401 if missing or invalid.
    Used by get_current_user_id and get_current_user_id_and_role so we decode once per request.
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
        UUID(sub)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid token (invalid user id)") from None
    return payload


def get_current_user_id(
    payload: dict = Depends(get_validated_payload),
) -> UUID:
    """Return user_id from validated JWT payload. Raises 401 if missing or invalid."""
    return UUID(payload["sub"])


def get_current_user_id_and_role(
    payload: dict = Depends(get_validated_payload),
) -> Tuple[UUID, str]:
    """
    Return (user_id, role) from validated JWT. Role from app_metadata.role (set by
    Custom Access Token Hook from public.profiles); defaults to 'viewer' if missing.
    """
    user_id = UUID(payload["sub"])
    role = (payload.get("app_metadata") or {}).get("role")
    if not role or not isinstance(role, str):
        role = "viewer"
    else:
        role = role.strip().lower()
    return (user_id, role)


def require_role(allowed_roles: List[str]):
    """
    Dependency: require the current user's role to be in allowed_roles.
    Use after auth (Bearer). Raises 403 if role not allowed. Returns user_id.
    """

    def _require(
        user_id_and_role: Tuple[UUID, str] = Depends(get_current_user_id_and_role),
    ) -> UUID:
        user_id, role = user_id_and_role
        normalized_allowed_roles = [str(r).strip().lower() for r in allowed_roles]
        if role not in normalized_allowed_roles:
            raise HTTPException(
                status_code=403,
                detail="Insufficient permissions (required role: one of {})".format(
                    ", ".join(normalized_allowed_roles),
                ),
            )
        return user_id

    return _require
