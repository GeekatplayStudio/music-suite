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

function Get-MusicSuiteDependencyState {
    <#
        .SYNOPSIS
        Hashes of what the installed Python and web dependencies should be right now.
    #>
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)][string]$WebDir
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
    return [PSCustomObject]@{
        schema = $script:InstallStateSchema
        python = $pythonHash
        web    = $webHash
    }
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
        `Stale` is installed but built from a different dependency list; the app still runs,
        so startup reports it and carries on rather than reinstalling behind the user's back.
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
            $stale += [PSCustomObject]@{ Component = "python"; Detail = "the Python dependency list in pyproject.toml changed since the last install" }
        }
        if ($recorded.web -ne $current.web) {
            $stale += [PSCustomObject]@{ Component = "web"; Detail = "pnpm-lock.yaml changed since the last install" }
        }
    }

    return [PSCustomObject]@{
        Missing  = @($missing)
        Stale    = @($stale)
        Current  = $current
        Recorded = $recorded
        # Ready means it will run. Stale dependencies do not stop it running.
        Ready    = ($missing.Count -eq 0)
    }
}
