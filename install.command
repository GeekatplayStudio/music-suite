#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "Geekatplay Studio Music Suite - Installer"
echo "This will install Homebrew, Python, FFmpeg, and Node.js if they are missing."
echo

# --- Homebrew (package manager for everything below) ---
if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew not found. Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  if [[ -x "/opt/homebrew/bin/brew" ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [[ -x "/usr/local/bin/brew" ]]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
fi

# --- Python 3.12+ ---
# librosa 1.0 and numpy 2.5 need Python 3.12; on older interpreters pip silently
# resolves to outdated releases, so an old Python is treated the same as a missing one.
python_is_supported() {
  "$1" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 12) else 1)' >/dev/null 2>&1
}

find_supported_python() {
  local candidate
  for candidate in python3 python3.14 python3.13 python3.12; do
    if command -v "$candidate" >/dev/null 2>&1 && python_is_supported "$candidate"; then
      command -v "$candidate"
      return 0
    fi
  done
  return 1
}

if ! PYTHON_BIN="$(find_supported_python)"; then
  echo "Python 3.12 or newer not found. Installing Python 3.12 via Homebrew..."
  brew install python@3.12
  PYTHON_BIN="$(brew --prefix python@3.12)/bin/python3.12"
fi

# --- FFmpeg / ffprobe ---
if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
  echo "FFmpeg not found. Installing FFmpeg via Homebrew..."
  brew install ffmpeg
fi

# --- Node.js (needed for pnpm/npm below) ---
# Node 20 is end-of-life and the current toolchain needs 22.13 or newer.
node_is_supported() {
  command -v node >/dev/null 2>&1 &&
    node -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 22 || (a === 22 && b >= 13) ? 0 : 1)'
}

if ! node_is_supported; then
  echo "Node.js 22.13 or newer not found. Installing Node.js via Homebrew..."
  brew install node
  brew link --overwrite node || true
fi

# --- pnpm ---
if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm not found. Installing pnpm via corepack..."
  corepack enable 2>/dev/null || npm install -g pnpm
fi

if [[ -x ".venv/bin/python" ]] && ! python_is_supported ".venv/bin/python"; then
  echo "The existing virtual environment uses a Python older than 3.12; recreating it..."
  rm -rf .venv
fi
if [[ ! -x ".venv/bin/python" ]]; then
  "$PYTHON_BIN" -m venv .venv
fi

.venv/bin/python -m ensurepip --upgrade
.venv/bin/python -m pip install --upgrade pip setuptools wheel
.venv/bin/python -m pip install -e ".[dev]"

cd "$ROOT/apps/web-next"
if command -v pnpm >/dev/null 2>&1; then
  pnpm install
  pnpm build
elif command -v npm >/dev/null 2>&1; then
  npm install
  npm run build
else
  echo "Node.js 22.13 or newer with pnpm or npm is required."
  exit 1
fi

cd "$ROOT"
GIT_REVISION="$(git rev-parse HEAD 2>/dev/null || printf 'no-git-revision')"
.venv/bin/python -c 'import hashlib, pathlib, sys; files=(pathlib.Path("pyproject.toml"), pathlib.Path("apps/web-next/pnpm-lock.yaml")); print("-".join([*(hashlib.sha256(path.read_bytes()).hexdigest().upper() for path in files), sys.argv[1]]))' "$GIT_REVISION" > .music-suite-install-state

echo
echo "Installation complete. Double-click start.command to launch Music Suite."
