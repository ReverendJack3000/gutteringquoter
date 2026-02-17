"""
Blueprint image processing: photo → technical drawing (B&W clean lines).
Designed for API use; can be called from REST or other services later.
Supports JPEG, PNG, GIF, WebP (OpenCV) and HEIC (pillow-heif fallback).
"""
import io
from typing import Literal

import cv2
import numpy as np
from PIL import Image

# Register HEIC opener so PIL can decode HEIC (Phase 2, Task 30.4)
try:
    from pillow_heif import register_heif_opener
    register_heif_opener(thumbnails=False)
except ImportError:
    pass  # pillow-heif optional; HEIC will fail with clear error


def _decode_image(image_bytes: bytes) -> "cv2.Mat":
    """Decode image bytes to OpenCV BGR array. Tries cv2 first, then pillow-heif for HEIC."""
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is not None:
        return img
    # OpenCV can't decode HEIC; try pillow-heif
    try:
        pil_img = Image.open(io.BytesIO(image_bytes))
        arr = np.asarray(pil_img)
        if len(arr.shape) == 2:
            arr = np.stack([arr] * 3, axis=-1)
        elif arr.shape[2] == 4:
            arr = arr[:, :, :3]
        img = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
        return img
    except Exception:
        raise ValueError("Invalid image data (could not decode with OpenCV or HEIC)")


def process_blueprint(
    image_bytes: bytes,
    mode: Literal["technical_drawing", "grayscale"] = "technical_drawing",
) -> bytes:
    """
    Convert a property photo to blueprint style.
    - technical_drawing: grayscale → blur → Canny edges → clean B&W (toggleable in UI).
    - grayscale: grayscale only (filter off).
    Returns PNG bytes. Resolution is preserved (no resize); output is lossless PNG.
    """
    img = _decode_image(image_bytes)

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    if mode == "grayscale":
        out = gray
    else:
        blurred = cv2.GaussianBlur(gray, (5, 5), 1.4)
        edges = cv2.Canny(blurred, 50, 150)
        out = cv2.bitwise_not(edges)  # white lines on black for technical drawing look

    # Lossless PNG; no resize or compression that would lose detail
    _, png = cv2.imencode(".png", out)
    return png.tobytes()
