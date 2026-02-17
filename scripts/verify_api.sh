#!/usr/bin/env bash
# Verify Quote App API. Run with backend up: cd backend && uvicorn main:app --reload
# Usage: ./scripts/verify_api.sh [http://127.0.0.1:8000]

set -e
BASE="${1:-http://127.0.0.1:8000}"
BASE="${BASE%/}"

echo "Checking $BASE ..."

# 1x1 PNG fixture (create with: python3 scripts/create_fixtures.py)
TINY_PNG="$(cd "$(dirname "$0")" && pwd)/fixtures/tiny.png"
if ! [ -f "$TINY_PNG" ]; then
  python3 "$(dirname "$0")/create_fixtures.py" || true
fi
[ -f "$TINY_PNG" ] || { echo "Missing $TINY_PNG"; exit 1; }

curl -sf "$BASE/api/health" | grep -q '"status"' && echo "GET /api/health OK" || { echo "GET /api/health FAIL"; exit 1; }
curl -sf "$BASE/api/products" | grep -q '"products"' && echo "GET /api/products OK" || { echo "GET /api/products FAIL"; exit 1; }
curl -sf -X POST "$BASE/api/process-blueprint?technical_drawing=true" -F "file=@$TINY_PNG" -o /dev/null -w "" && echo "POST /api/process-blueprint OK" || { echo "POST /api/process-blueprint FAIL"; exit 1; }

echo ""
echo "All checks passed."
