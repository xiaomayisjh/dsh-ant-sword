# Security Task Routing

## Routing Contract

Choose a domain from evidence, then choose the current lifecycle stage. Output this compact block when routing materially affects the work:

```text
Mode: CTF | lab | authorized-assessment | sample-analysis | defensive-review | tool-development
Primary domain:
Supporting domains:
Current stage:
Why:
Evidence status: observed | partial | assumed
Read now:
Required artifact:
Exit condition:
Next concrete action:
```

`Read now` should contain one domain entry plus at most three topic references. Add more only after a stage transition or new evidence.

## File and Service Triage

| Signal | Primary route | Supporting route | First proof |
|---|---|---|---|
| `.pcap`, `.pcapng` | Forensics | Malware, Crypto, Web | identify conversations and one reconstructed object |
| `.evtx`, registry hive, `$MFT`, `.E01`, `.dd`, `.raw` | Forensics | Malware | hash, format, timezone, and one timeline anchor |
| ELF/PE plus remote interactive service | Pwn | Reverse | mitigations, protocol frame, deterministic crash/leak |
| ELF/PE without remote service | Reverse | Malware or Pwn | entry, imports, strings, packer, high-value xref |
| `.apk`, `.dex`, `.so`, `.ipa`, Mach-O | Reverse | Web, Crypto | component/entry map and native/managed boundary |
| `.wasm`, worker, packed JS bundle | Reverse | Web | real request/message boundary and writer/caller |
| numeric dump, `.sage`, modulus/ciphertext/key material | Crypto | Misc | explicit equations and byte/integer representation |
| image/audio/video/PDF with hidden-data hints | Forensics | Misc, OSINT | metadata, channels/frames/trailer, known format anomalies |
| obfuscated script, suspicious PE/.NET, beacon traffic | Malware | Reverse, Forensics | static triage and config/behavior candidate |
| restricted shell, eval jail, custom VM, game protocol | Misc | Pwn, Crypto, Reverse | parser/constraint model and smallest controllable effect |
| HTTP site/API/source bundle | Web | Reverse, Crypto | one normal request chain and auth/session state |
| location/person/domain/public-source clue | OSINT | Forensics | exact proposition and two independent sources |
| model files, logits, prompts, Agent/RAG/tool chain | AI/ML | Web, Forensics | attacked plane, metric, baseline, version and budget |

Remote service presence is evidence, not a complete classifier. A web service may wrap crypto, an HTTP endpoint may expose a native parser, and a PCAP may contain the actual exploit chain.

## Web / API

Entry: `ctf/web/index.md`

| Signals | Read | Exit condition |
|---|---|---|
| SQL errors, query-dependent state, DB filter behavior | `ctf/web/sql-injection.md` | a deterministic boolean, error, time, read, or write primitive |
| SSTI, LFI, SSRF, XXE, command injection, parser mismatch | `ctf/web/server-side.md`, then `server-side-2.md` | one server-side effect tied to controlled input |
| upload, code execution, wrapper, filename, converter | `ctf/web/server-side-exec.md`; add `server-side-exec-2.md` if matched | upload/storage/parser path and execution/read boundary proven |
| Java/PHP/Python serialization, race, object graph | `ctf/web/server-side-deser.md` | serializer type, controllable fields, sink, and timing proven |
| proxy/path/archive/framework edge case | choose one `server-side-advanced*.md` by exact technology | parser disagreement reproduced with a minimal request |
| XSS, CSP, admin bot, DOM, cache, request smuggling | `ctf/web/client-side.md`; add `client-side-advanced.md` for CSP/Unicode/postMessage | browser sink and privileged effect proven |
| authz, IDOR, hidden role/route, redirect chain | `ctf/web/auth-and-access.md` | unauthorized object/action accessible from a clean low-privilege session |
| JWT/JWE/key confusion/replay | `ctf/web/auth-jwt.md` | verifier behavior and forged/replayed claim effect verified |
| OAuth/OIDC/SAML/CORS/CI identity | `ctf/web/auth-infra.md` | actor, issuer, audience, redirect, and trust transition mapped |
| Node prototype pollution or JS sandbox | `ctf/web/node-and-prototype.md` | source, polluted property, sink, and resulting capability proven |
| dependency/version/CVE shape | `ctf/web/cves.md` only after version evidence | affected code path reproduced, not banner-matched only |
| smart contract / Web3 integration | `ctf/web/web3.md` | chain state, contract address/build, signer and invariant recorded |

Pivot:

- to Reverse when the blocker is JS/WASM/worker/signature recovery
- to Crypto when token security depends on custom math rather than parser/trust behavior
- to Pwn when code execution leads into memory corruption or sandbox constraints
- to Forensics when logs, captures, backups, or browser artifacts contain the decisive evidence

## Pwn / Native Exploitation

Entry: `ctf/pwn/index.md`

| Signals | Read | Exit condition |
|---|---|---|
| stack/global overflow, ret2win, canary, OOB | `ctf/pwn/overflow-basics.md` | exact offset, controllable bytes, mitigation interaction |
| ret2libc, syscall ROP, ret2csu, bad chars, shellcode | `ctf/pwn/rop-and-shellcode.md` | chain respects calling convention, alignment, bad bytes, I/O |
| unusual gadgets, SROP, JOP, stack pivot | `ctf/pwn/rop-advanced.md` | register and stack state proven at control transfer |
| format string | `ctf/pwn/format-string.md` | argument offset and read/write width validated |
| allocator, UAF, double free, overlap, tcache | `ctf/pwn/heap-techniques.md`; then `heap-techniques-2.md` if exact version needs it | allocation timeline and overlap/write target verified |
| FILE structure / FSOP | `ctf/pwn/heap-fsop.md` | libc version, structure fields and call target proven |
| seccomp, namespace, language/runtime sandbox | `ctf/pwn/sandbox-escape.md` | allowed syscalls/capabilities and escape primitive mapped |
| kernel module, device, eBPF, race | `ctf/pwn/kernel.md`; add `kernel-techniques.md` or `kernel-bypass.md` by blocker | kernel build/config and primitive validated in resettable VM |
| technique not covered by focused docs | `ctf/pwn/advanced.md` or one matching `advanced-exploits*.md` | exact pattern matched to runtime evidence |

Pivot to Reverse when function/object semantics are unknown; return to Pwn after the data/control primitive is named.

## Reverse Engineering

Entry: `ctf/reverse/index.md`. Prefer the registered `reverse-master` skill for JS signatures, runtime fitting, Android/Frida/IDA, Unity, iOS, DEX dumping, Unicorn, or structured symbol recovery.

| Signals | Read | Exit condition |
|---|---|---|
| language/runtime identification | `ctf/reverse/languages.md`, `languages-compiled.md`, or `languages-platforms.md` | compiler/runtime and likely entry boundaries identified |
| platform/APK/firmware/hardware | `ctf/reverse/platforms.md` or `platforms-hardware.md` | image/component map and active code path known |
| validation routine, VM, serial, algorithm pattern | `ctf/reverse/patterns.md`, `patterns-runtime.md`, or one matching `patterns-ctf*.md` | input-to-check path and transform checkpoints recovered |
| debugger, tracing, emulator | `ctf/reverse/tools-dynamic.md` or `tools-emulation.md` | a targeted observation answers the current hypothesis |
| advanced decompiler/tool workflow | `ctf/reverse/tools.md` or matching `tools-advanced*.md` | reproducible export, script, hook, or recovered artifact |
| anti-debug, packing, anti-analysis | `ctf/reverse/anti-analysis.md`; add `anti-analysis-ctf.md` for challenge patterns | protection boundary bypassed or observed without altering target logic |

Do not route to recovery merely because a clue says JSVMP, wasm, packer, or anti-debug. First prove the real request/call/check boundary.

## Cryptography

Entry: `ctf/crypto/index.md`

| Signals | Read | Exit condition |
|---|---|---|
| substitution, Vigenere, XOR, book/grid cipher | `ctf/crypto/classic-ciphers.md` | key/plaintext validated against the full ciphertext |
| AES/mode/MAC/hash/oracle/custom symmetric | `ctf/crypto/modern-ciphers.md`; choose part 2/3 by exact construction | equation and oracle/structural weakness verified |
| LFSR, RC4, stream correlation | `ctf/crypto/stream-ciphers.md` | state/key stream reproduces known samples |
| RSA | `ctf/crypto/rsa-attacks.md`; add `rsa-attacks-2.md` for matched advanced form | factor/message/key candidate re-encrypts or verifies |
| ECC/signatures | `ctf/crypto/ecc-attacks.md` | curve/domain parameters and recovered relation validated |
| Lattice/LWE/Coppersmith | `ctf/crypto/lattice-and-lwe.md` | basis, bounds, scaling and recovered secret checked |
| PRNG/state prediction | `ctf/crypto/prng.md` or `prng-attacks.md` | recovered state predicts held-out output |
| ZKP/proof system | `ctf/crypto/zkp-and-advanced.md` | verifier equation and forged/witness relation checked |
| niche/exotic construction | `ctf/crypto/exotic-crypto.md` or part 2 | full transform chain and inverse/forgery reproduced |
| math prerequisite | `ctf/crypto/advanced-math.md` | numeric method and precision bounds documented |

## Forensics / DFIR / Steganography

Entry: `ctf/forensics/index.md`

| Signals | Read | Exit condition |
|---|---|---|
| disk, filesystem, deleted files | `ctf/forensics/disk-and-memory.md`, `disk-recovery.md`, or `disk-advanced.md` | recovered object has source offset/path and hash |
| memory dump | `ctf/forensics/disk-and-memory.md` | profile/build, process, address/region and extraction provenance recorded |
| Windows artifacts | `ctf/forensics/windows.md` | SID/user/timezone and artifact timeline correlated |
| Linux logs/filesystem | `ctf/forensics/linux-forensics.md` | process/user/file/network event chain correlated |
| PCAP/network | `ctf/forensics/network.md`; add `network-advanced.md` for covert/custom channels | stream/object/session reconstructed and validated |
| image stego | `ctf/forensics/stego-image.md`, `steganography.md`, then exact advanced part | channel/bit order/transform yields validated payload |
| USB/HID/Bluetooth | `ctf/forensics/peripheral-capture.md` | report IDs/events mapped to reconstructed input |
| RF/signal/hardware side channel | `ctf/forensics/signals-and-hardware.md` | sampling, modulation/leakage and decode parameters recorded |
| 3D print/G-code | `ctf/forensics/3d-printing.md` | container decoded and intended geometry/data verified |

## Malware / Protocol Analysis

Entry: `ctf/malware/index.md`

| Signals | Read | Exit condition |
|---|---|---|
| PowerShell/JS/VBA/Python layers, shellcode | `ctf/malware/scripts-and-obfuscation.md` | each transform layer saved and behavior/config extracted |
| PE/.NET | `ctf/malware/pe-and-dotnet.md` | packer/runtime/config and decisive behavior observed |
| C2 traffic/custom crypto/protocol | `ctf/malware/c2-and-protocols.md` | message framing, crypto state and one decoded conversation verified |

Use `malware.md` for broader static/dynamic analysis and `c2.md` for protocol/detection context. Treat network indicators as evidence requiring provenance, not automatic attribution.

## Misc

Entry: `ctf/misc/index.md`

| Signals | Read | Exit condition |
|---|---|---|
| Python jail | `ctf/misc/pyjails.md` | exact parser/builtin/object constraint and minimal escape proven |
| shell jail | `ctf/misc/bashjails.md` | shell, expansion order, allowed bytes and effect proven |
| encoding/esolang/QR/Unicode | `ctf/misc/encodings.md`; add `encodings-advanced.md` by format | ordered transform chain reproduces output |
| RF/SDR | `ctf/misc/rf-sdr.md` | sample rate, modulation, synchronization and decode validated |
| DNS challenge | `ctf/misc/dns.md` | resolver/auth behavior and record chain captured |
| game/VM/container/constraint | choose matching `games-and-vms*.md` | state model and winning/escape condition reproduced |
| Linux privilege path | `ctf/misc/linux-privesc.md` | challenge-specific trust/config primitive verified |
| CTFd API navigation | `ctf/misc/ctfd-navigation.md` | authenticated API flow works with user-provided challenge token |

## OSINT

Entry: `ctf/osint/index.md`

| Signals | Read | Exit condition |
|---|---|---|
| usernames/social identities | `ctf/osint/social-media.md` | identity link supported by a unique shared fact |
| image/location/media | `ctf/osint/geolocation-and-media.md` | coordinates/place supported by independent visual/geographic facts |
| DNS/domain/web archive/public records | `ctf/osint/web-and-dns.md` | dated source and corroborating record preserved |

## AI / ML Security

Entry: `ctf/ai-ml/index.md`

| Signals | Read | Exit condition |
|---|---|---|
| weights, extraction, inversion, membership, LoRA | `ctf/ai-ml/model-attacks.md` | model/version/query budget/metric and held-out result recorded |
| adversarial examples, patches, poisoning | `ctf/ai-ml/adversarial-ml.md` | perturbation constraint and clean/adversarial metrics verified |
| prompt injection, jailbreak, RAG, Agent tools | `ctf/ai-ml/llm-attacks.md`, then `ai-security.md` for broader threat model | boundary escape or data/tool effect reproduced in a fresh session |

For LLM/Agent deep methodology use the merged `../skills/sec-ai-security/references/llm-deep/` (OWASP LLM Top 10, prompt-injection methodology, agent security testing).

## 深度专项模块 (Deep Specialization Modules)

从对应领域进入需要深度方法论或武器化的阶段时使用。这些是领域轴的延伸，不是独立领域。

| 进入信号 | 模块入口 | 深度参考 | 退出条件 |
|---|---|---|---|
| 已定位漏洞，需从逆向到可用 exploit 的完整链 | `../skills/sec-pwn-chain/INSTRUCTIONS.md` | `references/{stack,heap,kernel}-pwn.md` | exploit 达成目标或明确交接缺失语义给 Reverse |
| 有厂商补丁/两版本，做 N-day 差分 | `../skills/sec-patch-diff/INSTRUCTIONS.md` | `references/{patch-tuesday-workflow,diff-tools-comparison,root-cause-and-poc}.md` | 漏洞点定位、PoC 可复现触发 |
| 固件/IoT/路由器 (OWASP FSTM) | `../skills/sec-firmware/INSTRUCTIONS.md` | `references/{extraction-methodology,emulation-and-fuzz,emba-automated-analysis}.md` | 提取的代码路径可仿真或漏洞可触达 |
| EDR/AV 绕过逆向 (防御研究/授权红队) | `../skills/sec-edr-bypass/INSTRUCTIONS.md` | `references/{hook-survey,unhook-techniques,telemetry-blinding}.md` | hook 表/遥测边界被绕过或观测到 |
| 供应链/SBOM/CI-CD/依赖投毒 | `../skills/sec-supply-chain/INSTRUCTIONS.md` | `references/{sbom-sca-methodology,cicd-pipeline-security}.md` | 构建链缺陷或恶意组件被定位 |
| 多阶段攻击链编排/横移 | `../skills/sec-attack-chain/INSTRUCTIONS.md` | `references/{attack-playbooks,evasion-cheatsheet}.md` | 端到端链路可复现，含失败回退 |
| 实战渗透/SRC 挖洞武器库 | `../../pentest-tools/SKILL.md` | `src-hunter/references/playbooks/`（20个）、`payloader/`（分类 payload + waf-bypass） | 发现从扫描信号升级为可复现 finding |

## CTF 竞赛编排层 (Competition Orchestration)

当任务是**完整 CTF 竞赛**（多题、需竞赛沙箱假设、跨领域快速路由）而非单点分析时，可先进入编排层：

- 入口：`../../ctf-sandbox-orchestrator/SKILL.md`
- 内部路由矩阵：`../../ctf-sandbox-orchestrator/references/router-matrix.md`
- 45 个 `competition-*` 专项子技能（web-runtime / reverse-pwn / crypto-mobile / agent-cloud / identity-windows / jwt-claim-confusion / ssrf-metadata-pivot / kerberos-delegation 等）
- 单题或已知领域时直接走上面的领域轴与专项模块，不必经过编排层。
- 许可证：bundle 的 `ctf-sandbox-orchestrator/` 子树源自 GPLv3 上游（见 bundle `skills/UPSTREAM-LICENSE.txt`）。

## Cross-Domain Chains

| Chain | Handoff condition |
|---|---|
| Web -> Reverse | request/message is real; writer or algorithm is the blocker |
| Reverse -> Web | signer/parser is callable; backend acceptance is the blocker |
| Reverse -> Pwn | vulnerable function/object layout and controllable input are identified |
| Pwn -> Reverse | exploit progress needs exact function, gadget, allocator, or object semantics |
| Forensics -> Crypto | encrypted payload and exact bytes/metadata are extracted |
| Crypto -> Forensics | key/plaintext is recovered; provenance and timeline need validation |
| Forensics -> Malware | process/file/flow is isolated and behavior/config extraction is next |
| Malware -> Forensics | IoCs/config are known and must be correlated across disk/memory/network |
| Web -> Crypto | application parser/trust path is known; custom primitive is decisive |
| OSINT -> Forensics | public artifact is acquired and local metadata/extraction begins |
| AI -> Web | model/Agent behavior reaches HTTP, auth, storage, or tool boundaries |

At every handoff record: current state, observed evidence, invalidated hypotheses, produced artifact, receiving domain, and its exit condition.
