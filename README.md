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
- Integrated Song Geometry Mapper workspace with 3D mappings, presets, overlays, exports, and adaptive rendering
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

### From the project root with npm

`npm run start` and `npm run stop` work from the repository root on both platforms and call the same unified launchers:

```bash
npm run start
npm run stop
npm run install:suite
```

### Ports

Music Suite prefers `http://127.0.0.1:3000` for the web interface and port `8008` for its local API. If either port is occupied, startup automatically scans upward for the next available loopback port; if that entire window is busy it asks the operating system for any free loopback port. It then displays and opens the selected web address and records the exact instance configuration. The existing application on the preferred port is never stopped or modified.

### Startup time and logs

A cold first start imports the complete audio stack and can take a few minutes on a slow disk, or while antivirus scans the virtual environment. The launchers wait up to **300 seconds** per service, print progress while waiting, and stream each service's output to `logs/`:

```text
logs/api.log        logs/api.error.log
logs/web.log        logs/web.error.log
```

If a service fails or times out, the launcher prints the tail of that log instead of stopping with an unexplained message. Raise the limit when needed:

```powershell
.\start.ps1 -StartupTimeoutSeconds 600
```

```bash
MUSIC_SUITE_STARTUP_TIMEOUT_SECONDS=600 ./start.command
```

The same value can be set once through the `MUSIC_SUITE_STARTUP_TIMEOUT_SECONDS` environment variable on either platform.

The frontend reaches the selected API through a same-origin streaming proxy, so uploads, audio seeking, downloads, MCP discovery, and configuration continue to work without fixed port assumptions. The installer creates an optimized production frontend, and normal startup uses `next start` without development hot-reload WebSockets.

Shutdown reads `.music-suite-processes.json` and terminates only the verified PIDs recorded for that project instance and their descendants. It does not scan or claim ports 3000/8008, and an unrelated process using either port is left running.

## Application workflow

1. Upload or drag in a song.
2. Select **Analyze** for technical and mastering analysis.
3. Select **Visual AI** for the live Spectrum, Orbit, and Waveform experience.
4. Select a run and open **Geometry Mapper** to reuse that song in the full 3D mapper workspace.
5. Use **AI Mastering** to render and compare mastered outputs.
6. Open **Configuration** to check for updates from the official Geekatplay Studio repository.

Geometry Mapper runs inside the normal Music Suite web process; Docker and a separate mapper server are not required. Classic analysis runs in the browser. Voice / Deep analysis uses the same loopback FastAPI service and stores its cache under `data/song-mapper`. Optional Demucs stem separation can be enabled with `pip install -e ".[geometry]"`; without it, the analyzer safely falls back to the full mix.

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

After an update, restart Music Suite. The start launcher fingerprints the Git revision, `pyproject.toml`, and `pnpm-lock.yaml` and automatically synchronizes dependencies and the production build when needed. ZIP installations can update by downloading a new release, but Git clone installations are recommended.

## Unified project layout

```text
music-suite/
  apps/api/                         FastAPI application
  apps/mcp/                         guarded MCP server
  apps/web-next/                    Next.js interface and Visual AI
    public/song-mapper/             integrated Song Geometry Mapper workspace
  audioqi/                          analysis, mastering, update, and integrations
    geometry_mapper/                mapper deep-analysis and managed cache service
    integrations/comfyui/
      sonic_holodeck/               bundled nodes and workflows
  tests/                            backend, security, MCP, and launcher tests
  scripts/launch.mjs                cross-platform bridge for the root npm scripts
  logs/                             per-service startup logs (generated, ignored by Git)
  package.json                      root npm start/stop/install wrappers
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
