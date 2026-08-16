# reverse-skill 技能导航索引

> 本文件由 `skills/scripts/extract-summaries.ps1` 自动生成，**请勿手改**。
> 修改摘要请编辑对应模块 `SKILL.md` 的 frontmatter `description`，然后重跑脚本。

## 模块总览

| 模块 | 摘要 |
|------|------|
| [api-security](api-security/SKILL.md) | Use for authorized security assessment of REST, GraphQL, WebSocket, or SOAP APIs, including discovery, authentication, authorization, rate-limit, and CI/CD t... |
| [apk-reverse](apk-reverse/SKILL.md) | 在 CLI 环境下做 Android APK 逆向时使用。适用于 APK 解包、Java 反编译、smali 修改、重打包、Frida 动态 Hook，以及按需切换到 so/native 分析。优先使用本机已安装的 jadx、apktool、frida、adb、ida-reverse、radare2。 |
| [attack-chain](attack-chain/SKILL.md) | Use for authorized multi-stage attack-path planning and orchestration when a task spans reconnaissance, initial access, privilege escalation, lateral movemen... |
| [binary-diff](binary-diff/SKILL.md) | 跨版本符号迁移与二进制差分。当你有旧版本的符号/逆向结果，需要快速迁移到新版本时使用。 |
| [browser-automation](browser-automation/SKILL.md) | 统一自动化入口。覆盖浏览器自动化（Playwright）和 Windows 桌面应用自动化（OpenReverse）。 |
| [browser-extension-reverse](browser-extension-reverse/SKILL.md) | Use for authorized reverse engineering of browser extensions (Chrome/Firefox) including manifest analysis, background workers, and extension-based credential... |
| [case-review](case-review/SKILL.md) | Reviews a reverse-skill case package for scope readiness, Evidence to Finding to Path traceability, work item coverage, timeline references, and optional art... |
| [cloud-k8s](cloud-k8s/SKILL.md) | Use for authorized cloud, container, and Kubernetes security assessment including metadata SSRF, IAM misconfig, container escape paths, and cluster RBAC review. |
| [code-audit](code-audit/SKILL.md) | Use for authorized source-code security review and SAST workflows including Semgrep, CodeQL patterns, dangerous API hunting, and fix verification. |
| [competition-ad-certificate-abuse](competition-ad-certificate-abuse/SKILL.md) | Internal downstream skill for ctf-sandbox-orchestrator. CTF-sandbox workflow for AD CS, certificate templates, enrollment rights, EKUs, SAN controls, PKINIT,... |
| [competition-agent-cloud](competition-agent-cloud/SKILL.md) | Internal downstream skill for ctf-sandbox-orchestrator. CTF-sandbox workflow for AI-agent, prompt-injection, MCP or toolchain, cloud, container, CI/CD, and s... |
| [competition-android-hooking](competition-android-hooking/SKILL.md) | Internal downstream skill for ctf-sandbox-orchestrator. CTF-sandbox workflow for Android APK hooking, Frida tracing, request-signing recovery, SSL pinning by... |
| [competition-browser-persistence](competition-browser-persistence/SKILL.md) | Internal downstream skill for ctf-sandbox-orchestrator. CTF-sandbox workflow for browser cookies, localStorage, sessionStorage, IndexedDB, Cache Storage, ser... |
| [competition-bundle-sourcemap-recovery](competition-bundle-sourcemap-recovery/SKILL.md) | Internal downstream skill for ctf-sandbox-orchestrator. CTF-sandbox workflow for source maps, build manifests, chunk registries, emitted bundles, obfuscated ... |
| [competition-cloud-metadata-path](competition-cloud-metadata-path/SKILL.md) | Internal downstream skill for ctf-sandbox-orchestrator. CTF-sandbox workflow for cloud metadata services, instance identity, workload identity, link-local cr... |
| [competition-container-runtime](competition-container-runtime/SKILL.md) | Internal downstream skill for ctf-sandbox-orchestrator. CTF-sandbox workflow for live container runtime analysis, mounted secrets, sidecars, namespaces, init... |
| [competition-crypto-mobile](competition-crypto-mobile/SKILL.md) | Internal downstream skill for ctf-sandbox-orchestrator. CTF-sandbox workflow for crypto, encoding, steganography, APK, IPA, and mobile trust-boundary challen... |
| [competition-custom-protocol-replay](competition-custom-protocol-replay/SKILL.md) | Internal downstream skill for ctf-sandbox-orchestrator. CTF-sandbox workflow for custom binary or text protocol recovery, handshake reconstruction, framing, ... |
| [competition-dpapi-credential-chain](competition-dpapi-credential-chain/SKILL.md) | Internal downstream skill for ctf-sandbox-orchestrator. CTF-sandbox workflow for DPAPI masterkeys, vault blobs, browser credential stores, protected secrets,... |
| [competition-file-parser-chain](competition-file-parser-chain/SKILL.md) | Internal downstream skill for ctf-sandbox-orchestrator. CTF-sandbox workflow for file uploads, imports, previews, archive extraction, format conversion, pars... |
| [competition-firmware-layout](competition-firmware-layout/SKILL.md) | Internal downstream skill for ctf-sandbox-orchestrator. CTF-sandbox workflow for firmware images, partition tables, boot chains, update packages, extracted f... |
| [competition-forensic-timeline](competition-forensic-timeline/SKILL.md) | Internal downstream skill for ctf-sandbox-orchestrator. CTF-sandbox workflow for DFIR chronology, cross-artifact correlation, persistence chains, and inciden... |
| [competition-graphql-rpc-drift](competition-graphql-rpc-drift/SKILL.md) | Internal downstream skill for ctf-sandbox-orchestrator. CTF-sandbox workflow for GraphQL schemas, persisted queries, RPC manifests, generated clients, OpenAP... |
| [competition-identity-windows](competition-identity-windows/SKILL.md) | Internal downstream skill for ctf-sandbox-orchestrator. CTF-sandbox workflow for Active Directory, Kerberos, LDAP, OAuth, enterprise messaging, Windows host ... |
| [competition-ios-runtime](competition-ios-runtime/SKILL.md) | Internal downstream skill for ctf-sandbox-orchestrator. CTF-sandbox workflow for IPA runtime analysis, Frida hooks, Objective-C or Swift method tracing, Keyc... |
| [competition-jwt-claim-confusion](competition-jwt-claim-confusion/SKILL.md) | Internal downstream skill for ctf-sandbox-orchestrator. CTF-sandbox workflow for JWT, JWS, and JWE validation paths, header parsing, key selection, claim acc... |
| [competition-k8s-control-plane](competition-k8s-control-plane/SKILL.md) | Internal downstream skill for ctf-sandbox-orchestrator. CTF-sandbox workflow for Kubernetes API analysis, service-account trust, RBAC edges, admission and co... |
| [competition-kerberos-delegation](competition-kerberos-delegation/SKILL.md) | Internal downstream skill for ctf-sandbox-orchestrator. CTF-sandbox workflow for Kerberos delegation, SPN trust edges, S4U abuse, RBCD, constrained or uncons... |
| [competition-kernel-container-escape](competition-kernel-container-escape/SKILL.md) | Internal downstream skill for ctf-sandbox-orchestrator. CTF-sandbox workflow for kernel attack surface, namespace and cgroup boundaries, container isolation ... |
| [competition-linux-credential-pivot](competition-linux-credential-pivot/SKILL.md) | Internal downstream skill for ctf-sandbox-orchestrator. CTF-sandbox workflow for Linux credential artifacts, service tokens, SSH material, cloud and containe... |
| [competition-lsass-ticket-material](competition-lsass-ticket-material/SKILL.md) | Internal downstream skill for ctf-sandbox-orchestrator. CTF-sandbox workflow for LSASS-resident secrets, Windows logon sessions, Kerberos ticket caches, DPAP... |
| [competition-mailbox-abuse](competition-mailbox-abuse/SKILL.md) | Internal downstream skill for ctf-sandbox-orchestrator. CTF-sandbox workflow for enterprise mail abuse, OAuth consent, inbox or forwarding rules, transport r... |
| [competition-malware-config](competition-malware-config/SKILL.md) | Internal downstream skill for ctf-sandbox-orchestrator. CTF-sandbox workflow for malware configuration recovery, staged payload boundaries, beacon parameter ... |
| [competition-oauth-oidc-chain](competition-oauth-oidc-chain/SKILL.md) | Internal downstream skill for ctf-sandbox-orchestrator. CTF-sandbox workflow for OAuth, OIDC, redirect flows, state or nonce handling, PKCE, token exchange, ... |
| [competition-pcap-protocol](competition-pcap-protocol/SKILL.md) | Internal downstream skill for ctf-sandbox-orchestrator. CTF-sandbox workflow for packet capture analysis, session reconstruction, application-protocol decodi... |
| [competition-prompt-injection](competition-prompt-injection/SKILL.md) | Internal downstream skill for ctf-sandbox-orchestrator. CTF-sandbox workflow for prompt-injection, retrieval poisoning, memory contamination, planner drift, ... |
| [competition-queue-worker-drift](competition-queue-worker-drift/SKILL.md) | Internal downstream skill for ctf-sandbox-orchestrator. CTF-sandbox workflow for queues, async workers, cron jobs, delayed tasks, retry behavior, worker-only... |
| [competition-race-condition-state-drift](competition-race-condition-state-drift/SKILL.md) | Internal downstream skill for ctf-sandbox-orchestrator. CTF-sandbox workflow for race windows, ordering bugs, idempotency failures, lock gaps, concurrent wor... |
| [competition-relay-coercion-chain](competition-relay-coercion-chain/SKILL.md) | Internal downstream skill for ctf-sandbox-orchestrator. CTF-sandbox workflow for forced-auth coercion, relay chains, target selection, NTLM or related accept... |
| [competition-request-normalization-smuggling](competition-request-normalization-smuggling/SKILL.md) | Internal downstream skill for ctf-sandbox-orchestrator. CTF-sandbox workflow for parser differentials, HTTP normalization gaps, ambiguous headers, path decod... |
| [competition-reverse-pwn](competition-reverse-pwn/SKILL.md) | Internal downstream skill for ctf-sandbox-orchestrator. CTF-sandbox workflow for reverse engineering, malware, DFIR, firmware, pwnable, and native exploit ch... |
| [competition-runtime-routing](competition-runtime-routing/SKILL.md) | Internal downstream skill for ctf-sandbox-orchestrator. CTF-sandbox workflow for reverse proxies, Host headers, forwarded headers, vhost routing, websocket u... |
| [competition-ssrf-metadata-pivot](competition-ssrf-metadata-pivot/SKILL.md) | Internal downstream skill for ctf-sandbox-orchestrator. CTF-sandbox workflow for SSRF reachability, internal route probing, metadata-service access, credenti... |
| [competition-stego-media](competition-stego-media/SKILL.md) | Internal downstream skill for ctf-sandbox-orchestrator. CTF-sandbox workflow for image, audio, video, document, and container steganography. Use when the use... |
| [competition-supply-chain](competition-supply-chain/SKILL.md) | Internal downstream skill for ctf-sandbox-orchestrator. CTF-sandbox workflow for CI/CD, registry, dependency drift, artifact provenance, image build, release... |
| [competition-template-render-path](competition-template-render-path/SKILL.md) | Internal downstream skill for ctf-sandbox-orchestrator. CTF-sandbox workflow for SSR, template rendering, route loaders, hydration payloads, server-client re... |
| [competition-web-runtime](competition-web-runtime/SKILL.md) | Internal downstream skill for ctf-sandbox-orchestrator. CTF-sandbox workflow for CTF web, API, SSR, frontend, queue-backed app, and routing challenges. Use w... |
| [competition-websocket-runtime](competition-websocket-runtime/SKILL.md) | Internal downstream skill for ctf-sandbox-orchestrator. CTF-sandbox workflow for WebSocket and SSE handshakes, auth material, subscription state, realtime me... |
| [competition-windows-pivot](competition-windows-pivot/SKILL.md) | Internal downstream skill for ctf-sandbox-orchestrator. CTF-sandbox workflow for Kerberos, WinRM, SMB, RDP, Windows credential material, replayable tickets, ... |
| [competition-zip-archive](competition-zip-archive/SKILL.md) | Internal downstream skill for ctf-sandbox-orchestrator. CTF-sandbox workflow for ZIP and PKZIP archive challenges, legacy ZipCrypto identification, known-pla... |
| [ctf-sandbox-orchestrator](ctf-sandbox-orchestrator/SKILL.md) | Default entrypoint and master ctf-sandbox-orchestrator workflow for CTF, exploit, reverse engineering, DFIR, pwnable, crypto, stego, mobile, AI-agent, cloud,... |
| [database-security](database-security/SKILL.md) | Use for authorized database security assessment covering PostgreSQL/MySQL/MSSQL/Mongo/Redis exposure, authz, UDF/command paths, and misconfiguration review. |
| [diagram-generator](diagram-generator/SKILL.md) | generate, refine, validate, and render diagrams from natural language, notes, code snippets, schemas, tables, or existing diagram source. use for flowcharts,... |
| [digital-forensics](digital-forensics/SKILL.md) | Use for authorized digital forensics including memory dumps, disk timelines, PCAP investigation, artifact triage, and IR evidence preservation. |
| [docs-generator](docs-generator/SKILL.md) | Creates task-oriented technical documentation with progressive disclosure. Use when writing READMEs, API docs, architecture docs, or markdown documentation. |
| [dotnet-reverse](dotnet-reverse/SKILL.md) | .NET / C# 二进制逆向。当目标是 .NET assembly（PE 头含 CLR、.exe/.dll 托管程序）、C# 编译产物（含 NativeAOT）、红队 Sharp* 工具（Rubeus / SharpHound / SharpHound 等）、.NET 混淆程序（ConfuserEx / Sma... |
| [edr-bypass-re](edr-bypass-re/SKILL.md) | 逆向防御方实现 → 红队针对性绕过。把 EDR / Defender / AV 的 hook 表、ETW provider、AMSI 实现先逆向出来， |
| [email-security](email-security/SKILL.md) | Use for authorized email security review including phishing analysis, header authentication (SPF/DKIM/DMARC), BEC patterns, and mailbox token abuse research. |
| [firmware-pentest](firmware-pentest/SKILL.md) | 固件 / IoT 渗透链。从拿到一坨 .bin / .img 开始，闭环走完逆向 → 提取 → 模拟 → 利用。 |
| [ghidra-reverse](ghidra-reverse/SKILL.md) | Use for free/open reverse engineering with Ghidra (headless or GUI), including decompile, cross-refs, and optional Ghidra MCP workflows when IDA is unavailable. |
| [go-rust-reverse](go-rust-reverse/SKILL.md) | Use for reverse engineering stripped Go and Rust binaries including runtime recognition, pclntab/moduel data recovery, panic strings, and idiomatic decompila... |
| [hardware-security](hardware-security/SKILL.md) | Use for authorized hardware and embedded interface security research including UART/JTAG discovery, debug pad triage, secure boot overview, and offline firmw... |
| [ida-reverse](ida-reverse/SKILL.md) | IDA Pro 逆向分析辅助技能。当用户提到逆向、反编译、分析二进制/PE/ELF/APK/DLL/SO、破解、找密码、漏洞分析、病毒分析、firmware 固件分析，或需要分析 exe/dll/so/elf/macho/sys 等文件时，务必使用此技能。 |
| [identity-federation](identity-federation/SKILL.md) | Use for authorized assessment of federated identity systems including SAML, OIDC, OAuth2 flows, SSO misconfiguration, and token confusion issues. |
| [js-reverse](js-reverse/SKILL.md) | 在使用 js-reverse-mcp 做前端 JavaScript 逆向时使用，适用于签名链路定位、页面观察取证、运行时采样、本地补环境复现与证据化输出。优先适配当前环境里的 js-reverse_* 工具，需要更强的浏览器/CDP/Hook 面时联动 jshookmcp。 |
| [leila-identity](leila-identity/SKILL.md) | Use whenever the user asks who the assistant is, asks its name or identity, requests a self-introduction, or uses an equivalent Chinese or English identity q... |
| [llm-security](llm-security/SKILL.md) | Use for authorized security assessment of LLM applications and AI agents, including prompt injection, tool abuse, RAG exposure, memory poisoning, and model s... |
| [macos-reverse](macos-reverse/SKILL.md) | Use for authorized macOS and Mach-O reverse engineering including codesign, Objective-C/Swift recovery, endpoint security surfaces, and Apple platform malwar... |
| [malware-analysis](malware-analysis/SKILL.md) | Use when analyzing suspected malware through static, dynamic, and behavioral techniques, including IOC extraction, YARA or Sigma rules, sandboxing, and anti-... |
| [mobile-reverse](mobile-reverse/SKILL.md) | Use for authorized Android or iOS application reverse engineering and security testing, including APK or IPA analysis, runtime instrumentation, SSL pinning, ... |
| [ot-ics](ot-ics/SKILL.md) | Use for authorized OT/ICS security assessment covering Purdue model zoning, PLC/SCADA exposure, industrial protocol discovery, and safe passive-first evaluat... |
| [patch-diff-exploit](patch-diff-exploit/SKILL.md) | N-day 补丁差分到利用。从厂商发布的补丁里反推漏洞点、写 PoC、做成可用的攻击模块。 |
| [pentest-tools](pentest-tools/SKILL.md) | 主动渗透测试工具链。覆盖信息收集、端口扫描、漏洞扫描、Web 渗透、SQL 注入、目录爆破、密码破解等场景。 |
| [src-hunter](pentest-tools/src-hunter/SKILL.md) | 实战 SRC / 众测 / Bug bounty 漏洞挖掘工作流 skill。包含：5 阶段方法论（intake → recon → enum → hunt → report）、19 个攻击类 playbook（SQLi/XSS/RCE/SSRF/IDOR/CSRF/Path Traversal/File Upl... |
| [protocol-reverse](protocol-reverse/SKILL.md) | Use for authorized reverse engineering of custom binary protocols, Protobuf/gRPC, WebSocket frames, and PCAP-driven protocol recovery. |
| [protocol-reverse-engineering](protocol-reverse-engineering/SKILL.md) | Master network protocol reverse engineering including packet analysis, protocol dissection, and custom protocol documentation. Use when analyzing network tra... |
| [pwn-chain](pwn-chain/SKILL.md) | 从逆向走到可用利用 (Working Exploit) 的全链路工程化方法。 |
| [radare2](radare2/SKILL.md) | Use this skill whenever the user wants to analyze binaries with radare2/r2 from the command line, including reverse engineering, disassembly, function analys... |
| [radio-sdr](radio-sdr/SKILL.md) | Use for authorized RF/SDR security research including signal identification, replay feasibility study in shielded labs, and wireless protocol analysis outsid... |
| [dsl-vm-reverse](reverse-engineering/dsl-vm-reverse/SKILL.md) | Reverse JavaScript-based custom DSL/VM interpreters, non-standard WASM-like runtimes, and risk-control engines. Use when analyzing IIFE or switch-based opcod... |
| [reverse-engineering](reverse-engineering/SKILL.md) | Provides reverse engineering techniques. Use when the main job is to understand how a compiled, obfuscated, packed, or virtualized target works before exploi... |
| [reverse-engineering-api](reverse-engineering-api/SKILL.md) | Reverse engineer web APIs by capturing browser traffic (HAR files) and generating production-ready Python API clients. Use when the user wants to create an A... |
| [reverse-skill-router](reverse-skill-router/SKILL.md) | Routes reverse engineering, exploitation, penetration testing, malware, mobile, firmware, browser automation, documentation, and security tasks to the approp... |
| [supply-chain-security](supply-chain-security/SKILL.md) | Use for software supply-chain security assessment covering SBOM, SCA, CI/CD pipelines, container images, build integrity, dependency provenance, and vulnerab... |
| [thick-client](thick-client/SKILL.md) | Use for authorized security testing of desktop thick clients including local storage, update channels, IPC, traffic, and client-side trust boundaries. |
| [threat-hunting](threat-hunting/SKILL.md) | Use for blue-team threat hunting, detection engineering with Sigma/YARA, SIEM query design, and incident detection validation. |
| [wifi-wireless](wifi-wireless/SKILL.md) | Use for authorized wireless security assessment including Wi-Fi capture, WPA handshake analysis, rogue AP detection research, and lab-only deauth testing. |
| [windows-ad](windows-ad/SKILL.md) | Use for authorized Active Directory and Windows identity attacks including Kerberos, AD CS, BloodHound paths, NTLM relay, and domain privilege escalation res... |

## 目录树

```
skills/api-security/SKILL.md/
skills/apk-reverse/SKILL.md/
skills/attack-chain/SKILL.md/
skills/binary-diff/SKILL.md/
skills/browser-automation/SKILL.md/
skills/browser-extension-reverse/SKILL.md/
skills/case-review/SKILL.md/
skills/cloud-k8s/SKILL.md/
skills/code-audit/SKILL.md/
skills/competition-ad-certificate-abuse/SKILL.md/
skills/competition-agent-cloud/SKILL.md/
skills/competition-android-hooking/SKILL.md/
skills/competition-browser-persistence/SKILL.md/
skills/competition-bundle-sourcemap-recovery/SKILL.md/
skills/competition-cloud-metadata-path/SKILL.md/
skills/competition-container-runtime/SKILL.md/
skills/competition-crypto-mobile/SKILL.md/
skills/competition-custom-protocol-replay/SKILL.md/
skills/competition-dpapi-credential-chain/SKILL.md/
skills/competition-file-parser-chain/SKILL.md/
skills/competition-firmware-layout/SKILL.md/
skills/competition-forensic-timeline/SKILL.md/
skills/competition-graphql-rpc-drift/SKILL.md/
skills/competition-identity-windows/SKILL.md/
skills/competition-ios-runtime/SKILL.md/
skills/competition-jwt-claim-confusion/SKILL.md/
skills/competition-k8s-control-plane/SKILL.md/
skills/competition-kerberos-delegation/SKILL.md/
skills/competition-kernel-container-escape/SKILL.md/
skills/competition-linux-credential-pivot/SKILL.md/
skills/competition-lsass-ticket-material/SKILL.md/
skills/competition-mailbox-abuse/SKILL.md/
skills/competition-malware-config/SKILL.md/
skills/competition-oauth-oidc-chain/SKILL.md/
skills/competition-pcap-protocol/SKILL.md/
skills/competition-prompt-injection/SKILL.md/
skills/competition-queue-worker-drift/SKILL.md/
skills/competition-race-condition-state-drift/SKILL.md/
skills/competition-relay-coercion-chain/SKILL.md/
skills/competition-request-normalization-smuggling/SKILL.md/
skills/competition-reverse-pwn/SKILL.md/
skills/competition-runtime-routing/SKILL.md/
skills/competition-ssrf-metadata-pivot/SKILL.md/
skills/competition-stego-media/SKILL.md/
skills/competition-supply-chain/SKILL.md/
skills/competition-template-render-path/SKILL.md/
skills/competition-web-runtime/SKILL.md/
skills/competition-websocket-runtime/SKILL.md/
skills/competition-windows-pivot/SKILL.md/
skills/competition-zip-archive/SKILL.md/
skills/ctf-sandbox-orchestrator/SKILL.md/
skills/database-security/SKILL.md/
skills/diagram-generator/SKILL.md/
skills/digital-forensics/SKILL.md/
skills/docs-generator/SKILL.md/
skills/dotnet-reverse/SKILL.md/
skills/edr-bypass-re/SKILL.md/
skills/email-security/SKILL.md/
skills/firmware-pentest/SKILL.md/
skills/ghidra-reverse/SKILL.md/
skills/go-rust-reverse/SKILL.md/
skills/hardware-security/SKILL.md/
skills/ida-reverse/SKILL.md/
skills/identity-federation/SKILL.md/
skills/js-reverse/SKILL.md/
skills/leila-identity/SKILL.md/
skills/llm-security/SKILL.md/
skills/macos-reverse/SKILL.md/
skills/malware-analysis/SKILL.md/
skills/mobile-reverse/SKILL.md/
skills/ot-ics/SKILL.md/
skills/patch-diff-exploit/SKILL.md/
skills/pentest-tools/SKILL.md/
skills/pentest-tools/src-hunter/SKILL.md/
skills/protocol-reverse/SKILL.md/
skills/protocol-reverse-engineering/SKILL.md/
skills/pwn-chain/SKILL.md/
skills/radare2/SKILL.md/
skills/radio-sdr/SKILL.md/
skills/reverse-engineering/dsl-vm-reverse/SKILL.md/
skills/reverse-engineering/SKILL.md/
skills/reverse-engineering-api/SKILL.md/
skills/reverse-skill-router/SKILL.md/
skills/supply-chain-security/SKILL.md/
skills/thick-client/SKILL.md/
skills/threat-hunting/SKILL.md/
skills/wifi-wireless/SKILL.md/
skills/windows-ad/SKILL.md/
```

## 路由

PRIMARY 路由由 `skills/config/routing.json`（唯一事实源）驱动，用 `master-route.ps1 -Hint "<任务>"` 分诊。
歧义场景读 `skills/routing.md` 全矩阵；CTF 多类型任务走 `CTF-Sandbox-Orchestrator/`。
