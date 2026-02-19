#!/usr/bin/env bash
# Start local server for phone testing with PWA enabled.
# Exposes the app on 0.0.0.0 so devices on the same LAN can access it.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-8000}"

detect_lan_ip() {
  if command -v ipconfig >/dev/null 2>&1; then
    ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true
    return
  fi
  if command -v hostname >/dev/null 2>&1; then
    hostname -I 2>/dev/null | awk '{print $1}'
    return
  fi
  true
}

LAN_IP="$(detect_lan_ip)"

echo "Phone preview mode: PWA_ENABLED=true, HOST=0.0.0.0, PORT=$PORT"
if [ -n "${LAN_IP:-}" ]; then
  echo "Open on your phone (same Wi-Fi): http://$LAN_IP:$PORT/"
else
  echo "Could not auto-detect LAN IP. Find your machine IP and open: http://<your-ip>:$PORT/"
fi
echo ""
echo "Note: full PWA install/offline behavior on mobile requires HTTPS."
echo "For homescreen production-like testing, use your Railway HTTPS URL with PWA_ENABLED=true."
echo ""

cd "$ROOT"
exec env PWA_ENABLED=true HOST=0.0.0.0 PORT="$PORT" ./scripts/run-server.sh
