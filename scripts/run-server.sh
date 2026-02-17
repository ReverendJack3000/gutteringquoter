#!/usr/bin/env bash
# Run the Quote App local server (Task 10.8). Single command from project root.
# Serves frontend at http://127.0.0.1:8000/ and exposes API (e.g. GET /api/health).

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"

if [ -d ".venv" ]; then
  # Activate venv if present (Unix/macOS)
  if [ -f ".venv/bin/activate" ]; then
    set +u
    # shellcheck source=/dev/null
    source .venv/bin/activate
    set -u
  fi
fi

echo "Starting Quote App at http://127.0.0.1:8000/"
echo "Health check: GET http://127.0.0.1:8000/api/health"
echo ""
exec python3 -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
