param(
    [Parameter(Mandatory = $true)]
    [string[]]$SourceDir,

    [Parameter(Mandatory = $true)]
    [string]$OutputDir,

    [Parameter(Mandatory = $false)]
    [ValidateSet("ollama", "openai", "google", "anthropic")]
    [string]$Provider = "ollama",

    [Parameter(Mandatory = $false)]
    [string]$Model = "llama3.2",

    [Parameter(Mandatory = $false)]
    [switch]$SaveCode,

    [Parameter(Mandatory = $false)]
    [string[]]$ExtraArgs = @()
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "../..")
$toolDir = Join-Path $root "tools/vendor/Androidmeda"
$script = Join-Path $toolDir "androidmeda.py"

if (-not (Test-Path -LiteralPath $script)) {
    throw "Missing vendored Androidmeda script at $script"
}

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
    $python = Get-Command python3 -ErrorAction SilentlyContinue
}
if (-not $python) {
    throw "Python is required to run Androidmeda."
}

$outputPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputDir)
New-Item -ItemType Directory -Force -Path $outputPath | Out-Null

$requirements = Join-Path $toolDir "requirements.txt"
if (Test-Path -LiteralPath $requirements) {
    Write-Host "Ensuring Androidmeda Python dependencies are installed"
    & $python.Source -m pip install -r $requirements
    if ($LASTEXITCODE -ne 0) {
        throw "pip install failed with code $LASTEXITCODE"
    }
}

$resolvedSources = @()
foreach ($src in $SourceDir) {
    $resolvedSources += (Resolve-Path $src).Path
}

$sourceArg = ($resolvedSources -join " ")
$saveCodeValue = if ($SaveCode) { "true" } else { "false" }
$argsList = @(
    $script,
    "--llm_provider", $Provider,
    "--llm_model", $Model,
    "-output_dir", $outputPath,
    "-source_dir", $sourceArg,
    "--save_code", $saveCodeValue
) + $ExtraArgs

& $python.Source @argsList
if ($LASTEXITCODE -ne 0) {
    throw "Androidmeda exited with code $LASTEXITCODE"
}

Write-Host "Androidmeda output: $outputPath"
