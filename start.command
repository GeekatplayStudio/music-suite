#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$ROOT/.music-suite-processes.json"
LOG_DIR="$ROOT/logs"
# A cold first start imports the full audio stack, so readiness can take minutes on slow disks.
STARTUP_TIMEOUT_SECONDS="${MUSIC_SUITE_STARTUP_TIMEOUT_SECONDS:-300}"
cd "$ROOT"
mkdir -p "$LOG_DIR"

echo "Geekatplay Studio Music Suite - Startup"

wait_for_url() {
  local url="$1" service="$2" watched_pid="$3" log_file="$4"
  local deadline=$(( SECONDS + STARTUP_TIMEOUT_SECONDS ))
  local next_notice=$(( SECONDS + 10 ))
  echo "Waiting for $service (up to ${STARTUP_TIMEOUT_SECONDS}s)..."
  while (( SECONDS < deadline )); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "$service is ready."
      return 0
    fi
    if ! kill -0 "$watched_pid" 2>/dev/null; then
      echo "$service exited during startup. Last log lines:" >&2
      tail -n 20 "$log_file" >&2 || true
      return 1
    fi
    if (( SECONDS >= next_notice )); then
      echo "  still starting $service... ($(( deadline - SECONDS ))s remaining)"
      next_notice=$(( SECONDS + 10 ))
    fi
    sleep 0.25
  done
  echo "$service did not become ready within ${STARTUP_TIMEOUT_SECONDS}s." >&2
  echo "Raise the limit with: MUSIC_SUITE_STARTUP_TIMEOUT_SECONDS=600 ./start.command" >&2
  echo "Startup log: $log_file" >&2
  tail -n 20 "$log_file" >&2 || true
  return 1
}

manifest_hash() {
  local git_revision
  git_revision="$(git rev-parse HEAD 2>/dev/null || printf 'no-git-revision')"
  .venv/bin/python -c 'import hashlib, pathlib, sys; files=(pathlib.Path("pyproject.toml"), pathlib.Path("apps/web-next/pnpm-lock.yaml")); print("-".join([*(hashlib.sha256(path.read_bytes()).hexdigest().upper() for path in files), sys.argv[1]]))' "$git_revision"
}

find_available_port() {
  # Scans upward from the preferred port, then falls back to any OS-assigned free loopback port.
  local preferred="$1" excluded="${2:-}"
  python3 -c $'import socket, sys\nstart=int(sys.argv[1]); excluded={int(x) for x in sys.argv[2].split(",") if x}\ndef free(port):\n sock=socket.socket()\n try:\n  sock.bind(("127.0.0.1", port))\n  return sock.getsockname()[1]\n except OSError:\n  return None\n finally:\n  sock.close()\nfor port in range(start, min(65535, start+100)+1):\n if port in excluded: continue\n if free(port): print(port); break\nelse:\n for _ in range(50):\n  port=free(0)\n  if port and port not in excluded: print(port); break\n else: raise SystemExit("No available loopback port found")' "$preferred" "$excluded"
}

if [[ -f "$PID_FILE" ]]; then
  EXISTING_WEB_PORT="$(python3 -c 'import json, pathlib; print(json.loads(pathlib.Path(".music-suite-processes.json").read_text()).get("web_port", ""))' 2>/dev/null || true)"
  EXISTING_API_PORT="$(python3 -c 'import json, pathlib; print(json.loads(pathlib.Path(".music-suite-processes.json").read_text()).get("api_port", ""))' 2>/dev/null || true)"
  if [[ "$EXISTING_WEB_PORT" =~ ^[0-9]+$ && "$EXISTING_API_PORT" =~ ^[0-9]+$ ]] && \
     curl -fsS "http://127.0.0.1:$EXISTING_API_PORT/health" >/dev/null 2>&1 && \
     curl -fsS "http://127.0.0.1:$EXISTING_WEB_PORT/" >/dev/null 2>&1; then
    echo "Music Suite is already running at http://127.0.0.1:$EXISTING_WEB_PORT"
    open "http://127.0.0.1:$EXISTING_WEB_PORT" 2>/dev/null || true
    exit 0
  fi
fi

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

API_PORT="$(find_available_port 8008)"
WEB_PORT="$(find_available_port 3000 "$API_PORT")"

cleanup() {
  kill "${WEB_PID:-}" "${API_PID:-}" 2>/dev/null || true
  rm -f "$PID_FILE"
}
trap cleanup EXIT INT TERM

API_LOG="$LOG_DIR/api.log"
WEB_LOG="$LOG_DIR/web.log"
: > "$API_LOG"
: > "$WEB_LOG"

.venv/bin/python -m uvicorn apps.api.main:app --host 127.0.0.1 --port "$API_PORT" >"$API_LOG" 2>&1 &
API_PID=$!

wait_for_url "http://127.0.0.1:$API_PORT/health" "Music Suite API" "$API_PID" "$API_LOG" || exit 1

cd "$ROOT/apps/web-next"
if command -v pnpm >/dev/null 2>&1; then
  MUSIC_SUITE_API_URL="http://127.0.0.1:$API_PORT" pnpm exec next start -H 127.0.0.1 -p "$WEB_PORT" >"$WEB_LOG" 2>&1 &
else
  MUSIC_SUITE_API_URL="http://127.0.0.1:$API_PORT" npm run start -- -H 127.0.0.1 -p "$WEB_PORT" >"$WEB_LOG" 2>&1 &
fi
WEB_PID=$!
cd "$ROOT"

wait_for_url "http://127.0.0.1:$WEB_PORT/" "Music Suite web" "$WEB_PID" "$WEB_LOG" || exit 1

API_RUNTIME_PID="$(lsof -tiTCP:"$API_PORT" -sTCP:LISTEN | head -n 1)"
WEB_RUNTIME_PID="$(lsof -tiTCP:"$WEB_PORT" -sTCP:LISTEN | head -n 1)"
python3 -c 'import datetime, json, pathlib, sys, uuid; keys=("project_root","api_port","api_launcher_pid","api_pid","web_port","web_launcher_pid","web_pid"); vals=(sys.argv[1], *map(int, sys.argv[2:])); data=dict(zip(keys, vals)); data.update(schema_version=2, instance_id=str(uuid.uuid4()), started_at=datetime.datetime.now(datetime.timezone.utc).isoformat()); pathlib.Path(sys.argv[1], ".music-suite-processes.json").write_text(json.dumps(data, indent=2)+"\n")' "$ROOT" "$API_PORT" "$API_PID" "$API_RUNTIME_PID" "$WEB_PORT" "$WEB_PID" "$WEB_RUNTIME_PID"

open "http://127.0.0.1:$WEB_PORT" 2>/dev/null || true
echo "Music Suite is running at http://127.0.0.1:$WEB_PORT"
echo "API: http://127.0.0.1:$API_PORT"
[[ "$WEB_PORT" == "3000" ]] || echo "Preferred web port 3000 was busy; selected $WEB_PORT."
[[ "$API_PORT" == "8008" ]] || echo "Preferred API port 8008 was busy; selected $API_PORT."
echo "Keep this window open. Press Control-C or run stop.command to stop this exact instance."
wait "$API_PID" "$WEB_PID"
