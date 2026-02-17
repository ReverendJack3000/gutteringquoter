#!/usr/bin/env python3
"""Create fixtures for API verification (e.g. tiny.png). Uses a 10x10 PNG so OpenCV accepts it."""
import base64
from pathlib import Path

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"
# 10x10 gray PNG (base64); 1x1 can be rejected by OpenCV imdecode
TINY_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAIAAAACUFjqAAAAFElEQVR4nGNsaGhgwA2Y8MiNYGkA22EBlPG3fjQAAAAASUVORK5CYII="

def main():
    FIXTURES_DIR.mkdir(parents=True, exist_ok=True)
    (FIXTURES_DIR / "tiny.png").write_bytes(base64.b64decode(TINY_PNG_BASE64))
    print("Created fixtures/tiny.png")

if __name__ == "__main__":
    main()
