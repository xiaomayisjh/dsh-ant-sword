# Reverse Experience Index

**⚠️ MANDATORY ENTRY POINT - READ THIS FIRST ⚠️**

This is the mandatory first durable-memory file to read for every `reverse-master` task. It routes to reusable experience, scripts, and self-evolution rules without loading the full skill pack. Skipping this file causes repeated work and repeated pitfalls.

## Required Start (DO NOT SKIP)

**Execute these steps in order every time this skill is triggered:**

1. ✅ **Read this file** (`references/experience-index.md`)
2. ✅ **Read** `references/reverse-experience-summary.md`
3. ✅ **Select the smallest route** from `SKILL.md` based on task type
4. ✅ **Read the matching task-specific experience file** from the table below
5. ✅ **Check** `scripts/reusable/` before writing a new helper from scratch

## Experience Routes

| Task signal | Read next | Reusable helpers |
|---|---|---|
| Geetest, captcha SDK, slider, click-order, HAR login replay, SSO challenge | `experience/captcha-replay.md` | `../security-research/scripts/reusable/har_summary.py` if available |
| Packed APK/DEX, PE/ELF packer, PyInstaller, OEP, dump, IAT, shell unpacking | `experience/unpacking.md` | `scripts/reusable/frida/trace_exports.js`, security `pe_entropy_triage.py` |
| JS obfuscation, `_0x`, JSVMP, webpack, Python marshal/zlib, eval/exec | `experience/deobfuscation.md` | `scripts/reusable/js/obfuscation-fingerprint.js`, `scripts/reusable/python/layer_decoder.py` |
| Frida/IDA/IDA MCP/Unicorn/dynamic tracing pitfalls or repeated debug harnesses | `reverse-experience-summary.md` plus selected internal module | `scripts/reusable/frida/trace_exports.js` |
| New reusable result from current task | `experience/research-log-template.md` | `scripts/reusable/new-research-entry.ps1` |

## Storage Rules

Long-term skill storage should contain reusable method:

- stable decision rules
- input/output contracts
- scripts with examples
- tool versions and license notes
- validation checkpoints
- pitfalls and rollback points

Current project storage should contain target state:

- samples, dumps, HARs, PCAPs, screenshots
- recovered proprietary assets
- challenge-specific tokens/cookies
- large intermediate outputs
- raw logs

## Promotion Rules

Use three levels:

| Level | Meaning | Location |
|---|---|---|
| `candidate` | Useful once, not yet generalized | `references/experience/log/` |
| `stable` | Reused or cleanly reproduced | `references/experience/*.md` |
| `deprecated` | Replaced or unsafe to apply blindly | keep note with reason |

Before promoting, verify:

- what input signal selects the workflow
- which command/script runs it
- what output proves success
- when it fails
- what to inspect before trusting it

## IDA MCP Rule

If IDA MCP is the right interface, verify that IDA has the correct target loaded before using it. When the active IDB cannot be verified, ask the user to open the required binary in IDA and wait for auto-analysis to finish. This avoids reading functions, xrefs, names, or decompiler output from a stale database left over from another task.

## Current Durable Assets

| Path | Purpose |
|---|---|
| `references/reverse-experience-summary.md` | Compact cross-domain experience summary |
| `references/experience/captcha-replay.md` | Captcha SDK/replay and login-chain experience |
| `references/experience/unpacking.md` | Unpacking and dump validation experience |
| `references/experience/deobfuscation.md` | JS/Python/native deobfuscation decision rules |
| `scripts/reusable/new-research-entry.ps1` | Create structured candidate notes |
| `scripts/reusable/js/obfuscation-fingerprint.js` | Fast JS obfuscation feature report |
| `scripts/reusable/python/layer_decoder.py` | Safe recursive decode/decompress helper |
| `scripts/reusable/frida/trace_exports.js` | Frida export tracing template |

## Bundled Methodology Modules (deep references)

These modules were merged from the `reverse-skill` pack. Read the module `INSTRUCTIONS.md` first, then only the topic file you need — do not load a whole module at once.

| Module | Deep references | Read when |
|---|---|---|
| bundle `../../reverse-engineering/SKILL.md` | cross-language/platform pattern library, OLLVM, CTF reverse patterns (merged from rev-methodology) | Use when a general reversing methodology or pattern library is needed first |
| bundle `../../radare2/SKILL.md` | CLI-first r2 recon/disasm/patch/diff (merged from rev-bin-radare2) | Use for CLI-first binary analysis without a GUI |
| bundle `../../dotnet-reverse/SKILL.md` | .NET/C# managed PE, Sharp* tools, de4dot (merged from rev-dotnet) | Use for managed-PE reversing |
| bundle `../../binary-diff/SKILL.md` | Cross-version symbol migration / bindiff (merged from rev-bin-diff) | Use for symbol migration between versions |
| bundle `../../apk-reverse/SKILL.md` | APK unpack→jadx→smali→repack→Frida CLI workflow (merged from rev-android-apk) | Use for full APK workflows |
| bundle `../../mobile-reverse/SKILL.md` | Android+iOS OWASP MSTG, pinning/root/jailbreak bypass (merged from rev-mobile-deep) | Use for cross-platform mobile testing |
| bundle `../../ida-reverse/SKILL.md` | IDA MCP / IDAPython deep workflow (merged from rev-bin-idapython) | Use for IDA/headless analysis |
