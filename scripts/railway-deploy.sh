#!/usr/bin/env bash
# Deploy Quote App to Railway from this directory.
# Prerequisite: Run `railway login` (or `npx @railway/cli login`) once in a terminal and complete browser auth.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Prefer railway on PATH (e.g. from brew); fall back to npx
if command -v railway >/dev/null 2>&1; then
  RAILWAY="railway"
else
  RAILWAY="npx -y @railway/cli"
fi

echo "Using: $RAILWAY"
$RAILWAY whoami >/dev/null 2>&1 || {
  echo "Not logged in to Railway. Run in a terminal: $RAILWAY login"
  exit 1
}

# Link project if not already linked
if ! $RAILWAY status >/dev/null 2>&1; then
  echo "Linking project (create new or select existing)..."
  $RAILWAY link
fi

echo "Deploying..."
$RAILWAY up

echo "Done. Check your Railway dashboard for the deployment URL."
