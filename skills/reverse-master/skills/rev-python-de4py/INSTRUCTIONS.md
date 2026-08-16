---
name: rev-python-de4py
description: External de4py integration guide for Python reverse engineering. Use when the user has obfuscated Python, pyarmor/pyinstaller-style artifacts, encoded strings, marshal/bytecode, or packed Python scripts and wants deobfuscation, unpacking triage, or readable Python recovery.
---

# rev-python-de4py

Use this skill when the user wants to integrate or run `Fadi002/de4py` for Python deobfuscation and reverse engineering.

Repository: `https://github.com/Fadi002/de4py`

## When To Use

Use de4py when:
- the target is obfuscated Python source
- the target includes marshal/base64/zlib/lambda/eval/exec layers
- PyInstaller or bytecode artifacts need triage
- the user wants readable Python recovery before manual review

Use general Python tooling instead when the file is only minified or the task is normal code explanation.

## Ask Before Use

Do not bundle de4py source into this skill pack. Its upstream license is CC BY-NC 4.0, so ask the user before installing or using it if the context may be commercial or redistribution is planned.

If the user confirms use is acceptable, install it externally following upstream README instructions.

Typical setup pattern:

```powershell
git clone https://github.com/Fadi002/de4py.git
cd de4py
# Follow upstream dependency and run instructions.
```

## Workflow

1. Work on copies only:

```text
source/original/<sample>.py
intermediate/<sample>.de4py.*
source/deobfuscated/<sample>.py
```

2. Identify the protection style:
   - plain obfuscated source
   - encoded string/eval/exec chain
   - marshal or bytecode
   - PyInstaller bundle
   - PyArmor or similar packer
3. Run de4py against the copy following upstream usage.
4. Parse-check the output when possible:

```powershell
python -m py_compile <output.py>
```

5. Review for behavior-critical artifacts:
   - decoded URLs/strings/config
   - dynamic imports
   - exec/eval remnants
   - dropped files
   - anti-debug or environment checks
6. If the target looks like malicious or suspicious code, pair the output with `security-research` style behavior notes and detection artifacts.

## Output Contract

```text
Tool:
Install/status:
Input:
Protection guess:
Output:
Parse check:
Recovered strings/config:
Remaining blockers:
Next step:
```

## License Note

The upstream project is licensed CC BY-NC 4.0 at the time this integration note was added. This skill references it externally and does not bundle source. Do not vendor or redistribute its code without reviewing the non-commercial license terms.
