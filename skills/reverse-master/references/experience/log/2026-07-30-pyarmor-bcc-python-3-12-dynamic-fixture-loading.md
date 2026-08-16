---
title: "PyArmor BCC Python 3.12 dynamic fixture loading"
category: "deobfuscation"
tags: ["PyInstaller", "PyArmor", "Python312", "Windows", "pyd-layout", "MITM"]
created: 2026-07-30
source_task: "H:\Playground\qoder-research\wuxianxubei-xianyu\qodervip"
reusable_script: "H:\Playground\qoder-research\wuxianxubei-xianyu\qodervip_analysis\dump_decrypted.py"
status: "candidate"
---

# PyArmor BCC Python 3.12 dynamic fixture loading

## Applies When
- PyInstaller contains Python 3.12 `.pyc`, PyArmor BCC wrappers, and native extensions.
- The extracted package places `__init__.pyc` in `PYZ.pyz_extracted` while the matching `.pyd` remains at the application root.

## Evidence
- Runtime behavior: Python 3.13 loads the `.pyc` but the PyArmor runtime rejects `python312.dll`; Python 3.12 imports the runtime and decrypts module wrappers.
- Network/file/process evidence: copying only the runtime package and native extension into an analysis-only shim lets `fingerprint`, `gateway_pool`, and interceptor modules load without starting the application.
- Static/source evidence: PyArmor BCC functions expose `co_consts[2]` as a bound `bcc_<line>` method whose bound tuple retains names, literals, endpoints, and field mappings.

## Workflow
1. Inventory the PyInstaller extraction and identify the embedded Python ABI from `python312.dll` and extension suffixes.
2. Use a matching Python 3.12 embeddable interpreter and add the target root, `PYZ.pyz_extracted`, and an analysis shim to `sys.path`.
3. Copy only required native modules into the shim: `pyarmor_runtime`, `mitmproxy_rs`, and package-specific extensions such as `zstandard`.
4. Import modules one at a time, record names and sanitized constants, and avoid importing the main entry point.
5. Treat BCC wrappers as native dispatch: collect function metadata and bound constant tuples instead of relying on `dis` for the wrapper body.
6. Run deterministic fake-flow tests for response rewrites and request short-circuits; keep real tokens, keys, and machine values out of artifacts.

## Validation
- Command: `tools\python312\python.exe verify_behavior.py`
- Expected decisive output: JSON with `ok: true`, response rewrite checks, telemetry block checks, and 32-character UUID/MD5 device-pair checks.
- Sample or artifact hash: `dynamic_probe\behavior_results.json` and `dynamic_probe\decrypted_index.json`.

## Pitfalls
- Python 3.13 reports a `python312.dll` ABI conflict; use Python 3.12.
- Importing the `.pyd` from the application root alone fails when the package initializer is inside the extracted PYZ tree; create a separate shim package and copy both pieces.
- `dis.get_instructions()` can raise an access violation on protected BCC code objects. Read metadata and sanitized constant tuples, and use a child process for probes.
- Importing the real entry point may start proxy, certificate, or system integration components; module-level imports plus fake flow objects give reproducible evidence with lower side effects.

## Reusable Assets
- Script: H:\Playground\qoder-research\wuxianxubei-xianyu\qodervip_analysis\dump_decrypted.py
- Config/template: `pyarmor_probe.py` and `verify_behavior.py` in the analysis directory.

## Promotion Notes
- Promote to stable after clean reproduction or repeated reuse.
