"""
Saved diagrams (blueprints) per user. Persists canvas state to public.saved_diagrams
and blueprint/thumbnail images to Supabase Storage bucket 'blueprints'.
"""
import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from app.supabase_client import get_supabase

logger = logging.getLogger(__name__)

BUCKET = "blueprints"


def _storage_path(user_id: UUID, diagram_id: UUID, filename: str) -> str:
    return f"{user_id}/{diagram_id}/{filename}"


def list_diagrams(user_id: UUID):
    """Return list of saved diagrams for user (id, name, thumbnail_url, blueprint_image_url, servicem8_job_id, created_at, updated_at)."""
    supabase = get_supabase()
    resp = (
        supabase.table("saved_diagrams")
        .select("id, name, thumbnail_url, blueprint_image_url, servicem8_job_id, created_at, updated_at")
        .eq("user_id", str(user_id))
        .order("created_at", desc=True)
        .execute()
    )
    rows = resp.data or []
    return [
        {
            "id": str(r["id"]),
            "name": r.get("name", ""),
            "thumbnailUrl": r.get("thumbnail_url"),
            "blueprintImageUrl": r.get("blueprint_image_url"),
            "servicem8JobId": r.get("servicem8_job_id"),
            "createdAt": r.get("created_at"),
            "updatedAt": r.get("updated_at"),
        }
        for r in rows
    ]


def get_diagram(user_id: UUID, diagram_id: UUID) -> Optional[dict]:
    """Return full diagram row for user if owned."""
    supabase = get_supabase()
    resp = (
        supabase.table("saved_diagrams")
        .select("*")
        .eq("id", str(diagram_id))
        .eq("user_id", str(user_id))
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    if not rows:
        return None
    r = rows[0]
    return {
        "id": str(r["id"]),
        "name": r.get("name", ""),
        "data": r.get("data") or {},
        "blueprintImageUrl": r.get("blueprint_image_url"),
        "thumbnailUrl": r.get("thumbnail_url"),
        "servicem8JobId": r.get("servicem8_job_id"),
        "createdAt": r.get("created_at"),
        "updatedAt": r.get("updated_at"),
    }


def create_diagram(
    user_id: UUID,
    name: str,
    data: dict,
    *,
    blueprint_bytes: Optional[bytes] = None,
    thumbnail_bytes: Optional[bytes] = None,
    servicem8_job_id: Optional[str] = None,
) -> dict:
    """Insert row and optionally upload blueprint/thumbnail to Storage. Returns created diagram meta."""
    supabase = get_supabase()
    insert = {
        "user_id": str(user_id),
        "name": name,
        "data": data,
    }
    if servicem8_job_id is not None:
        insert["servicem8_job_id"] = servicem8_job_id[:32] if servicem8_job_id else None
    resp = supabase.table("saved_diagrams").insert(insert).execute()
    rows = resp.data or []
    if not rows:
        raise RuntimeError("Insert saved_diagrams returned no row")
    row = rows[0]
    diagram_id = UUID(str(row["id"]))
    blueprint_url = None
    thumbnail_url = None

    if blueprint_bytes:
        path = _storage_path(user_id, diagram_id, "blueprint.png")
        try:
            supabase.storage.from_(BUCKET).upload(path, blueprint_bytes, {"content-type": "image/png"})
            pub = supabase.storage.from_(BUCKET).get_public_url(path)
            blueprint_url = pub
        except Exception as e:
            logger.warning("Upload blueprint image failed: %s", e)
    if thumbnail_bytes:
        path = _storage_path(user_id, diagram_id, "thumb.png")
        try:
            supabase.storage.from_(BUCKET).upload(path, thumbnail_bytes, {"content-type": "image/png"})
            thumbnail_url = supabase.storage.from_(BUCKET).get_public_url(path)
        except Exception as e:
            logger.warning("Upload thumbnail failed: %s", e)

    if blueprint_url or thumbnail_url:
        payload = {"updated_at": datetime.now(timezone.utc).isoformat()}
        if blueprint_url:
            payload["blueprint_image_url"] = blueprint_url
        if thumbnail_url:
            payload["thumbnail_url"] = thumbnail_url
        supabase.table("saved_diagrams").update(payload).eq("id", str(diagram_id)).execute()

    return {
        "id": str(diagram_id),
        "name": name,
        "blueprintImageUrl": blueprint_url,
        "thumbnailUrl": thumbnail_url,
        "servicem8JobId": insert.get("servicem8_job_id"),
        "createdAt": row.get("created_at"),
        "updatedAt": row.get("updated_at"),
    }


def update_diagram(
    user_id: UUID,
    diagram_id: UUID,
    *,
    name: Optional[str] = None,
    data: Optional[dict] = None,
    blueprint_bytes: Optional[bytes] = None,
    thumbnail_bytes: Optional[bytes] = None,
    servicem8_job_id: Optional[str] = None,
) -> Optional[dict]:
    """Update diagram; optionally replace image/thumbnail. Returns updated row or None if not found."""
    existing = get_diagram(user_id, diagram_id)
    if not existing:
        return None
    supabase = get_supabase()
    updates = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if name is not None:
        updates["name"] = name
    if data is not None:
        updates["data"] = data
    if servicem8_job_id is not None:
        updates["servicem8_job_id"] = servicem8_job_id[:32] if servicem8_job_id else None

    if blueprint_bytes:
        path = _storage_path(user_id, diagram_id, "blueprint.png")
        try:
            supabase.storage.from_(BUCKET).upload(path, blueprint_bytes, {"content-type": "image/png", "upsert": "true"})
            updates["blueprint_image_url"] = supabase.storage.from_(BUCKET).get_public_url(path)
        except Exception as e:
            logger.warning("Upload blueprint image failed: %s", e)
    if thumbnail_bytes:
        path = _storage_path(user_id, diagram_id, "thumb.png")
        try:
            supabase.storage.from_(BUCKET).upload(path, thumbnail_bytes, {"content-type": "image/png", "upsert": "true"})
            updates["thumbnail_url"] = supabase.storage.from_(BUCKET).get_public_url(path)
        except Exception as e:
            logger.warning("Upload thumbnail failed: %s", e)

    supabase.table("saved_diagrams").update(updates).eq("id", str(diagram_id)).eq("user_id", str(user_id)).execute()
    return get_diagram(user_id, diagram_id)


def delete_diagram(user_id: UUID, diagram_id: UUID) -> bool:
    """Delete diagram row and its storage objects. Returns True if deleted."""
    existing = get_diagram(user_id, diagram_id)
    if not existing:
        return False
    supabase = get_supabase()
    prefix = f"{user_id}/{diagram_id}"
    try:
        files = supabase.storage.from_(BUCKET).list(prefix=prefix)
        for item in files or []:
            if isinstance(item, dict) and item.get("name"):
                supabase.storage.from_(BUCKET).remove([f"{prefix}/{item['name']}"])
        # Also try direct paths
        for fname in ("blueprint.png", "thumb.png"):
            try:
                supabase.storage.from_(BUCKET).remove([f"{prefix}/{fname}"])
            except Exception:
                pass
    except Exception as e:
        logger.warning("Storage delete for diagram %s failed: %s", diagram_id, e)
    supabase.table("saved_diagrams").delete().eq("id", str(diagram_id)).eq("user_id", str(user_id)).execute()
    return True
