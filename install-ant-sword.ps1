param(
  [string]$Profile = 'web',
  [string]$Repository = 'xiaomayisjh/dsh-ant-sword',
  [string]$Tag,
  [string]$Release
)

$ErrorActionPreference = 'Stop'

foreach ($command in @('dsh', 'pnpm', 'node')) {
  if ($null -eq (Get-Command $command -ErrorAction SilentlyContinue)) { throw "Required command not found: $command" }
}

function Assert-DshRc2 {
  $version = [string](& dsh --version 2>$null)
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($version)) {
    throw 'Could not determine the installed DSH version.'
  }
  if ($version -match '^0\.2\.0-rc\.(\d+)$' -and [int]$Matches[1] -lt 2) {
    throw "DSH $version is too old for the embedded client. Upgrade with: npm install -g @deepseek-ai/dsh@0.2.0-rc.2"
  }
}

Assert-DshRc2

function Stop-StaleDshWeb {
  param([int]$Port = 3080)

  $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  foreach ($connection in $connections) {
    $processId = $connection.OwningProcess
    if ($null -eq $processId -or $processId -eq 0) { continue }
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
    if ($null -eq $process) { continue }
    $commandLine = [string]$process.CommandLine
    if ($commandLine -match 'dsh.*web' -or $commandLine -match 'dsh.*bin\.js') {
      Write-Host "ant-sword: stopping stale dsh instance on port $Port (PID $processId)"
      Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
      Start-Sleep -Milliseconds 500
    } else {
      Write-Warning "Port $Port is held by PID $processId ($($process.Name)), which is not dsh. Not stopping it automatically."
    }
  }
}

function Install-AntSwordRelease {
  param(
    [string]$ReleasePath,
    [string]$InstallerPath
  )

  node $InstallerPath --profile $Profile --release $ReleasePath
  if ($LASTEXITCODE -ne 0) { throw 'Profile installation failed.' }
}

# Stop any stale dsh web instance so the freshly installed plugin starts cleanly.
if ($Profile -eq 'web') {
  Stop-StaleDshWeb -Port 3080
}

if ($Release) {
  if (-not $PSScriptRoot) { throw 'Local release mode requires running install-ant-sword.ps1 from a checkout, not piping it to iex.' }
  $installer = Join-Path $PSScriptRoot 'scripts/install-profile.mjs'
  if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) { throw "Installer module not found: $installer" }
  Install-AntSwordRelease -ReleasePath $Release -InstallerPath $installer
  Write-Host "Ant Sword installed. Start with: $(if ($Profile -eq 'web') { 'dsh web' } else { "dsh --profile $Profile" })"
  return
}

if ($null -eq (Get-Command 'gh' -ErrorAction SilentlyContinue)) { throw 'Required command not found: gh' }
if ($Repository -notmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$') { throw 'Repository must be owner/name.' }
$releaseArgs = @('release', 'view')
if (-not [string]::IsNullOrWhiteSpace($Tag)) { $releaseArgs += $Tag }
$releaseArgs += @('--repo', $Repository, '--json', 'tagName', '--jq', '.tagName')
$releaseTag = [string](& gh @releaseArgs | Select-Object -First 1)
$releaseTag = $releaseTag.Trim()
if ($LASTEXITCODE -ne 0 -or $releaseTag -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*$') {
  throw 'Could not resolve a valid Release tag.'
}
$workspace = Join-Path ([System.IO.Path]::GetTempPath()) ("dsh-ant-sword-" + [guid]::NewGuid().ToString('N'))
try {
  New-Item -ItemType Directory -Path $workspace | Out-Null
  $downloadArgs = @('release', 'download', $releaseTag)
  $downloadArgs += @(
    '--repo', $Repository,
    '--pattern', '*.tgz',
    '--pattern', 'ant-sword-release-manifest.json',
    '--dir', $workspace,
    '--clobber'
  )
  & gh @downloadArgs
  if ($LASTEXITCODE -ne 0) { throw 'Release download failed.' }

  # A release tag can have assets left over from an older layout (for example
  # the standalone Autograph tarball). Keep only the tarballs declared by the
  # signed manifest so the installer can enforce its no-extra-artifacts check.
  $manifestFile = Join-Path $workspace 'ant-sword-release-manifest.json'
  $manifest = Get-Content -Raw -LiteralPath $manifestFile | ConvertFrom-Json
  $declared = @($manifest.artifacts | ForEach-Object { [string]$_.filename })
  Get-ChildItem -LiteralPath $workspace -Filter '*.tgz' -File |
    Where-Object { $declared -notcontains $_.Name } |
    Remove-Item -Force

  $scripts = Join-Path $workspace 'scripts'
  New-Item -ItemType Directory -Path $scripts | Out-Null
  $raw = "https://raw.githubusercontent.com/$Repository/$releaseTag/scripts"
  Invoke-WebRequest -UseBasicParsing -Uri "$raw/install-profile.mjs" -OutFile (Join-Path $scripts 'install-profile.mjs')
  Invoke-WebRequest -UseBasicParsing -Uri "$raw/release-artifacts.mjs" -OutFile (Join-Path $scripts 'release-artifacts.mjs')
  try {
    Invoke-WebRequest -UseBasicParsing -Uri "$raw/align-dsh-scope.ps1" -OutFile (Join-Path $scripts 'align-dsh-scope.ps1')
  } catch {
    if ($null -eq $_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 404) { throw }
  }

  Install-AntSwordRelease -ReleasePath $workspace -InstallerPath (Join-Path $scripts 'install-profile.mjs')
} finally {
  Remove-Item -Recurse -Force $workspace -ErrorAction SilentlyContinue
}

Write-Host "Ant Sword installed. Start with: $(if ($Profile -eq 'web') { 'dsh web' } else { "dsh --profile $Profile" })"
