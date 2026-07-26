param(
    [int]$ApiPort = 8008,
    [int]$WebPort = 3000,
    [int]$PortSearchLimit = 100,
    [int]$StartupTimeoutSeconds = 300,
    [switch]$StartComfyUI,
    [string]$ComfyUIPath,
    [int]$ComfyPort = 8188,
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$venvPython = Join-Path $root ".venv\Scripts\python.exe"
$webDir = Join-Path $root "apps\web-next"
$installStatePath = Join-Path $root ".music-suite-install-state"
$processFile = Join-Path $root ".music-suite-processes.json"
$logDir = Join-Path $root "logs"

if ($StartupTimeoutSeconds -lt 30) { $StartupTimeoutSeconds = 30 }
if ($env:MUSIC_SUITE_STARTUP_TIMEOUT_SECONDS) {
    $envTimeout = $env:MUSIC_SUITE_STARTUP_TIMEOUT_SECONDS -as [int]
    if ($envTimeout -and $envTimeout -ge 30) { $StartupTimeoutSeconds = $envTimeout }
}

New-Item -ItemType Directory -Path $logDir -Force | Out-Null

$nullInput = Join-Path $logDir ".empty-stdin"
Set-Content -LiteralPath $nullInput -Value "" -Encoding ascii

function New-ServiceLogPair([string]$Name) {
    $stdout = Join-Path $logDir "$Name.log"
    $stderr = Join-Path $logDir "$Name.error.log"
    foreach ($path in @($stdout, $stderr)) { Set-Content -LiteralPath $path -Value "" -Encoding utf8 }
    # Redirecting stdin as well keeps a background service from inheriting the caller's console
    # handles, so `npm run start` and start.bat return to the prompt instead of appearing to hang.
    return [PSCustomObject]@{ StdOut = $stdout; StdErr = $stderr; StdIn = $nullInput }
}

function Get-LogTail($LogPair, [int]$LineCount = 20) {
    $lines = @()
    foreach ($path in @($LogPair.StdErr, $LogPair.StdOut)) {
        if (Test-Path -LiteralPath $path) {
            $lines += @(Get-Content -LiteralPath $path -Tail $LineCount -ErrorAction SilentlyContinue)
        }
    }
    return @($lines | Where-Object { $_ -and $_.Trim() }) -join [Environment]::NewLine
}

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

function Test-PortAvailable([int]$Port) {
    if ($Port -lt 1 -or $Port -gt 65535) { return $false }
    $listener = $null
    try {
        $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
        $listener.Start()
        return $true
    } catch [Net.Sockets.SocketException] {
        return $false
    } finally {
        if ($listener) { $listener.Stop() }
    }
}

function Get-EphemeralPort([int[]]$ExcludedPorts = @()) {
    for ($attempt = 0; $attempt -lt 50; $attempt++) {
        $listener = $null
        try {
            $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
            $listener.Start()
            $candidate = ([Net.IPEndPoint]$listener.LocalEndpoint).Port
        } finally {
            if ($listener) { $listener.Stop() }
        }
        if ($ExcludedPorts -notcontains $candidate) { return $candidate }
    }
    throw "The operating system did not offer a free loopback port."
}

function Find-AvailablePort([int]$PreferredPort, [int[]]$ExcludedPorts = @()) {
    $lastPort = [Math]::Min(65535, $PreferredPort + [Math]::Max(0, $PortSearchLimit))
    foreach ($candidate in $PreferredPort..$lastPort) {
        if ($ExcludedPorts -notcontains $candidate -and (Test-PortAvailable $candidate)) {
            return $candidate
        }
    }
    # Every port in the preferred window is busy; let the OS pick any free loopback port.
    return Get-EphemeralPort $ExcludedPorts
}

function Get-ListenerProcessId([int]$Port) {
    foreach ($line in (& netstat.exe -ano -p TCP)) {
        if ($line -match '^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$' -and [int]$Matches[1] -eq $Port) {
            return [int]$Matches[2]
        }
    }
    return $null
}

function Wait-ForListener([int]$Port, $Launcher, [string]$Service, $LogPair) {
    # A cold first start imports the full audio stack, so readiness can take minutes on slow disks
    # or while antivirus scans the virtual environment. Wait patiently and report progress instead.
    $deadline = [DateTime]::UtcNow.AddSeconds($StartupTimeoutSeconds)
    $nextNotice = [DateTime]::UtcNow.AddSeconds(10)
    Write-Host "Waiting for $Service on port $Port (up to $StartupTimeoutSeconds seconds)..."
    while ([DateTime]::UtcNow -lt $deadline) {
        $Launcher.Refresh()
        $listenerPid = Get-ListenerProcessId $Port
        if ($listenerPid) {
            Write-Host "$Service is listening on port $Port." -ForegroundColor Green
            return $listenerPid
        }
        if ($Launcher.HasExited) {
            $detail = if ($LogPair) { Get-LogTail $LogPair } else { "" }
            $message = "$Service exited before opening port $Port (exit code $($Launcher.ExitCode))."
            if ($detail) { $message += [Environment]::NewLine + $detail }
            throw $message
        }
        if ([DateTime]::UtcNow -ge $nextNotice) {
            $remaining = [int]($deadline - [DateTime]::UtcNow).TotalSeconds
            Write-Host "  still starting $Service... ($remaining seconds remaining)" -ForegroundColor DarkGray
            $nextNotice = [DateTime]::UtcNow.AddSeconds(10)
        }
        Start-Sleep -Milliseconds 250
    }
    $tail = if ($LogPair) { Get-LogTail $LogPair } else { "" }
    $timeoutMessage = @(
        "$Service did not open port $Port within $StartupTimeoutSeconds seconds.",
        "Increase the limit with: .\start.ps1 -StartupTimeoutSeconds 600"
    )
    if ($LogPair) { $timeoutMessage += "Startup log: $($LogPair.StdOut)" }
    if ($tail) { $timeoutMessage += "", $tail }
    throw ($timeoutMessage -join [Environment]::NewLine)
}

function Stop-SpawnedTree([int]$ProcessId) {
    if ($ProcessId -le 0) { return }
    & taskkill.exe /PID $ProcessId /T /F 2>$null | Out-Null
}

function Test-RecordedInstance($State) {
    if (-not $State -or [string]$State.project_root -ne $root) { return $false }
    $apiPid = $State.api_pid -as [int]
    $webPid = $State.web_pid -as [int]
    $apiPortValue = $State.api_port -as [int]
    $webPortValue = $State.web_port -as [int]
    if (-not $apiPid -or -not $webPid -or -not $apiPortValue -or -not $webPortValue) { return $false }
    $processes = @(Get-CimInstance Win32_Process -Filter "ProcessId = $apiPid OR ProcessId = $webPid")
    $api = $processes | Where-Object { $_.ProcessId -eq $apiPid -and $_.CommandLine -match 'uvicorn\s+apps\.api\.main:app' }
    $web = $processes | Where-Object { $_.ProcessId -eq $webPid -and ([string]$_.CommandLine).IndexOf($root, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and $_.CommandLine -match 'next.+start' }
    return [bool]($api -and $web)
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

if (Test-Path -LiteralPath $processFile) {
    try {
        $existing = Get-Content -Raw -LiteralPath $processFile | ConvertFrom-Json
        if (Test-RecordedInstance $existing) {
            $existingUrl = "http://127.0.0.1:$([int]$existing.web_port)"
            Write-Host "Music Suite is already running." -ForegroundColor Green
            Write-Host "Web: $existingUrl"
            Write-Host "API: http://127.0.0.1:$([int]$existing.api_port)"
            Write-Host "To stop it, double-click stop.bat or run: .\stop.ps1" -ForegroundColor Cyan
            if (-not $NoBrowser) { Start-Process $existingUrl }
            return
        }
    } catch {
        Write-Warning "Ignoring a stale Music Suite runtime file."
    }
}

if (
    -not (Test-Path -LiteralPath $venvPython) -or
    -not (Test-Path -LiteralPath (Join-Path $webDir "node_modules")) -or
    -not (Test-Path -LiteralPath (Join-Path $webDir ".next\BUILD_ID")) -or
    -not (Test-Path -LiteralPath $installStatePath) -or
    (Get-Content -Raw -LiteralPath $installStatePath).Trim() -ne (Get-DependencyManifestHash)
) {
    Write-Host "Dependencies are missing or changed; running the unified installer first..."
    & (Join-Path $root "install.ps1") -ComfyUIPath $ComfyUIPath
}

$selectedWebPort = Find-AvailablePort $WebPort
$selectedApiPort = Find-AvailablePort $ApiPort @($selectedWebPort)
$selectedComfyPort = $null

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
    $selectedComfyPort = Find-AvailablePort $ComfyPort @($selectedWebPort, $selectedApiPort)
    $comfyLaunch = [PSCustomObject]@{ Root = $resolvedComfy; Python = $comfyPython; Main = $comfyMain }
}

$apiProcess = $null
$webProcess = $null
$comfyProcess = $null
try {
    $apiLog = New-ServiceLogPair "api"
    $apiArgs = @("-m", "uvicorn", "apps.api.main:app", "--host", "127.0.0.1", "--port", $selectedApiPort)
    $apiProcess = Start-Process -FilePath $venvPython -ArgumentList $apiArgs -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardInput $apiLog.StdIn -RedirectStandardOutput $apiLog.StdOut -RedirectStandardError $apiLog.StdErr
    $apiRuntimePid = Wait-ForListener $selectedApiPort $apiProcess "Music Suite API" $apiLog

    if (Get-Command pnpm.cmd -ErrorAction SilentlyContinue) {
        $webCommand = "pnpm.cmd exec next start -H 127.0.0.1 -p $selectedWebPort"
    } elseif (Get-Command npm.cmd -ErrorAction SilentlyContinue) {
        $webCommand = "npm.cmd run start -- -H 127.0.0.1 -p $selectedWebPort"
    } else {
        throw "pnpm or npm was not found on PATH."
    }
    $webLog = New-ServiceLogPair "web"
    $previousApiUrl = $env:MUSIC_SUITE_API_URL
    $env:MUSIC_SUITE_API_URL = "http://127.0.0.1:$selectedApiPort"
    try {
        $webProcess = Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", $webCommand) -WorkingDirectory $webDir -WindowStyle Hidden -PassThru -RedirectStandardInput $webLog.StdIn -RedirectStandardOutput $webLog.StdOut -RedirectStandardError $webLog.StdErr
    } finally {
        $env:MUSIC_SUITE_API_URL = $previousApiUrl
    }
    $webRuntimePid = Wait-ForListener $selectedWebPort $webProcess "Music Suite web" $webLog

    $state = [ordered]@{
        schema_version = 2
        instance_id = [guid]::NewGuid().ToString()
        project_root = $root
        started_at = [DateTime]::UtcNow.ToString("o")
        api_port = $selectedApiPort
        api_launcher_pid = $apiProcess.Id
        api_pid = $apiRuntimePid
        web_port = $selectedWebPort
        web_launcher_pid = $webProcess.Id
        web_pid = $webRuntimePid
    }

    if ($comfyLaunch) {
        $comfyLog = New-ServiceLogPair "comfyui"
        $comfyProcess = Start-Process -FilePath $comfyLaunch.Python -ArgumentList @($comfyLaunch.Main, "--listen", "127.0.0.1", "--port", $selectedComfyPort) -WorkingDirectory $comfyLaunch.Root -WindowStyle Hidden -PassThru -RedirectStandardInput $comfyLog.StdIn -RedirectStandardOutput $comfyLog.StdOut -RedirectStandardError $comfyLog.StdErr
        $state.comfyui_port = $selectedComfyPort
        $state.comfyui_launcher_pid = $comfyProcess.Id
        $state.comfyui_pid = Wait-ForListener $selectedComfyPort $comfyProcess "ComfyUI" $comfyLog
    }

    $state | ConvertTo-Json | Set-Content -LiteralPath $processFile -Encoding utf8
} catch {
    if ($comfyProcess) { Stop-SpawnedTree $comfyProcess.Id }
    if ($webProcess) { Stop-SpawnedTree $webProcess.Id }
    if ($apiProcess) { Stop-SpawnedTree $apiProcess.Id }
    throw
}

$webUrl = "http://127.0.0.1:$selectedWebPort"
Write-Host "Music Suite is running." -ForegroundColor Green
Write-Host "Web: $webUrl"
Write-Host "API: http://127.0.0.1:$selectedApiPort"
if ($selectedWebPort -ne $WebPort) { Write-Host "Preferred web port $WebPort was busy; selected $selectedWebPort." -ForegroundColor Yellow }
if ($selectedApiPort -ne $ApiPort) { Write-Host "Preferred API port $ApiPort was busy; selected $selectedApiPort." -ForegroundColor Yellow }
if ($selectedComfyPort) { Write-Host "ComfyUI: http://127.0.0.1:$selectedComfyPort" }
Write-Host "Startup logs: $logDir"
Write-Host "To stop this exact instance, double-click stop.bat or run: .\stop.ps1" -ForegroundColor Cyan
if (-not $NoBrowser) { Start-Process $webUrl }
