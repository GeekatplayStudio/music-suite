param(
    [int]$ApiPort = 8008,
    [int]$WebPort = 3000,
    [int]$PortSearchLimit = 100,
    [int]$StartupTimeoutSeconds = 300,
    [switch]$StartComfyUI,
    [string]$ComfyUIPath,
    [int]$ComfyPort = 8188,
    [switch]$NoBrowser,
    # Report what is missing and stop, rather than installing anything.
    [switch]$NoInstall
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$venvPython = Join-Path $root ".venv\Scripts\python.exe"
$webDir = Join-Path $root "apps\web-next"
$toolsRoot = Join-Path $root ".tools"
$installStatePath = Join-Path $root ".music-suite-install-state"
$processFile = Join-Path $root ".music-suite-processes.json"
$logDir = Join-Path $root "logs"
. (Join-Path $root "scripts\install-state.ps1")
Set-MusicSuitePortableEnvironment -Root $root

# Started on its own (not from start.bat), the window would close on an error before it could
# be read: show it and wait. The error still ends the script.
trap {
    if ($env:MUSIC_SUITE_LAUNCHER -ne "bat") {
        Write-Host ""
        Write-Host "Music Suite could not start: $($_.Exception.Message)" -ForegroundColor Red
        Wait-IfOwnWindow "start.ps1"
    }
    break
}

function Add-BundledToolPaths {
    foreach ($folder in @(
        (Join-Path $toolsRoot "ffmpeg\bin"),
        (Join-Path $toolsRoot "node"),
        (Join-Path $toolsRoot "git\cmd")
    )) {
        Add-PathFolder $folder
    }
}

Add-BundledToolPaths

if ($StartupTimeoutSeconds -lt 30) { $StartupTimeoutSeconds = 30 }
if ($env:MUSIC_SUITE_STARTUP_TIMEOUT_SECONDS) {
    $envTimeout = $env:MUSIC_SUITE_STARTUP_TIMEOUT_SECONDS -as [int]
    if ($envTimeout -and $envTimeout -ge 30) { $StartupTimeoutSeconds = $envTimeout }
}

$nullInput = Join-Path $logDir ".empty-stdin"

function New-ServiceLogPair([string]$Name) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    # A service from an earlier launch may still hold this file open as its stdin, so only
    # create it when it is missing; an existing empty file is already what every service needs.
    if (-not (Test-Path -LiteralPath $nullInput)) {
        Set-Content -LiteralPath $nullInput -Value "" -Encoding ascii
    }
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
    # Which process listens on a loopback port. Windows' own connection list first: it reads
    # the same in every language. netstat names the state in the system language (LISTENING
    # in English, translated elsewhere), so its fallback goes by the remote address instead, which
    # is 0.0.0.0:0 for a listening socket everywhere.
    try {
        $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -First 1
        if ($connection) { return [int]$connection.OwningProcess }
    } catch {}
    foreach ($line in (& netstat.exe -ano -p TCP 2>$null)) {
        if ($line -match '^\s*TCP\s+\S+:(\d+)\s+(0\.0\.0\.0:0|\[::\]:0)\s+\S+\s+(\d+)\s*$' -and [int]$Matches[1] -eq $Port) {
            return [int]$Matches[3]
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

# Starting must start. On an ordinary start nothing is installed or rebuilt. Only three
# things lead to work here, each only when it is really so:
#   * something the app needs is missing: the core is installed (never optional models);
#   * an update changed the libraries this version needs: they are brought up to date,
#     as the in-app updater promises, because new code can fail on old libraries;
#   * an update changed the web app's source: it is built again, or the old one keeps
#     being served and the update seems to have done nothing.
$readiness = Get-MusicSuiteReadiness -Root $root -WebDir $webDir -StatePath $installStatePath

if (-not $readiness.Ready -or $readiness.Stale.Count -gt 0) {
    if (-not $readiness.Ready) {
        Write-Host "Music Suite cannot start yet. What is missing:" -ForegroundColor Yellow
        foreach ($item in $readiness.Missing) { Write-Host "  - $($item.Detail)" -ForegroundColor Yellow }
    } else {
        Write-Host "Music Suite was updated. Bringing its libraries up to date first:" -ForegroundColor Cyan
        foreach ($item in $readiness.Stale) { Write-Host "  - $($item.Detail)" -ForegroundColor Cyan }
    }
    Write-Host ""
    if ($NoInstall) {
        if (-not $readiness.Ready) { throw "Run install.bat to install the missing pieces, or start again without -NoInstall." }
        Write-Host "Starting with what is installed (-NoInstall). Run install.bat to update it." -ForegroundColor Yellow
    } else {
        Write-Host "This installs only what Music Suite needs to run; optional AI models are not touched." -ForegroundColor Cyan
        Write-Host ""
        & (Join-Path $root "install.ps1") -CoreOnly -ComfyUIPath $ComfyUIPath
        $installExit = $LASTEXITCODE
        Add-BundledToolPaths
        $readiness = Get-MusicSuiteReadiness -Root $root -WebDir $webDir -StatePath $installStatePath
        if (-not $readiness.Ready) {
            $stillMissing = ($readiness.Missing | ForEach-Object { $_.Detail }) -join "; "
            throw "Music Suite could not be installed, so it cannot start: $stillMissing. The installer's message above says why; run install.bat to try again."
        }
        if ($installExit -ne 0) {
            Write-Host "Updating did not fully finish (see above). Starting with what is installed." -ForegroundColor Yellow
        }
    }
}

if ($readiness.Ready -and $readiness.Rebuild -and -not $NoInstall) {
    Write-Host "This version's web app has not been built yet. Building it now (usually 1 to 3 minutes)..." -ForegroundColor Cyan
    try {
        Invoke-WebAppBuild -WebDir $webDir -BuildOnly
        $built = Get-MusicSuiteDependencyState -Root $root -WebDir $webDir -WithWebBuild
        Write-MusicSuiteInstallState -Path $installStatePath -State $built
        Write-Host "The web app is built." -ForegroundColor Green
    } catch {
        if (-not (Test-Path -LiteralPath (Join-Path $webDir ".next\BUILD_ID"))) { throw }
        Write-Host "Building the new web app failed: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "Starting the previous build instead. Run install.bat to try the build again." -ForegroundColor Yellow
    }
    Write-Host ""
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

    # Node runs Next directly: no pnpm, corepack or cmd.exe wrapper has to work for the app to
    # start, and the full path in the command line is how stop.ps1 recognises this process.
    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    $nextBin = Join-Path $webDir "node_modules\next\dist\bin\next"
    if (-not $node) { throw "Node.js was not found. Run install.bat." }
    if (-not (Test-Path -LiteralPath $nextBin)) { throw "The web app's libraries are incomplete (Next.js is missing). Run install.bat." }
    $webLog = New-ServiceLogPair "web"
    $previousApiUrl = $env:MUSIC_SUITE_API_URL
    $env:MUSIC_SUITE_API_URL = "http://127.0.0.1:$selectedApiPort"
    try {
        # Windows PowerShell does not quote arguments for Start-Process, so a folder with a
        # space in its name would split the path in two without these quotes.
        $webArgs = @("`"$nextBin`"", "start", "-H", "127.0.0.1", "-p", "$selectedWebPort")
        $webProcess = Start-Process -FilePath $node.Source -ArgumentList $webArgs -WorkingDirectory $webDir -WindowStyle Hidden -PassThru -RedirectStandardInput $webLog.StdIn -RedirectStandardOutput $webLog.StdOut -RedirectStandardError $webLog.StdErr
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
