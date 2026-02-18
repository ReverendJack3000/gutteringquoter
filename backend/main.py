"""
Quote App API – FastAPI backend.
Blueprint processing, product list, static frontend. API-ready for future integrations.
"""
import base64
import logging
from pathlib import Path
from typing import Any, Optional

from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile
from starlette.responses import RedirectResponse
from pydantic import BaseModel, Field

from app.auth import get_current_user_id
from app.blueprint_processor import process_blueprint
from app.csv_import import import_products_from_csv
from app.diagrams import (
    create_diagram,
    delete_diagram,
    get_diagram,
    list_diagrams,
    update_diagram,
)
from app.gutter_accessories import expand_elements_with_gutter_accessories
from app.pricing import get_product_pricing
from app.products import get_products
from app.supabase_client import get_supabase
from app import servicem8 as sm8
from fastapi.middleware.cors import CORSMiddleware
import httpx
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

logger = logging.getLogger(__name__)


class QuoteElement(BaseModel):
    assetId: str = Field(..., min_length=1, description="Product ID (e.g. gutter, bracket)")
    quantity: float = Field(..., ge=0, description="Quantity for this product")
    length_mm: Optional[float] = Field(None, ge=0, description="Optional measured length in mm (used for bracket/screw and downpipe clip calculation)")


class CalculateQuoteRequest(BaseModel):
    elements: list[QuoteElement] = Field(..., min_length=1, description="At least one element required")
    labour_hours: float = Field(..., ge=0, description="Labour hours (>= 0)")
    labour_rate_id: str = Field(..., min_length=1, description="UUID of the labour rate")


class UpdatePricingItem(BaseModel):
    id: str = Field(..., min_length=1, description="Product ID")
    cost_price: float = Field(..., ge=0, description="Cost price (>= 0)")
    markup_percentage: float = Field(..., ge=0, le=1000, description="Markup percentage (0-1000)")


class SaveDiagramRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    data: dict[str, Any] = Field(..., description="Canvas state: elements, blueprintTransform, groups")
    blueprintImageBase64: Optional[str] = Field(None, description="PNG image as base64 data URL or raw base64")
    thumbnailBase64: Optional[str] = Field(None, description="Thumbnail PNG as base64")


class UpdateDiagramRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    data: Optional[dict[str, Any]] = Field(None)
    blueprintImageBase64: Optional[str] = None
    thumbnailBase64: Optional[str] = None


app = FastAPI(
    title="Quote App API",
    description="Property photo → blueprint; Marley guttering repair plans. API-ready for integrations.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    """Health check for local dev and future API consumers."""
    return {"status": "ok"}


@app.get("/api/config")
def api_config():
    """Public config for frontend (Supabase URL and anon key for auth). Safe to expose."""
    import os
    url = os.environ.get("SUPABASE_URL", "").strip()
    anon = os.environ.get("SUPABASE_ANON_KEY", "").strip()
    return {"supabaseUrl": url or None, "anonKey": anon or None}


@app.get("/api/products")
def api_products(
    search: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    profile: Optional[str] = Query(None, description="Filter by profile: storm_cloud | classic | other"),
):
    """List Marley products; optional search, category, and profile filter."""
    return {"products": get_products(search=search, category=category, profile=profile)}


@app.post("/api/products/update-pricing")
def api_update_pricing(body: list[UpdatePricingItem]):
    """
    Update cost_price and markup_percentage for products. Accepts array of {id, cost_price, markup_percentage}.
    Returns {success: true, updated: count}. 400 if validation fails; 500 on DB error.
    """
    if not body:
        raise HTTPException(400, "At least one product update is required")
    for item in body:
        if item.cost_price < 0:
            raise HTTPException(400, f"Product {item.id}: cost_price must be >= 0")
        if not (0 <= item.markup_percentage <= 1000):
            raise HTTPException(400, f"Product {item.id}: markup_percentage must be between 0 and 1000")
    try:
        supabase = get_supabase()
        updated = 0
        for item in body:
            resp = (
                supabase.table("products")
                .update({"cost_price": item.cost_price, "markup_percentage": item.markup_percentage})
                .eq("id", item.id)
                .execute()
            )
            if resp.data and len(resp.data) > 0:
                updated += len(resp.data)
        return {"success": True, "updated": updated}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to update product pricing in Supabase: %s", e)
        raise HTTPException(500, "Failed to update pricing")


@app.post("/api/products/import-csv")
async def api_import_csv(file: UploadFile = File(...)):
    """
    Import products from CSV. Expected columns: Item Number, Servicem8 Material_uuid, Item Name,
    Purchase Cost, Price. Profile is derived from item number (SC/CL) or name (Storm Cloud/Classic).
    Returns {success, imported, failed, errors}.
    """
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(400, "File must be a CSV")
    content = (await file.read()).decode("utf-8", errors="replace")
    try:
        result = import_products_from_csv(content)
    except Exception as e:
        logger.exception("CSV import failed: %s", e)
        raise HTTPException(500, str(e))
    if not result["success"] and result["imported"] == 0 and result["failed"] == 0:
        raise HTTPException(400, "; ".join(result["errors"][:5]))
    return result


@app.get("/api/labour-rates")
def api_labour_rates():
    """Return active labour rates for quote generation. Response uses camelCase."""
    try:
        supabase = get_supabase()
        resp = (
            supabase.table("labour_rates")
            .select("id, rate_name, hourly_rate")
            .eq("active", True)
            .execute()
        )
        rows = resp.data or []
        labour_rates = [
            {
                "id": str(r["id"]),
                "rateName": r.get("rate_name", ""),
                "hourlyRate": float(r["hourly_rate"]) if r.get("hourly_rate") is not None else 0,
            }
            for r in rows
        ]
        return {"labour_rates": labour_rates}
    except Exception as e:
        logger.exception("Failed to fetch labour rates from Supabase: %s", e)
        raise HTTPException(500, "Failed to fetch labour rates")


@app.post("/api/calculate-quote")
def api_calculate_quote(body: CalculateQuoteRequest):
    """
    Calculate quote from materials (elements with assetId + quantity), labour hours,
    and labour rate. Request validated by Pydantic (elements non-empty, labour_hours >= 0, etc.).
    Auto-adds brackets (1 per 400mm gutter) and screws (3 per bracket) when gutters are present.
    Returns 400 if any product not found or missing pricing; 404 if labour rate invalid; 500 on DB errors.
    """
    # Expand elements with inferred brackets and screws from gutters (1 bracket/400mm, 3 screws/bracket)
    raw_elements = [
        {"assetId": e.assetId, "quantity": e.quantity, "length_mm": getattr(e, "length_mm", None)}
        for e in body.elements
    ]
    elements_for_quote = expand_elements_with_gutter_accessories(raw_elements)

    # Fetch product pricing; 500 on database error
    product_ids = list({e["assetId"] for e in elements_for_quote})
    try:
        pricing = get_product_pricing(product_ids)
    except Exception as e:
        logger.exception("Database error while fetching product pricing: %s", e)
        raise HTTPException(500, "Failed to load product pricing")

    # Build materials lines; 400 if any product missing or has no cost_price
    materials = []
    materials_subtotal = 0.0
    for e in elements_for_quote:
        pid = e["assetId"]
        if pid not in pricing:
            logger.warning("Product not found or missing pricing: %s", pid)
            raise HTTPException(400, f"Product {pid} not found or missing pricing")
        p = pricing[pid]
        cost_price = p["cost_price"]
        markup_pct = p["markup_percentage"]
        sell_price = round(cost_price * (1 + markup_pct / 100), 2)
        qty = e["quantity"]
        line_total = round(sell_price * qty, 2)
        materials.append({
            "id": pid,
            "name": p["name"],
            "qty": qty,
            "cost_price": cost_price,
            "markup_percentage": markup_pct,
            "sell_price": sell_price,
            "line_total": line_total,
        })
        materials_subtotal += line_total

    materials_subtotal = round(materials_subtotal, 2)

    # Fetch labour rate; 404 if not found, 500 on database error
    try:
        supabase = get_supabase()
        resp = (
            supabase.table("labour_rates")
            .select("id, hourly_rate")
            .eq("id", body.labour_rate_id)
            .eq("active", True)
            .limit(1)
            .execute()
        )
        rows = resp.data or []
        if not rows:
            logger.warning("Labour rate not found: %s", body.labour_rate_id)
            raise HTTPException(404, "Labour rate not found")
        hourly_rate = float(rows[0]["hourly_rate"])
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Database error while fetching labour rate: %s", e)
        raise HTTPException(500, "Failed to load labour rate")

    labour_hours = body.labour_hours  # already validated >= 0 by Pydantic
    labour_subtotal = round(labour_hours * hourly_rate, 2)
    total = round(materials_subtotal + labour_subtotal, 2)

    quote = {
        "materials": materials,
        "materials_subtotal": materials_subtotal,
        "labour_hours": labour_hours,
        "labour_rate": hourly_rate,
        "labour_subtotal": labour_subtotal,
        "total": total,
    }
    logger.debug("Quote calculated: total=%.2f, materials=%.2f, labour=%.2f", total, materials_subtotal, labour_subtotal)
    return {"quote": quote}


@app.post("/api/process-blueprint")
async def api_process_blueprint(
    file: UploadFile = File(...),
    technical_drawing: bool = Query(True),
):
    """
    Upload a property photo; returns PNG blueprint (technical drawing or grayscale).
    Toggle technical_drawing on/off for filter effect.
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "File must be an image")
    content = await file.read()
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(400, "File too large (max 20MB)")
    mode = "technical_drawing" if technical_drawing else "grayscale"
    try:
        png_bytes = process_blueprint(content, mode=mode)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return Response(content=png_bytes, media_type="image/png")


def _decode_base64_image(value: str) -> Optional[bytes]:
    """Decode base64 image; supports data URL (data:image/png;base64,...) or raw base64."""
    if not value or not value.strip():
        return None
    s = value.strip()
    if s.startswith("data:"):
        idx = s.find("base64,")
        if idx == -1:
            return None
        s = s[idx + 7 :]
    try:
        return base64.b64decode(s)
    except Exception:
        return None


@app.get("/api/diagrams")
def api_list_diagrams(user_id: Any = Depends(get_current_user_id)):
    """List saved diagrams for the current user. Requires Bearer token."""
    return {"diagrams": list_diagrams(user_id)}


@app.post("/api/diagrams")
def api_create_diagram(body: SaveDiagramRequest, user_id: Any = Depends(get_current_user_id)):
    """Save a new diagram. Requires Bearer token."""
    blueprint_bytes = _decode_base64_image(body.blueprintImageBase64) if body.blueprintImageBase64 else None
    thumbnail_bytes = _decode_base64_image(body.thumbnailBase64) if body.thumbnailBase64 else None
    try:
        created = create_diagram(
            user_id,
            body.name,
            body.data,
            blueprint_bytes=blueprint_bytes,
            thumbnail_bytes=thumbnail_bytes,
        )
        return created
    except Exception as e:
        logger.exception("Create diagram failed: %s", e)
        raise HTTPException(500, "Failed to save diagram")


@app.get("/api/diagrams/{diagram_id}")
def api_get_diagram(diagram_id: str, user_id: Any = Depends(get_current_user_id)):
    """Get full diagram by id. Requires Bearer token; returns 404 if not found or not owned."""
    from uuid import UUID
    try:
        did = UUID(diagram_id)
    except ValueError:
        raise HTTPException(404, "Diagram not found")
    diagram = get_diagram(user_id, did)
    if not diagram:
        raise HTTPException(404, "Diagram not found")
    return diagram


@app.patch("/api/diagrams/{diagram_id}")
def api_update_diagram(
    diagram_id: str,
    body: UpdateDiagramRequest,
    user_id: Any = Depends(get_current_user_id),
):
    """Update diagram name/data/images. Requires Bearer token."""
    from uuid import UUID
    try:
        did = UUID(diagram_id)
    except ValueError:
        raise HTTPException(404, "Diagram not found")
    blueprint_bytes = _decode_base64_image(body.blueprintImageBase64) if body.blueprintImageBase64 else None
    thumbnail_bytes = _decode_base64_image(body.thumbnailBase64) if body.thumbnailBase64 else None
    updated = update_diagram(
        user_id,
        did,
        name=body.name,
        data=body.data,
        blueprint_bytes=blueprint_bytes,
        thumbnail_bytes=thumbnail_bytes,
    )
    if not updated:
        raise HTTPException(404, "Diagram not found")
    return updated


@app.delete("/api/diagrams/{diagram_id}")
def api_delete_diagram(diagram_id: str, user_id: Any = Depends(get_current_user_id)):
    """Delete a diagram. Requires Bearer token."""
    from uuid import UUID
    try:
        did = UUID(diagram_id)
    except ValueError:
        raise HTTPException(404, "Diagram not found")
    if not delete_diagram(user_id, did):
        raise HTTPException(404, "Diagram not found")
    return {"success": True}


# --- ServiceM8 OAuth 2.0 ---


@app.get("/api/servicem8/oauth/authorize")
def api_servicem8_authorize(user_id: Any = Depends(get_current_user_id)):
    """
    Start ServiceM8 OAuth flow. Requires Bearer token.
    Redirects user to ServiceM8 authorize URL with state containing user_id.
    
    For internal use: redirect_uri is omitted from authorize request (ServiceM8 Store Connect
    UI doesn't allow entering it). redirect_uri is still sent in token exchange.
    """
    try:
        state = sm8.generate_state(str(user_id))
        # Omit redirect_uri for internal use (optional per ServiceM8 docs)
        url = sm8.build_authorize_url(state, include_redirect_uri=False)
        return RedirectResponse(url=url, status_code=302)
    except ValueError as e:
        raise HTTPException(503, str(e))


@app.get("/api/servicem8/oauth/callback")
def api_servicem8_callback(
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
):
    """
    ServiceM8 OAuth callback. Receives code and state, exchanges for tokens, stores per user.
    Redirects to frontend with ?servicem8=connected or ?servicem8=error.
    """
    if error:
        logger.warning("ServiceM8 OAuth error: %s", error)
        base = sm8.get_redirect_uri().replace("/api/servicem8/oauth/callback", "")
        return RedirectResponse(url=f"{base}/?servicem8=error", status_code=302)

    if not code or not state:
        raise HTTPException(400, "Missing code or state")

    user_id = sm8.verify_state(state)
    if not user_id:
        raise HTTPException(400, "Invalid or expired state")

    try:
        # redirect_uri required in token exchange (even if omitted in authorize)
        # Use our Railway callback URL
        redirect_uri = sm8.get_redirect_uri()
        tokens = sm8.exchange_code_for_tokens(code, redirect_uri)
    except httpx.HTTPStatusError as e:
        logger.exception("ServiceM8 token exchange failed: %s", e)
        base = sm8.get_redirect_uri().replace("/api/servicem8/oauth/callback", "")
        return RedirectResponse(url=f"{base}/?servicem8=error", status_code=302)

    sm8.store_tokens(
        user_id,
        tokens["access_token"],
        tokens["refresh_token"],
        tokens.get("expires_in", 3600),
        tokens.get("scope"),
    )

    base = sm8.get_redirect_uri().replace("/api/servicem8/oauth/callback", "")
    return RedirectResponse(url=f"{base}/?servicem8=connected", status_code=302)


@app.get("/api/servicem8/oauth/status")
def api_servicem8_status(user_id: Any = Depends(get_current_user_id)):
    """Check if user has connected ServiceM8. Requires Bearer token."""
    try:
        tokens = sm8.get_tokens(str(user_id))
        return {"connected": tokens is not None}
    except ValueError:
        return {"connected": False, "config": "ServiceM8 OAuth not configured"}


@app.post("/api/servicem8/oauth/disconnect")
def api_servicem8_disconnect(user_id: Any = Depends(get_current_user_id)):
    """Disconnect ServiceM8. Remove stored tokens. Requires Bearer token."""
    sm8.delete_tokens(str(user_id))
    return {"success": True}


# Serve static frontend and assets (must be after API routes)
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
INDEX_HTML = FRONTEND_DIR / "index.html"


@app.on_event("startup")
def startup():
    """Require Supabase and log how to load the app on a local server."""
    try:
        from app.supabase_client import get_supabase
        get_supabase()
    except ValueError as e:
        print("ERROR:", e)
        raise
    if FRONTEND_DIR.exists() and INDEX_HTML.exists():
        print("Quote App frontend: serve at http://127.0.0.1:8000/ (or your host:port)")
    else:
        print("WARNING: frontend not found at", FRONTEND_DIR, "- app will not load at /")


if FRONTEND_DIR.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIR / "assets"), name="assets")

    @app.get("/")
    def index():
        """Ensure the app loads at the root on a local server."""
        if INDEX_HTML.exists():
            return FileResponse(INDEX_HTML, media_type="text/html")
        from fastapi.responses import HTMLResponse
        return HTMLResponse("<h1>Quote App</h1><p>index.html not found in frontend/.</p>", status_code=404)

    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
else:
    @app.get("/")
    def index_missing():
        from fastapi.responses import HTMLResponse
        return HTMLResponse(
            "<h1>Quote App</h1><p>Frontend directory not found. Run from project root with <code>frontend/</code> present.</p>",
            status_code=503,
        )
