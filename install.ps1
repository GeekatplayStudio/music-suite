param(
    [switch]$WithGpu,
    [switch]$WithPro,
    [string]$ComfyUIPath,
    [switch]$InstallComfyDependencies
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
Push-Location $root

function Find-SystemPython {
    $python = Get-Command python -ErrorAction SilentlyContinue
    if ($python) {
        return [PSCustomObject]@{ Executable = $python.Source; PrefixArgs = @() }
    }

    $launcher = Get-Command py -ErrorAction SilentlyContinue
    if ($launcher) {
        return [PSCustomObject]@{ Executable = $launcher.Source; PrefixArgs = @("-3") }
    }

    throw "Python 3.11 or newer was not found on PATH."
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
        } elseif (Get-Command npm.cmd -ErrorAction SilentlyContinue) {
            & npm.cmd install
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
    $manifestHash = @(
        (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $root "pyproject.toml")).Hash,
        (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $webDir "pnpm-lock.yaml")).Hash
    ) -join "-"
    Set-Content -LiteralPath (Join-Path $root ".music-suite-install-state") -Value $manifestHash -Encoding ascii
    Write-Host "Music Suite installation complete." -ForegroundColor Green
    Write-Host "Start everything with: start.bat"
} finally {
    Pop-Location
}
