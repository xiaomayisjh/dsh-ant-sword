#Requires -Version 5.1
# Remove the portable MCP servers registered by register.ps1 from host configs.
# Reads skills/mcp/registered.json for the host list; -Hosts overrides it.
param(
    [string[]] $Hosts = @()
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$scriptDir = $PSScriptRoot
if (-not $scriptDir) { $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
$registeredPath = Join-Path $scriptDir 'registered.json'
$utf8 = [System.Text.UTF8Encoding]::new($false)

$names = @('firecrawl', 'codebase-memory')
$hosts = @($Hosts)
if ($hosts.Count -eq 0 -and (Test-Path -LiteralPath $registeredPath)) {
    $record = Get-Content -LiteralPath $registeredPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $hosts = @($record.hosts)
    if ($record.servers) { $names = @($record.servers) }
}
if ($hosts.Count -eq 0) { $hosts = @('claude', 'codex') }

foreach ($hostName in $hosts) {
    switch ($hostName.ToLowerInvariant()) {
        'claude' {
            $path = Join-Path $env:USERPROFILE '.claude\mcp.json'
            if (Test-Path -LiteralPath $path) {
                $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
                $parsed = $raw | ConvertFrom-Json
                foreach ($name in $names) {
                    if ($parsed.mcpServers.PSObject.Properties[$name]) {
                        $parsed.mcpServers.PSObject.Properties.Remove($name)
                    }
                }
                [System.IO.File]::WriteAllText($path, ($parsed | ConvertTo-Json -Depth 8), $utf8)
                Write-Output "claude: removed $($names -join ', ') from $path"
            }
        }
        'codex' {
            $path = Join-Path $env:USERPROFILE '.codex\config.toml'
            if (Test-Path -LiteralPath $path) {
                $lines = @(Get-Content -LiteralPath $path -Encoding UTF8)
                $out = New-Object System.Collections.Generic.List[string]
                $skip = $false
                foreach ($line in $lines) {
                    if ($line -match '^\[mcp_servers\.(?:"([^"]+)"|([^\].]+))\]') {
                        $name = if ($Matches[1]) { $Matches[1] } else { $Matches[2] }
                        $skip = $names -contains $name
                        if ($skip) { continue }
                    }
                    elseif ($line -match '^\s*\[') {
                        $skip = $false
                    }
                    if (-not $skip) { $out.Add($line) }
                }
                [System.IO.File]::WriteAllText($path, ($out -join "`n"), $utf8)
                Write-Output "codex: removed $($names -join ', ') from $path"
            }
        }
    }
}
Remove-Item -LiteralPath $registeredPath -Force -ErrorAction SilentlyContinue
Write-Output 'done'