"""
Blueprint image processing: photo → technical drawing (B&W clean lines).
Designed for API use; can be called from REST or other services later.
"""
import io
from typing import Literal

import cv2
import numpy as np
from PIL import Image


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
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Invalid image data")

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
