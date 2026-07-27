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

# --- Python 3.11+ ---
if ! command -v python3 >/dev/null 2>&1; then
  echo "Python not found. Installing Python via Homebrew..."
  brew install python@3.11
  brew link --overwrite python@3.11 || true
fi

# --- FFmpeg / ffprobe ---
if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
  echo "FFmpeg not found. Installing FFmpeg via Homebrew..."
  brew install ffmpeg
fi

# --- Node.js (needed for pnpm/npm below) ---
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not found. Installing Node.js via Homebrew..."
  brew install node
fi

# --- pnpm ---
if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm not found. Installing pnpm via corepack..."
  corepack enable 2>/dev/null || npm install -g pnpm
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
  pnpm build
elif command -v npm >/dev/null 2>&1; then
  npm install
  npm run build
else
  echo "Node.js 20.9 or newer with pnpm or npm is required."
  exit 1
fi

cd "$ROOT"
GIT_REVISION="$(git rev-parse HEAD 2>/dev/null || printf 'no-git-revision')"
.venv/bin/python -c 'import hashlib, pathlib, sys; files=(pathlib.Path("pyproject.toml"), pathlib.Path("apps/web-next/pnpm-lock.yaml")); print("-".join([*(hashlib.sha256(path.read_bytes()).hexdigest().upper() for path in files), sys.argv[1]]))' "$GIT_REVISION" > .music-suite-install-state

echo
echo "Installation complete. Double-click start.command to launch Music Suite."
