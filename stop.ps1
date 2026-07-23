param(
    [int]$ApiPort = 8008,
    [int]$WebPort = 3000,
    [int]$ComfyPort = 8188
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$processFile = Join-Path $root ".music-suite-processes.json"

function Get-ListenerProcessIds([int[]]$Ports) {
    $ids = [System.Collections.Generic.HashSet[int]]::new()
    foreach ($line in (& netstat.exe -ano -p TCP)) {
        if ($line -match '^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$') {
            $port = [int]$Matches[1]
            if ($Ports -contains $port) { $null = $ids.Add([int]$Matches[2]) }
        }
    }
    return @($ids)
}

function Test-MusicSuiteProcess($ProcessInfo, [System.Collections.Generic.HashSet[int]]$RecordedIds) {
    if (-not $ProcessInfo) { return $false }
    $commandLine = [string]$ProcessInfo.CommandLine
    $executable = [string]$ProcessInfo.ExecutablePath
    if ($commandLine.IndexOf($root, [StringComparison]::OrdinalIgnoreCase) -ge 0) { return $true }
    if ($executable.IndexOf($root, [StringComparison]::OrdinalIgnoreCase) -eq 0) { return $true }
    if ($commandLine -match 'uvicorn\s+apps\.api\.main:app') { return $true }
    if ($RecordedIds.Contains([int]$ProcessInfo.ProcessId) -and $commandLine -match 'next\s+start|pnpm\.cmd\s+exec\s+next\s+start') { return $true }
    if ($RecordedIds.Contains([int]$ProcessInfo.ProcessId) -and $commandLine -match 'main\.py.+--listen\s+127\.0\.0\.1') { return $true }
    return $false
}

$recordedIds = [System.Collections.Generic.HashSet[int]]::new()
if (Test-Path -LiteralPath $processFile) {
    try {
        $recorded = Get-Content -Raw -LiteralPath $processFile | ConvertFrom-Json
        foreach ($property in $recorded.PSObject.Properties) {
            if ($property.Value -as [int]) { $null = $recordedIds.Add([int]$property.Value) }
        }
    } catch {
        Write-Warning "The Music Suite PID file is invalid; verified port ownership will be used instead."
    }
}

$listenerIds = Get-ListenerProcessIds @($ApiPort, $WebPort, $ComfyPort)
$snapshot = @(Get-CimInstance Win32_Process)
$byId = @{}
foreach ($processInfo in $snapshot) { $byId[[int]$processInfo.ProcessId] = $processInfo }

$targets = [System.Collections.Generic.HashSet[int]]::new()
foreach ($candidateId in @($recordedIds) + @($listenerIds)) {
    $processInfo = $byId[[int]$candidateId]
    if (Test-MusicSuiteProcess $processInfo $recordedIds) {
        $null = $targets.Add([int]$candidateId)
    }
}

# Include descendants of verified launchers so pnpm/cmd and Python wrapper trees stop together.
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

if ($targets.Count -eq 0) {
    Write-Host "No running Geekatplay Studio Music Suite processes were found." -ForegroundColor Yellow
} else {
    $orderedTargets = @($targets) | Sort-Object -Descending
    foreach ($targetId in $orderedTargets) {
        if ($targetId -eq $PID) { continue }
        Stop-Process -Id $targetId -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Milliseconds 600
    Write-Host "Stopped Music Suite process IDs: $($orderedTargets -join ', ')" -ForegroundColor Green
}

$remaining = Get-ListenerProcessIds @($ApiPort, $WebPort)
if ($remaining.Count -gt 0) {
    throw "Ports $ApiPort/$WebPort are still in use by unrecognized process IDs: $($remaining -join ', '). They were not terminated."
}

if (Test-Path -LiteralPath $processFile) {
    Remove-Item -LiteralPath $processFile -Force
}
Write-Host "Music Suite is stopped. Ports $WebPort and $ApiPort are available." -ForegroundColor Green
