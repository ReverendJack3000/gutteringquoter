"""
Quote App API – FastAPI backend.
Blueprint processing, product list, static frontend. API-ready for future integrations.
"""
import base64
import logging
import uuid as uuid_lib
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
    elements: list[QuoteElement] = Field(default_factory=list, description="Material elements (assetId + quantity)")
    labour_elements: list[QuoteElement] = Field(default_factory=list, description="Labour lines (assetId e.g. REP-LAB, quantity = hours)")


class UpdatePricingItem(BaseModel):
    id: str = Field(..., min_length=1, description="Product ID")
    cost_price: float = Field(..., ge=0, description="Cost price (>= 0)")
    markup_percentage: float = Field(..., ge=0, le=1000, description="Markup percentage (0-1000)")


class SaveDiagramRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    data: dict[str, Any] = Field(..., description="Canvas state: elements, blueprintTransform, groups")
    blueprintImageBase64: Optional[str] = Field(None, description="PNG image as base64 data URL or raw base64")
    blueprintImageUrl: Optional[str] = Field(None, description="When base64 not sent (e.g. tainted canvas), copy from this storage URL to persist blueprint")
    thumbnailBase64: Optional[str] = Field(None, description="Thumbnail PNG as base64")
    servicem8JobId: Optional[str] = Field(None, max_length=32, description="ServiceM8 job number to stamp on the saved project")


class UpdateDiagramRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    data: Optional[dict[str, Any]] = Field(None)
    blueprintImageBase64: Optional[str] = None
    blueprintImageUrl: Optional[str] = Field(None, description="Copy from this storage URL when base64 not sent")
    thumbnailBase64: Optional[str] = None
    servicem8JobId: Optional[str] = Field(None, max_length=32)


class AddToJobElement(BaseModel):
    name: str = Field(..., min_length=1)
    qty: float = Field(..., ge=0)


class AddToJobRequest(BaseModel):
    job_uuid: str = Field(..., min_length=1)
    elements: list[AddToJobElement] = Field(..., min_length=1)
    quote_total: float = Field(..., ge=0)
    labour_hours: float = Field(..., ge=0)
    material_cost: float = Field(..., ge=0)
    user_name: str = Field("", description="Name of app user for note")
    profile: str = Field("spouting", description="stormcloud | classic | spouting for material line name")
    people_count: int = Field(1, ge=1, description="Number of labour lines / people (for job note: People Req)")


class UploadJobAttachmentRequest(BaseModel):
    job_uuid: str = Field(..., min_length=1, description="ServiceM8 job UUID to attach the file to")
    image_base64: str = Field(..., min_length=1, description="PNG image as base64 string (no data URL prefix)")
    attachment_name: Optional[str] = Field(None, max_length=127, description="Optional filename for the attachment (default: Blueprint_Design.png)")


class CreateNewJobRequest(BaseModel):
    """Request for Create New Job Instead: original job UUID + same quote payload as add-to-job + optional blueprint PNG."""
    original_job_uuid: str = Field(..., min_length=1, description="ServiceM8 UUID of the job we looked up (to copy fields and add note/diagram to both)")
    elements: list[AddToJobElement] = Field(..., min_length=1)
    quote_total: float = Field(..., ge=0)
    labour_hours: float = Field(..., ge=0)
    material_cost: float = Field(..., ge=0)
    user_name: str = Field("", description="Name of app user for note")
    profile: str = Field("spouting", description="stormcloud | classic | spouting for material line name")
    people_count: int = Field(1, ge=1, description="Number of labour lines / people (for job note: People Req)")
    image_base64: Optional[str] = Field(None, description="PNG blueprint image as base64 (no data URL prefix); attached to both original and new job")


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
    """Return labour product as a single 'rate' for backward compatibility. Frontend should use products (REP-LAB) instead."""
    try:
        pricing = get_product_pricing(["REP-LAB"])
        if "REP-LAB" not in pricing:
            return {"labour_rates": []}
        p = pricing["REP-LAB"]
        sell_price = round(p["cost_price"] * (1 + p["markup_percentage"] / 100), 2)
        return {
            "labour_rates": [
                {"id": "REP-LAB", "rateName": p["name"], "hourlyRate": sell_price}
            ]
        }
    except Exception as e:
        logger.exception("Failed to fetch labour product for labour-rates: %s", e)
        return {"labour_rates": []}


@app.post("/api/calculate-quote")
def api_calculate_quote(body: CalculateQuoteRequest):
    """
    Calculate quote from materials (elements) and labour (labour_elements).
    Materials: assetId + quantity; auto-adds brackets/screws for gutters.
    Labour: labour_elements with assetId e.g. REP-LAB, quantity = hours; priced from public.products.
    Returns 400 if any product not found or missing pricing; 500 on DB errors.
    """
    # Expand material elements with inferred brackets and screws from gutters
    raw_elements = [
        {"assetId": e.assetId, "quantity": e.quantity, "length_mm": getattr(e, "length_mm", None)}
        for e in body.elements
    ]
    elements_for_quote = expand_elements_with_gutter_accessories(raw_elements)

    all_product_ids = list({e["assetId"] for e in elements_for_quote} | {e.assetId for e in body.labour_elements})
    try:
        pricing = get_product_pricing(all_product_ids) if all_product_ids else {}
    except Exception as e:
        logger.exception("Database error while fetching product pricing: %s", e)
        raise HTTPException(500, "Failed to load product pricing")

    # Build materials lines
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

    # Labour from labour_elements (priced via products, e.g. REP-LAB)
    labour_hours = 0.0
    labour_subtotal = 0.0
    labour_rate = 0.0  # sell price per hour for display
    for e in body.labour_elements:
        pid = e.assetId
        if pid not in pricing:
            logger.warning("Labour product not found or missing pricing: %s", pid)
            raise HTTPException(400, f"Labour product {pid} not found or missing pricing")
        p = pricing[pid]
        cost_price = p["cost_price"]
        markup_pct = p["markup_percentage"]
        sell_price = round(cost_price * (1 + markup_pct / 100), 2)
        hours = e.quantity
        line_total = round(sell_price * hours, 2)
        labour_hours += hours
        labour_subtotal += line_total
        if labour_rate == 0:
            labour_rate = sell_price
    labour_subtotal = round(labour_subtotal, 2)

    total = round(materials_subtotal + labour_subtotal, 2)

    quote = {
        "materials": materials,
        "materials_subtotal": materials_subtotal,
        "labour_hours": labour_hours,
        "labour_rate": labour_rate,
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
            blueprint_image_source_url=body.blueprintImageUrl,
            thumbnail_bytes=thumbnail_bytes,
            servicem8_job_id=body.servicem8JobId,
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
        blueprint_image_source_url=body.blueprintImageUrl,
        thumbnail_bytes=thumbnail_bytes,
        servicem8_job_id=body.servicem8JobId,
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
    Return the ServiceM8 OAuth authorize URL. Requires Bearer token.
    Frontend must fetch this with Authorization header, then redirect the user to the returned URL.
    (Browser navigation to this endpoint does not send Bearer token, so we return JSON, not a redirect.)
    
    redirect_uri in the authorize URL MUST match the Activation URL set in ServiceM8 Store Connect
    exactly: https://quote-app-production-7897.up.railway.app/api/servicem8/oauth/callback
    """
    try:
        state = sm8.generate_state(str(user_id))
        url = sm8.build_authorize_url(state)
        return {"url": url}
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


@app.get("/api/servicem8/jobs")
def api_servicem8_job_by_generated_id(
    generated_job_id: str = Query(..., min_length=1, max_length=20),
    user_id: Any = Depends(get_current_user_id),
):
    """
    Fetch a ServiceM8 job by generated_job_id (job number).
    Returns job_address, total_invoice_amount, and uuid for confirmation UI.
    """
    job = sm8.fetch_job_by_generated_id(str(user_id), generated_job_id)
    if job is None:
        raise HTTPException(404, "Job not found")
    return {
        "uuid": job.get("uuid"),
        "generated_job_id": job.get("generated_job_id"),
        "job_address": job.get("job_address") or "",
        "total_invoice_amount": job.get("total_invoice_amount"),
    }


@app.post("/api/servicem8/add-to-job")
def api_servicem8_add_to_job(
    body: AddToJobRequest,
    user_id: Any = Depends(get_current_user_id),
):
    """
    Add materials and note to a ServiceM8 job.
    POSTs job material (bundled line) and job note via ServiceM8 API.
    """
    tokens = sm8.get_tokens(str(user_id))
    if not tokens:
        raise HTTPException(401, "ServiceM8 not connected")
    profile_label = "spouting"
    if body.profile and body.profile.lower() == "stormcloud":
        profile_label = "Stormcloud"
    elif body.profile and body.profile.lower() == "classic":
        profile_label = "Classic"
    material_name = f"{profile_label} repairs, labour & materials"
    qty_str = "1"
    price_str = f"{body.quote_total:.2f}"
    cost_str = f"{body.material_cost:.2f}"
    # price and displayed_amount must match; cost and displayed_cost must match (do not send displayed_amount_is_tax_inclusive)
    displayed_amount_str = price_str
    displayed_cost_str = cost_str
    ok, err = sm8.add_job_material(
        tokens["access_token"],
        body.job_uuid,
        material_name,
        qty_str,
        price_str,
        cost=cost_str,
        displayed_amount=displayed_amount_str,
        displayed_cost=displayed_cost_str,
    )
    if not ok:
        raise HTTPException(502, f"Failed to add job material: {err or 'unknown'}")

    note_text = _build_job_note_text(
        body.user_name,
        body.elements,
        body.quote_total,
        body.labour_hours,
        body.people_count,
        body.material_cost,
    )
    ok, err = sm8.add_job_note(tokens["access_token"], body.job_uuid, note_text)
    if not ok:
        raise HTTPException(502, f"Failed to add job note: {err or 'unknown'}")

    return {"success": True}


@app.post("/api/servicem8/upload-job-attachment")
def api_servicem8_upload_job_attachment(
    body: UploadJobAttachmentRequest,
    user_id: Any = Depends(get_current_user_id),
):
    """
    Upload the blueprint + elements PNG as an attachment to a ServiceM8 job.
    Requires OAuth scope manage_attachments. Accepts base64-encoded PNG from the frontend.
    """
    tokens = sm8.get_tokens(str(user_id))
    if not tokens:
        raise HTTPException(401, "ServiceM8 not connected")
    try:
        image_bytes = base64.b64decode(body.image_base64, validate=True)
    except Exception as e:
        logger.warning("Upload job attachment: invalid base64: %s", e)
        raise HTTPException(400, "Invalid image_base64")
    if len(image_bytes) > 10 * 1024 * 1024:
        raise HTTPException(400, "Image too large (max 10MB)")
    attachment_name = (body.attachment_name or "Blueprint_Design.png").strip() or "Blueprint_Design.png"
    if not attachment_name.lower().endswith(".png"):
        attachment_name = attachment_name + ".png"
    ok, err, sm8_response = sm8.upload_job_attachment(
        tokens["access_token"],
        body.job_uuid,
        image_bytes,
        attachment_name=attachment_name,
        file_type=".png",
    )
    if not ok:
        raise HTTPException(502, f"Failed to upload attachment: {err or 'unknown'}")
    return {
        "success": True,
        "servicem8": sm8_response,
    }


def _build_job_note_text(
    user_name: str,
    elements: list,
    quote_total: float,
    labour_hours: float,
    people_count: int,
    material_cost: float,
) -> str:
    """
    Build the note text used for add-to-job, create-new-job (both notes), and new job description.
    Format matches: user/email, then "- Name x qty" lines, blank line, Total Price, Total Time used,
    People Req, Material Cost (all exc gst).
    """
    def _fmt_qty(q: float) -> str:
        return f"{q:g}"

    def _fmt_hours(h: float) -> str:
        h_fmt = f"{h:g}" if h == int(h) else f"{h}"
        return f"{h_fmt} hour" if h == 1 else f"{h_fmt} hours"

    lines = [f"- {e.name} x {_fmt_qty(e.qty)}" for e in elements]
    note_body = [
        user_name or "Quote App User",
        *lines,
        "",
        f"Total Price = ${quote_total:.2f} exc gst",
        f"- Total Time used = {_fmt_hours(labour_hours)}",
    ]
    if people_count:
        note_body.append(f"    - People Req = {people_count}")
    note_body.append(f"- Material Cost = ${material_cost:.2f} exc gst")
    return "\n".join(note_body)


@app.post("/api/servicem8/create-new-job")
def api_servicem8_create_new_job(
    body: CreateNewJobRequest,
    user_id: Any = Depends(get_current_user_id),
):
    """
    Create a new ServiceM8 job from the confirm popup (Create New Job Instead).
    Uses our generated UUID; copies fields from original job; adds materials to new job only;
    adds same note and diagram to both original and new job; copies job contact to new job.
    """
    tokens = sm8.get_tokens(str(user_id))
    if not tokens:
        raise HTTPException(401, "ServiceM8 not connected")
    access_token = tokens["access_token"]

    # Fetch original job (re-fetch by UUID so we have full body for copy)
    original_job = sm8.fetch_job_by_uuid(access_token, body.original_job_uuid)
    if not original_job:
        raise HTTPException(400, "Original job not found")
    if not original_job.get("company_uuid"):
        raise HTTPException(400, "company_uuid missing — cannot create new job for this job")

    new_job_uuid = str(uuid_lib.uuid4())

    # Job description = same content as note (parts list, totals, etc.)
    job_description = _build_job_note_text(
        body.user_name,
        body.elements,
        body.quote_total,
        body.labour_hours,
        body.people_count,
        body.material_cost,
    )
    job_description = "New job created via Jacks app for repairs.\n\n" + job_description

    # Build create-job payload from original job (required: company_uuid; copy optional fields)
    create_payload = {
        "uuid": new_job_uuid,
        "job_description": job_description,
        "status": "Quote",
        "company_uuid": original_job["company_uuid"],
    }
    for key in ("job_address", "lat", "lng", "billing_address", "geo_is_valid", "category_uuid", "badges"):
        if key in original_job and original_job[key] is not None:
            create_payload[key] = original_job[key]

    ok, err = sm8.create_job(access_token, create_payload)
    if not ok:
        raise HTTPException(502, f"Failed to create job: {err or 'unknown'}")

    # Add materials to new job (same format as add-to-job)
    profile_label = "spouting"
    if body.profile and body.profile.lower() == "stormcloud":
        profile_label = "Stormcloud"
    elif body.profile and body.profile.lower() == "classic":
        profile_label = "Classic"
    material_name = f"{profile_label} repairs, labour & materials"
    price_str = f"{body.quote_total:.2f}"
    cost_str = f"{body.material_cost:.2f}"
    ok, err = sm8.add_job_material(
        access_token,
        new_job_uuid,
        material_name,
        "1",
        price_str,
        cost=cost_str,
        displayed_amount=price_str,
        displayed_cost=cost_str,
    )
    if not ok:
        raise HTTPException(502, f"Failed to add materials to new job: {err or 'unknown'}")

    # Add note to both jobs (identical content)
    note_text = _build_job_note_text(
        body.user_name,
        body.elements,
        body.quote_total,
        body.labour_hours,
        body.people_count,
        body.material_cost,
    )
    ok, err = sm8.add_job_note(access_token, body.original_job_uuid, note_text)
    if not ok:
        raise HTTPException(502, f"Failed to add note to original job: {err or 'unknown'}")
    ok, err = sm8.add_job_note(access_token, new_job_uuid, note_text)
    if not ok:
        raise HTTPException(502, f"Failed to add note to new job: {err or 'unknown'}")

    # Add diagram to both jobs (same PNG)
    if body.image_base64:
        try:
            image_bytes = base64.b64decode(body.image_base64, validate=True)
        except Exception as e:
            logger.warning("Create new job: invalid image_base64: %s", e)
            raise HTTPException(400, "Invalid image_base64")
        if len(image_bytes) > 10 * 1024 * 1024:
            raise HTTPException(400, "Image too large (max 10MB)")
        attachment_name = "Blueprint_Design.png"
        for jid in (body.original_job_uuid, new_job_uuid):
            ok, err, _ = sm8.upload_job_attachment(
                access_token, jid, image_bytes, attachment_name=attachment_name, file_type=".png"
            )
            if not ok:
                raise HTTPException(502, f"Failed to attach blueprint to job: {err or 'unknown'}")

    # Job contact: get from original, create BILLING on new job (skip if no contact)
    contacts = sm8.get_job_contacts(access_token, body.original_job_uuid)
    if contacts:
        # Prefer first BILLING; else first contact
        contact = None
        for c in contacts:
            if (c.get("type") or "").upper() == "BILLING":
                contact = c
                break
        if contact is None:
            contact = contacts[0]
        contact_payload = {
            "job_uuid": new_job_uuid,
            "type": "BILLING",
            "first": contact.get("first") or "",
            "last": contact.get("last") or "",
            "phone": contact.get("phone") or "",
            "mobile": contact.get("mobile") or "",
            "email": contact.get("email") or "",
        }
        ok, err = sm8.create_job_contact(access_token, contact_payload)
        if not ok:
            raise HTTPException(502, f"Failed to create job contact: {err or 'unknown'}")

    new_job = sm8.fetch_job_by_uuid(access_token, new_job_uuid)
    generated_job_id = new_job.get("generated_job_id") if new_job else None
    return {"success": True, "new_job_uuid": new_job_uuid, "generated_job_id": generated_job_id}


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
