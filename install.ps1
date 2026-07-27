param(
    [switch]$WithGpu,
    [switch]$WithPro,
    [string]$ComfyUIPath,
    [switch]$InstallComfyDependencies
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
Push-Location $root

function Install-WithWinget([string]$Id, [string]$FriendlyName) {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        throw "$FriendlyName is missing and winget is not available to install it. Install $FriendlyName manually."
    }
    Write-Host "Installing $FriendlyName via winget..."
    & winget install --id $Id -e --source winget --accept-package-agreements --accept-source-agreements
}

function Find-SystemPython {
    $python = Get-Command python -ErrorAction SilentlyContinue
    if ($python) {
        return [PSCustomObject]@{ Executable = $python.Source; PrefixArgs = @() }
    }

    $launcher = Get-Command py -ErrorAction SilentlyContinue
    if ($launcher) {
        return [PSCustomObject]@{ Executable = $launcher.Source; PrefixArgs = @("-3") }
    }

    Install-WithWinget "Python.Python.3.11" "Python 3.11"
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")

    $python = Get-Command python -ErrorAction SilentlyContinue
    if ($python) {
        return [PSCustomObject]@{ Executable = $python.Source; PrefixArgs = @() }
    }
    throw "Python was installed but is not yet on PATH. Close this window, reopen a terminal, and re-run install.bat."
}

function Find-ComfyPython([string]$Path) {
    $candidates = @(
        (Join-Path $Path "python_embeded\python.exe"),
        (Join-Path $Path ".venv\Scripts\python.exe"),
        (Join-Path $Path "venv\Scripts\python.exe")
    )
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) { return $candidate }
    }
    return $null
}

try {
    Write-Host "== Music Suite unified installer ==" -ForegroundColor Cyan
    Write-Host "This will install Python, FFmpeg, and Node.js if they are missing." -ForegroundColor Cyan

    if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue) -or -not (Get-Command ffprobe -ErrorAction SilentlyContinue)) {
        Install-WithWinget "Gyan.FFmpeg" "FFmpeg"
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    }

    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Install-WithWinget "OpenJS.NodeJS.LTS" "Node.js"
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    }

    if (-not (Get-Command pnpm.cmd -ErrorAction SilentlyContinue) -and (Get-Command corepack -ErrorAction SilentlyContinue)) {
        Write-Host "Enabling pnpm via corepack..."
        & corepack enable
    }

    $venvPython = Join-Path $root ".venv\Scripts\python.exe"
    if (-not (Test-Path -LiteralPath $venvPython)) {
        $systemPython = Find-SystemPython
        Write-Host "Creating project virtual environment..."
        $venvArgs = @($systemPython.PrefixArgs) + @("-m", "venv", (Join-Path $root ".venv"))
        & $systemPython.Executable @venvArgs
    }

    & $venvPython -m ensurepip --upgrade
    & $venvPython -m pip install --upgrade pip setuptools wheel

    $extras = @("dev")
    if ($WithGpu) { $extras += "gpu" }
    if ($WithPro) { $extras += "pro" }
    $extraSpec = $extras -join ","
    Write-Host "Installing Music Suite Python dependencies ($extraSpec)..."
    & $venvPython -m pip install -e ".[${extraSpec}]"

    $webDir = Join-Path $root "apps\web-next"
    Write-Host "Installing web dependencies..."
    Push-Location $webDir
    try {
        if (Get-Command pnpm.cmd -ErrorAction SilentlyContinue) {
            & pnpm.cmd install
            & pnpm.cmd build
        } elseif (Get-Command npm.cmd -ErrorAction SilentlyContinue) {
            & npm.cmd install
            & npm.cmd run build
        } else {
            throw "pnpm or npm was not found on PATH."
        }
    } finally {
        Pop-Location
    }

    if (-not $ComfyUIPath -and $env:MUSIC_SUITE_COMFYUI_PATH) {
        $ComfyUIPath = $env:MUSIC_SUITE_COMFYUI_PATH
    }

    if ($ComfyUIPath) {
        $resolvedComfy = (Resolve-Path -LiteralPath $ComfyUIPath).Path
        $customNodes = Join-Path $resolvedComfy "custom_nodes"
        if (-not (Test-Path -LiteralPath $customNodes)) {
            throw "ComfyUI custom_nodes folder not found: $customNodes"
        }

        $integrationSource = Join-Path $root "audioqi\integrations\comfyui\sonic_holodeck"
        $integrationTarget = Join-Path $customNodes "music_suite_sonic_holodeck"
        if (Test-Path -LiteralPath $integrationTarget) {
            $targetInfo = Get-Item -LiteralPath $integrationTarget -Force
            $linkedTarget = @($targetInfo.Target)[0]
            if ($targetInfo.LinkType -ne "Junction" -or $linkedTarget -ne $integrationSource) {
                throw "A different ComfyUI node already exists at $integrationTarget. Move it aside and rerun the installer."
            }
            Write-Host "ComfyUI integration is already linked."
        } else {
            New-Item -ItemType Junction -Path $integrationTarget -Target $integrationSource | Out-Null
            Write-Host "Linked Sonic Holodeck into ComfyUI: $integrationTarget"
        }

        if ($InstallComfyDependencies) {
            $comfyPython = Find-ComfyPython $resolvedComfy
            if (-not $comfyPython) {
                throw "Could not locate ComfyUI's Python environment."
            }
            Write-Host "Installing Sonic Holodeck dependencies into the ComfyUI environment..."
            & $comfyPython -m pip install --upgrade pip setuptools wheel
            & $comfyPython -m pip install soundfile librosa protobuf pystoi torchmetrics torchdiffeq matplotlib einops datasets diffusers transformers accelerate sentencepiece huggingface_hub pydub
            & $comfyPython -m pip install tangoflux --no-deps
            & $comfyPython -m pip install "git+https://github.com/facebookresearch/demucs.git@main#egg=demucs" --no-deps
            & $comfyPython -m pip install "git+https://github.com/suno-ai/bark.git" --no-deps
            & $comfyPython -m pip install "git+https://github.com/facebookresearch/audiocraft.git" --no-deps
        }
    }

    Write-Host ""
    $gitRevision = "no-git-revision"
    if (Get-Command git.exe -ErrorAction SilentlyContinue) {
        $detectedRevision = (& git.exe -C $root rev-parse HEAD 2>$null)
        if ($LASTEXITCODE -eq 0 -and $detectedRevision) { $gitRevision = $detectedRevision.Trim() }
    }
    $manifestHash = @(
        (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $root "pyproject.toml")).Hash,
        (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $webDir "pnpm-lock.yaml")).Hash,
        $gitRevision
    ) -join "-"
    Set-Content -LiteralPath (Join-Path $root ".music-suite-install-state") -Value $manifestHash -Encoding ascii
    Write-Host "Music Suite installation complete." -ForegroundColor Green
    Write-Host "Start everything with: start.bat"
} finally {
    Pop-Location
}
