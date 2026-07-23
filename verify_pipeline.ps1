$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$python = Join-Path $root ".venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $python)) {
    throw "Music Suite is not installed. Run .\install.ps1 first."
}

function Assert-LastCommand([string]$Name) {
    if ($LASTEXITCODE -ne 0) {
        throw "$Name failed with exit code $LASTEXITCODE."
    }
}

Write-Host "== Music Suite validation ==" -ForegroundColor Cyan

Write-Host "[1/7] Python dependency check"
& $python -m pip check
Assert-LastCommand "Python dependency check"

Write-Host "[2/7] Music Suite Python lint"
& $python -m ruff check . --ignore E501
Assert-LastCommand "Python lint"

Write-Host "[3/7] ComfyUI integration syntax"
& $python -m compileall -q (Join-Path $root "audioqi\integrations\comfyui\sonic_holodeck")
Assert-LastCommand "ComfyUI integration syntax check"

Write-Host "[4/7] Backend tests"
& $python -m pytest -q --basetemp (Join-Path $root ".pytest_tmp")
Assert-LastCommand "Backend tests"

Write-Host "[5/7] Frontend lint and type check"
Push-Location (Join-Path $root "apps\web-next")
try {
    & pnpm.cmd exec tsc --noEmit
    Assert-LastCommand "Frontend type check"
    & pnpm.cmd lint
    Assert-LastCommand "Frontend lint"

    Write-Host "[6/7] Frontend production build"
    & pnpm.cmd build
    Assert-LastCommand "Frontend production build"

    Write-Host "[7/7] Production dependency audit"
    & pnpm.cmd audit --prod
    Assert-LastCommand "Production dependency audit"
} finally {
    Pop-Location
}

Write-Host "Music Suite validation passed." -ForegroundColor Green
