"""
Quote App API – FastAPI backend.
Blueprint processing, product list, static frontend. API-ready for future integrations.
"""
import logging
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field

from app.blueprint_processor import process_blueprint
from app.csv_import import import_products_from_csv
from app.gutter_accessories import expand_elements_with_gutter_accessories
from app.pricing import get_product_pricing
from app.products import get_products
from app.supabase_client import get_supabase
from fastapi.middleware.cors import CORSMiddleware
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
