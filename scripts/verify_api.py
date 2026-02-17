#!/usr/bin/env python3
"""
Verify Quote App API: health, products, and blueprint processing.
Run with backend server up: uvicorn main:app --reload (from backend/).
Usage: python scripts/verify_api.py [--base http://127.0.0.1:8000]
"""
import argparse
import json
import sys
import urllib.request
import urllib.error

# Minimal 1x1 PNG (valid image for blueprint endpoint)
TINY_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
)


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

    # Blueprint (technical drawing on)
    try:
        status, raw, headers = post_multipart(
            base, "/api/process-blueprint", TINY_PNG, params={"technical_drawing": "true"}
        )
        assert status == 200
        ct = headers.get("Content-Type", "")
        if isinstance(ct, bytes):
            ct = ct.decode()
        assert "image" in ct
        assert len(raw) > 0
        print("POST /api/process-blueprint (technical_drawing=true) OK")
    except Exception as e:
        print(f"POST /api/process-blueprint FAIL: {e}")
        ok = False

    # Blueprint (technical drawing off)
    try:
        status, raw, headers = post_multipart(
            base, "/api/process-blueprint", TINY_PNG, params={"technical_drawing": "false"}
        )
        assert status == 200
        ct = headers.get("Content-Type", "")
        if isinstance(ct, bytes):
            ct = ct.decode()
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
