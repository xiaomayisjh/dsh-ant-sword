param(
    [Parameter(Mandatory = $true)]
    [string]$Title,

    [string]$Category = "other",
    [string[]]$Tags = @(),
    [string]$SourceTask = "",
    [string]$ReusableScript = "",
    [string]$Status = "candidate",
    [string]$SkillRoot = ""
)

$ErrorActionPreference = "Stop"

function Convert-ToSlug {
    param([string]$Value)
    $slug = $Value.ToLowerInvariant() -replace "[^a-z0-9\u4e00-\u9fff]+", "-"
    $slug = $slug.Trim("-")
    if ([string]::IsNullOrWhiteSpace($slug)) {
        return "research-note"
    }
    return $slug
}

if ([string]::IsNullOrWhiteSpace($SkillRoot)) {
    $SkillRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
}

$root = (Resolve-Path -LiteralPath $SkillRoot).Path
$logDir = Join-Path $root "references\experience\log"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$date = Get-Date -Format "yyyy-MM-dd"
$slug = Convert-ToSlug $Title
$path = Join-Path $logDir "$date-$slug.md"
$tagText = ($Tags | ForEach-Object { '"' + ($_ -replace '"', '\"') + '"' }) -join ", "

$content = @"
---
title: "$($Title -replace '"', '\"')"
category: "$($Category -replace '"', '\"')"
tags: [$tagText]
created: $date
source_task: "$($SourceTask -replace '"', '\"')"
reusable_script: "$($ReusableScript -replace '"', '\"')"
status: "$($Status -replace '"', '\"')"
---

# $Title

## Applies When
- 

## Evidence
- Runtime behavior:
- Network/file/process evidence:
- Static/source evidence:

## Workflow
1. 

## Validation
- Command:
- Expected decisive output:
- Sample or artifact hash:

## Pitfalls
- 

## Reusable Assets
- Script: $ReusableScript
- Config/template:

## Promotion Notes
- Promote to stable after clean reproduction or repeated reuse.
"@

Set-Content -LiteralPath $path -Encoding UTF8 -Value $content
Write-Output $path
