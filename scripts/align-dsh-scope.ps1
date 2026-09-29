param(
    [string]$ProfileName = 'red-team',
    [string]$DshHome,
    [string]$GlobalDshScopePath,
    [string]$GlobalDshToolsPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($env:OS -ne 'Windows_NT') {
    throw 'This script requires Windows because it creates directory Junctions.'
}

function Get-AbsolutePath {
    param([Parameter(Mandatory)][string]$Value)
    if ($Value -notmatch '^(?:[A-Za-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+(?:[\\/]|$))') {
        throw "An absolute Windows path is required: $Value"
    }
    if (@($Value -split '[\\/]') -contains '..') {
        throw "Parent traversal is not allowed in a path: $Value"
    }
    $full = [System.IO.Path]::GetFullPath($Value)
    $root = [System.IO.Path]::GetPathRoot($full)
    if ($full.Length -gt $root.Length) { $full = $full.TrimEnd([char[]]@('\', '/')) }
    return $full
}

function Assert-Within {
    param([Parameter(Mandatory)][string]$Parent, [Parameter(Mandatory)][string]$Child)
    $prefix = $Parent.TrimEnd([char[]]@('\', '/')) + '\'
    if (-not $Child.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Path escapes the expected directory: $Child"
    }
}

function Assert-PlainDirectory {
    param([Parameter(Mandatory)][string]$Path)
    $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
    if (-not $item.PSIsContainer -or ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Expected an ordinary directory: $Path"
    }
}

function Get-PackageInfo {
    param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$Name)
    $packagePath = Join-Path $Path 'package.json'
    $entryPath = Join-Path $Path 'lib\index.js'
    if (-not (Test-Path -LiteralPath $packagePath -PathType Leaf) -or
        -not (Test-Path -LiteralPath $entryPath -PathType Leaf)) {
        throw "Incomplete $Name package: $Path"
    }
    $package = Get-Content -LiteralPath $packagePath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($package.name -ne "@deepseek-ai/$Name" -or [string]::IsNullOrWhiteSpace([string]$package.version)) {
        throw "Unexpected $Name package metadata: $packagePath"
    }
    return [pscustomobject]@{
        Version = [string]$package.version
        Hash = (Get-FileHash -LiteralPath $entryPath -Algorithm SHA256).Hash
    }
}

function Find-GlobalDshPackage {
    param([Parameter(Mandatory)][string]$Name)
    $commands = @(Get-Command -Name dsh -All -CommandType Application, ExternalScript -ErrorAction Stop)
    foreach ($command in $commands) {
        $shimPath = if ($command.Path) { $command.Path } else { $command.Source }
        if ([string]::IsNullOrWhiteSpace($shimPath)) { continue }
        $shimDirectory = Split-Path -Path (Get-AbsolutePath $shimPath) -Parent
        $candidates = @(
            (Join-Path $shimDirectory "node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\$Name"),
            (Join-Path $shimDirectory "node_modules\@deepseek-ai\$Name")
        )
        foreach ($candidate in $candidates) {
            if (Test-Path -LiteralPath (Join-Path $candidate 'package.json') -PathType Leaf) {
                return (Get-AbsolutePath $candidate)
            }
        }
    }
    throw "Could not locate $Name beside the current global dsh command. Pass its -GlobalDsh*Path parameter explicitly."
}

function Assert-JunctionTarget {
    param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$Target)
    $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
    if ($item.LinkType -ne 'Junction') { throw "Expected a Junction at: $Path" }
    $targets = @(@($item.Target) | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) })
    if ($targets.Count -ne 1 -or
        -not (Get-AbsolutePath ([string]$targets[0])).Equals($Target, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Junction has an unexpected target: $Path"
    }
}

if ($ProfileName -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*$' -or $ProfileName -eq '.' -or $ProfileName -eq '..') {
    throw 'ProfileName must be a single profile directory name.'
}
if ([string]::IsNullOrWhiteSpace($DshHome)) {
    if (-not [string]::IsNullOrWhiteSpace($env:DSH_HOME)) {
        $DshHome = $env:DSH_HOME
    } elseif (-not [string]::IsNullOrWhiteSpace($env:USERPROFILE)) {
        $DshHome = Join-Path $env:USERPROFILE '.dsh'
    } else {
        throw 'DSH_HOME and USERPROFILE are unavailable; pass -DshHome explicitly.'
    }
}
$homePath = Get-AbsolutePath $DshHome
$profilesPath = Get-AbsolutePath (Join-Path $homePath 'profiles')
$profilePath = Get-AbsolutePath (Join-Path $profilesPath $ProfileName)
$modulesPath = Get-AbsolutePath (Join-Path $profilePath 'node_modules')
$packageParentPath = Get-AbsolutePath (Join-Path $modulesPath '@deepseek-ai')
$backupRoot = Get-AbsolutePath (Join-Path $profilePath '.runtime-backups')

Assert-Within -Parent $homePath -Child $profilesPath
Assert-Within -Parent $profilesPath -Child $profilePath
Assert-Within -Parent $profilePath -Child $packageParentPath
Assert-Within -Parent $profilePath -Child $backupRoot
foreach ($path in @($homePath, $profilesPath, $profilePath, $modulesPath, $packageParentPath)) {
    Assert-PlainDirectory $path
}

$profileScopePath = Get-AbsolutePath (Join-Path $packageParentPath 'dsh-scope')
$profileToolsPath = Get-AbsolutePath (Join-Path $packageParentPath 'dsh-tools')
$hasScope = Test-Path -LiteralPath $profileScopePath -PathType Container
$hasTools = Test-Path -LiteralPath $profileToolsPath -PathType Container
if (-not $hasScope -and -not $hasTools) {
    Write-Output "No profile-local dsh-scope or dsh-tools packages to align in $profilePath"
    return
}

# Existing -GlobalDshScopePath callers remain valid; infer dsh-tools beside it.
$globalScopePath = if ($hasScope) {
    if ([string]::IsNullOrWhiteSpace($GlobalDshScopePath)) { Find-GlobalDshPackage 'dsh-scope' }
    else { Get-AbsolutePath $GlobalDshScopePath }
} else { $null }
$globalToolsPath = if ($hasTools) {
    if (-not [string]::IsNullOrWhiteSpace($GlobalDshToolsPath)) { Get-AbsolutePath $GlobalDshToolsPath }
    elseif (-not [string]::IsNullOrWhiteSpace($GlobalDshScopePath)) {
        Get-AbsolutePath (Join-Path (Split-Path (Get-AbsolutePath $GlobalDshScopePath) -Parent) 'dsh-tools')
    } else { Find-GlobalDshPackage 'dsh-tools' }
} else { $null }

$targets = [System.Collections.Generic.List[object]]::new()
if ($hasScope) {
    $targets.Add([pscustomobject]@{ Name = 'dsh-scope'; ProfilePath = $profileScopePath; GlobalPath = $globalScopePath })
}
if ($hasTools) {
    $targets.Add([pscustomobject]@{ Name = 'dsh-tools'; ProfilePath = $profileToolsPath; GlobalPath = $globalToolsPath })
}

# Preflight both packages before changing either one.
foreach ($target in $targets) {
    Assert-Within -Parent $packageParentPath -Child $target.ProfilePath
    if ($target.GlobalPath.Equals($profilePath, [System.StringComparison]::OrdinalIgnoreCase) -or
        $target.GlobalPath.StartsWith($profilePath + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Global $($target.Name) path must be outside the profile directory."
    }
    if (-not (Test-Path -LiteralPath $target.GlobalPath -PathType Container)) {
        throw "Global $($target.Name) directory does not exist: $($target.GlobalPath)"
    }
    $profileItem = Get-Item -LiteralPath $target.ProfilePath -Force -ErrorAction Stop
    if (-not $profileItem.PSIsContainer) { throw "Profile $($target.Name) is not a directory: $($target.ProfilePath)" }
    $globalInfo = Get-PackageInfo -Path $target.GlobalPath -Name $target.Name
    $profileInfo = Get-PackageInfo -Path $target.ProfilePath -Name $target.Name
    if ($globalInfo.Version -ne $profileInfo.Version -or $globalInfo.Hash -ne $profileInfo.Hash) {
        throw "$($target.Name) differs between global dsh and profile (global version $($globalInfo.Version), profile version $($profileInfo.Version); global SHA256 $($globalInfo.Hash), profile SHA256 $($profileInfo.Hash))."
    }
    $target | Add-Member -NotePropertyName Info -NotePropertyValue $globalInfo
    $target | Add-Member -NotePropertyName AlreadyAligned -NotePropertyValue $false
    if (($profileItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        Assert-JunctionTarget -Path $target.ProfilePath -Target $target.GlobalPath
        $target.AlreadyAligned = $true
    }
}

if (@($targets | Where-Object { -not $_.AlreadyAligned }).Count -eq 0) {
    foreach ($target in $targets) {
        Write-Output "Already aligned: $($target.ProfilePath) -> $($target.GlobalPath) ($($target.Info.Version), SHA256 $($target.Info.Hash))"
    }
    return
}

if (Test-Path -LiteralPath $backupRoot) { Assert-PlainDirectory $backupRoot }
else {
    New-Item -ItemType Directory -Path $backupRoot -ErrorAction Stop | Out-Null
    Assert-PlainDirectory $backupRoot
}

$changes = [System.Collections.Generic.List[object]]::new()
try {
    foreach ($target in $targets) {
        if ($target.AlreadyAligned) { continue }
        $backupName = $target.Name + '-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ') + '-' + [guid]::NewGuid().ToString('N')
        $backupPath = Get-AbsolutePath (Join-Path $backupRoot $backupName)
        Assert-Within -Parent $backupRoot -Child $backupPath
        Assert-Within -Parent $profilePath -Child $backupPath
        if (Test-Path -LiteralPath $backupPath) { throw "Backup path already exists: $backupPath" }
        Move-Item -LiteralPath $target.ProfilePath -Destination $backupPath -ErrorAction Stop
        $changes.Add([pscustomobject]@{ Target = $target; BackupPath = $backupPath })
        New-Item -ItemType Junction -Path $target.ProfilePath -Target $target.GlobalPath -ErrorAction Stop | Out-Null
        Assert-JunctionTarget -Path $target.ProfilePath -Target $target.GlobalPath
        $linkedInfo = Get-PackageInfo -Path $target.ProfilePath -Name $target.Name
        if ($linkedInfo.Version -ne $target.Info.Version -or $linkedInfo.Hash -ne $target.Info.Hash) {
            throw "New Junction failed package verification: $($target.ProfilePath)"
        }
    }
} catch {
    $failure = $_
    $rollbackErrors = [System.Collections.Generic.List[string]]::new()
    for ($index = $changes.Count - 1; $index -ge 0; $index--) {
        $change = $changes[$index]
        try {
            $partialItem = Get-Item -LiteralPath $change.Target.ProfilePath -Force -ErrorAction SilentlyContinue
            if ($null -ne $partialItem) {
                if ($partialItem.LinkType -ne 'Junction') {
                    throw "Rollback found a non-Junction at $($change.Target.ProfilePath); backup remains at $($change.BackupPath)"
                }
                Remove-Item -LiteralPath $change.Target.ProfilePath -Force -ErrorAction Stop
            }
            Move-Item -LiteralPath $change.BackupPath -Destination $change.Target.ProfilePath -ErrorAction Stop
        } catch { $rollbackErrors.Add([string]$_) }
    }
    if ($rollbackErrors.Count -gt 0) {
        throw "Alignment failed: $failure. Rollback also failed: $($rollbackErrors -join '; ')"
    }
    throw $failure
}

foreach ($target in $targets) {
    if ($target.AlreadyAligned) {
        Write-Output "Already aligned: $($target.ProfilePath) -> $($target.GlobalPath) ($($target.Info.Version), SHA256 $($target.Info.Hash))"
        continue
    }
    $change = @($changes | Where-Object { $_.Target.Name -eq $target.Name })[0]
    Write-Output "Aligned: $($target.ProfilePath) -> $($target.GlobalPath) ($($target.Info.Version), SHA256 $($target.Info.Hash))"
    Write-Output "Original profile package backed up to: $($change.BackupPath)"
}
