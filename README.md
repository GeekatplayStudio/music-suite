# Geekatplay Studio Music Suite

Music Suite is a unified local application by **Geekatplay Studio**, created by **Vladimir Chopine**, for music analysis, AI-assisted mastering, high-quality real-time visualization, and optional ComfyUI music generation.

The former AudioQI Analyzer and Sonic Visual AI projects now share one codebase, interface, installer, startup workflow, dependency set, and release lifecycle. Sonic Holodeck is included as an optional ComfyUI integration rather than maintained as a second application.

Official repository: [GeekatplayStudio/music-suite](https://github.com/GeekatplayStudio/music-suite)

## Features

- FastAPI analysis and mastering backend
- Next.js 16 unified desktop-style interface
- Loudness, true-peak, stereo, phase, waveform, spectrum, and spectrogram analysis
- Internal, FFmpeg, Pedalboard, and Matchering mastering paths
- Smooth high-DPI Spectrum, Orbit, and Waveform visualization after upload
- Guarded local MCP server for analysis access and mastering advice
- In-app configuration and update checking against the official repository
- Sonic Holodeck ComfyUI nodes and workflows for supported music-generation models

## Requirements

- Windows 10/11 or a current macOS release
- Python 3.11 or newer
- Node.js 20.9 or newer
- pnpm (recommended) or npm
- FFmpeg and ffprobe on `PATH`
- Git for in-app updates
- Optional: ComfyUI with a compatible Torch/CUDA environment

## Simple installation

### Windows

Double-click:

```text
install.bat
```

Then launch with:

```text
start.bat
```

Stop all verified Music Suite background processes with:

```text
stop.bat
```

The `.bat` files call the unified PowerShell implementation. Advanced installation flags remain available from PowerShell:

```powershell
.\install.ps1 -WithGpu
.\install.ps1 -WithPro
.\install.ps1 -ComfyUIPath "D:\ComfyUI" -InstallComfyDependencies
```

### macOS

Double-click `install.command`, then double-click `start.command`. Use `stop.command` or press Control-C in the startup terminal to shut down. If macOS blocks the first launch, Control-click the file, choose **Open**, and confirm.

From Terminal, the same commands are:

```bash
./install.command
./start.command
./stop.command
```

Install FFmpeg with Homebrew when needed:

```bash
brew install ffmpeg
```

Music Suite opens at `http://127.0.0.1:3000`; its local API uses `http://127.0.0.1:8008`. The installer creates an optimized production frontend, and the normal launcher uses `next start` without development hot-reload WebSockets.

## Application workflow

1. Upload or drag in a song.
2. Select **Analyze** for technical and mastering analysis.
3. Select **Visual AI** for the live Spectrum, Orbit, and Waveform experience.
4. Use **AI Mastering** to render and compare mastered outputs.
5. Open **Configuration** to check for updates from the official Geekatplay Studio repository.

## Safe in-app updates

The Configuration panel checks only:

```text
https://github.com/GeekatplayStudio/music-suite
```

Updates are available to Git clones. The updater:

- accepts only the official repository as `origin`;
- uses the stable `main` branch;
- permits fast-forward updates only;
- refuses to overwrite a dirty or diverged working tree;
- requires an explicit same-origin confirmation header;
- never executes a user-provided URL or branch.

After an update, restart Music Suite. The start launcher fingerprints `pyproject.toml` and `pnpm-lock.yaml` and automatically synchronizes dependencies only when either manifest changed. ZIP installations can update by downloading a new release, but Git clone installations are recommended.

## Unified project layout

```text
music-suite/
  apps/api/                         FastAPI application
  apps/mcp/                         guarded MCP server
  apps/web-next/                    Next.js interface and Visual AI
  audioqi/                          analysis, mastering, update, and integrations
    integrations/comfyui/
      sonic_holodeck/               bundled nodes and workflows
  tests/                            backend, security, MCP, and launcher tests
  install.bat / start.bat           simple Windows launchers
  stop.bat                           safe Windows shutdown launcher
  install.command / start.command   simple macOS launchers
  stop.command                       safe macOS shutdown launcher
  install.ps1 / start.ps1 / stop.ps1 unified Windows implementation
```

## Validation

Run the complete Windows quality gate:

```powershell
.\verify_pipeline.ps1
```

Individual checks:

```powershell
.\.venv\Scripts\python.exe -m pytest -q --basetemp .pytest_tmp
.\.venv\Scripts\python.exe -m ruff check . --ignore E501
cd apps\web-next
pnpm.cmd exec tsc --noEmit
pnpm.cmd lint
pnpm.cmd build
pnpm.cmd audit --prod
```

## MCP server

Start Music Suite, then configure an MCP client to launch the installed `music-suite-mcp` executable. On Windows it is normally:

```text
<music-suite>\.venv\Scripts\music-suite-mcp.exe
```

On macOS:

```text
<music-suite>/.venv/bin/music-suite-mcp
```

Available tools are `music_suite_status`, `list_analysis_runs`, `get_analysis_result`, `get_mastering_advice`, and `queue_analysis`. MCP uses stdio and is read-only by default. Queueing an existing run requires `MUSIC_SUITE_MCP_ALLOW_MUTATIONS=1`.

See [GUARDRAILS.md](GUARDRAILS.md) for the complete enforced security boundary.

## Credits and license

**Geekatplay Studio Music Suite**<br>
Created and maintained by **Vladimir Chopine**<br>
Copyright © 2026 Geekatplay Studio

Released under the [MIT License](LICENSE).
