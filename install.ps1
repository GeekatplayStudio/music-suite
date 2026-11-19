param(
    [switch]$WithGpu,
    [switch]$WithPro,
    [switch]$WithAiStems,
    [switch]$FullInstall,
    [string]$ComfyUIPath,
    [switch]$InstallComfyDependencies
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$toolsRoot = Join-Path $root ".tools"
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
Push-Location $root
$installLogDir = Join-Path $root "logs"
$installLogPath = Join-Path $installLogDir "install.log"
$transcriptStarted = $false
try {
    New-Item -ItemType Directory -Path $installLogDir -Force | Out-Null
    Start-Transcript -Path $installLogPath -Append | Out-Null
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
        if ((Test-Path -LiteralPath $folder) -and $env:Path -notlike "*$folder*") {
            $env:Path = "$folder;$env:Path"
        }
    }
}

function Invoke-TrustedDownload([string]$Uri, [string]$Destination, [string]$FriendlyName) {
    Write-Host "Downloading $FriendlyName from $(([uri]$Uri).Host)..."
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
        $oldProgress = $ProgressPreference
        $ProgressPreference = "SilentlyContinue"
        try {
            Invoke-WebRequest -Uri $Uri -OutFile $Destination -UseBasicParsing
        } finally {
            $ProgressPreference = $oldProgress
        }
    } catch {
        throw "Could not download $FriendlyName from its official source. Check the internet connection, VPN/proxy, and antivirus, then run install.bat again. Details: $($_.Exception.Message)"
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
    & winget install --id $Id -e --source winget --accept-package-agreements --accept-source-agreements | Out-Host
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

function Install-PythonDirect {
    $version = "3.12.10"
    $architecture = Get-WindowsArchitecture
    $suffix = if ($architecture -eq "arm64") { "-arm64" } else { "-amd64" }
    $installer = Join-Path ([IO.Path]::GetTempPath()) "music-suite-python-$version$suffix.exe"
    $url = "https://www.python.org/ftp/python/$version/python-$version$suffix.exe"
    try {
        Invoke-TrustedDownload $url $installer "Python $version"
        $signature = Get-AuthenticodeSignature -LiteralPath $installer
        if ($signature.Status -ne "Valid" -or $signature.SignerCertificate.Subject -notlike "*Python Software Foundation*") {
            throw "The Python installer did not have a valid Python Software Foundation signature. Nothing was installed."
        }
        Write-Host "Installing Python $version for this Windows user..."
        $process = Start-Process -FilePath $installer -ArgumentList @(
            "/quiet", "InstallAllUsers=0", "PrependPath=1", "Include_test=0",
            "Include_launcher=1", "InstallLauncherAllUsers=0"
        ) -Wait -PassThru
        if ($process.ExitCode -ne 0) { throw "Python setup failed (exit code $($process.ExitCode))." }
        Refresh-Path
    } finally {
        Remove-Item -LiteralPath $installer -Force -ErrorAction SilentlyContinue
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

function Find-SystemPython {
    $found = Find-SupportedPython
    if ($found) { return $found }

    $null = Try-InstallWithWinget "Python.Python.3.$minPythonMinor" "Python 3.$minPythonMinor"
    Refresh-Path

    $found = Find-SupportedPython
    if ($found) { return $found }
    Install-PythonDirect
    $found = Find-SupportedPython
    if ($found) { return $found }
    throw "Python 3.$minPythonMinor could not be found after installation. Restart Windows, then run install.bat again."
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

try {
    Clear-Host
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host "  Geekatplay Studio Music Suite - Windows Installer" -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "The installer checks every required library and installs anything missing:"
    Write-Host "  - Python 3.12+, FFmpeg, Node.js and pnpm/npm"
    Write-Host "  - Music Suite Python libraries and the optimized web app"
    Write-Host "  - Troubleshooting log: $installLogPath"
    Write-Host ""

    $completeInstall = $FullInstall -or $env:MUSIC_SUITE_INSTALL_ALL -eq "1"
    $completeFailures = @()
    if (-not $completeInstall -and -not $env:MUSIC_SUITE_INSTALL_ALL -and (Test-InteractiveConsole)) {
        Write-Host "OPTIONAL COMPLETE INSTALL" -ForegroundColor Yellow
        Write-Host "Download every local AI model and optional instrument too?"
        Write-Host "This enables AI songs, AI editing, XL quality, lyrics, all stem models,"
        Write-Host "and Surge XT. Allow about 30 GB of downloads and at least 45 GB free."
        Write-Host "You can also add these later from Models & engines inside the app."
        Write-Host ""
        $completeInstall = Test-Yes (Read-Host "Complete install? [y/N]")
    }
    if ($completeInstall) {
        Write-Host "Selected: COMPLETE installation (core app plus all models)." -ForegroundColor Green
        $WithPro = $true
    } else {
        Write-Host "Selected: STANDARD installation (core app; models can be added later)." -ForegroundColor Green
    }
    Write-Host ""
    Write-Host "Step 1 of 5 - Checking system tools..." -ForegroundColor Cyan

    if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue) -or -not (Get-Command ffprobe -ErrorAction SilentlyContinue)) {
        $null = Try-InstallWithWinget "Gyan.FFmpeg" "FFmpeg"
        Refresh-Path
        if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue) -or -not (Get-Command ffprobe -ErrorAction SilentlyContinue)) {
            Install-PortableFFmpeg
        }
    }

    if (-not (Test-NodeVersion)) {
        $null = Try-InstallWithWinget "OpenJS.NodeJS.LTS" "Node.js LTS"
        Refresh-Path
        if (-not (Test-NodeVersion)) { Install-PortableNode }
    }

    if (-not (Get-Command git.exe -ErrorAction SilentlyContinue)) {
        $null = Try-InstallWithWinget "Git.Git" "Git"
        Refresh-Path
        if (-not (Get-Command git.exe -ErrorAction SilentlyContinue)) { Install-PortableGit }
    }

    if (-not (Get-Command pnpm.cmd -ErrorAction SilentlyContinue) -and (Get-Command corepack -ErrorAction SilentlyContinue)) {
        Write-Host "Enabling pnpm via corepack..."
        & corepack enable
        Assert-LastExitCode "Enabling pnpm"
    }

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
            & ollama.exe list 2>$null | Out-Null
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
        Write-Host "The existing virtual environment uses a Python older than 3.$minPythonMinor; recreating it..."
        Remove-Item -LiteralPath (Join-Path $root ".venv") -Recurse -Force
    }
    if (-not (Test-Path -LiteralPath $venvPython)) {
        $systemPython = Find-SystemPython
        Write-Host "Creating project virtual environment..."
        $venvArgs = @($systemPython.PrefixArgs) + @("-m", "venv", (Join-Path $root ".venv"))
        & $systemPython.Executable @venvArgs
        Assert-LastExitCode "Creating the Python environment"
    }

    Write-Host "Step 2 of 5 - Checking Music Suite libraries..." -ForegroundColor Cyan
    & $venvPython -m ensurepip --upgrade
    Assert-LastExitCode "Preparing pip"
    & $venvPython -m pip install --upgrade pip setuptools wheel
    Assert-LastExitCode "Updating Python installation tools"

    $extras = @("dev", "editor")
    if ($WithGpu) { $extras += "gpu" }
    if ($WithPro) { $extras += "pro" }
    $extraSpec = $extras -join ","
    Write-Host "Installing or updating Music Suite Python dependencies ($extraSpec)..."
    & $venvPython -m pip install -e ".[${extraSpec}]"
    Assert-LastExitCode "Installing Music Suite Python libraries"

    $webDir = Join-Path $root "apps\web-next"
    # A running site keeps serving pages that point at the old build's files; rebuilding under
    # it makes the open tab fail with 500s and ChunkLoadError. Stop it first (start.bat restarts it).
    if (Test-Path -LiteralPath (Join-Path $root ".music-suite-processes.json")) {
        Write-Host "Stopping the running Music Suite before rebuilding the web app..."
        try { & (Join-Path $root "stop.ps1") } catch { Write-Warning "Could not stop the running Music Suite: $_" }
    }
    Write-Host "Step 3 of 5 - Installing and building the web app..." -ForegroundColor Cyan
    Push-Location $webDir
    try {
        if (Get-Command pnpm.cmd -ErrorAction SilentlyContinue) {
            & pnpm.cmd install
            Assert-LastExitCode "Installing web libraries"
            & pnpm.cmd build
            Assert-LastExitCode "Building the Music Suite web app"
        } elseif (Get-Command npm.cmd -ErrorAction SilentlyContinue) {
            & npm.cmd install
            Assert-LastExitCode "Installing web libraries"
            & npm.cmd run build
            Assert-LastExitCode "Building the Music Suite web app"
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

    Write-Host "Step 4 of 5 - Optional models and instruments..." -ForegroundColor Cyan

    # --- Optional: local AI music engine (AI Song Studio) ---
    # Asks once and remembers a "no". MUSIC_SUITE_INSTALL_AI=1 installs without asking, =0 skips.
    # A failure here never fails the install: the engine can be installed later with one click
    # from AI Song Studio > Settings.
    $aiChoice = if ($completeInstall) { "1" } elseif ($env:MUSIC_SUITE_INSTALL_AI) { $env:MUSIC_SUITE_INSTALL_AI } else { "0" }
    if ($aiChoice -eq "0") {
        Write-Host "Skipping the local AI music engine (MUSIC_SUITE_INSTALL_AI=0)."
    } else {
        $aiArgs = if ($completeInstall) { @("--yes") } elseif ($aiChoice -eq "1") { @("--yes") } else { @("--ask") }
        & $venvPython -m audioqi.generation.setup @aiArgs
        if ($LASTEXITCODE -ne 0) {
            Write-Host "The AI music engine was not installed. Music Suite itself is ready." -ForegroundColor Yellow
            if ($completeInstall) { $completeFailures += "AI music engine and editing model" }
        }
        $global:LASTEXITCODE = 0
    }

    if ($completeInstall) {
        Write-Host "Downloading the Ollama lyrics model (about 8 GB)..."
        & $venvPython -m audioqi.generation.setup --writer-only
        if ($LASTEXITCODE -ne 0) {
            Write-Host "The lyrics model was not installed. Run install.bat again to retry." -ForegroundColor Yellow
            $completeFailures += "lyrics model"
        }
        $global:LASTEXITCODE = 0

        Write-Host "Downloading the high-quality XL music model (about 4.9 GB)..."
        & $venvPython -m audioqi.generation.setup --quality
        if ($LASTEXITCODE -ne 0) {
            Write-Host "The XL model was not installed. Try again from Models & engines in the app." -ForegroundColor Yellow
            $completeFailures += "high-quality XL model"
        }
        $global:LASTEXITCODE = 0
    }

    # --- Optional: AI stem separation (6 stems, drum kit pieces, lead/backing vocals) ---
    # -WithAiStems or MUSIC_SUITE_INSTALL_STEMS=1. Uses the NVIDIA GPU when there is one.
    # Also available any time from Models & engines in the app.
    if ($completeInstall -or $WithAiStems -or $env:MUSIC_SUITE_INSTALL_STEMS -eq "1") {
        Write-Host "Installing AI stem separation (about 3 GB with GPU support, plus models)..."
        & $venvPython -m audioqi.addons install stems --models all
        if ($LASTEXITCODE -ne 0) {
            Write-Host "AI stem separation was not installed. Try again from Models & engines in the app." -ForegroundColor Yellow
            if ($completeInstall) { $completeFailures += "AI stem separation and models" }
        }
        $global:LASTEXITCODE = 0
    }

    # --- Optional: Surge XT synthesizer (free, 3,000 sounds; plays MIDI clips in the Studio Editor) ---
    # MUSIC_SUITE_INSTALL_SURGE=1. Also available any time from Models & engines in the app.
    if ($completeInstall -or $env:MUSIC_SUITE_INSTALL_SURGE -eq "1") {
        Write-Host "Installing the Surge XT synthesizer (about 300 MB)..."
        & $venvPython -m audioqi.editor.instruments install surge-xt
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Surge XT was not installed. Try again from Models & engines in the app." -ForegroundColor Yellow
            if ($completeInstall) { $completeFailures += "Surge XT" }
        }
        $global:LASTEXITCODE = 0
    }

    Write-Host "Step 5 of 5 - Saving installation status..." -ForegroundColor Cyan
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
} finally {
    if ($transcriptStarted) { Stop-Transcript -ErrorAction SilentlyContinue | Out-Null }
    Pop-Location
}
