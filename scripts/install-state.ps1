# Shared between install.ps1 and start.ps1: what is installed, what is missing, what changed.
#
# The point of this file is that starting Music Suite must not reinstall it. Earlier the
# recorded state was one hash of pyproject.toml + pnpm-lock.yaml + **the git commit**, so
# every commit, branch switch or pull made startup throw away a working installation and
# download everything again. Renaming an author in pyproject.toml did the same.
#
# So two things changed:
#   * the commit is not part of the state at all, and only the dependency-bearing parts of
#     pyproject.toml are hashed, not its description, version or authors;
#   * Python and web are tracked separately, so a change to one never reinstalls the other.
#
# Written for Windows PowerShell 5.1: no ternary, no ?? and no -AsHashtable.
#
# Dot-sourced, so it deliberately sets no Set-StrictMode and no $ErrorActionPreference:
# either would silently change how install.ps1 and start.ps1 behave around it.

$script:InstallStateSchema = 3

function Get-PyprojectDependencyText {
    <#
        .SYNOPSIS
        The parts of pyproject.toml that decide what pip installs, and nothing else.

        Takes `requires-python`, the [project] dependencies array and the whole
        [project.optional-dependencies] table. Metadata such as the version, description
        and authors is left out on purpose: editing those must not trigger a reinstall.
    #>
    param([Parameter(Mandatory = $true)][string]$Path)

    $kept = @()
    $inDependencies = $false
    $inOptional = $false
    foreach ($rawLine in (Get-Content -LiteralPath $Path)) {
        $line = $rawLine.Trim()
        if ($inDependencies) {
            $kept += $line
            if ($line -eq "]") { $inDependencies = $false }
            continue
        }
        if ($inOptional) {
            # The table runs until the next section header.
            if ($line -match '^\[') { $inOptional = $false }
            else {
                if ($line) { $kept += $line }
                continue
            }
        }
        if ($line -match '^requires-python\s*=') { $kept += $line; continue }
        if ($line -match '^dependencies\s*=\s*\[') {
            $kept += $line
            # A single-line array opens and closes on the same line.
            if ($line -notmatch '\]\s*$') { $inDependencies = $true }
            continue
        }
        if ($line -match '^\[project\.optional-dependencies\]') { $inOptional = $true; continue }
    }
    return ($kept -join "`n")
}

function Get-TextSha256 {
    param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Text)
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [Text.Encoding]::UTF8.GetBytes($Text)
        return -join ($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString("x2") })
    } finally {
        $sha.Dispose()
    }
}

function Get-MusicSuiteWebSourceHash {
    <#
        .SYNOPSIS
        One hash of everything the built web app is made from.

        The build is not rebuilt just because it exists: after an update the source changes
        while the old build stays on disk, and starting would keep serving the old app. This
        hash is recorded when the app is built, and a different hash at start means "build
        again". It covers the web app's own files (not its libraries or its build output) and
        the user manual, which the Help page reads when it is built. About 120 small files,
        hashed in a fraction of a second.
    #>
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)][string]$WebDir
    )
    $skip = @("node_modules", ".next", "next-env.d.ts")
    $files = @()
    if (Test-Path -LiteralPath $WebDir) {
        foreach ($item in (Get-ChildItem -LiteralPath $WebDir -Force)) {
            if ($skip -contains $item.Name -or $item.Name -like "*.tsbuildinfo") { continue }
            if ($item.PSIsContainer) { $files += @(Get-ChildItem -LiteralPath $item.FullName -Recurse -File -Force) }
            else { $files += $item }
        }
    }
    $manual = Join-Path $Root "docs\USER_MANUAL.md"
    if (Test-Path -LiteralPath $manual) { $files += Get-Item -LiteralPath $manual }
    $lines = foreach ($file in ($files | Sort-Object FullName)) {
        $relative = $file.FullName.Substring($Root.Length).TrimStart('\').ToLowerInvariant()
        "$relative $((Get-FileHash -Algorithm SHA256 -LiteralPath $file.FullName).Hash)"
    }
    return Get-TextSha256 (@($lines) -join "`n")
}

function Get-MusicSuiteDependencyState {
    <#
        .SYNOPSIS
        Hashes of what the installed Python and web dependencies should be right now.
    #>
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)][string]$WebDir,
        # Include the hash of the web app's source, for recording right after a build.
        [switch]$WithWebBuild
    )
    $pyprojectPath = Join-Path $Root "pyproject.toml"
    $lockPath = Join-Path $WebDir "pnpm-lock.yaml"
    $pythonHash = "no-pyproject"
    if (Test-Path -LiteralPath $pyprojectPath) {
        $pythonHash = Get-TextSha256 (Get-PyprojectDependencyText $pyprojectPath)
    }
    $webHash = "no-lockfile"
    if (Test-Path -LiteralPath $lockPath) {
        $webHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $lockPath).Hash.ToLowerInvariant()
    }
    $state = [ordered]@{
        schema = $script:InstallStateSchema
        python = $pythonHash
        web    = $webHash
    }
    if ($WithWebBuild) { $state.webBuild = Get-MusicSuiteWebSourceHash -Root $Root -WebDir $WebDir }
    return [PSCustomObject]$state
}

function Read-MusicSuiteInstallState {
    <#
        .SYNOPSIS
        The recorded state, or $null when there is none this version understands.

        A file written by an older installer was one long hyphen-joined string that included
        the git commit. It is not worth interpreting: it is treated as "unknown", which means
        anything already on disk is accepted and only genuinely missing pieces are installed.
    #>
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    $raw = (Get-Content -Raw -LiteralPath $Path).Trim()
    if (-not $raw -or -not $raw.StartsWith("{")) { return $null }
    try {
        $parsed = $raw | ConvertFrom-Json
    } catch {
        return $null
    }
    if (-not $parsed.PSObject.Properties.Match("schema").Count) { return $null }
    if ([int]$parsed.schema -ne $script:InstallStateSchema) { return $null }
    return $parsed
}

function Write-MusicSuiteInstallState {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)]$State
    )
    $State | ConvertTo-Json | Set-Content -LiteralPath $Path -Encoding ascii
}

function Get-MusicSuiteReadiness {
    <#
        .SYNOPSIS
        What is installed, what is missing and what has changed since it was installed.

        `Missing` is what genuinely stops the app running, so it has to be installed.
        `Stale` is installed from a different dependency list than this version asks for,
        which happens after an update. Start brings it up to date, because the updater
        promises exactly that and a new version can fail on old libraries. This is only
        ever true after something really changed, never on an ordinary start.
        `Rebuild` means the web app's source changed since it was built (also after an
        update), so the old build would keep being served.
    #>
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)][string]$WebDir,
        [Parameter(Mandatory = $true)][string]$StatePath
    )

    # Plain arrays, not System.Collections.Generic.List: Windows PowerShell 5.1 cannot cast
    # a hashtable holding a generic list to [PSCustomObject] ("Argument types do not match").
    $missing = @()
    $stale = @()

    $venvPython = Join-Path $Root ".venv\Scripts\python.exe"
    if (-not (Test-Path -LiteralPath $venvPython)) {
        $missing += [PSCustomObject]@{ Component = "python"; Detail = "the Python environment (.venv) has not been created" }
    }
    foreach ($tool in @(
        @{ Command = "node.exe"; Detail = "Node.js is not on PATH" },
        @{ Command = "ffmpeg.exe"; Detail = "FFmpeg is not on PATH" },
        @{ Command = "ffprobe.exe"; Detail = "FFprobe is not on PATH" }
    )) {
        if (-not (Get-Command $tool.Command -ErrorAction SilentlyContinue)) {
            $missing += [PSCustomObject]@{ Component = "tools"; Detail = $tool.Detail }
        }
    }
    if (-not (Test-Path -LiteralPath (Join-Path $WebDir "node_modules"))) {
        $missing += [PSCustomObject]@{ Component = "web"; Detail = "the web app's libraries (node_modules) are not installed" }
    }
    if (-not (Test-Path -LiteralPath (Join-Path $WebDir ".next\BUILD_ID"))) {
        $missing += [PSCustomObject]@{ Component = "web-build"; Detail = "the web app has not been built" }
    }

    $current = Get-MusicSuiteDependencyState -Root $Root -WebDir $WebDir
    $recorded = Read-MusicSuiteInstallState -Path $StatePath
    if ($recorded) {
        if ($recorded.python -ne $current.python) {
            $stale += [PSCustomObject]@{ Component = "python"; Detail = "this version needs different Python libraries" }
        }
        if ($recorded.web -ne $current.web) {
            $stale += [PSCustomObject]@{ Component = "web"; Detail = "this version needs different web libraries" }
        }
    }

    # A build made before the source hash was recorded is of unknown age: build it once.
    $rebuild = $false
    if ($missing.Count -eq 0 -and $stale.Count -eq 0) {
        $builtFrom = $null
        if ($recorded -and $recorded.PSObject.Properties.Match("webBuild").Count) { $builtFrom = $recorded.webBuild }
        $rebuild = ($builtFrom -ne (Get-MusicSuiteWebSourceHash -Root $Root -WebDir $WebDir))
    }

    return [PSCustomObject]@{
        Missing  = @($missing)
        Stale    = @($stale)
        Rebuild  = $rebuild
        Current  = $current
        Recorded = $recorded
        # Ready means it will run as it is; Stale and Rebuild are brought up to date first.
        Ready    = ($missing.Count -eq 0)
    }
}

function Invoke-Native {
    <#
        .SYNOPSIS
        Run an external program and judge it only by its exit code ($LASTEXITCODE).

        Windows PowerShell turns every line a program writes to stderr into an error record
        when the output is being captured (a log, a pipe, `npm run`), and with
        $ErrorActionPreference = "Stop" the first such line ends the script. pip, pnpm and git
        all write progress and warnings there, so a perfectly good install could stop at its
        first warning depending on how it was started. Here those lines are just output.
    #>
    param([Parameter(Mandatory = $true)][scriptblock]$Command)
    $ErrorActionPreference = "Continue"
    & $Command
}

function Get-PnpmInvocation {
    <#
        .SYNOPSIS
        How to run pnpm on this computer: its own command, through corepack, or npm.

        `corepack enable` writes shims into Node's folder, which needs administrator rights
        when Node is installed for all users, so a failed enable must not end the install.
        `corepack pnpm` runs the same pinned pnpm with no shims at all. Corepack would also
        stop to ask before downloading pnpm, with nobody there to answer, so it is told not to.
    #>
    $env:COREPACK_ENABLE_DOWNLOAD_PROMPT = "0"
    $pnpm = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
    if ($pnpm) { return [PSCustomObject]@{ Exe = $pnpm.Source; Prefix = @(); Name = "pnpm" } }
    $corepack = Get-Command corepack.cmd -ErrorAction SilentlyContinue
    if (-not $corepack) { $corepack = Get-Command corepack -ErrorAction SilentlyContinue }
    if ($corepack) { return [PSCustomObject]@{ Exe = $corepack.Source; Prefix = @("pnpm"); Name = "pnpm" } }
    $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if ($npm) { return [PSCustomObject]@{ Exe = $npm.Source; Prefix = @(); Name = "npm" } }
    return $null
}

function Invoke-WebAppBuild {
    <#
        .SYNOPSIS
        Install the web app's libraries (unless -BuildOnly) and build it. Throws on failure.

        Each step is tried twice: a dropped connection or an antivirus scan holding a file
        open is the usual reason a first attempt fails, and both are gone a moment later.
    #>
    param(
        [Parameter(Mandatory = $true)][string]$WebDir,
        [switch]$BuildOnly
    )
    $runner = Get-PnpmInvocation
    if (-not $runner) { throw "Node.js's package tools (pnpm, corepack or npm) were not found. Run install.bat." }
    $steps = @()
    $installArgs = @("install")
    if ($runner.Name -eq "pnpm" -and $env:MUSIC_SUITE_CACHE) {
        # Keep pnpm's store and caches inside Music Suite's folder (Set-MusicSuitePortableEnvironment).
        # A store moved here makes pnpm rebuild node_modules once; it must not stop to ask.
        $cache = $env:MUSIC_SUITE_CACHE
        $installArgs += @("--store-dir=$cache\pnpm-store", "--config.cache-dir=$cache\pnpm",
            "--config.state-dir=$cache\pnpm-state", "--config.confirm-modules-purge=false")
    }
    if (-not $BuildOnly) { $steps += ,@("Installing the web app's libraries", $installArgs) }
    if ($runner.Name -eq "pnpm") { $steps += ,@("Building the web app", @("build")) }
    else { $steps += ,@("Building the web app", @("run", "build")) }

    Push-Location $WebDir
    try {
        foreach ($step in $steps) {
            $label = $step[0]
            $commandArgs = @($runner.Prefix) + @($step[1])
            for ($attempt = 1; $attempt -le 2; $attempt++) {
                Invoke-Native { & $runner.Exe @commandArgs }
                if ($LASTEXITCODE -eq 0) { break }
                if ($attempt -eq 2) { throw "$label failed (exit code $LASTEXITCODE)." }
                Write-Host "$label did not finish (exit code $LASTEXITCODE). Trying once more in 5 seconds..." -ForegroundColor Yellow
                Start-Sleep -Seconds 5
            }
        }
    } finally {
        Pop-Location
    }
}

function Add-PathFolder {
    <# Put a folder first on PATH for this session, unless it is already there. #>
    param([Parameter(Mandatory = $true)][string]$Folder)
    if (-not (Test-Path -LiteralPath $Folder)) { return }
    # IndexOf, not -like: a folder name with [ or ] in it is a wildcard pattern to -like.
    $current = ";" + $env:Path + ";"
    if ($current.IndexOf(";" + $Folder + ";", [StringComparison]::OrdinalIgnoreCase) -lt 0) {
        $env:Path = "$Folder;$env:Path"
    }
}

function Wait-IfOwnWindow([string]$ScriptName) {
    <#
        .SYNOPSIS
        Keep the window open when a script was started on its own.

        Right-clicking install.ps1 or start.ps1 and choosing "Run with PowerShell" runs it in a
        window that closes the moment the script ends, taking the explanation of what went
        wrong with it: to the person it looks as if the installer "just closed". The .bat files
        keep their own window open (they set MUSIC_SUITE_LAUNCHER), and a script run from a
        PowerShell window someone opened needs no pause, so this waits only when the script's
        name is on this PowerShell's own command line.
    #>
    if ($env:MUSIC_SUITE_LAUNCHER -eq "bat") { return }
    if (-not [Environment]::UserInteractive -or [Console]::IsInputRedirected) { return }
    if ([Environment]::CommandLine -notmatch [regex]::Escape($ScriptName)) { return }
    Write-Host ""
    try { Read-Host "Press Enter to close this window" | Out-Null } catch {}
}

function Set-MusicSuitePortableEnvironment {
    <#
        .SYNOPSIS
        Keep every download cache inside Music Suite's folder, for this session and the programs
        it starts.

        pip, npm, pnpm and corepack keep caches in the user's profile by default
        (%LOCALAPPDATA%\pip, npm-cache, pnpm\store, node\corepack). Music Suite is portable,
        like ComfyUI Portable: what it adds stays in its folder, and deleting the folder removes
        it. A variable the user set is kept. Python-side caches (models) are handled by
        audioqi/portable.py.
    #>
    param([Parameter(Mandatory = $true)][string]$Root)
    $cache = Join-Path $Root ".cache"
    $values = [ordered]@{
        # Read by Invoke-WebAppBuild: pnpm 11 and newer ignore npm_config_* for its own
        # settings, so the store and caches are also passed on its command line.
        MUSIC_SUITE_CACHE = $cache
        PIP_CACHE_DIR = (Join-Path $cache "pip")
        npm_config_cache = (Join-Path $cache "npm")
        npm_config_store_dir = (Join-Path $cache "pnpm-store")
        npm_config_cache_dir = (Join-Path $cache "pnpm")
        npm_config_state_dir = (Join-Path $cache "pnpm-state")
        COREPACK_HOME = (Join-Path $cache "corepack")
        # A store moved here makes pnpm rebuild node_modules once; it must not stop to ask.
        npm_config_confirm_modules_purge = "false"
        # Next.js would otherwise write its telemetry setting into the user's profile.
        NEXT_TELEMETRY_DISABLED = "1"
        # Packages in the user's own Python folder must not leak into Music Suite's Python.
        PYTHONNOUSERSITE = "1"
    }
    foreach ($name in $values.Keys) {
        if (-not [Environment]::GetEnvironmentVariable($name, "Process")) {
            [Environment]::SetEnvironmentVariable($name, $values[$name], "Process")
        }
    }
}
