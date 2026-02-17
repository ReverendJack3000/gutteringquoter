#!/usr/bin/env python3
"""
Normalize gutter and downpipe SVG assets so the main object runs horizontally (left-to-right)
with a tight bounding box. Outputs PNGs for use as diagram assets; frontend can apply
default isometric rotation so they look correct while keeping the box aligned to length.

Steps: Detect orientation (angle of main object) -> Rotate to horizontal -> Crop transparent
whitespace -> Save as PNG.

Usage:
  python scripts/normalize_linear_assets.py [assets_dir]
  Default assets_dir: ../../frontend/assets/marley (relative to script) or frontend/assets/marley from project root.

Requires: cairosvg, opencv-python-headless, Pillow, numpy.
System: cairosvg needs the Cairo library (e.g. on macOS: brew install cairo).
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np

# Optional deps: fail with clear message if missing
try:
    import cairosvg
except (ImportError, OSError) as e:
    if isinstance(e, ImportError):
        print("Missing cairosvg. Install with: pip install cairosvg", file=sys.stderr)
    elif "cairo" in str(e).lower():
        print("Cairo library not found. cairosvg needs system Cairo. On macOS: brew install cairo", file=sys.stderr)
    else:
        print(f"cairosvg failed to load: {e}", file=sys.stderr)
    sys.exit(1)
try:
    import cv2
except ImportError:
    print("Missing opencv. Install with: pip install opencv-python-headless", file=sys.stderr)
    sys.exit(1)
try:
    from PIL import Image
except ImportError:
    print("Missing Pillow. Install with: pip install Pillow", file=sys.stderr)
    sys.exit(1)

# Patterns for linear assets (gutters, downpipes, dropper). Exclude placeholder.
INCLUDE_PATTERNS = ("gutter-classic", "gutter-storm-cloud", "downpipe-65", "downpipe-80", "downpipe-joiner-65", "downpipe-joiner-80", "dropper")
EXCLUDE = ("gutter-placeholder", "gutter.svg")  # generic placeholder / single name

ALPHA_THRESHOLD = 32  # pixels with alpha above this count as content
MIN_CONTENT_PIXELS = 100  # skip if almost empty
SCALE = 4  # render at 4x for sharpness at high zoom / 4K (was 2x)


def _should_process(name: str) -> bool:
    base = Path(name).stem.lower()
    if any(ex in name for ex in EXCLUDE):
        return False
    return any(p in base for p in (p.lower() for p in INCLUDE_PATTERNS))


def svg_to_rgba(svg_path: Path, scale: float = 1.0) -> np.ndarray:
    """Render SVG to RGBA numpy array (H, W, 4)."""
    import io
    url = str(svg_path.resolve())
    buf = io.BytesIO()
    cairosvg.svg2png(url=url, write_to=buf, scale=scale)
    buf.seek(0)
    pil = Image.open(buf).convert("RGBA")
    return np.array(pil)


def get_content_points(rgba: np.ndarray) -> np.ndarray:
    """Return (N, 2) array of (x, y) coordinates where alpha > threshold (content pixels)."""
    alpha = rgba[:, :, 3]
    ys, xs = np.where(alpha > ALPHA_THRESHOLD)
    return np.column_stack((xs.astype(np.float32), ys.astype(np.float32)))


def get_orientation_angle(points: np.ndarray) -> float:
    """Angle in degrees to rotate so the main (long) axis is horizontal. OpenCV minAreaRect angle in [-90, 0)."""
    if len(points) < 5:
        return 0.0
    rect = cv2.minAreaRect(points)
    # rect = ((cx, cy), (w, h), angle); angle in [-90, 0). We want to rotate by -angle so long edge is horizontal.
    _, (w, h), angle = rect
    # OpenCV: width is the first edge; angle is from horizontal. Rotate image by -angle.
    return float(angle)


def rotate_image_rgba(rgba: np.ndarray, angle_deg: float) -> np.ndarray:
    """Rotate RGBA image by angle_deg (counter-clockwise). Expands canvas to fit."""
    h, w = rgba.shape[:2]
    center = (w / 2, h / 2)
    M = cv2.getRotationMatrix2D(center, -angle_deg, 1.0)
    cos = np.abs(M[0, 0])
    sin = np.abs(M[0, 1])
    nw = int((h * sin + w * cos))
    nh = int((h * cos + w * sin))
    M[0, 2] += (nw / 2) - center[0]
    M[1, 2] += (nh / 2) - center[1]
    out = cv2.warpAffine(rgba, M, (nw, nh), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))
    return out


def crop_to_content(rgba: np.ndarray) -> np.ndarray:
    """Crop to tight bounding box of non-transparent pixels."""
    pts = get_content_points(rgba)
    if len(pts) == 0:
        return rgba
    x_min = int(np.min(pts[:, 0]))
    x_max = int(np.max(pts[:, 0])) + 1
    y_min = int(np.min(pts[:, 1]))
    y_max = int(np.max(pts[:, 1])) + 1
    x_min = max(0, x_min)
    y_min = max(0, y_min)
    x_max = min(rgba.shape[1], x_max)
    y_max = min(rgba.shape[0], y_max)
    return rgba[y_min:y_max, x_min:x_max]


def normalize_one(svg_path: Path, out_path: Path, scale: float = SCALE) -> bool:
    """Normalize one SVG: detect angle, rotate to horizontal, crop, save PNG. Returns True on success."""
    if not svg_path.exists():
        print(f"Skip (not found): {svg_path}")
        return False
    try:
        rgba = svg_to_rgba(svg_path, scale=scale)
    except Exception as e:
        print(f"Error rendering {svg_path}: {e}")
        return False
    points = get_content_points(rgba)
    if len(points) < MIN_CONTENT_PIXELS:
        print(f"Skip (too little content): {svg_path}")
        return False
    angle = get_orientation_angle(points)
    # Only rotate if meaningful (avoid jitter for nearly horizontal assets)
    if abs(angle) > 0.5:
        rgba = rotate_image_rgba(rgba, angle)
    rgba = crop_to_content(rgba)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    # Save PNG (cv2 uses BGR; we have RGBA)
    if rgba.shape[2] == 4:
        cv2.imwrite(str(out_path), cv2.cvtColor(rgba, cv2.COLOR_RGBA2BGRA))
    else:
        cv2.imwrite(str(out_path), cv2.cvtColor(rgba, cv2.COLOR_RGB2BGR))
    print(f"OK: {svg_path.name} -> {out_path.name}")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="Normalize gutter/downpipe SVGs to horizontal, tight-bound PNGs.")
    parser.add_argument("assets_dir", nargs="?", default=None, help="Directory containing SVG assets (e.g. frontend/assets/marley)")
    args = parser.parse_args()
    if args.assets_dir:
        assets_dir = Path(args.assets_dir)
    else:
        # Default: from script location backend/scripts -> ../../frontend/assets/marley
        script_dir = Path(__file__).resolve().parent
        assets_dir = (script_dir / ".." / ".." / "frontend" / "assets" / "marley").resolve()
    if not assets_dir.is_dir():
        print(f"Assets directory not found: {assets_dir}", file=sys.stderr)
        return 1
    count = 0
    for path in sorted(assets_dir.glob("*.svg")):
        if not _should_process(path.name):
            continue
        out_path = assets_dir / f"{path.stem}.png"
        if normalize_one(path, out_path):
            count += 1
    print(f"Normalized {count} assets. Use .png diagram URLs for these in backend and set default rotation in frontend.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
