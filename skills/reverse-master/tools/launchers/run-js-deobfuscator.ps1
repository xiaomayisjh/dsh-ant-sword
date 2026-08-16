param(
    [Parameter(Mandatory = $true)]
    [string]$InputFile,

    [Parameter(Mandatory = $false)]
    [string]$OutputDir = "out",

    [Parameter(Mandatory = $false)]
    [string[]]$ExtraArgs = @()
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "../..")
$toolDir = Join-Path $root "tools/vendor/js-deobfuscator"
$inputPath = Resolve-Path $InputFile
$outputPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputDir)

if (-not (Test-Path -LiteralPath $toolDir)) {
    throw "Missing vendored js-deobfuscator at $toolDir"
}

$pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
if (-not $pnpm) {
    throw "pnpm is required. Install it, then run: corepack enable"
}

if (-not (Test-Path -LiteralPath (Join-Path $toolDir "node_modules"))) {
    Write-Host "Installing js-deobfuscator dependencies in $toolDir"
    Push-Location $toolDir
    try {
        pnpm install
    } finally {
        Pop-Location
    }
}

New-Item -ItemType Directory -Force -Path $outputPath | Out-Null

Push-Location $toolDir
try {
    $argsList = @("exec", "deob", $inputPath.Path, "-o", $outputPath) + $ExtraArgs
    & pnpm @argsList
    if ($LASTEXITCODE -ne 0) {
        throw "js-deobfuscator exited with code $LASTEXITCODE"
    }
} finally {
    Pop-Location
}

Write-Host "js-deobfuscator output: $outputPath"
