# BootstrapSupplyChain.ps1 — pinned-checkout and runtime supply-chain guards.
#
# Every git-backed install must resolve to an operator-pinned commit, refuse
# dirty checkouts, and never race a concurrently created target path. pnpm
# runtime provisioning is version-pinned through Get-BootstrapDependency.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Install the pinned pnpm version through npm when the active pnpm does not
# already match. The version check is authoritative; a matching runtime is
# left untouched so repeated boots stay side-effect free.
function Ensure-Pnpm {
    [CmdletBinding()]
    param()

    $dependency = Get-BootstrapDependency
    $expectedVersion = [string]$dependency.version
    $pnpm = Find-ReverseCommand -Names @('pnpm', 'pnpm.cmd')
    if ($pnpm) {
        $current = (& $pnpm --version 2>$null | Select-Object -First 1)
        if ($current -and ([string]$current).Trim() -eq $expectedVersion) {
            return
        }
    }
    $npm = Find-ReverseCommand -Names @('npm', 'npm.cmd')
    if (-not $npm) {
        throw 'npm is required to provision pnpm but was not found on PATH.'
    }
    & $npm install -g $dependency.package
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to install pinned $($dependency.package) via npm."
    }
}

# First executable on PATH matching any of the given names.
function Find-ReverseCommand {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string[]] $Names
    )
    foreach ($name in $Names) {
        $command = Get-Command -Name $name -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($command) {
            return $command.Source
        }
    }
    return $null
}

# Ensure a git checkout at TargetPath exists, is clean, and sits exactly on the
# pinned commit. A missing target is cloned into a hidden staging directory and
# promoted atomically; any failure removes the staging path so a poisoned
# checkout never survives. Returns @{ Verified = $true; Promoted = <bool> }.
function Ensure-GitCloneInstall {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        $Definition,
        [Parameter(Mandatory = $true)]
        [string] $TargetPath
    )

    $repo = [string]$Definition.repo
    $pinnedCommit = [string]$Definition.pinnedCommit
    if ([string]::IsNullOrWhiteSpace($repo) -or [string]::IsNullOrWhiteSpace($pinnedCommit)) {
        throw 'git-clone definition requires both repo and pinnedCommit.'
    }

    $resolved = [System.IO.Path]::GetFullPath($TargetPath)
    if (Test-Path -LiteralPath $resolved) {
        Assert-ReversePinnedCheckout -RepoDir $resolved -PinnedCommit $pinnedCommit -Git 'git'
        return [pscustomobject]@{ Verified = $true; Promoted = $false }
    }

    $parent = Split-Path -Path $resolved -Parent
    $staging = Join-Path $parent ('.reverse-bootstrap-' + [Guid]::NewGuid().ToString('N'))
    try {
        & git clone --quiet $repo $staging
        if ($LASTEXITCODE -ne 0) { throw "git clone failed for $repo." }
        & git -C $staging checkout --quiet $pinnedCommit
        if ($LASTEXITCODE -ne 0) { throw "git checkout failed for $pinnedCommit." }
        Assert-ReversePinnedCheckout -RepoDir $staging -PinnedCommit $pinnedCommit -Git 'git'
        Move-BootstrapDirectory -Source $staging -Destination $resolved
        return [pscustomobject]@{ Verified = $true; Promoted = $true }
    } catch {
        if (Test-Path -LiteralPath $staging) {
            Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
        }
        throw
    }
}

# Atomic promote of a staged checkout. Refuses to replace anything that
# appeared concurrently; the caller retries through a fresh staging path.
function Move-BootstrapDirectory {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string] $Source,
        [Parameter(Mandatory = $true)]
        [string] $Destination
    )
    if (Test-Path -LiteralPath $Destination) {
        throw "Refusing to replace existing path: $Destination"
    }
    Move-Item -LiteralPath $Source -Destination $Destination
}

# Verify a checkout is clean and on the pinned commit. Throws with a stable
# reason phrase ('local changes' / 'expected pinned commit') that callers and
# tests match on.
function Assert-ReversePinnedCheckout {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string] $RepoDir,
        [Parameter(Mandatory = $true)]
        [string] $PinnedCommit,
        [Parameter(Mandatory = $true)]
        [string] $Git
    )
    if (-not (Test-Path -LiteralPath (Join-Path $RepoDir '.git') -PathType Container)) {
        throw "Not a git checkout: $RepoDir"
    }
    $status = & $Git -C $RepoDir status --porcelain 2>$null | Out-String
    if (-not [string]::IsNullOrWhiteSpace($status)) {
        throw "Checkout verification failed: local changes in $RepoDir"
    }
    $head = (& $Git -C $RepoDir rev-parse HEAD 2>$null | Out-String).Trim()
    if ($head -ne $PinnedCommit) {
        throw "Checkout verification failed: expected pinned commit $PinnedCommit, got $head"
    }
}

# Pinned install of the anything-analyzer repo. Verifies the checkout before
# installing, then re-verifies after build approvals so an approval-generated
# mutation cannot poison the pinned tree. On post-install drift the generated
# files are rolled back before the error propagates.
function Invoke-AnythingAnalyzerPinnedInstall {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string] $RepoDir,
        [Parameter(Mandatory = $true)]
        [string] $PnpmPath,
        [Parameter(Mandatory = $true)]
        [string] $GitPath,
        [Parameter(Mandatory = $true)]
        [string] $PinnedCommit
    )

    Assert-ReversePinnedCheckout -RepoDir $RepoDir -PinnedCommit $PinnedCommit -Git $GitPath
    & $PnpmPath install --frozen-lockfile 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "pnpm install failed in $RepoDir."
    }
    Approve-AnythingAnalyzerBuildScripts -RepoDir $RepoDir
    try {
        Assert-ReversePinnedCheckout -RepoDir $RepoDir -PinnedCommit $PinnedCommit -Git $GitPath
    } catch {
        Restore-ReverseCheckout -RepoDir $RepoDir -Git $GitPath
        throw
    }
}

# Roll back approval-generated checkout mutations: untracked files are
# removed, tracked modifications are reverted to HEAD.
function Restore-ReverseCheckout {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string] $RepoDir,
        [Parameter(Mandatory = $true)]
        [string] $Git
    )
    $status = & $Git -C $RepoDir status --porcelain 2>$null | Out-String
    foreach ($line in ($status -split "`r?`n")) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        $code = $line.Substring(0, 2)
        $relative = $line.Substring(3).Trim('"')
        $target = Join-Path $RepoDir $relative
        if ($code -match '^\?\?') {
            Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction SilentlyContinue
        } else {
            & $Git -C $RepoDir checkout --quiet -- $relative 2>$null
        }
    }
}