#Requires -Version 5.1
# Register the portable MCP servers from mcp-manifest.json into the host MCP
# configs (Claude ~/.claude/mcp.json, Codex ~/.codex/config.toml).
# Everything resolves through %SKILL_ROOT% so the whole bundle stays movable:
# copy it elsewhere, re-run this script, and the servers plug back in.
param(
    [string[]] $Hosts = @('claude', 'codex'),
    [switch] $DryRun
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$scriptDir = $PSScriptRoot
if (-not $scriptDir) { $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
$skillRoot = Split-Path -Parent $scriptDir
$manifestPath = Join-Path $scriptDir 'mcp-manifest.json'
$registeredPath = Join-Path $scriptDir 'registered.json'
$utf8 = [System.Text.UTF8Encoding]::new($false)

$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$dataRoot = $manifest.meta.dataRoot.Replace('%SKILL_ROOT%', $skillRoot)

function Expand-SkillRoot([string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value)) { return $Value }
    return $Value.Replace('%SKILL_ROOT%', $skillRoot).Replace('/', [IO.Path]::DirectorySeparatorChar)
}

function Resolve-ApiKeyEnv([string]$Key, [string]$Template) {
    if ([string]::IsNullOrWhiteSpace($Key)) { return $null }
    if (-not [string]::IsNullOrWhiteSpace($env:$Key)) { return $env:$Key }
    return $null
}

# --- Claude: ~/.claude/mcp.json ---
function Set-ClaudeServers {
    param($Servers, [string]$ClaudeConfigPath)
    $existing = @{}
    if (Test-Path -LiteralPath $ClaudeConfigPath) {
        $raw = Get-Content -LiteralPath $ClaudeConfigPath -Raw -Encoding UTF8
        if ($raw.Trim()) {
            $parsed = $raw | ConvertFrom-Json
            if ($parsed.mcpServers) {
                foreach ($prop in $parsed.mcpServers.PSObject.Properties) {
                    $existing[$prop.Name] = $prop.Value
                }
            }
        }
    }
    foreach ($server in $Servers) {
        $definition = [ordered]@{}
        $definition['command'] = Expand-SkillRoot $server.command
        $definition['args'] = @($server.args | ForEach-Object { Expand-SkillRoot $_ })
        $env = @{}
        foreach ($prop in $server.env.PSObject.Properties) {
            $value = $prop.Value
            if ($value -match '^%([A-Z_]+)%$') {
                $resolved = Resolve-ApiKeyEnv -Key $Matches[1] -Template $value
                if ($resolved) { $env[$prop.Name] = $resolved }
            } else {
                $env[$prop.Name] = Expand-SkillRoot $value
            }
        }
        if ($env.Count -gt 0) { $definition['env'] = $env }
        if ($server.dataDir) { $definition['env'] = @{ 'CODEBASE_MEMORY_DATA_DIR' = Expand-SkillRoot $server.dataDir } }
        $existing[$server.name] = [pscustomobject]$definition
    }
    $config = [ordered]@{ mcpServers = $existing }
    $json = $config | ConvertTo-Json -Depth 8
    if (-not $DryRun) {
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $ClaudeConfigPath) | Out-Null
        [System.IO.File]::WriteAllText($ClaudeConfigPath, $json, $utf8)
    }
    Write-Output "claude: $($Servers.Count) server(s) registered at $ClaudeConfigPath"
}

# --- Codex: ~/.codex/config.toml ([mcp_servers."name"] sections) ---
function Set-CodexServers {
    param($Servers, [string]$CodexConfigPath)
    $lines = if (Test-Path -LiteralPath $CodexConfigPath) {
        @(Get-Content -LiteralPath $CodexConfigPath -Encoding UTF8)
    } else { @() }
    $sections = @{}
    $current = $null
    $out = New-Object System.Collections.Generic.List[string]
    foreach ($line in $lines) {
        if ($line -match '^\[mcp_servers\.(?:"([^"]+)"|([^\].]+))\]') {
            $name = if ($Matches[1]) { $Matches[1] } else { $Matches[2] }
            $current = $name
            $sections[$name] = $true
        }
        elseif ($line -match '^\s*\[') {
            $current = $null
        }
        if ($null -eq $current -or -not $sections.ContainsKey($current)) {
            $out.Add($line)
        }
    }
    while ($out.Count -gt 0 -and -not $out[-1].Trim()) { $out.RemoveAt($out.Count - 1) }
    if ($out.Count -gt 0) { $out.Add('') }
    foreach ($server in $Servers) {
        $out.Add("[mcp_servers.`"$($server.name)`"]")
        $out.Add("command = `"$(Expand-SkillRoot $server.command)`"")
        if (@($server.args).Count -gt 0) {
            $argsJson = @($server.args | ForEach-Object { Expand-SkillRoot $_ }) | ConvertTo-Json -Compress
            $out.Add("args = $argsJson")
        }
        $env = [ordered]@{}
        foreach ($prop in $server.env.PSObject.Properties) {
            $value = $prop.Value
            if ($value -match '^%([A-Z_]+)%$') {
                $resolved = Resolve-ApiKeyEnv -Key $Matches[1] -Template $value
                if ($resolved) { $env[$prop.Name] = $resolved }
            } else {
                $env[$prop.Name] = Expand-SkillRoot $value
            }
        }
        if ($server.dataDir) { $env['CODEBASE_MEMORY_DATA_DIR'] = Expand-SkillRoot $server.dataDir }
        if ($env.Count -gt 0) {
            $out.Add('env = {')
            $first = $true
            foreach ($key in $env.Keys) {
                $comma = if ($first) { '' } else { ',' }
                $out.Add("  $comma `"$key`" = `"$($env[$key])`"")
                $first = $false
            }
            $out.Add('}')
        }
        $out.Add('')
    }
    if (-not $DryRun) {
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $CodexConfigPath) | Out-Null
        [System.IO.File]::WriteAllText($CodexConfigPath, ($out -join "`n"), $utf8)
    }
    Write-Output "codex: $($Servers.Count) server(s) registered at $CodexConfigPath"
}

$servers = @($manifest.servers)
$record = @{ hosts = @(); servers = @($servers | ForEach-Object { $_.name }); registeredAt = (Get-Date -Format o) }
foreach ($hostName in $Hosts) {
    switch ($hostName.ToLowerInvariant()) {
        'claude' {
            $path = Join-Path $env:USERPROFILE '.claude\mcp.json'
            Set-ClaudeServers -Servers $servers -ClaudeConfigPath $path
            $record.hosts += 'claude'
        }
        'codex' {
            $path = Join-Path $env:USERPROFILE '.codex\config.toml'
            Set-CodexServers -Servers $servers -CodexConfigPath $path
            $record.hosts += 'codex'
        }
        default { Write-Warning "unknown host: $hostName (supported: claude, codex)" }
    }
}
if (-not $DryRun) {
    [System.IO.File]::WriteAllText($registeredPath, ($record | ConvertTo-Json -Depth 4), $utf8)
    Write-Output "registration record written to $registeredPath"
}
Write-Output 'done'