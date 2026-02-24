#!/usr/bin/env bash
# Run backend unit tests (e.g. bonus_calc Section 59). From project root: ./scripts/run-backend-tests.sh
# Tests live in backend/tests/ and must be run with backend as cwd so 'app' resolves.

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"

if [ -d ".venv" ] && [ -f ".venv/bin/activate" ]; then
  set +u
  # shellcheck source=/dev/null
  source .venv/bin/activate
  set -u
fi

python3 -m unittest discover -s tests -p "test_*.py" -v
