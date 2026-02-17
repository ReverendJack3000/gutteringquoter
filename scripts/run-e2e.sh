#!/usr/bin/env bash
# Run E2E tests. Start the backend first (see below) or run this and follow the prompt.

set -e
BASE_URL="${BASE_URL:-http://127.0.0.1:8000}"
HEALTH_URL="${BASE_URL}/api/health"

echo "Checking for server at $BASE_URL ..."
if curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
  echo "Server is up. Running E2E tests..."
  cd "$(dirname "$0")/.."
  BASE_URL="$BASE_URL" npm run test:e2e
else
  echo ""
  echo "  Server not running. In a separate terminal, start it (from project root):"
  echo ""
  echo "    ./scripts/run-server.sh"
  echo ""
  echo "  Or manually:  cd backend && source .venv/bin/activate && uvicorn main:app --reload --host 127.0.0.1 --port 8000"
  echo ""
  echo "  Then run this script again:  ./scripts/run-e2e.sh"
  echo "  Or:  npm run test:e2e"
  echo ""
  exit 1
fi
