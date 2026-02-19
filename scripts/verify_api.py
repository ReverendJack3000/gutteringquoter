#!/usr/bin/env python3
"""
Verify Quote App API: health, products, and blueprint processing.
Run with backend server up: uvicorn main:app --reload (from backend/).
Usage: python scripts/verify_api.py [--base http://127.0.0.1:8000]
"""
import argparse
import json
import base64
import sys
import urllib.request
import urllib.error
from pathlib import Path

# 10x10 gray PNG fixture (OpenCV may reject 1x1 PNGs on some builds).
TINY_PNG_BASE64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAIAAAACUFjqAAAAFElEQVR4nGNsaGhgwA2Y8MiNYGkA22EBlPG3fjQAAAAASUVORK5CYII="
)


def load_tiny_png():
    fixtures_dir = Path(__file__).resolve().parent / "fixtures"
    tiny_png_path = fixtures_dir / "tiny.png"
    if tiny_png_path.exists():
        return tiny_png_path.read_bytes()
    fixtures_dir.mkdir(parents=True, exist_ok=True)
    data = base64.b64decode(TINY_PNG_BASE64)
    tiny_png_path.write_bytes(data)
    return data


def header_get(headers, key, default=""):
    key_lower = key.lower()
    for k, v in headers.items():
        if str(k).lower() == key_lower:
            return v
    return default


def get(base, path, timeout=5):
    req = urllib.request.Request(base + path)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.read(), dict(r.headers)


def post_multipart(base, path, file_content, filename="test.png", params=None, timeout=10):
    import mimetypes
    boundary = "----------boundary"
    body = []
    body.append(f"--{boundary}".encode())
    body.append(b'Content-Disposition: form-data; name="file"; filename="' + filename.encode() + b'"')
    body.append(b"Content-Type: image/png")
    body.append(b"")
    body.append(file_content)
    body.append(f"--{boundary}--".encode())
    body_bytes = b"\r\n".join(body)
    url = base + path
    if params:
        url += "?" + "&".join(f"{k}={v}" for k, v in params.items())
    req = urllib.request.Request(url, data=body_bytes, method="POST")
    req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    req.add_header("Content-Length", str(len(body_bytes)))
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.read(), dict(r.headers)


def main():
    p = argparse.ArgumentParser(description="Verify Quote App API")
    p.add_argument("--base", default="http://127.0.0.1:8000", help="Base URL of running app")
    args = p.parse_args()
    base = args.base.rstrip("/")
    tiny_png = load_tiny_png()

    ok = True

    # Health
    try:
        status, raw, _ = get(base, "/api/health")
        assert status == 200
        data = json.loads(raw.decode())
        assert data.get("status") == "ok"
        print("GET /api/health OK")
    except Exception as e:
        print(f"GET /api/health FAIL: {e}")
        ok = False

    # Products
    try:
        status, raw, _ = get(base, "/api/products")
        assert status == 200
        data = json.loads(raw.decode())
        products = data.get("products") or []
        assert len(products) >= 6, f"Expected at least 6 products, got {len(products)}"
        print(f"GET /api/products OK ({len(products)} products)")
    except Exception as e:
        print(f"GET /api/products FAIL: {e}")
        ok = False

    # Manifest
    try:
        status, raw, headers = get(base, "/manifest.webmanifest")
        assert status == 200
        ct = header_get(headers, "Content-Type", "")
        if isinstance(ct, bytes):
            ct = ct.decode(errors="replace")
        data = json.loads(raw.decode())
        assert isinstance(data, dict)
        assert data.get("display") in {"standalone", "fullscreen", "minimal-ui", "browser"}
        print("GET /manifest.webmanifest OK")
    except Exception as e:
        print(f"GET /manifest.webmanifest FAIL: {e}")
        ok = False

    # Service worker
    try:
        status, raw, headers = get(base, "/service-worker.js")
        assert status == 200
        ct = header_get(headers, "Content-Type", "")
        if isinstance(ct, bytes):
            ct = ct.decode(errors="replace")
        assert b"self.addEventListener" in raw
        print("GET /service-worker.js OK")
    except Exception as e:
        print(f"GET /service-worker.js FAIL: {e}")
        ok = False

    # Blueprint (technical drawing on)
    try:
        status, raw, headers = post_multipart(
            base, "/api/process-blueprint", tiny_png, params={"technical_drawing": "true"}
        )
        assert status == 200
        ct = header_get(headers, "Content-Type", "")
        if isinstance(ct, bytes):
            ct = ct.decode(errors="replace")
        assert "image" in ct
        assert len(raw) > 0
        print("POST /api/process-blueprint (technical_drawing=true) OK")
    except Exception as e:
        print(f"POST /api/process-blueprint FAIL: {e}")
        ok = False

    # Blueprint (technical drawing off)
    try:
        status, raw, headers = post_multipart(
            base, "/api/process-blueprint", tiny_png, params={"technical_drawing": "false"}
        )
        assert status == 200
        ct = header_get(headers, "Content-Type", "")
        if isinstance(ct, bytes):
            ct = ct.decode(errors="replace")
        assert "image" in ct
        print("POST /api/process-blueprint (technical_drawing=false) OK")
    except Exception as e:
        print(f"POST /api/process-blueprint (grayscale) FAIL: {e}")
        ok = False

    if ok:
        print("\nAll checks passed.")
    else:
        print("\nSome checks failed.")
        sys.exit(1)


if __name__ == "__main__":
    main()
