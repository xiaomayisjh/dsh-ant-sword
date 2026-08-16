# WorkRoot.ps1 — shared project-root resolution for reverse-skill scripts.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Resolve the analysis-project root that owns work/<case> and route artifacts.
# An explicit RequestedRoot is absolutized and must exist; an empty request
# follows the caller's current location so artifacts stay with the project
# the operator is working in instead of leaking into the skill package.
function Resolve-ReverseProjectRoot {
    [CmdletBinding()]
    param(
        [AllowEmptyString()]
        [string] $RequestedRoot = ''
    )

    $candidate = if ([string]::IsNullOrWhiteSpace($RequestedRoot)) {
        (Get-Location).Path
    } else {
        $RequestedRoot
    }
    $resolved = [System.IO.Path]::GetFullPath($candidate)
    if (-not (Test-Path -LiteralPath $resolved -PathType Container)) {
        throw "Project root does not exist: $resolved"
    }
    return $resolved
}