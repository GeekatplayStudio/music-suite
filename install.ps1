param(
    [switch]$WithGpu,
    [switch]$WithPro,
    [switch]$WithAiStems,
    [switch]$FullInstall,
    [string]$ComfyUIPath,
    [switch]$InstallComfyDependencies,
    # Install only what the app needs to run, asking nothing. Used by start.ps1 when it
    # finds a missing piece, so starting never turns into an interactive download session.
    [switch]$CoreOnly
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
. (Join-Path $root "scripts\install-state.ps1")
Set-MusicSuitePortableEnvironment -Root $root
$toolsRoot = Join-Path $root ".tools"
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
Push-Location $root
$installLogDir = Join-Path $root "logs"
$installLogPath = Join-Path $installLogDir "install.log"
$transcriptStarted = $false
try {
    New-Item -ItemType Directory -Path $installLogDir -Force | Out-Null
    Start-Transcript -Path $installLogPath -Append -ErrorAction Stop | Out-Null
    $transcriptStarted = $true
} catch {
    Write-Warning "The installer could not create its log file, but installation will continue."
}

function Get-WindowsArchitecture {
    $architecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
    if ($architecture -eq "arm64") { return "arm64" }
    if ($architecture -eq "x64") { return "x64" }
    throw "Unsupported Windows architecture: $architecture"
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

function Test-InstallPreflight([bool]$Complete, [bool]$FreshInstall) {
    <#
        Everything that would otherwise fail half an hour in, checked in the first seconds:
        a folder that cannot be written, a full disk, no internet, OneDrive, very long paths.
        Each problem is explained with what to do about it.
    #>
    $probe = Join-Path $root (".write-test-" + [guid]::NewGuid().ToString("N"))
    try {
        Set-Content -LiteralPath $probe -Value "ok" -ErrorAction Stop
        Remove-Item -LiteralPath $probe -Force -ErrorAction SilentlyContinue
    } catch {
        throw ("Windows does not allow writing to this folder: $root" + [Environment]::NewLine +
            "Move the Music Suite folder somewhere of your own, for example C:\MusicSuite or your Documents folder, and run install.bat there.")
    }

    $needGb = if ($Complete) { 45 } elseif ($FreshInstall) { 8 } else { 3 }
    $drive = $null
    try { $drive = New-Object IO.DriveInfo ([IO.Path]::GetPathRoot($root)) } catch {}
    if ($drive -and $drive.IsReady) {
        $freeGb = [math]::Floor($drive.AvailableFreeSpace / 1GB)
        if ($freeGb -lt $needGb) {
            throw ("Not enough free disk space on $($drive.Name): $freeGb GB free, and this installation needs about $needGb GB." + [Environment]::NewLine +
                "Free some space (empty the Recycle Bin, remove large downloads) or move Music Suite to a drive with more room, then run install.bat again.")
        }
        Write-Host "Disk space: $freeGb GB free on $($drive.Name) (about $needGb GB needed)." -ForegroundColor DarkGray
    } else {
        Write-Host "Could not read the free disk space; continuing." -ForegroundColor DarkGray
    }

    if ($root -match '\\OneDrive( - [^\\]+)?\\') {
        Write-Host ""
        Write-Host "Music Suite is inside a OneDrive folder. OneDrive tries to upload the thousands of" -ForegroundColor Yellow
        Write-Host "library files the install creates and can lock them halfway, which makes installs fail." -ForegroundColor Yellow
        Write-Host "If anything below fails, move the folder outside OneDrive (for example C:\MusicSuite)." -ForegroundColor Yellow
        Write-Host ""
    }

    if ($root.Length -gt 120) {
        $longPaths = $false
        try { $longPaths = (Get-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name LongPathsEnabled -ErrorAction Stop).LongPathsEnabled -eq 1 } catch {}
        if (-not $longPaths) {
            Write-Host "The folder path is very long ($($root.Length) characters). Some library files are nested deeply" -ForegroundColor Yellow
            Write-Host "and Windows limits paths to 260 characters. If the install fails, move the folder to a short path such as C:\MusicSuite." -ForegroundColor Yellow
        }
    }

    $unreachable = @()
    foreach ($site in @(
        @{ Name = "the Python package index (pypi.org)"; Url = "https://pypi.org/simple/pip/" },
        @{ Name = "the web package registry (registry.npmjs.org)"; Url = "https://registry.npmjs.org/pnpm" }
    )) {
        try {
            $request = [Net.HttpWebRequest]::Create($site.Url)
            $request.Method = "HEAD"
            $request.Timeout = 20000
            $request.UserAgent = "MusicSuiteInstaller"
            $request.GetResponse().Dispose()
        } catch {
            $unreachable += $site.Name
        }
    }
    if ($unreachable.Count -gt 0) {
        $message = "This computer cannot reach " + ($unreachable -join " or ") + "." + [Environment]::NewLine +
            "Check the internet connection. A VPN, proxy, firewall or antivirus web filter can also block it; pause it and run install.bat again."
        if ($FreshInstall) { throw $message }
        Write-Host $message -ForegroundColor Yellow
        Write-Host "Continuing with what is already installed." -ForegroundColor Yellow
    }
}

function Format-Bytes([long]$Bytes) {
    if ($Bytes -ge 1GB) { return "{0:N2} GB" -f ($Bytes / 1GB) }
    if ($Bytes -ge 1MB) { return "{0:N1} MB" -f ($Bytes / 1MB) }
    if ($Bytes -ge 1KB) { return "{0:N0} KB" -f ($Bytes / 1KB) }
    return "$Bytes bytes"
}

function Invoke-TrustedDownload([string]$Uri, [string]$Destination, [string]$FriendlyName) {
    <#
        Downloads with visible progress: how much of how big, how fast, on one line that
        updates. The old version silenced the progress bar, so a multi-hundred-megabyte
        download looked like the installer had hung.
    #>
    Write-Host "Downloading $FriendlyName from $(([uri]$Uri).Host)..."
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    $response = $null
    $input_ = $null
    $output = $null
    try {
        $request = [Net.HttpWebRequest]::Create($Uri)
        $request.UserAgent = "MusicSuiteInstaller"
        $request.Timeout = 60000
        $response = $request.GetResponse()
        $total = [long]$response.ContentLength
        $input_ = $response.GetResponseStream()
        $output = [IO.File]::Create($Destination)
        $buffer = New-Object byte[] 131072
        $done = [long]0
        $started = [Diagnostics.Stopwatch]::StartNew()
        $lastReport = [TimeSpan]::Zero
        $sizeLabel = if ($total -gt 0) { Format-Bytes $total } else { "unknown size" }
        while (($read = $input_.Read($buffer, 0, $buffer.Length)) -gt 0) {
            $output.Write($buffer, 0, $read)
            $done += $read
            # Report about five times a second: often enough to look alive, rarely enough
            # not to flood a redirected log with thousands of lines.
            if (($started.Elapsed - $lastReport).TotalMilliseconds -lt 200) { continue }
            $lastReport = $started.Elapsed
            $speed = if ($started.Elapsed.TotalSeconds -gt 0) { $done / $started.Elapsed.TotalSeconds } else { 0 }
            $line = if ($total -gt 0) {
                "  {0} of {1} ({2,3:N0}%) at {3}/s" -f (Format-Bytes $done), $sizeLabel, ($done * 100.0 / $total), (Format-Bytes ([long]$speed))
            } else {
                "  {0} at {1}/s" -f (Format-Bytes $done), (Format-Bytes ([long]$speed))
            }
            Write-Host ("`r" + $line.PadRight(70)) -NoNewline
        }
        $started.Stop()
        Write-Host ("`r" + ("  {0} in {1:N0}s" -f (Format-Bytes $done), $started.Elapsed.TotalSeconds).PadRight(70))
    } catch {
        if ($output) { $output.Dispose(); $output = $null }
        if (Test-Path -LiteralPath $Destination) { Remove-Item -LiteralPath $Destination -Force -ErrorAction SilentlyContinue }
        throw "Could not download $FriendlyName from its official source. Check the internet connection, VPN/proxy, and antivirus, then run install.bat again. Details: $($_.Exception.Message)"
    } finally {
        if ($output) { $output.Dispose() }
        if ($input_) { $input_.Dispose() }
        if ($response) { $response.Dispose() }
    }
}

function Assert-FileSha256([string]$Path, [string]$Expected, [string]$FriendlyName) {
    if ($Expected -notmatch '^[0-9a-fA-F]{64}$') {
        throw "The official checksum for $FriendlyName was invalid. Nothing was installed."
    }
    $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash
    if ($actual -ne $Expected) {
        throw "$FriendlyName failed its SHA-256 safety check. Nothing was installed."
    }
}

function Try-InstallWithWinget([string]$Id, [string]$FriendlyName) {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Write-Host "Windows Package Manager is unavailable for $FriendlyName." -ForegroundColor Yellow
        return $false
    }
    Write-Host "Installing $FriendlyName via winget..."
    Invoke-Native { & winget install --id $Id -e --source winget --accept-package-agreements --accept-source-agreements | Out-Host }
    if ($LASTEXITCODE -ne 0) {
        Write-Host "winget could not install $FriendlyName (exit code $LASTEXITCODE)." -ForegroundColor Yellow
        return $false
    }
    return $true
}

function Install-PortableFFmpeg {
    $downloadUrl = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
    $checksumUrl = "$downloadUrl.sha256"
    $archive = Join-Path ([IO.Path]::GetTempPath()) "music-suite-ffmpeg-$PID.zip"
    $stage = Join-Path $toolsRoot ".ffmpeg-stage-$PID"
    $prepared = Join-Path $toolsRoot ".ffmpeg-new-$PID"
    New-Item -ItemType Directory -Path $toolsRoot -Force | Out-Null
    try {
        Invoke-TrustedDownload $downloadUrl $archive "FFmpeg"
        try {
            $checksumText = (Invoke-WebRequest -Uri $checksumUrl -UseBasicParsing).Content.Trim()
        } catch {
            throw "Could not download FFmpeg's official checksum. Nothing was installed."
        }
        $expected = ([regex]::Match($checksumText, '[0-9a-fA-F]{64}')).Value
        Assert-FileSha256 $archive $expected "FFmpeg"
        Expand-Archive -LiteralPath $archive -DestinationPath $stage -Force
        $ffmpeg = Get-ChildItem -LiteralPath $stage -Filter "ffmpeg.exe" -Recurse -File | Select-Object -First 1
        if (-not $ffmpeg -or -not (Test-Path -LiteralPath (Join-Path $ffmpeg.Directory.FullName "ffprobe.exe"))) {
            throw "The verified FFmpeg package did not contain ffmpeg.exe and ffprobe.exe."
        }
        Move-Item -LiteralPath $ffmpeg.Directory.Parent.FullName -Destination $prepared
        $target = Join-Path $toolsRoot "ffmpeg"
        if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
        Move-Item -LiteralPath $prepared -Destination $target
        Add-BundledToolPaths
        Write-Host "FFmpeg is ready inside Music Suite." -ForegroundColor Green
    } finally {
        Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $prepared -Recurse -Force -ErrorAction SilentlyContinue
    }
}

function Install-PortableNode {
    $baseUrl = "https://nodejs.org/dist/latest-v24.x"
    $architecture = Get-WindowsArchitecture
    $archive = Join-Path ([IO.Path]::GetTempPath()) "music-suite-node-$PID.zip"
    $stage = Join-Path $toolsRoot ".node-stage-$PID"
    $prepared = Join-Path $toolsRoot ".node-new-$PID"
    New-Item -ItemType Directory -Path $toolsRoot -Force | Out-Null
    try {
        try {
            $checksums = (Invoke-WebRequest -Uri "$baseUrl/SHASUMS256.txt" -UseBasicParsing).Content
        } catch {
            throw "Could not download Node.js checksums from nodejs.org. Nothing was installed."
        }
        $match = [regex]::Match($checksums, "(?m)^([0-9a-f]{64})\s+(node-v[^\s]+-win-$architecture\.zip)$")
        if (-not $match.Success) { throw "The official Node.js download list did not contain a Windows $architecture package." }
        $fileName = $match.Groups[2].Value
        Invoke-TrustedDownload "$baseUrl/$fileName" $archive "Node.js LTS"
        Assert-FileSha256 $archive $match.Groups[1].Value "Node.js LTS"
        Expand-Archive -LiteralPath $archive -DestinationPath $stage -Force
        $node = Get-ChildItem -LiteralPath $stage -Filter "node.exe" -Recurse -File | Select-Object -First 1
        if (-not $node -or -not (Test-Path -LiteralPath (Join-Path $node.Directory.FullName "npm.cmd"))) {
            throw "The verified Node.js package did not contain node.exe and npm.cmd."
        }
        Move-Item -LiteralPath $node.Directory.FullName -Destination $prepared
        $target = Join-Path $toolsRoot "node"
        if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
        Move-Item -LiteralPath $prepared -Destination $target
        Add-BundledToolPaths
        Write-Host "Node.js is ready inside Music Suite." -ForegroundColor Green
    } finally {
        Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $prepared -Recurse -Force -ErrorAction SilentlyContinue
    }
}

function Install-PortableGit {
    $architecture = Get-WindowsArchitecture
    $assetPattern = if ($architecture -eq "arm64") { '^MinGit-.+-arm64\.zip$' } else { '^MinGit-.+-64-bit\.zip$' }
    $archive = Join-Path ([IO.Path]::GetTempPath()) "music-suite-git-$PID.zip"
    $stage = Join-Path $toolsRoot ".git-stage-$PID"
    New-Item -ItemType Directory -Path $toolsRoot -Force | Out-Null
    try {
        try {
            $headers = @{ "User-Agent" = "Geekatplay-Music-Suite-Installer" }
            $release = Invoke-RestMethod -Uri "https://api.github.com/repos/git-for-windows/git/releases/latest" -Headers $headers
        } catch {
            throw "Could not read the official Git for Windows release information from GitHub."
        }
        $asset = @($release.assets | Where-Object { $_.name -match $assetPattern }) | Select-Object -First 1
        if (-not $asset -or $asset.browser_download_url -notlike "https://github.com/git-for-windows/git/releases/download/*") {
            throw "The official Git for Windows release did not contain the expected portable package."
        }
        $expected = ([string]$asset.digest) -replace '^sha256:', ''
        Invoke-TrustedDownload $asset.browser_download_url $archive "Git for Windows"
        Assert-FileSha256 $archive $expected "Git for Windows"
        Expand-Archive -LiteralPath $archive -DestinationPath $stage -Force
        if (-not (Test-Path -LiteralPath (Join-Path $stage "cmd\git.exe"))) {
            throw "The verified Git package did not contain git.exe."
        }
        $target = Join-Path $toolsRoot "git"
        if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
        Move-Item -LiteralPath $stage -Destination $target
        Add-BundledToolPaths
        Write-Host "Git is ready inside Music Suite." -ForegroundColor Green
    } finally {
        Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
    }
}

function Assert-LastExitCode([string]$Action) {
    if ($LASTEXITCODE -ne 0) {
        throw "$Action failed (exit code $LASTEXITCODE). Review the messages above and run install.bat again."
    }
}

function Refresh-Path {
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    Add-BundledToolPaths
}

function Add-KnownOllamaPath {
    $ollamaFolder = Join-Path $env:LOCALAPPDATA "Programs\Ollama"
    if ((Test-Path -LiteralPath (Join-Path $ollamaFolder "ollama.exe")) -and $env:Path -notlike "*$ollamaFolder*") {
        $env:Path = "$ollamaFolder;$env:Path"
    }
}

function Test-InteractiveConsole {
    return [Environment]::UserInteractive -and -not [Console]::IsInputRedirected
}

function Test-Yes([string]$Answer) {
    return $Answer.Trim().ToLowerInvariant() -in @("y", "yes")
}

# librosa 1.0 and numpy 2.5 need Python 3.12; on older interpreters pip silently
# resolves to outdated releases, so an old Python is treated the same as a missing one.
$minPythonMinor = 12

function Test-PythonVersion([string]$Executable, [string[]]$PrefixArgs = @()) {
    try {
        $checkArgs = @($PrefixArgs) + @("-c", "import sys; raise SystemExit(0 if sys.version_info >= (3, $minPythonMinor) else 1)")
        & $Executable @checkArgs 2>$null | Out-Null
        return $LASTEXITCODE -eq 0
    } catch {
        return $false
    }
}

function Find-SupportedPython {
    $python = Get-Command python -ErrorAction SilentlyContinue
    if ($python -and (Test-PythonVersion $python.Source)) {
        return [PSCustomObject]@{ Executable = $python.Source; PrefixArgs = @() }
    }

    $launcher = Get-Command py -ErrorAction SilentlyContinue
    if ($launcher) {
        foreach ($selector in @("-3", "-3.$minPythonMinor")) {
            if (Test-PythonVersion $launcher.Source @($selector)) {
                return [PSCustomObject]@{ Executable = $launcher.Source; PrefixArgs = @($selector) }
            }
        }
    }

    $perUser = Join-Path $env:LOCALAPPDATA "Programs\Python\Python3$minPythonMinor\python.exe"
    if ((Test-Path -LiteralPath $perUser) -and (Test-PythonVersion $perUser)) {
        return [PSCustomObject]@{ Executable = $perUser; PrefixArgs = @() }
    }
    return $null
}

# Music Suite's own Python, inside its folder (.tools\python), the way ComfyUI's portable build
# carries one: nothing is installed on Windows, no administrator, no PATH change, and it does
# not matter whether, or which, Python the computer has. It is python.org's own build, which
# python.org publishes as a NuGet package (a zip with a full Python, venv and pip included).
# The version is pinned; the download must match a fixed SHA-256 fingerprint (the packages
# nuget.org lists with these SHA-512 hashes) and python.exe must be signed by the Python
# Software Foundation.
$portablePythonVersion = "3.12.10"
$portablePythonPackages = @{
    x64 = @{ Id = "python"; Sha256 = "0EB85C2DFCCCCF1B17352DE4C397F69194035B7D37149EACC16F1147D93DE3B8" }
    arm64 = @{ Id = "pythonarm64"; Sha256 = "E397423B13B1F1DB294CD822B13A695B9F95193F2DC4572FF30DD5CD83B99C37" }
}
$portablePythonDir = Join-Path $toolsRoot "python"

function Install-PortablePython {
    $python = Join-Path $portablePythonDir "python.exe"
    if ((Test-Path -LiteralPath $python) -and (Test-PythonVersion $python @("-I"))) { return $python }
    $package = $portablePythonPackages[(Get-WindowsArchitecture)]
    $name = "Python $portablePythonVersion"
    $archive = Join-Path ([IO.Path]::GetTempPath()) "music-suite-python-$PID.zip"
    $stage = Join-Path $toolsRoot ".python-stage-$PID"
    New-Item -ItemType Directory -Path $toolsRoot -Force | Out-Null
    try {
        $url = "https://api.nuget.org/v3-flatcontainer/$($package.Id)/$portablePythonVersion/$($package.Id).$portablePythonVersion.nupkg"
        Invoke-TrustedDownload $url $archive $name
        Assert-FileSha256 $archive $package.Sha256 $name
        Expand-Archive -LiteralPath $archive -DestinationPath $stage -Force
        $tools = Join-Path $stage "tools"
        $staged = Join-Path $tools "python.exe"
        if (-not (Test-Path -LiteralPath $staged)) { throw "The verified $name package did not contain python.exe." }
        $signature = Get-AuthenticodeSignature -LiteralPath $staged
        if ($signature.Status -ne "Valid" -or $signature.SignerCertificate.Subject -notlike "*Python Software Foundation*") {
            throw "$name did not carry a valid Python Software Foundation signature. Nothing was installed."
        }
        if (Test-Path -LiteralPath $portablePythonDir) { Remove-Item -LiteralPath $portablePythonDir -Recurse -Force }
        Move-Item -LiteralPath $tools -Destination $portablePythonDir
        if (-not (Test-PythonVersion $python @("-I"))) { throw "$name was unpacked but does not run." }
        Write-Host "$name is ready inside Music Suite (nothing was installed on Windows)." -ForegroundColor Green
        return $python
    } finally {
        Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
    }
}

function Find-SystemPython {
    # Music Suite's own Python first: it behaves the same on every computer. A Python already
    # on the computer is used, as it is, only when that download is impossible (nuget.org
    # blocked). Nothing is ever installed on Windows for Python.
    try {
        $portable = Install-PortablePython
        return [PSCustomObject]@{ Executable = $portable; PrefixArgs = @("-I") }
    } catch {
        Write-Host "Music Suite's own Python could not be set up: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "Looking for a Python 3.$minPythonMinor or newer already on this computer instead..." -ForegroundColor Yellow
    }

    $found = Find-SupportedPython
    if ($found) { return $found }
    throw ("Music Suite could not download its own Python from api.nuget.org. Check that this computer can " +
        "reach it (a VPN, proxy or antivirus web filter can block it), then run install.bat again. Music Suite " +
        "does not install Python on Windows.")
}

# Node 20 is end-of-life and the current toolchain needs 22.13 or newer.
function Test-NodeVersion {
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) { return $false }
    try {
        $version = [version]((& $node.Source --version) -replace '^v', '')
        return $version -ge [version]"22.13.0"
    } catch {
        return $false
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

Add-BundledToolPaths

$script:InstallStarted = [Diagnostics.Stopwatch]::StartNew()
function Write-Step([string]$Message) {
    # Every step says how long the install has been going, so a long one is visibly working
    # rather than apparently stuck.
    $elapsed = $script:InstallStarted.Elapsed
    Write-Host ("[{0:mm\:ss}] {1}" -f $elapsed, $Message) -ForegroundColor Cyan
}

try {
    # Clearing would erase the explanation start.ps1 just printed about what is missing.
    # Clearing needs a real console window: with the output captured (a pipe, Tee-Object, CI)
    # PowerShell cannot move the cursor and Clear-Host fails with "CursorPosition".
    if (-not $CoreOnly -and -not [Console]::IsOutputRedirected) {
        try { Clear-Host } catch {}
    }
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host "  Geekatplay Studio Music Suite - Windows Installer" -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "The installer checks every required library and installs anything missing:"
    Write-Host "  - Python 3.12 (its own copy inside this folder), FFmpeg, Node.js and pnpm/npm"
    Write-Host "  - Music Suite Python libraries and the optimized web app"
    Write-Host "  - Troubleshooting log: $installLogPath"
    Write-Host ""

    $completeInstall = (-not $CoreOnly) -and ($FullInstall -or $env:MUSIC_SUITE_INSTALL_ALL -eq "1")
    $completeFailures = @()
    if ($CoreOnly) {
        Write-Host "Running in core-only mode: nothing optional is downloaded and nothing is asked." -ForegroundColor Cyan
        Write-Host ""
    }
    if (-not $CoreOnly -and -not $completeInstall -and -not $env:MUSIC_SUITE_INSTALL_ALL -and (Test-InteractiveConsole)) {
        Write-Host "OPTIONAL COMPLETE INSTALL" -ForegroundColor Yellow
        Write-Host "Download every local AI model and optional instrument too?"
        Write-Host "This enables AI songs, AI editing, XL quality, lyrics, all stem models,"
        Write-Host "and Surge XT. Allow about 30 GB of downloads and at least 45 GB free."
        Write-Host "You can also add these later from Models & engines inside the app."
        Write-Host "Everything stays inside this folder, except that the complete install adds"
        Write-Host "Ollama (lyrics writer) and, for the AI music engine, CMake and C++ build tools to Windows."
        Write-Host ""
        $completeInstall = Test-Yes (Read-Host "Complete install? [y/N]")
    }
    if ($completeInstall) {
        Write-Host "Selected: COMPLETE installation (core app plus all models)." -ForegroundColor Green
        $WithPro = $true
    } elseif ($CoreOnly) {
        Write-Host "Selected: CORE installation (only what is needed to run)." -ForegroundColor Green
    } else {
        Write-Host "Selected: STANDARD installation (core app; models can be added later)." -ForegroundColor Green
    }
    Write-Host ""
    # Scripts from a downloaded ZIP carry a "came from the internet" mark that can make
    # Windows stop and ask about each one; the installer's own scripts are unmarked here.
    $ownScripts = @(Get-ChildItem -LiteralPath $root -File -ErrorAction SilentlyContinue | Where-Object { $_.Extension -in @(".ps1", ".bat", ".cmd") })
    $ownScripts += @(Get-ChildItem -LiteralPath (Join-Path $root "scripts") -File -ErrorAction SilentlyContinue)
    foreach ($script_ in $ownScripts) {
        Unblock-File -LiteralPath $script_.FullName -ErrorAction SilentlyContinue
    }
    Test-InstallPreflight -Complete $completeInstall -FreshInstall (-not (Test-Path -LiteralPath (Join-Path $root ".venv\Scripts\python.exe")))
    Write-Step "Step 1 of 5 - Checking system tools (Python, FFmpeg, Node.js, Git)..."

    if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue) -or -not (Get-Command ffprobe -ErrorAction SilentlyContinue)) {
        # A private copy inside Music Suite's folder (.tools), never a Windows install: a tool
        # already on the computer is used as it is, a missing one is not added to the system.
        Install-PortableFFmpeg
    }

    if (-not (Test-NodeVersion)) { Install-PortableNode }

    if (-not (Get-Command git.exe -ErrorAction SilentlyContinue)) { Install-PortableGit }
    # pnpm runs through "corepack pnpm" (Get-PnpmInvocation). "corepack enable" is not used:
    # it writes shortcuts into Node's own folder, which may be a system-wide Node.js.

    if ($completeInstall) {
        Add-KnownOllamaPath
        if (-not (Get-Command ollama.exe -ErrorAction SilentlyContinue)) {
            $null = Try-InstallWithWinget "Ollama.Ollama" "Ollama (local lyrics model runner)"
            Refresh-Path
            Add-KnownOllamaPath
        }
        if (-not (Get-Command ollama.exe -ErrorAction SilentlyContinue)) {
            Write-Host "Ollama was installed but is not available in this window yet; the lyrics model can be downloaded later." -ForegroundColor Yellow
            $completeFailures += "Ollama"
        } else {
            Invoke-Native { & ollama.exe list 2>$null | Out-Null }
            if ($LASTEXITCODE -ne 0) {
                Write-Host "Starting Ollama for the lyrics-model download..."
                Start-Process -FilePath (Get-Command ollama.exe).Source -ArgumentList "serve" -WindowStyle Hidden
                Start-Sleep -Seconds 3
            }
        }
    }

    Write-Host "System tools are ready." -ForegroundColor Green

    $venvPython = Join-Path $root ".venv\Scripts\python.exe"
    if ((Test-Path -LiteralPath $venvPython) -and -not (Test-PythonVersion $venvPython)) {
        # Too old, or its Python is gone: the Music Suite folder was moved or renamed (the
        # environment records where its Python lives) or the Python it was made from was removed.
        Write-Host "The Python environment (.venv) cannot run here or is older than 3.$minPythonMinor; recreating it..."
        Remove-Item -LiteralPath (Join-Path $root ".venv") -Recurse -Force
    }
    if (-not (Test-Path -LiteralPath $venvPython)) {
        $systemPython = Find-SystemPython
        Write-Host "Creating project virtual environment..."
        $venvArgs = @($systemPython.PrefixArgs) + @("-m", "venv", (Join-Path $root ".venv"))
        Invoke-Native { & $systemPython.Executable @venvArgs }
        Assert-LastExitCode "Creating the Python environment"
    }

    # A running Music Suite holds its Python libraries and web build open, and Windows will not
    # replace a file that is in use: pip fails with "access denied" and a rebuild breaks the open
    # tab. Stop it before touching either (start.bat starts it again).
    if (Test-Path -LiteralPath (Join-Path $root ".music-suite-processes.json")) {
        Write-Host "Stopping the running Music Suite so its files can be updated..."
        try { & (Join-Path $root "stop.ps1") } catch { Write-Warning "Could not stop the running Music Suite: $_" }
    }

    Write-Step "Step 2 of 5 - Checking Music Suite Python libraries..."
    Invoke-Native { & $venvPython -m ensurepip --upgrade }
    Assert-LastExitCode "Preparing pip"
    Invoke-Native { & $venvPython -m pip install --upgrade pip setuptools wheel }
    Assert-LastExitCode "Updating Python installation tools"

    $extras = @("dev", "editor")
    if ($WithGpu) { $extras += "gpu" }
    if ($WithPro) { $extras += "pro" }
    $extraSpec = $extras -join ","
    Write-Host "Installing or updating Music Suite Python dependencies ($extraSpec)..."
    for ($attempt = 1; $attempt -le 2; $attempt++) {
        Invoke-Native { & $venvPython -m pip install --retries 8 --timeout 60 -e ".[${extraSpec}]" }
        if ($LASTEXITCODE -eq 0) { break }
        if ($attempt -eq 2) { Assert-LastExitCode "Installing Music Suite Python libraries" }
        Write-Host "The Python libraries did not finish installing (exit code $LASTEXITCODE). Trying once more in 5 seconds..." -ForegroundColor Yellow
        Start-Sleep -Seconds 5
    }

    $webDir = Join-Path $root "apps\web-next"
    Write-Step "Step 3 of 5 - Installing and building the web app (this is the slowest step)..."
    Invoke-WebAppBuild -WebDir $webDir

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
            Invoke-Native { & $comfyPython -m pip install --upgrade pip setuptools wheel }
            Invoke-Native { & $comfyPython -m pip install soundfile librosa protobuf pystoi torchmetrics torchdiffeq matplotlib einops datasets diffusers transformers accelerate sentencepiece huggingface_hub pydub }
            Invoke-Native { & $comfyPython -m pip install tangoflux --no-deps }
            Invoke-Native { & $comfyPython -m pip install "git+https://github.com/facebookresearch/demucs.git@main#egg=demucs" --no-deps }
            Invoke-Native { & $comfyPython -m pip install "git+https://github.com/suno-ai/bark.git" --no-deps }
            Invoke-Native { & $comfyPython -m pip install "git+https://github.com/facebookresearch/audiocraft.git" --no-deps }
        }
    }

    Write-Step "Step 4 of 5 - Optional models and instruments..."

    # --- Optional: local AI music engine (AI Song Studio) ---
    # Asks once and remembers a "no". MUSIC_SUITE_INSTALL_AI=1 installs without asking, =0 skips.
    # A failure here never fails the install: the engine can be installed later with one click
    # from AI Song Studio > Settings.
    $aiChoice = if ($CoreOnly) { "0" } elseif ($completeInstall) { "1" } elseif ($env:MUSIC_SUITE_INSTALL_AI) { $env:MUSIC_SUITE_INSTALL_AI } else { "0" }
    if ($aiChoice -eq "0") {
        Write-Host "The local AI music engine is not part of this installation. Add it any time from"
        Write-Host "AI Song Studio > Settings, or Models & engines, inside Music Suite."
    } else {
        $aiArgs = if ($completeInstall) { @("--yes") } elseif ($aiChoice -eq "1") { @("--yes") } else { @("--ask") }
        Invoke-Native { & $venvPython -m audioqi.generation.setup @aiArgs }
        if ($LASTEXITCODE -ne 0) {
            Write-Host "The AI music engine was not installed. Music Suite itself is ready." -ForegroundColor Yellow
            if ($completeInstall) { $completeFailures += "AI music engine and editing model" }
        }
        $global:LASTEXITCODE = 0
    }

    if ($completeInstall) {
        Write-Host "Downloading the Ollama lyrics model (about 8 GB)..."
        Invoke-Native { & $venvPython -m audioqi.generation.setup --writer-only }
        if ($LASTEXITCODE -ne 0) {
            Write-Host "The lyrics model was not installed. Run install.bat again to retry." -ForegroundColor Yellow
            $completeFailures += "lyrics model"
        }
        $global:LASTEXITCODE = 0

        Write-Host "Downloading the high-quality XL music model (about 4.9 GB)..."
        Invoke-Native { & $venvPython -m audioqi.generation.setup --quality }
        if ($LASTEXITCODE -ne 0) {
            Write-Host "The XL model was not installed. Try again from Models & engines in the app." -ForegroundColor Yellow
            $completeFailures += "high-quality XL model"
        }
        $global:LASTEXITCODE = 0
    }

    # --- Optional: AI stem separation (6 stems, drum kit pieces, lead/backing vocals) ---
    # -WithAiStems or MUSIC_SUITE_INSTALL_STEMS=1. Uses the NVIDIA GPU when there is one.
    # Also available any time from Models & engines in the app.
    if (-not $CoreOnly -and ($completeInstall -or $WithAiStems -or $env:MUSIC_SUITE_INSTALL_STEMS -eq "1")) {
        Write-Host "Installing AI stem separation (about 3 GB with GPU support, plus models)..."
        Invoke-Native { & $venvPython -m audioqi.addons install stems --models all }
        if ($LASTEXITCODE -ne 0) {
            Write-Host "AI stem separation was not installed. Try again from Models & engines in the app." -ForegroundColor Yellow
            if ($completeInstall) { $completeFailures += "AI stem separation and models" }
        }
        $global:LASTEXITCODE = 0
    }

    # --- Optional: Surge XT synthesizer (free, 3,000 sounds; plays MIDI clips in the Studio Editor) ---
    # MUSIC_SUITE_INSTALL_SURGE=1. Also available any time from Models & engines in the app.
    if (-not $CoreOnly -and ($completeInstall -or $env:MUSIC_SUITE_INSTALL_SURGE -eq "1")) {
        Write-Host "Installing the Surge XT synthesizer (about 300 MB)..."
        Invoke-Native { & $venvPython -m audioqi.editor.instruments install surge-xt }
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Surge XT was not installed. Try again from Models & engines in the app." -ForegroundColor Yellow
            if ($completeInstall) { $completeFailures += "Surge XT" }
        }
        $global:LASTEXITCODE = 0
    }

    Write-Step "Step 5 of 5 - Saving installation status..."
    # Only the dependency lists are recorded, never the git commit: see scripts/install-state.ps1.
    $installedState = Get-MusicSuiteDependencyState -Root $root -WebDir $webDir -WithWebBuild
    Write-MusicSuiteInstallState -Path (Join-Path $root ".music-suite-install-state") -State $installedState
    if ($completeInstall -and $completeFailures.Count -gt 0) {
        Write-Host ""
        Write-Host "The core app is installed, but the complete installation still needs:" -ForegroundColor Yellow
        foreach ($item in $completeFailures) { Write-Host "  - $item" -ForegroundColor Yellow }
        throw "Complete installation is not yet 100%. Check the messages above, then run install.bat again to retry."
    }
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host "  Music Suite is installed!" -ForegroundColor Green
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host "Next: double-click start.bat"
    if (-not $completeInstall) {
        Write-Host "Optional AI features: open Models & engines inside Music Suite."
    }
} catch {
    $script:installFailed = $true
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Red
    Write-Host "  Music Suite could not finish installing" -ForegroundColor Red
    Write-Host "============================================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "What went wrong:" -ForegroundColor Yellow
    Write-Host "  $($_.Exception.Message)"
    Write-Host ""
    Write-Host "What to do:" -ForegroundColor Yellow
    Write-Host "  1. Run install.bat again. It keeps everything already done and carries on from there."
    Write-Host "  2. If it stops at the same place, restart Windows and run install.bat once more."
    Write-Host "  3. Still stuck? The full record of this install is in:"
    Write-Host "     $installLogPath"
    Write-Host ""
} finally {
    if ($transcriptStarted) { Stop-Transcript -ErrorAction SilentlyContinue | Out-Null }
    Pop-Location
}
if (-not $CoreOnly) { Wait-IfOwnWindow "install.ps1" }
if ($script:installFailed) { exit 1 }
