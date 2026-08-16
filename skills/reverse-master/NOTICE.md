# Notices

This aggregate skill pack is GPL-3.0 because it includes GPL-3.0 material from `jshook-reverse`.

## Copied Sources

### reverse-skills-main

- Source path: `h:\Skills\Creater-Studio\reverse-skills-main`
- License: MIT, as stated in the source README
- Copied into:
  - `skills/rev-bin-frida`
  - `skills/rev-bin-idapython`
  - `skills/rev-bin-symbol`
  - `skills/rev-bin-struct`
  - `skills/rev-bin-unicorn-debug`
  - `skills/rev-bin-dex-dumper`
  - `skills/rev-bin-u3d-dump`
  - `skills/rev-bin-ios-dump`

### ai-reverse-toolkit-video

- Source path: `h:\Skills\Creater-Studio\ai-reverse-toolkit-video`
- License: MIT
- Copied into:
  - `skills/rev-js-crypto-entry`
  - `skills/rev-js-ast`
  - `skills/rev-js-env`

### js-reverse-automation

- Source path: `h:\Skills\Creater-Studio\reverse-skill-jsr-skills-15-a3e116e\项目资料\js-reverse-automation--skill-main`
- License: Apache-2.0
- Copied into:
  - `skills/rev-js-automation`

### jshook-reverse

- Source path: `h:\Skills\Creater-Studio\jshook-skill-main`
- License: GPL-3.0
- Copied into:
  - `skills/rev-js-hook-platform`

### hello_js_reverse_skill

- Source path: `h:\Skills\Creater-Studio\hello_js_reverse_skill-3.2.0`
- License file: not found in the local source directory during implementation
- Copied into:
  - `references/hello-js-references`
  - `references/hello-js-cases`
  - `scripts/hello-js`
  - `templates/hello-js`
- Usage note: copied as local reference material in this GPL aggregate. Review upstream license before redistributing outside this workspace.

### reverse-skill-jsr-skills

- Source path: `h:\Skills\Creater-Studio\reverse-skill-jsr-skills-15-a3e116e`
- License file: not found at repository root during implementation
- Copied into:
  - `skills/rev-js-workflow`
  - `references/js-reverse-sop`
- Usage note: copied as local reference material in this GPL aggregate. Review upstream license before redistributing outside this workspace.

### reverse-skill router pack (2026-07 upgrade)

- Source path: `H:\Skills\Creater-Studio\reverse-skill`
- License: MIT (reverse-skill main), per its LICENSE/README
- Copied into (path references rewritten to this pack's anchor files; technical content unchanged):
  - `skills/rev-methodology` ← `reverse-skill/skills/reverse-engineering`（跨语言/平台方法论 20+ 篇 + OLLVM 脱混淆 + dsl-vm-reverse）
  - `skills/rev-bin-radare2` ← `reverse-skill/skills/radare2`
  - `skills/rev-dotnet` ← `reverse-skill/skills/dotnet-reverse`
  - `skills/rev-bin-diff` ← `reverse-skill/skills/binary-diff`
  - `skills/rev-mobile-deep` ← `reverse-skill/skills/mobile-reverse`
  - `skills/rev-android-apk` ← `reverse-skill/skills/apk-reverse`（含 decode/frida-run/rebuild-sign/manifest 脚本 + debug.keystore）
  - `skills/rev-bin-idapython/references/{ida-mcp-cheatsheet,ida-workflow-deep}.md`、`scripts/{open,start}.ps1` ← `reverse-skill/skills/ida-reverse`
  - `skills/rev-bin-frida/references/{frida-cookbook,frida-bypass-kit,frida-objection-deep}.md` ← `reverse-skill/skills/{apk-reverse,mobile-reverse}`
- Usage note: copied as local reference material in this GPL aggregate. All targets assumed authorized (CTF/lab/owned). Review upstream MIT terms before redistributing outside this workspace.

## Referenced But Not Bundled

### rs-reverse

- Source path: `h:\Skills\Creater-Studio\reverse-skill-jsr-skills-15-a3e116e\项目资料\rs-reverse-main`
- License: BSD-3-Clause
- Not copied wholesale because it is a large tool with runtime dependencies.
- Referenced as an optional external tool for RS/瑞数 analysis.

### sdenv

- Source path: `h:\Skills\Creater-Studio\reverse-skill-jsr-skills-15-a3e116e\项目资料\sdenv-main`
- License: BSD-3-Clause
- Not copied wholesale because it is a large runtime framework with native dependencies.
- Referenced as an optional external tool for browser environment fitting.

### ricardodeazambuja/deobfuscate-mcp-server

- Repository: `https://github.com/ricardodeazambuja/deobfuscate-mcp-server`
- License observed during integration: MIT
- Not bundled; referenced by `skills/rev-js-deobfuscate-mcp`.

### kuizuo/js-deobfuscator

- Repository: `https://github.com/kuizuo/js-deobfuscator`
- License observed during integration: MIT
- Bundled into `tools/vendor/js-deobfuscator`.
- Referenced by `skills/rev-js-deobfuscator-cli`.

### In3tinct/Androidmeda

- Repository: `https://github.com/In3tinct/Androidmeda`
- License observed during integration: Apache-2.0
- Bundled into `tools/vendor/Androidmeda`.
- Referenced by `skills/rev-android-androidmeda`.

### Fadi002/de4py

- Repository: `https://github.com/Fadi002/de4py`
- License observed during integration: CC BY-NC 4.0
- Not bundled; referenced by `skills/rev-python-de4py`.
- Review the non-commercial terms before vendoring, redistributing, or using in a commercial workflow.

## License Files

Copies of available upstream licenses are stored under `licenses/`.
