# reverse-master-skills

GPL-3.0 reverse-engineering skill pack for JS/Web and binary/native work.

This pack combines a master router with specialized skills copied and organized from the local open-source skill folders under `h:\Skills\Creater-Studio`.

## Authorized Research Baseline

This pack is intended for CTFs, lab environments, authorized assessments, local sample analysis, owned app/API analysis, and malware/sample triage. When those signals are present, the skills should proceed with concrete reverse-engineering help instead of repeatedly asking for authorization.

Read `references/authorized-research-context.md` for the exact baseline, boundary, and output style. The pack intentionally does not include wording tricks or encoded terminology for avoiding review; it keeps the authorization context explicit and uses normal technical language.

## Layout

```text
reverse-master-skills/
|-- SKILL.md
|-- LICENSE
|-- NOTICE.md
|-- README.md
|-- skills/
|   |-- rev-js-workflow/INSTRUCTIONS.md
|   |-- rev-js-crypto-entry/INSTRUCTIONS.md
|   |-- rev-js-ast/INSTRUCTIONS.md
|   |-- rev-js-deobfuscate-mcp/INSTRUCTIONS.md
|   |-- rev-js-deobfuscator-cli/INSTRUCTIONS.md
|   |-- rev-js-env/INSTRUCTIONS.md
|   |-- rev-js-automation/INSTRUCTIONS.md
|   |-- rev-js-hook-platform/INSTRUCTIONS.md
|   |-- rev-android-androidmeda/INSTRUCTIONS.md
|   |-- rev-python-de4py/INSTRUCTIONS.md
|   |-- rev-bin-frida/INSTRUCTIONS.md
|   |-- rev-bin-idapython/INSTRUCTIONS.md
|   |-- rev-bin-symbol/INSTRUCTIONS.md
|   |-- rev-bin-struct/INSTRUCTIONS.md
|   |-- rev-bin-unicorn-debug/INSTRUCTIONS.md
|   |-- rev-bin-dex-dumper/INSTRUCTIONS.md
|   |-- rev-bin-u3d-dump/INSTRUCTIONS.md
|   |-- rev-bin-ios-dump/INSTRUCTIONS.md
|   |-- rev-bin-radare2/INSTRUCTIONS.md        # merged: radare2 CLI 分析
|   |-- rev-dotnet/INSTRUCTIONS.md             # merged: .NET/C# 逆向
|   |-- rev-bin-diff/INSTRUCTIONS.md           # merged: 跨版本符号迁移
|   |-- rev-android-apk/INSTRUCTIONS.md        # merged: APK 解包/jadx/smali/重打包
|   |-- rev-mobile-deep/INSTRUCTIONS.md        # merged: Android+iOS OWASP MSTG
|   `-- rev-methodology/INSTRUCTIONS.md        # merged: 通用逆向方法论 20+ 篇 + OLLVM
|-- references/
|-- scripts/
|-- templates/
|-- tools/
|   |-- launchers/
|   `-- vendor/
`-- licenses/
```

## Skills

Import this package as one skill: `reverse-master`. The `skills/` directories are bundled internal modules, not separate importable skills. Each module uses `INSTRUCTIONS.md` so zip importers that recursively scan `SKILL.md` files only discover the root skill.

JS skills:
- `rev-js-workflow`: evidence-first Web JS reverse workflow and stage routing.
- `rev-js-crypto-entry`: locate sign/token/enc/cookie writers and call chains.
- `rev-js-ast`: Babel AST deobfuscation playbook.
- `rev-js-deobfuscate-mcp`: external `deobfuscate-mcp-server` MCP navigation/deobfuscation integration.
- `rev-js-deobfuscator-cli`: external `kuizuo/js-deobfuscator` CLI/API integration.
- `rev-js-env`: Node.js/vm/jsdom/browser-environment fitting and webpack extraction.
- `rev-js-automation`: JSRPC, Flask proxy, Burp autoDecoder artifact generation.
- `rev-js-hook-platform`: GPL jshook CDP/hook/debugging platform reference.

Android/Python external integrations:
- `rev-android-androidmeda`: external Androidmeda APK/Java reverse analysis integration.
- `rev-python-de4py`: external de4py Python deobfuscation integration.

Binary skills:
- `rev-bin-symbol`: function symbol recovery.
- `rev-bin-struct`: structure layout recovery.
- `rev-bin-idapython`: IDAPython/IDALib snippets (+ merged IDA MCP cheatsheet, deep workflow, open/start scripts).
- `rev-bin-frida`: modern Frida hook generation (+ merged frida-cookbook, bypass-kit, objection-deep).
- `rev-bin-unicorn-debug`: focused Unicorn emulation.
- `rev-bin-dex-dumper`: Android DEX dumping.
- `rev-bin-u3d-dump`: Unity IL2CPP symbol/type dumping.
- `rev-bin-ios-dump`: decrypted iOS IPA/Mach-O dumping.
- `rev-bin-radare2` *(merged)*: radare2/r2 CLI recon, disasm, patch, radiff2 binary diffing.
- `rev-bin-diff` *(merged)*: cross-version symbol migration / LLM-assisted bindiff.

.NET / Android / Mobile skills:
- `rev-dotnet` *(merged)*: .NET/C# managed-PE reversing, dnSpyEx + de4dot, ConfuserEx/obfuscator handling, Sharp* tools.
- `rev-android-apk` *(merged)*: full APK unpack → jadx → smali → repack+sign → Frida CLI workflow (bundled scripts + debug.keystore).
- `rev-mobile-deep` *(merged)*: unified Android+iOS OWASP MSTG methodology, SSL-pinning / root / jailbreak bypass.

Cross-cutting methodology:
- `rev-methodology` *(merged)*: the deep cross-language/platform RE pattern library (20+ docs), OLLVM deobfuscation, Go/kernel-driver/ELF analysis, CTF reverse patterns, and DSL/VM reversing. General fallback when no single tool module dominates.

## Install

This implementation intentionally stays in the current workspace. To install later, copy either the individual skill folders or the whole pack into the target skill root used by your agent.

Typical Codex layout:

```text
C:\Users\xiaom\.codex\skills\
```

## Validate

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\reverse-master-skills\scripts\validate_skill_pack.ps1
```

The validator checks:
- exactly one importable `SKILL.md` exists
- the root skill has `name` and `description` frontmatter
- authorized research context reference exists
- expected copied resources exist
- `NOTICE.md` lists the copied source projects and licenses
- embedded tool launchers and vendored tool directories exist
- external tool integration notes exist

## Quick Tool Calls

Embedded tools can be called through launchers:

```powershell
powershell -ExecutionPolicy Bypass -File .\reverse-master-skills\tools\launchers\run-js-deobfuscator.ps1 -InputFile .\sample.js -OutputDir .\out-js
powershell -ExecutionPolicy Bypass -File .\reverse-master-skills\tools\launchers\run-androidmeda.ps1 -SourceDir .\jadx\sources\com\example -OutputDir .\out-android -Provider ollama -Model llama3.2 -SaveCode
```

Tools that need MCP configuration or license confirmation are not embedded. The relevant skill should ask the user when needed.

## Startup Prompt

For manual agent launches, copy `templates/authorized-reverse-agent-startup-prompt.md` into the agent startup flow. It injects the authorized research context once, routes the agent toward `reverse-master`, and gives it a structured task input block.

## License

This aggregate skill pack is distributed under GPL-3.0 because it includes GPL-3.0 `jshook-reverse` material. Some bundled subdirectories came from MIT, Apache-2.0, and BSD-3-Clause projects; see `NOTICE.md` and `licenses/`.

`js-deobfuscator` and `Androidmeda` are vendored for quick local use. `deobfuscate-mcp-server` is not embedded because it requires MCP configuration. `de4py` is not embedded because upstream is CC BY-NC 4.0; review the non-commercial terms before installing or using it.

