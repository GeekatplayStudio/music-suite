#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "Geekatplay Studio Music Suite - Startup"

manifest_hash() {
  local git_revision
  git_revision="$(git rev-parse HEAD 2>/dev/null || printf 'no-git-revision')"
  .venv/bin/python -c 'import hashlib, pathlib, sys; files=(pathlib.Path("pyproject.toml"), pathlib.Path("apps/web-next/pnpm-lock.yaml")); print("-".join([*(hashlib.sha256(path.read_bytes()).hexdigest().upper() for path in files), sys.argv[1]]))' "$git_revision"
}

NEEDS_INSTALL=0
[[ -x ".venv/bin/python" ]] || NEEDS_INSTALL=1
[[ -d "apps/web-next/node_modules" ]] || NEEDS_INSTALL=1
[[ -f "apps/web-next/.next/BUILD_ID" ]] || NEEDS_INSTALL=1
[[ -f ".music-suite-install-state" ]] || NEEDS_INSTALL=1
if [[ "$NEEDS_INSTALL" -eq 0 ]] && [[ "$(tr -d '\r\n' < .music-suite-install-state)" != "$(manifest_hash)" ]]; then
  NEEDS_INSTALL=1
fi
if [[ "$NEEDS_INSTALL" -eq 1 ]]; then
  "$ROOT/install.command"
fi

for port in 3000 8008; do
  if command -v lsof >/dev/null 2>&1 && lsof -iTCP:"$port" -sTCP:LISTEN -t >/dev/null; then
    echo "Port $port is already in use. Close the existing service and try again."
    exit 1
  fi
done

cleanup() {
  kill "${WEB_PID:-}" "${API_PID:-}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

.venv/bin/python -m uvicorn apps.api.main:app --host 127.0.0.1 --port 8008 &
API_PID=$!

cd "$ROOT/apps/web-next"
if command -v pnpm >/dev/null 2>&1; then
  pnpm exec next start -H 127.0.0.1 -p 3000 &
else
  npm run start -- -H 127.0.0.1 -p 3000 &
fi
WEB_PID=$!

sleep 2
open "http://127.0.0.1:3000" 2>/dev/null || true
echo "Music Suite is running at http://127.0.0.1:3000"
echo "Keep this window open. Press Control-C to stop."
wait "$API_PID" "$WEB_PID"
