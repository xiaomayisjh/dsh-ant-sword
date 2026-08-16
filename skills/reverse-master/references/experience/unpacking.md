# Unpacking Experience

Use this for packed binaries, APK/DEX dumping, PyInstaller, native dump/IAT repair, and shell recovery.

## Start With Triage

Collect:

- format, architecture, entry point
- file hash and size
- section names, sizes, permissions, entropy
- imports/exports and sparse import signals
- TLS callbacks, overlay, resources
- packer/compiler hints from DIE or equivalent

For PE triage, the security skill provides `scripts/reusable/pe_entropy_triage.py`.

If deeper static analysis needs IDA MCP, first verify that IDA has the exact sample or fixed dump loaded. If not, ask the user to load it in IDA and wait for auto-analysis to complete before requesting functions, xrefs, strings, segments, or decompiler output through MCP.

## Route Matrix

| Target | First route | Validation |
|---|---|---|
| Android packed APK | `rev-bin-dex-dumper` | dumped DEX files non-empty and parse in jadx |
| Python packed/obfuscated | `rev-python-de4py` or `scripts/reusable/python/layer_decoder.py` | readable output compiles or decompiles |
| Windows native packer | x64dbg/OEP/dump/IAT repair; Frida only for focused runtime evidence | fixed dump imports and reaches original logic |
| Unity IL2CPP | `rev-bin-u3d-dump` | `script.json`, `dump.cs`, headers match same build |
| iOS encrypted IPA | bundle mobile-reverse skill | Mach-O `cryptid` is 0 |

## Dump Validation

Do not treat a dump file as solved until:

- magic/header is correct
- size is plausible
- imports or metadata are restored enough for tools
- decompiler/disassembler can parse it
- key strings or functions from runtime appear statically
- a small behavior checkpoint reproduces

## Frida Trace Helper

Use `scripts/reusable/frida/trace_exports.js` when you need a quick export-level trace before writing a task-specific hook. It is a template; set module and regex in the script header or inject globals according to your Frida runner.

## Pitfalls

- Dumping the wrong module because the real payload loads later.
- Hooking before module load; use module-load-aware hooks for Android/iOS/native.
- Saving only fixed dump without raw dump and OEP notes.
- Letting a tool rename or patch the only copy.
- Assuming packer name implies one fixed workflow.
