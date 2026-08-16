# MASTER-ROUTING — reverse/CTF 技能包任务路由

> 路由规则的**单一事实源**是 `config/routing.json`（`routes` 表 + `priority` 顺序）。
> 本文件是给模型与人类维护者看的优先级视图：**必须与 `config/routing.json` 保持一致**，
> 由 `scripts/verify-routing-coherence.ps1` 校验。改路由只改 `config/routing.json`，
> 不要改散落在 markdown / ps1 里的路由表。

## 用法（三轴路由：目标类型 × 用户意图 × 工具链）

1. 拿到任务后先做三轴匹配（目标类型 / 用户意图 / 工具链），然后执行：

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\master-route.ps1 -Hint "<任务一句话>"
   # 输出 route-scope.md 并给出 PRIMARY 路由 id 与技能路径
   ```

2. 路由未命中任何规则 → 回退 `R0`（通用逆向）；仍不合适 → 联网补方法论并**提议新增 skill**，
   禁止硬塞到不匹配模块。
3. 进入 PRIMARY skill 前，**先完成授权与 scope 落地**：见 [ops/scope-contract.md](ops/scope-contract.md)
   与 [scripts/case-init.ps1](scripts/case-init.ps1)（`work/<case>/scope.md` 是 ACT 的硬门槛）。
4. 涉及本机工具时读 `tool-index.md`（由 `scripts/refresh-tool-index.ps1` 生成），**禁止猜路径**。
5. 身份与定位：见 [ops/IDENTITY.md](ops/IDENTITY.md)。

## 优先级表（与 routing.json `priority` 一一对应，自上而下优先级递减）

| 优先级 | id | 路由 | 入口技能 |
|---|---|---|---|
| 1 | R4 | DSL VM reverse | [reverse-engineering/dsl-vm-reverse/SKILL.md](reverse-engineering/dsl-vm-reverse/SKILL.md) |
| 2 | R1 | APK reverse | [apk-reverse/SKILL.md](apk-reverse/SKILL.md) |
| 3 | R2 | Mobile reverse (Android+iOS) | [mobile-reverse/SKILL.md](mobile-reverse/SKILL.md) |
| 4 | R3 | JS / frontend reverse | [js-reverse/SKILL.md](js-reverse/SKILL.md) |
| 5 | R30 | Browser extension reverse | [browser-extension-reverse/SKILL.md](browser-extension-reverse/SKILL.md) |
| 6 | R31 | macOS / Mach-O reverse | [macos-reverse/SKILL.md](macos-reverse/SKILL.md) |
| 7 | R33 | Go / Rust reverse | [go-rust-reverse/SKILL.md](go-rust-reverse/SKILL.md) |
| 8 | R5 | .NET reverse | [dotnet-reverse/SKILL.md](dotnet-reverse/SKILL.md) |
| 9 | R9 | Malware analysis | [malware-analysis/SKILL.md](malware-analysis/SKILL.md) |
| 10 | R21 | Protocol reverse | [protocol-reverse/SKILL.md](protocol-reverse/SKILL.md) |
| 11 | R22 | Ghidra reverse | [ghidra-reverse/SKILL.md](ghidra-reverse/SKILL.md) |
| 12 | R6 | IDA reverse | [ida-reverse/SKILL.md](ida-reverse/SKILL.md) |
| 13 | R7 | radare2 | [radare2/SKILL.md](radare2/SKILL.md) |
| 14 | R8 | Firmware pentest | [firmware-pentest/SKILL.md](firmware-pentest/SKILL.md) |
| 15 | R34 | Hardware / debug interfaces | [hardware-security/SKILL.md](hardware-security/SKILL.md) |
| 16 | R28 | OT / ICS | [ot-ics/SKILL.md](ot-ics/SKILL.md) |
| 17 | R17 | Pwn chain | [pwn-chain/SKILL.md](pwn-chain/SKILL.md) |
| 18 | R16 | Patch-diff / N-day | [patch-diff-exploit/SKILL.md](patch-diff-exploit/SKILL.md) |
| 19 | R18 | EDR bypass RE | [edr-bypass-re/SKILL.md](edr-bypass-re/SKILL.md) |
| 20 | R24 | Windows / AD | [windows-ad/SKILL.md](windows-ad/SKILL.md) |
| 21 | R37 | Identity federation (SAML/OIDC) | [identity-federation/SKILL.md](identity-federation/SKILL.md) |
| 22 | R23 | Cloud / K8s | [cloud-k8s/SKILL.md](cloud-k8s/SKILL.md) |
| 23 | R35 | Database security | [database-security/SKILL.md](database-security/SKILL.md) |
| 24 | R25 | Digital forensics | [digital-forensics/SKILL.md](digital-forensics/SKILL.md) |
| 25 | R36 | Email / phishing analysis | [email-security/SKILL.md](email-security/SKILL.md) |
| 26 | R29 | Wi-Fi / wireless | [wifi-wireless/SKILL.md](wifi-wireless/SKILL.md) |
| 27 | R38 | RF / SDR research | [radio-sdr/SKILL.md](radio-sdr/SKILL.md) |
| 28 | R32 | Thick client security | [thick-client/SKILL.md](thick-client/SKILL.md) |
| 29 | R26 | Code audit / SAST | [code-audit/SKILL.md](code-audit/SKILL.md) |
| 30 | R27 | Threat hunting | [threat-hunting/SKILL.md](threat-hunting/SKILL.md) |
| 31 | R10 | Attack chain | [attack-chain/SKILL.md](attack-chain/SKILL.md) |
| 32 | R11 | Pentest tools | [pentest-tools/SKILL.md](pentest-tools/SKILL.md) |
| 33 | R12 | API security | [api-security/SKILL.md](api-security/SKILL.md) |
| 34 | R13 | Supply chain | [supply-chain-security/SKILL.md](supply-chain-security/SKILL.md) |
| 35 | R14 | LLM / Agent security | [llm-security/SKILL.md](llm-security/SKILL.md) |
| 36 | R15 | Binary diff / symbol migrate | [binary-diff/SKILL.md](binary-diff/SKILL.md) |
| 37 | R19 | Browser / desktop automation | [browser-automation/SKILL.md](browser-automation/SKILL.md) |
| 38 | R40 | Case evidence review | [case-review/SKILL.md](case-review/SKILL.md) |
| 39 | R20 | Docs generator | [docs-generator/SKILL.md](docs-generator/SKILL.md) |
| 40 | R39 | Diagram generation | [diagram-generator/SKILL.md](diagram-generator/SKILL.md) |
| 41 | R41 | Security research / CTF master | [security-research/SKILL.md](security-research/SKILL.md) |
| 42 | R42 | Reverse master router | [reverse-master/SKILL.md](reverse-master/SKILL.md) |
| 43 | R0 | General reverse-engineering（兜底） | [reverse-engineering/SKILL.md](reverse-engineering/SKILL.md) |
| 44 | R43 | Mission keeper（最后兜底） | [mission-keeper/SKILL.md](mission-keeper/SKILL.md) |

## 关联资产

- 路由引擎：`scripts/master-route.ps1` / `scripts/master-route.sh`（读取 `config/routing.json`）
- 路由一致性校验：`scripts/verify-routing-coherence.ps1`
- 路由基准测试：`tests/routing-benchmark.json`
- 领域覆盖对照：`references/domain-coverage-map.md`
- 社区 skill 生态对照与借鉴规则：`references/community-security-skills.md`
- skill 供应链（外部 skill/MCP 安装门闩）：`ops/skill-supply-chain.md`
- RE 四阶段门闩：`reverse-engineering/references/re-agent-workflow.md`
- 授权侦察管线：`pentest-tools/references/recon-pipeline.md`
- 攻击链阶段门闩：`attack-chain/references/lifecycle-checklist.md`