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

function Install-AntSwordRelease {
  param(
    [string]$ReleasePath,
    [string]$InstallerPath
  )

  node $InstallerPath --profile $Profile --release $ReleasePath
  if ($LASTEXITCODE -ne 0) { throw 'Profile installation failed.' }
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
$workspace = Join-Path ([System.IO.Path]::GetTempPath()) ("dsh-ant-sword-" + [guid]::NewGuid().ToString('N'))
try {
  New-Item -ItemType Directory -Path $workspace | Out-Null
  $downloadArgs = @('release', 'download')
  if (-not [string]::IsNullOrWhiteSpace($Tag)) { $downloadArgs += $Tag }
  $downloadArgs += @(
    '--repo', $Repository,
    '--pattern', '*.tgz',
    '--pattern', 'ant-sword-release-manifest.json',
    '--dir', $workspace,
    '--clobber'
  )
  & gh @downloadArgs
  if ($LASTEXITCODE -ne 0) { throw 'Release download failed.' }

  $scripts = Join-Path $workspace 'scripts'
  New-Item -ItemType Directory -Path $scripts | Out-Null
  $raw = "https://raw.githubusercontent.com/$Repository/main/scripts"
  Invoke-WebRequest -UseBasicParsing -Uri "$raw/install-profile.mjs" -OutFile (Join-Path $scripts 'install-profile.mjs')
  Invoke-WebRequest -UseBasicParsing -Uri "$raw/release-artifacts.mjs" -OutFile (Join-Path $scripts 'release-artifacts.mjs')

  Install-AntSwordRelease -ReleasePath $workspace -InstallerPath (Join-Path $scripts 'install-profile.mjs')
} finally {
  Remove-Item -Recurse -Force $workspace -ErrorAction SilentlyContinue
}

Write-Host "Ant Sword installed. Start with: $(if ($Profile -eq 'web') { 'dsh web' } else { "dsh --profile $Profile" })"