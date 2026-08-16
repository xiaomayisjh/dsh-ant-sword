# Reverse Experience Summary

This file summarizes the reusable reverse-engineering experience collected into this skill pack.

## Authorized Research Baseline

This skill pack is for CTFs, lab work, authorized assessments, local artifact reverse engineering, owned app/API analysis, and malware/sample triage. When the prompt provides one of those signals, proceed as authorized research and focus on the missing technical evidence instead of repeatedly asking for permission.

Use normal security terminology and keep the authorization context explicit. Do not hide, encode, or rename terms as an output-filter mechanism.

## JS Reverse

### Evidence Before Recovery

Start by proving the real target request, trigger action, writer boundary, and upstream state. Do not deobfuscate a full bundle before the request or field boundary is real.

Recommended route:

```text
intake -> evidence -> locate -> recover -> runtime -> validation -> handoff
```

Use the bundle js-reverse skill when the task stage is unclear or the next thing to prove is where a parameter is written.

### Locate Writers First

Common architectures:
- business code directly assigns the field
- request interceptors add a common signature
- external security SDK exposes an entrypoint and hides the inner logic

Search plain business code first. If obfuscated code encrypts strings, static search inside that file may fail; observe the caller, request builder, or XHR/fetch boundary.

### HAR-Driven Login Replay

For login automation built from HARs, split evidence into boot/session, primary login, SSO or service-ticket exchange, app token, and post-login API phases. Preserve cookies across all hosts and do not treat "login success" as proof that business APIs are ready.

Practical rules:
- Treat captcha as an upstream challenge-producing subsystem. Record challenge fields, solver output, verification response, and retry artifacts. Geetest-style providers may rotate puzzle types, so keep solver type, retries, dump directory, and provider command configurable.
- Name every credential transform by boundary. A page login and an SSO login can use different password encoders or key material; validate each boundary against HAR field shapes instead of assuming one encoder covers the chain.
- For token failures, test header, query, cookie, and referer placement separately and record the server wording. A later container/app token may supersede a stale report token.
- After login, replay a small set of benign business APIs and parse visible identity/report fields into console output and JSON. This proves cookies, token, routed host, referer, and user context together.

### Geetest v4 SDK Replay

When Geetest v4 blocks pure protocol login, do not try to hand-forge `w` first. Reuse the vendor SDK as a local encryptor after proving the `/load -> /verify -> validate` chain.

Before using a saved Geetest profile, compare hard fingerprints: `captcha_id`, `static_path`, `gct_path`, SDK asset hashes, decoded anchor table, and the internal submit function. If any gate differs, use the profile only as a rediscovery checklist.

Reusable pattern:
- Fetch `/load` with `captcha_id`, random `challenge`, `client_type=0`, `pt=0`, and JSONP callback. Keep `captcha_type`, `lot_number`, `payload`, `process_token`, `payload_protocol`, `pt`, `guard`, `check_device`, image fields, and PoW fields.
- Solve the visible task separately. For slide, AntiCAP `Slider_Match` gives the gap; verified answer shape is `{setLeft, passtime, userresponse}` with `setLeft ~= gap_x * 0.8876 * 300 / bg_width` and `userresponse ~= gap_x + 2`. For word, pass an ordered question strip plus target image to a click-order solver and convert centers to 0-10000 coordinate units.
- Execute a local `gcaptcha4.js`/SSO wrapper under `jsdom`, intercept `/load` with the captured payload, patch `guard=false` and `check_device=false` only inside the local replay runtime, then call the recovered internal submit function. Let the SDK produce `w` and call the real `/verify`.
- Useful anchors from the recovered SDK: decoder `$_CO`, `load=$_CO(332)`, `verify=$_CO(667)`, internal submit `$_CO(683)`, public key field `$_CO(535)`, registry getter `$_CO(401)`, validate getter `$_CO(554)`.
- Extract the final login validate object from `/verify` payload or nested `seccode`: `captcha_id`, `lot_number`, `pass_token`, `gen_time`, `captcha_output`.

### Recover Only the Blocking Shell

Use AST recovery for:
- string arrays and accessor functions
- control-flow flattening
- object/proxy helper inlining
- dead-code removal
- webpack module extraction

Keep intermediate files per step so bad transforms can be rolled back.

Use external JS tools when they reduce orientation cost:
- `rev-js-deobfuscate-mcp` for MCP-based bundle navigation, module/function/string discovery, and precise target selection before custom transforms.
- `rev-js-deobfuscator-cli` for a first-pass `js-deobfuscator` cleanup when the target matches common JS obfuscation patterns.
- For VSCode/Cursor extensions or local JS projects where the user asks to "deobfuscate all JS", use the bundled batch launcher before writing custom AST scripts, then read `vscode-cursor-extension-audit.md` for logic and backdoor triage.

In both cases, parse-check output and keep the original plus intermediate files. Treat tool output as a candidate artifact, not as proof of behavioral equivalence.

### VSCode / Cursor Extension Audits

When auditing an unpacked extension:
- Start from `package.json`: main entry, activation events, commands, views, configuration, and scripts.
- Deobfuscate first-party JS/MJS with `tools/launchers/run-js-deobfuscator-batch.ps1`; do not begin by hand-writing a custom deobfuscator unless the bundled tool fails after retry.
- Exclude dependencies and previous outputs (`node_modules`, `vendor`, `reverse-output`).
- Syntax-check every generated `output.js`.
- Map privileged surfaces: webview message handlers, filesystem writes, `child_process`, local HTTP/WebSocket listeners, network endpoints, credential reads, DB access, host-app patching, MCP config rewrites, and remote bridges.
- Separate confirmed hidden backdoor behavior from high-risk documented features such as opt-in remote bridges or account switching.

### Fit Runtime After the Boundary Is Known

Use `rev-js-env` when a known entry diverges outside the browser. Patch only the minimum environment needed to keep the execution path aligned:
- collect missing facts with a Proxy monitor
- compare them against browser values
- distinguish lifecycle-produced state from simple surface properties
- export internal functions by adding explicit `global.__name__ = fn` lines in local copies instead of changing algorithm logic

### Validate With Checkpoints

Final output similarity is not enough when intermediate state diverges. Fix samples and compare:
- input plaintext
- key state objects
- branch decisions
- intermediate crypto material
- final sign/token/cookie
- real request response semantics

## JS Automation Artifacts

Use `rev-js-automation` when the deliverable is integration code rather than pure algorithm recovery:
- `analysis_result.json`
- JSRPC injection code
- Flask proxy
- Burp autoDecoder documentation
- validation report

All generated artifacts should share the same analysis result contract.

## Binary Reverse

### Static Triage

For stripped code, first collect:
- strings
- imports/exports
- callers and callees
- magic constants
- control-flow shape
- known paired call patterns such as alloc/free, lock/unlock, open/close, read/write

Use `rev-bin-symbol` for function names and `rev-bin-struct` for object layouts.

### IDA / IDALib

Use the bundle ida-reverse skill when the task needs scripts for:
- function enumeration
- xref traversal
- import/export analysis
- Hex-Rays decompilation or microcode
- type and struct inspection
- debug memory/register operations
- batch headless analysis

### Dynamic Hooks

Use `rev-bin-frida` for runtime observation. Prefer:
- modern Frida APIs such as `Process.getModuleByName` and module object methods
- module-load-aware hooks through `android_dlopen_ext` or `dlopen`
- stable exports or business functions after load
- `RegisterNatives`, `dlsym`, or real call sites before risky init hooks

Avoid blind constructor or `.init_array` hooks unless evidence shows the critical behavior happens there.

### Local Emulation

Use `rev-bin-unicorn-debug` when the objective is a focused function or decode routine:
- load raw bytes first
- map only needed pages
- stub JNI/libc/syscall/import dependencies
- use hooks for missing memory, code, blocks, and interrupts
- prefer block summaries over noisy instruction traces

### Mobile / Unity

Use:
- `rev-android-androidmeda` for Androidmeda source-level APK/Java analysis and report-oriented triage.
- `rev-bin-dex-dumper` for Android packed DEX extraction
- the bundle mobile-reverse skill for decrypted IPA/Mach-O dumping
- `rev-bin-u3d-dump` for Unity IL2CPP metadata and symbol recovery

Validate outputs before downstream analysis:
- DEX files exist and are non-empty
- iOS `cryptid` is `0`
- IL2CPP `script.json`, `dump.cs`, and `il2cpp.h` match the same build

## Python Reverse

Use `rev-python-de4py` when the target is obfuscated Python source, marshal/base64/zlib/eval/exec layers, bytecode, or PyInstaller-style artifacts. Work on copies, preserve intermediate outputs, and run `python -m py_compile` when readable `.py` output is produced.

## External Tools

`js-deobfuscator` and `Androidmeda` are bundled under `tools/vendor` with local launchers. `sdenv`, `rs-reverse`, `deobfuscate-mcp-server`, and `de4py` remain optional or ask-user-first integrations when the active task fits their niche. See `external-tools.md`.

## Self-Evolution

Use `references/experience-index.md` as the durable experience router. When a task produces a reusable script, fingerprint, workflow, validation checklist, or pitfall, save it as a candidate note with `scripts/reusable/new-research-entry.ps1`. Keep stable distilled playbooks under `references/experience/` and executable helpers under `scripts/reusable/`.

Only promote candidate notes after clean reproduction or repeated reuse. Keep original samples, dumps, HARs, screenshots, and target-specific outputs in the active project workspace; the skill should keep reusable method, not one-off state.
