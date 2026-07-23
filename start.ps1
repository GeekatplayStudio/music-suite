param(
    [int]$ApiPort = 8008,
    [int]$WebPort = 3000,
    [switch]$StartComfyUI,
    [string]$ComfyUIPath,
    [int]$ComfyPort = 8188
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$venvPython = Join-Path $root ".venv\Scripts\python.exe"
$webDir = Join-Path $root "apps\web-next"
$installStatePath = Join-Path $root ".music-suite-install-state"

function Get-DependencyManifestHash {
    $gitRevision = "no-git-revision"
    if (Get-Command git.exe -ErrorAction SilentlyContinue) {
        $detectedRevision = (& git.exe -C $root rev-parse HEAD 2>$null)
        if ($LASTEXITCODE -eq 0 -and $detectedRevision) { $gitRevision = $detectedRevision.Trim() }
    }
    return @(
        (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $root "pyproject.toml")).Hash,
        (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $webDir "pnpm-lock.yaml")).Hash,
        $gitRevision
    ) -join "-"
}

function Assert-PortAvailable([int]$Port, [string]$Service) {
    $listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
    if ($listener) {
        throw "$Service port $Port is already in use by process $($listener[0].OwningProcess)."
    }
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

if (
    -not (Test-Path -LiteralPath $venvPython) -or
    -not (Test-Path -LiteralPath (Join-Path $webDir "node_modules")) -or
    -not (Test-Path -LiteralPath (Join-Path $webDir ".next\BUILD_ID")) -or
    -not (Test-Path -LiteralPath $installStatePath) -or
    (Get-Content -Raw -LiteralPath $installStatePath).Trim() -ne (Get-DependencyManifestHash)
) {
    Write-Host "Dependencies are missing; running the unified installer first..."
    & (Join-Path $root "install.ps1") -ComfyUIPath $ComfyUIPath
}

Assert-PortAvailable $ApiPort "API"
Assert-PortAvailable $WebPort "Web"

$comfyLaunch = $null
if ($StartComfyUI) {
    if (-not $ComfyUIPath -and $env:MUSIC_SUITE_COMFYUI_PATH) {
        $ComfyUIPath = $env:MUSIC_SUITE_COMFYUI_PATH
    }
    if (-not $ComfyUIPath) {
        throw "-StartComfyUI requires -ComfyUIPath or MUSIC_SUITE_COMFYUI_PATH."
    }
    $resolvedComfy = (Resolve-Path -LiteralPath $ComfyUIPath).Path
    $comfyPython = Find-ComfyPython $resolvedComfy
    $comfyMain = Join-Path $resolvedComfy "main.py"
    if (-not $comfyPython -or -not (Test-Path -LiteralPath $comfyMain)) {
        throw "ComfyUI Python or main.py was not found under $resolvedComfy."
    }
    Assert-PortAvailable $ComfyPort "ComfyUI"
    $comfyLaunch = [PSCustomObject]@{
        Root = $resolvedComfy
        Python = $comfyPython
        Main = $comfyMain
    }
}

$apiArgs = @("-m", "uvicorn", "apps.api.main:app", "--host", "127.0.0.1", "--port", $ApiPort)
$apiProcess = Start-Process -FilePath $venvPython -ArgumentList $apiArgs -WorkingDirectory $root -WindowStyle Hidden -PassThru

if (Get-Command pnpm.cmd -ErrorAction SilentlyContinue) {
    $webCommand = "pnpm.cmd exec next start -H 127.0.0.1 -p $WebPort"
} elseif (Get-Command npm.cmd -ErrorAction SilentlyContinue) {
    $webCommand = "npm.cmd run start -- -H 127.0.0.1 -p $WebPort"
} else {
    Stop-Process -Id $apiProcess.Id -Force
    throw "pnpm or npm was not found on PATH."
}
$webProcess = Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", $webCommand) -WorkingDirectory $webDir -WindowStyle Hidden -PassThru

$processes = [ordered]@{
    api = $apiProcess.Id
    web = $webProcess.Id
}

if ($comfyLaunch) {
    $comfyProcess = Start-Process -FilePath $comfyLaunch.Python -ArgumentList @($comfyLaunch.Main, "--listen", "127.0.0.1", "--port", $ComfyPort) -WorkingDirectory $comfyLaunch.Root -WindowStyle Hidden -PassThru
    $processes.comfyui = $comfyProcess.Id
}

$processFile = Join-Path $root ".music-suite-processes.json"
$processes | ConvertTo-Json | Set-Content -LiteralPath $processFile -Encoding utf8

Write-Host "Music Suite is starting." -ForegroundColor Green
Write-Host "Web: http://127.0.0.1:$WebPort"
Write-Host "API: http://127.0.0.1:$ApiPort"
if ($processes.Contains("comfyui")) { Write-Host "ComfyUI: http://127.0.0.1:$ComfyPort" }
Write-Host "Launcher process IDs: API $($processes.api), Web $($processes.web)"
Write-Host "To stop Music Suite, double-click stop.bat or run: .\stop.ps1" -ForegroundColor Cyan
