---
name: rev-android-androidmeda
description: External Androidmeda integration guide for Android reverse engineering. Use when the user has an Android APK, Java/JADX output, or obfuscated Android source and wants automated Java deobfuscation, flow analysis, vulnerability-oriented findings, or a structured report before deeper Frida/DEX/IDA work.
---

# rev-android-androidmeda

Use this skill when the user wants to integrate or run `In3tinct/Androidmeda` for Android reverse engineering.

Repository: `https://github.com/In3tinct/Androidmeda`

## When To Use

Use Androidmeda when:
- the target is an APK or decompiled Android Java source
- the user wants a higher-level Java/source report before native work
- obfuscated Java identifiers obscure data flow
- the task needs vulnerability-oriented review of Android code

Route elsewhere when:
- memory DEX extraction is the blocker -> `rev-bin-dex-dumper`
- native `.so` runtime behavior is the blocker -> `rev-bin-frida`
- JNI/native symbol or struct work is needed -> `rev-bin-symbol`, `rev-bin-struct`, or the bundle ida-reverse skill

## Embedded Tool

This skill pack vendors Androidmeda under:

```text
tools/vendor/Androidmeda
```

Prefer the bundled launcher:

```powershell
powershell -ExecutionPolicy Bypass -File tools/launchers/run-androidmeda.ps1 -SourceDir <jadx-sources-dir> -OutputDir <out-dir> -Provider ollama -Model llama3.2 -SaveCode
```

The launcher installs `requirements.txt` with pip on first run and invokes `androidmeda.py`.

Prepare standard Android reverse inputs:
- APK file
- JADX/JD-GUI/decompiled Java directory if required
- package name and app version
- known target behavior or suspicious feature

Ask the user before using cloud LLM providers if API keys, data handling, or model choice are unclear. For private samples, prefer `-Provider ollama` with a local model when available.

## Workflow

1. Normalize the input:

```text
APK/source path:
Package:
Goal:
Known suspicious APIs:
Native libraries:
Expected output:
```

2. Run the bundled launcher or Androidmeda directly when custom flags are needed.
3. Save the report into the current analysis workspace.
4. Extract findings into a concise triage:
   - suspicious classes/methods
   - sensitive API usage
   - obfuscation hotspots
   - native/JNI boundaries
   - recommended next skill
5. Hand off:
   - Java deobfuscation/data-flow follow-up stays in Androidmeda/JADX
   - DEX unpacking -> `rev-bin-dex-dumper`
   - runtime hooks -> `rev-bin-frida`
   - native static recovery -> the bundle ida-reverse skill

## Verification

Before relying on results, verify:
- the APK/source analyzed is the intended version
- the tool completed without fatal dependency errors
- reported class/method names map back to decompiled files
- any vulnerability or behavior claim has a file/method anchor

## License Note

Androidmeda is vendored in `tools/vendor/Androidmeda` under Apache-2.0. See `NOTICE.md` and the upstream `LICENSE`.
