param(
    [Parameter(Mandatory = $false)]
    [string]$RootDir = ".",

    [Parameter(Mandatory = $false)]
    [string]$OutputRoot = "reverse-output/js-deobfuscator-launcher",

    [Parameter(Mandatory = $false)]
    [string[]]$IncludeGlobs = @("*.js", "*.mjs", "*.cjs"),

    [Parameter(Mandatory = $false)]
    [string[]]$ExcludeDirNames = @("node_modules", ".git", "reverse-output", ".vscode-test", "coverage", "vendor"),

    [Parameter(Mandatory = $false)]
    [string[]]$ExtraArgs = @(),

    [Parameter(Mandatory = $false)]
    [switch]$StopOnError
)

$ErrorActionPreference = "Stop"

$singleLauncher = Join-Path $PSScriptRoot "run-js-deobfuscator.ps1"
if (-not (Test-Path -LiteralPath $singleLauncher)) {
    throw "Missing single-file launcher: $singleLauncher"
}

$rootPath = (Resolve-Path $RootDir).Path
$outputRootPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputRoot)
New-Item -ItemType Directory -Force -Path $outputRootPath | Out-Null

function Get-RelativePathCompat($fullPath) {
    $rootFull = ([System.IO.Path]::GetFullPath($rootPath)) -replace '[\\/]+$', ''
    $targetFull = [System.IO.Path]::GetFullPath($fullPath)
    if ($targetFull.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        $relative = $targetFull.Substring($rootFull.Length) -replace '^[\\/]+', ''
        if ($relative) {
            return $relative
        }
    }
    return [System.IO.Path]::GetFileName($targetFull)
}

function Test-IncludeFile($file) {
    foreach ($glob in $IncludeGlobs) {
        if ($file.Name -like $glob) {
            return $true
        }
    }
    return $false
}

function Test-ExcludedFile($file) {
    $relative = Get-RelativePathCompat $file.FullName
    $segments = $relative -split '[\\/]+' | Where-Object { $_ -ne "" }
    foreach ($segment in $segments) {
        foreach ($excluded in $ExcludeDirNames) {
            if ($segment -ieq $excluded) {
                return $true
            }
        }
    }
    return $false
}

function ConvertTo-SafeName($file) {
    $relative = Get-RelativePathCompat $file.FullName
    $safe = $relative -replace '[\\/:*?"<>|\s]+', '__'
    $safe = $safe -replace '\.(mjs|cjs|js)$', ''
    if (-not $safe) {
        return $file.BaseName
    }
    return $safe
}

$files = Get-ChildItem -LiteralPath $rootPath -Recurse -File |
    Where-Object { Test-IncludeFile $_ } |
    Where-Object { -not (Test-ExcludedFile $_) } |
    Sort-Object FullName

if ($files.Count -eq 0) {
    throw "No JS files found under $rootPath"
}

$summary = New-Object System.Collections.Generic.List[object]
Write-Host "js-deobfuscator batch root: $rootPath"
Write-Host "js-deobfuscator batch output: $outputRootPath"
Write-Host "js-deobfuscator batch files: $($files.Count)"

foreach ($file in $files) {
    $started = Get-Date
    $safeName = ConvertTo-SafeName $file
    $outDir = Join-Path $outputRootPath $safeName
    $record = [ordered]@{
        input = $file.FullName
        outputDir = $outDir
        outputFile = (Join-Path $outDir "output.js")
        status = "pending"
        durationMs = 0
        error = $null
    }

    try {
        Write-Host "deobfuscating: $($file.FullName)"
        $launcherArgs = @(
            "-ExecutionPolicy", "Bypass",
            "-File", $singleLauncher,
            "-InputFile", $file.FullName,
            "-OutputDir", $outDir
        )
        if ($ExtraArgs.Count -gt 0) {
            $launcherArgs += "-ExtraArgs"
            $launcherArgs += $ExtraArgs
        }
        & powershell @launcherArgs
        if ($LASTEXITCODE -ne 0) {
            throw "single-file launcher exited with code $LASTEXITCODE"
        }
        $record.status = "ok"
    } catch {
        $record.status = "error"
        $record.error = $_.Exception.Message
        Write-Host "deobfuscation failed: $($file.FullName) :: $($record.error)" -ForegroundColor Red
        if ($StopOnError) {
            $record.durationMs = [int]((Get-Date) - $started).TotalMilliseconds
            $summary.Add([pscustomobject]$record) | Out-Null
            break
        }
    } finally {
        if ($record.durationMs -eq 0) {
            $record.durationMs = [int]((Get-Date) - $started).TotalMilliseconds
        }
        if ($summary.Count -eq 0 -or $summary[$summary.Count - 1].input -ne $record.input) {
            $summary.Add([pscustomobject]$record) | Out-Null
        }
    }
}

$summaryPath = Join-Path $outputRootPath "summary.json"
$summary | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $summaryPath -Encoding UTF8
Write-Host "js-deobfuscator batch summary: $summaryPath"
