# External Reverse Tools

Some tools are embedded for fast local use. Tools that require MCP configuration, cloud/provider setup, or restrictive license review remain ask-user-first integrations.

## JavaScript

### ricardodeazambuja/deobfuscate-mcp-server

Use for MCP-based JavaScript code navigation and deobfuscation assistance. This is not embedded because MCP setup is environment-specific.

Best fit:
- large bundled/minified JS where orientation is the blocker
- module/function/class/string/import/export discovery
- preparing a precise target for the bundle js-reverse skill

Skill: `rev-js-deobfuscate-mcp`

### kuizuo/js-deobfuscator

Use as an embedded Babel-based JS deobfuscation CLI/API.

Best fit:
- common obfuscator.io/string-array/control-flow cleanup
- first-pass deobfuscation before the bundle js-reverse skill's custom transforms
- local JS files where behavior can be parse-checked and checkpointed

Skill: `rev-js-deobfuscator-cli`

Launcher:

```powershell
powershell -ExecutionPolicy Bypass -File tools/launchers/run-js-deobfuscator.ps1 -InputFile <input.js> -OutputDir <out-dir>
```

## Android

### In3tinct/Androidmeda

Use for embedded Android Java/source-level reverse analysis and reporting.

Best fit:
- APK or decompiled Java review
- obfuscated Java data-flow triage
- vulnerability-oriented reports
- mapping Java findings to native/JNI follow-up

Skill: `rev-android-androidmeda`

Launcher:

```powershell
powershell -ExecutionPolicy Bypass -File tools/launchers/run-androidmeda.ps1 -SourceDir <jadx-source-dir> -OutputDir <out-dir> -Provider ollama -Model llama3.2 -SaveCode
```

## Python

### Fadi002/de4py

Use for Python deobfuscation and unpacking triage. This is not embedded because upstream is CC BY-NC 4.0.

Best fit:
- obfuscated Python source
- marshal/base64/zlib/eval/exec layers
- PyInstaller or bytecode-oriented triage
- readable Python recovery before manual analysis

Skill: `rev-python-de4py`

## Integration Rules

- Use embedded launchers first for vendored script tools.
- Install external tools outside `reverse-master-skills` only when they are not embedded.
- Ask the user before changing MCP configuration or using tools with restrictive/non-commercial licenses.
- Work on target copies, not originals.
- Save intermediate outputs and validation notes in the active analysis workspace.
- Parse-check deobfuscated code when possible.
- Treat external tool output as evidence to inspect, not as a final proof by itself.
- Check upstream license before vendoring or redistributing any source.
