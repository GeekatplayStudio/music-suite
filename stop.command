#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$ROOT/.music-suite-processes.json"
cd "$ROOT"

echo "Geekatplay Studio Music Suite - Shutdown"

is_music_suite_process() {
  local pid="$1" command_line
  command_line="$(ps -p "$pid" -o command= 2>/dev/null || true)"
  [[ "$command_line" == *"$ROOT"* || "$command_line" == *"uvicorn apps.api.main:app"* || "$command_line" == *"next start"* ]]
}

stop_tree() {
  local pid="$1" child
  while read -r child; do
    [[ -n "$child" ]] && stop_tree "$child"
  done < <(pgrep -P "$pid" 2>/dev/null || true)
  kill -TERM "$pid" 2>/dev/null || true
}

PIDS=()
if [[ -f "$PID_FILE" ]]; then
  while read -r pid; do
    [[ "$pid" =~ ^[0-9]+$ ]] && PIDS+=("$pid")
  done < <(python3 -c 'import json, pathlib; data=json.loads(pathlib.Path(".music-suite-processes.json").read_text()); print(*[value for value in data.values() if isinstance(value, int)], sep="\n")' 2>/dev/null || true)
fi
for port in 3000 8008; do
  while read -r pid; do
    [[ "$pid" =~ ^[0-9]+$ ]] && PIDS+=("$pid")
  done < <(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
done

STOPPED=0
for pid in "${PIDS[@]:-}"; do
  if [[ -n "$pid" ]] && is_music_suite_process "$pid"; then
    stop_tree "$pid"
    STOPPED=1
  fi
done
sleep 1

for port in 3000 8008; do
  if lsof -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port $port is still used by an unrecognized process; it was not terminated."
    exit 1
  fi
done

rm -f "$PID_FILE"
if [[ "$STOPPED" -eq 1 ]]; then
  echo "Music Suite processes stopped."
else
  echo "No running Music Suite processes were found."
fi
echo "Ports 3000 and 8008 are available."
