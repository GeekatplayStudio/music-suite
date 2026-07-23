#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "Geekatplay Studio Music Suite - Installer"

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3.11 or newer is required. Install it from https://python.org/"
  exit 1
fi
if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
  echo "FFmpeg and ffprobe are required. Install them with: brew install ffmpeg"
  exit 1
fi

if [[ ! -x ".venv/bin/python" ]]; then
  python3 -m venv .venv
fi

.venv/bin/python -m ensurepip --upgrade
.venv/bin/python -m pip install --upgrade pip setuptools wheel
.venv/bin/python -m pip install -e ".[dev]"

cd "$ROOT/apps/web-next"
if command -v pnpm >/dev/null 2>&1; then
  pnpm install
elif command -v npm >/dev/null 2>&1; then
  npm install
else
  echo "Node.js 20.9 or newer with pnpm or npm is required."
  exit 1
fi

cd "$ROOT"
.venv/bin/python -c 'import hashlib, pathlib; files=(pathlib.Path("pyproject.toml"), pathlib.Path("apps/web-next/pnpm-lock.yaml")); print("-".join(hashlib.sha256(path.read_bytes()).hexdigest().upper() for path in files))' > .music-suite-install-state

echo
echo "Installation complete. Double-click start.command to launch Music Suite."
