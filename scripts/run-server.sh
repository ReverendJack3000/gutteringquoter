#!/usr/bin/env bash
# Run the Quote App local server (Task 10.8). Single command from project root.
# Serves frontend and API (e.g. GET /api/health). Defaults to 127.0.0.1:8000.

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-8000}"

if [ -d ".venv" ]; then
  # Activate venv if present (Unix/macOS)
  if [ -f ".venv/bin/activate" ]; then
    set +u
    # shellcheck source=/dev/null
    source .venv/bin/activate
    set -u
  fi
fi

echo "Starting Quote App at http://$HOST:$PORT/"
echo "Health check: GET http://$HOST:$PORT/api/health"
if [ "${PWA_ENABLED:-false}" = "true" ]; then
  echo "PWA rollout: ENABLED (PWA_ENABLED=true)"
else
  echo "PWA rollout: disabled (set PWA_ENABLED=true to enable)"
fi
echo ""
exec python3 -m uvicorn main:app --reload --host "$HOST" --port "$PORT"
