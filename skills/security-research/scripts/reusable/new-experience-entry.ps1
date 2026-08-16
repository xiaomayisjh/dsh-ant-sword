[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$Title,

    [ValidateSet("web-api", "pwn", "reverse", "crypto", "forensics", "malware", "misc", "osint", "ai-security", "identity-cloud", "mobile-firmware", "tooling", "other")]
    [string]$Category = "other",

    [string[]]$Tags = @(),
    [string]$SourceTask = "",
    [string]$ReusableScript = "",

    [ValidateSet("candidate", "stable", "deprecated")]
    [string]$Status = "candidate",

    [string]$SkillRoot = "",
    [string]$OutputDir = "",
    [string]$Date = "",
    [switch]$DryRun,
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$script = Join-Path $PSScriptRoot "new_experience_entry.py"
if (-not (Test-Path -LiteralPath $script -PathType Leaf)) {
    throw "Python implementation not found: $script"
}

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
    $python = Get-Command python3 -ErrorAction SilentlyContinue
}
if (-not $python) {
    throw "Python 3 was not found in PATH."
}

$arguments = @($script, "--title", $Title, "--category", $Category, "--status", $Status)
foreach ($tag in $Tags) {
    $arguments += @("--tag", $tag)
}
if ($SourceTask) {
    $arguments += @("--source-task", $SourceTask)
}
if ($ReusableScript) {
    $arguments += @("--reusable-script", $ReusableScript)
}
if ($SkillRoot) {
    $arguments += @("--skill-root", $SkillRoot)
}
if ($OutputDir) {
    $arguments += @("--output-dir", $OutputDir)
}
if ($Date) {
    $arguments += @("--date", $Date)
}
if ($DryRun) {
    $arguments += "--dry-run"
}
if ($Force) {
    $arguments += "--overwrite"
}

& $python.Source @arguments
exit $LASTEXITCODE
