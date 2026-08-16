$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$errors = New-Object System.Collections.Generic.List[string]

function Add-Err($message) {
    $errors.Add($message) | Out-Null
}

$skillFiles = Get-ChildItem -Path $root -Recurse -File -Include "SKILL.md", "skill.md" |
    Where-Object { $_.FullName -notmatch "\\node_modules\\" }

if ($skillFiles.Count -eq 0) {
    Add-Err "No SKILL.md files found."
}

if ($skillFiles.Count -ne 1) {
    Add-Err "Expected exactly one importable SKILL.md, found $($skillFiles.Count). Rename bundled module instructions to INSTRUCTIONS.md."
}

$rootSkillPath = Join-Path $root "SKILL.md"
if (-not (Test-Path -LiteralPath $rootSkillPath)) {
    Add-Err "Missing root SKILL.md."
}

foreach ($file in $skillFiles) {
    if ($file.FullName -ne (Resolve-Path $rootSkillPath).Path) {
        Add-Err "Unexpected nested skill file: $($file.FullName)"
    }
}

$names = @{}
foreach ($file in $skillFiles) {
    $content = Get-Content -Raw -Encoding UTF8 $file.FullName
    if ($content -notmatch "(?s)^---\s*\r?\n(.+?)\r?\n---") {
        Add-Err "Missing YAML frontmatter: $($file.FullName)"
        continue
    }

    $frontmatter = $matches[1]
    if ($frontmatter -notmatch "(?m)^name:\s*(.+)$") {
        Add-Err "Missing name in frontmatter: $($file.FullName)"
    } else {
        $name = $matches[1].Trim().Trim('"').Trim("'")
        if ($names.ContainsKey($name)) {
            Add-Err "Duplicate skill name '$name': $($names[$name]) and $($file.FullName)"
        } else {
            $names[$name] = $file.FullName
        }
    }

    if ($frontmatter -notmatch "(?m)^description:\s*(.+)$") {
        Add-Err "Missing description in frontmatter: $($file.FullName)"
    }
}

$expectedPaths = @(
    "LICENSE",
    "NOTICE.md",
    "README.md",
    "SKILL.md",
    "skills/rev-js-workflow/INSTRUCTIONS.md",
    "skills/rev-js-crypto-entry/INSTRUCTIONS.md",
    "skills/rev-js-ast/INSTRUCTIONS.md",
    "skills/rev-js-deobfuscate-mcp/INSTRUCTIONS.md",
    "skills/rev-js-deobfuscator-cli/INSTRUCTIONS.md",
    "skills/rev-js-env/INSTRUCTIONS.md",
    "skills/rev-js-env/scripts/proxy_monitor.js",
    "skills/rev-js-env/scripts/webpack_runtime.js",
    "skills/rev-js-automation/INSTRUCTIONS.md",
    "skills/rev-js-hook-platform/INSTRUCTIONS.md",
    "skills/rev-android-androidmeda/INSTRUCTIONS.md",
    "skills/rev-python-de4py/INSTRUCTIONS.md",
    "skills/rev-bin-frida/INSTRUCTIONS.md",
    "skills/rev-bin-idapython/INSTRUCTIONS.md",
    "skills/rev-bin-symbol/INSTRUCTIONS.md",
    "skills/rev-bin-struct/INSTRUCTIONS.md",
    "skills/rev-bin-unicorn-debug/INSTRUCTIONS.md",
    "skills/rev-bin-dex-dumper/INSTRUCTIONS.md",
    "skills/rev-bin-u3d-dump/INSTRUCTIONS.md",
    "skills/rev-bin-ios-dump/INSTRUCTIONS.md",
    "references/authorized-research-context.md",
    "references/reverse-experience-summary.md",
    "references/vscode-cursor-extension-audit.md",
    "references/external-tools.md",
    "tools/README.md",
    "tools/launchers/run-js-deobfuscator.ps1",
    "tools/launchers/run-js-deobfuscator-batch.ps1",
    "tools/launchers/run-androidmeda.ps1",
    "tools/vendor/js-deobfuscator/package.json",
    "tools/vendor/js-deobfuscator/LICENSE",
    "tools/vendor/Androidmeda/androidmeda.py",
    "tools/vendor/Androidmeda/LICENSE",
    "templates/authorized-reverse-agent-startup-prompt.md",
    "references/hello-js-references/workflow-overview.md",
    "references/hello-js-cases/README.md",
    "references/js-reverse-sop/README.md",
    "scripts/hello-js/crypto-identifier.js",
    "templates/hello-js/node-request/main.js",
    "licenses/jshook-reverse.GPL-3.0.LICENSE",
    "licenses/ai-reverse-toolkit-video.MIT.LICENSE",
    "licenses/js-reverse-automation.Apache-2.0.LICENSE",
    "licenses/rs-reverse.BSD-3-Clause.LICENSE",
    "licenses/sdenv.BSD-3-Clause.LICENSE"
)

foreach ($relative in $expectedPaths) {
    $path = Join-Path $root $relative
    if (-not (Test-Path -LiteralPath $path)) {
        Add-Err "Missing expected path: $relative"
    }
}

$notice = Get-Content -Raw -Encoding UTF8 (Join-Path $root "NOTICE.md")
foreach ($term in @("reverse-skills-main", "ai-reverse-toolkit-video", "js-reverse-automation", "jshook-reverse", "hello_js_reverse_skill", "reverse-skill-jsr-skills", "rs-reverse", "sdenv", "deobfuscate-mcp-server", "js-deobfuscator", "Androidmeda", "de4py")) {
    if ($notice -notmatch [regex]::Escape($term)) {
        Add-Err "NOTICE.md missing source term: $term"
    }
}

if ($errors.Count -gt 0) {
    Write-Host "Validation failed:" -ForegroundColor Red
    foreach ($err in $errors) {
        Write-Host " - $err" -ForegroundColor Red
    }
    exit 1
}

Write-Host "Validation passed."
Write-Host "Skill files: $($skillFiles.Count)"
Write-Host "Unique skill names: $($names.Count)"
