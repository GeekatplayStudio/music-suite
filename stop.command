#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$ROOT/.music-suite-processes.json"
cd "$ROOT"

echo "Geekatplay Studio Music Suite - Shutdown"

if [[ ! -f "$PID_FILE" ]]; then
  echo "No recorded Music Suite instance is running. No processes were changed."
  exit 0
fi

RECORDED_ROOT="$(python3 -c 'import json, pathlib; print(json.loads(pathlib.Path(".music-suite-processes.json").read_text()).get("project_root", ""))')"
if [[ "$RECORDED_ROOT" != "$ROOT" ]]; then
  echo "The runtime file belongs to another project directory. No processes were changed."
  exit 1
fi

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
while read -r pid; do
  [[ "$pid" =~ ^[0-9]+$ ]] && PIDS+=("$pid")
done < <(python3 -c 'import json, pathlib; data=json.loads(pathlib.Path(".music-suite-processes.json").read_text()); print(*[value for key, value in data.items() if key.endswith("_pid") and isinstance(value, int)], sep="\n")')

STOPPED=0
for pid in "${PIDS[@]:-}"; do
  if [[ -n "$pid" ]] && is_music_suite_process "$pid"; then
    stop_tree "$pid"
    STOPPED=1
  fi
done
sleep 1
rm -f "$PID_FILE"

if [[ "$STOPPED" -eq 1 ]]; then
  echo "The recorded Music Suite instance was stopped."
else
  echo "The recorded processes had already exited. No other processes were changed."
fi
