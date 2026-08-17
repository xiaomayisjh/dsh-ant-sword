param([string]$Profile = 'web')

$ErrorActionPreference = 'Stop'
foreach ($command in @('gh', 'dsh', 'pnpm', 'node')) {
  if ($null -eq (Get-Command $command -ErrorAction SilentlyContinue)) { throw "Required command not found: $command" }
}

$workspace = Join-Path ([System.IO.Path]::GetTempPath()) ("dsh-ant-sword-" + [guid]::NewGuid().ToString('N'))
try {
  New-Item -ItemType Directory -Path $workspace | Out-Null
  gh release download --repo xiaomayisjh/dsh-ant-sword --pattern 'deepseek-ai-dsh-ant-sword-harness-*.tgz' --dir $workspace --clobber
  if ($LASTEXITCODE -ne 0) { throw 'Release download failed.' }
  $bundle = Get-ChildItem $workspace -Filter 'deepseek-ai-dsh-ant-sword-harness-*.tgz' | Select-Object -First 1
  if ($null -eq $bundle) { throw 'Release contains no Ant Sword bundle tarball.' }

  dsh plugin --profile $Profile add $bundle.FullName
  if ($LASTEXITCODE -ne 0) { throw 'Bundle installation failed.' }

  $dshHome = if ([string]::IsNullOrWhiteSpace($env:DSH_HOME)) { Join-Path $HOME '.dsh' } else { $env:DSH_HOME }
  $profileDir = Join-Path $dshHome "profiles/$Profile"
  pnpm --dir $profileDir add '@nanmicoder/dsh-agent-teams@^0.1.4' 'dshmarket@^1.4.1'
  if ($LASTEXITCODE -ne 0) { throw 'Profile dependency installation failed.' }

  $manifest = Join-Path $profileDir 'package.json'
  node -e "const fs=require('fs');const p=process.argv[1];const m=JSON.parse(fs.readFileSync(p,'utf8'));const b=m.dsh?.profile?.bundles;if(Array.isArray(b))m.dsh.profile.bundles=b.filter(x=>!['@nanmicoder/dsh-agent-teams','dshmarket'].includes(x));fs.writeFileSync(p,JSON.stringify(m,null,2)+'\n')" $manifest
  if ($LASTEXITCODE -ne 0) { throw 'Duplicate bundle cleanup failed.' }
} finally {
  Remove-Item -Recurse -Force $workspace -ErrorAction SilentlyContinue
}

Write-Host "Ant Sword installed. Start with: dsh web"