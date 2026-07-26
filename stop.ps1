$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$processFile = Join-Path $root ".music-suite-processes.json"

function Get-ListenerProcessId([int]$Port) {
    foreach ($line in (& netstat.exe -ano -p TCP)) {
        if ($line -match '^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$' -and [int]$Matches[1] -eq $Port) {
            return [int]$Matches[2]
        }
    }
    return $null
}

if (-not (Test-Path -LiteralPath $processFile)) {
    Write-Host "No recorded Music Suite instance is running. No processes were changed." -ForegroundColor Yellow
    return
}

try {
    $state = Get-Content -Raw -LiteralPath $processFile | ConvertFrom-Json
} catch {
    throw "The Music Suite runtime file is invalid. No processes were changed."
}
if ([string]$state.project_root -ne $root) {
    throw "The runtime file belongs to a different project directory. No processes were changed."
}

$recordedIds = [System.Collections.Generic.HashSet[int]]::new()
foreach ($name in @("api_launcher_pid", "api_pid", "web_launcher_pid", "web_pid", "comfyui_launcher_pid", "comfyui_pid")) {
    $value = $state.$name -as [int]
    if ($value) { $null = $recordedIds.Add($value) }
}

$snapshot = @(Get-CimInstance Win32_Process)
$byId = @{}
foreach ($processInfo in $snapshot) { $byId[[int]$processInfo.ProcessId] = $processInfo }

function Test-RecordedMusicSuiteProcess($ProcessInfo) {
    if (-not $ProcessInfo -or -not $recordedIds.Contains([int]$ProcessInfo.ProcessId)) { return $false }
    $commandLine = [string]$ProcessInfo.CommandLine
    $executable = [string]$ProcessInfo.ExecutablePath
    if ($commandLine.IndexOf($root, [StringComparison]::OrdinalIgnoreCase) -ge 0) { return $true }
    if ($executable.IndexOf($root, [StringComparison]::OrdinalIgnoreCase) -eq 0) { return $true }
    if ($commandLine -match 'uvicorn\s+apps\.api\.main:app') { return $true }
    if ($commandLine -match 'pnpm\.cmd\s+exec\s+next\s+start|npm\.cmd\s+run\s+start') { return $true }
    if ($commandLine -match 'main\.py.+--listen\s+127\.0\.0\.1') { return $true }
    return $false
}

$targets = [System.Collections.Generic.HashSet[int]]::new()
foreach ($recordedId in $recordedIds) {
    $processInfo = $byId[$recordedId]
    if (Test-RecordedMusicSuiteProcess $processInfo) { $null = $targets.Add($recordedId) }
}

# Descendants are owned by a verified recorded launcher, even when pnpm/Python add wrappers.
$added = $true
while ($added) {
    $added = $false
    foreach ($processInfo in $snapshot) {
        $pidValue = [int]$processInfo.ProcessId
        if ($targets.Contains([int]$processInfo.ParentProcessId) -and -not $targets.Contains($pidValue)) {
            $null = $targets.Add($pidValue)
            $added = $true
        }
    }
}

if ($targets.Count -gt 0) {
    $orderedTargets = @($targets) | Sort-Object -Descending
    foreach ($targetId in $orderedTargets) {
        if ($targetId -ne $PID) { Stop-Process -Id $targetId -Force -ErrorAction SilentlyContinue }
    }
    Start-Sleep -Milliseconds 600
    Write-Host "Stopped recorded Music Suite process IDs: $($orderedTargets -join ', ')" -ForegroundColor Green
} else {
    Write-Host "The recorded Music Suite processes had already exited. No other processes were changed." -ForegroundColor Yellow
}

$recordedPorts = @($state.web_port, $state.api_port, $state.comfyui_port) | Where-Object { $_ -as [int] }
foreach ($port in $recordedPorts) {
    $remainingPid = Get-ListenerProcessId ([int]$port)
    if ($remainingPid) {
        Write-Host "Port $port is currently used by another process ($remainingPid); it was left running." -ForegroundColor Yellow
    }
}

Remove-Item -LiteralPath $processFile -Force
Write-Host "The recorded Music Suite instance is stopped." -ForegroundColor Green
