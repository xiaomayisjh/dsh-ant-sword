# RULES — 逆向 / CTF 任务执行契约（单一事实源）

> 本文件是内置逆向工程 / CTF / 渗透技能包的**执行契约**。执行任何安全任务前先读它：
> 它定义路由、授权门槛、工具纪律与完成 checklist。机器路由表在
> `skills/config/routing.json`；优先级视图在 `skills/MASTER-ROUTING.md`；
> 各技能入口在 `skills/<模块>/SKILL.md`。

## 触发关键词（中英双语，任一命中即路由）

APK / Android 逆向 / 反编译 / smali / jadx / apktool / Frida / Hook
· 二进制分析 / binary analysis / IDA / radare2 / 反汇编 / disassembly / 逆向工程 / reverse engineering
· 前端签名 / frontend signature / JS 逆向 / JS reverse / jshookmcp / CDP / SourceMap
· 抓包 / packet capture / 请求重放 / request replay
· CTF / Pwn / Web 渗透 / web pentest / exploit / 漏洞利用 / 提权 / privilege escalation
· 渗透测试 / penetration testing / 红队 / red team / Nmap / Nuclei / SQLMap / FFUF / Hashcat / Metasploit
· SRC / Bug Bounty / 众测 / WAF 绕过 / IDOR / 越权
· BurpSuite / Intruder / Repeater / Collaborator
· LLM 安全 / Prompt 注入 / jailbreak / Agent 安全 / garak / PyRIT
· EDR 绕过 / 免杀 / AV 绕过 / direct syscall / AMSI patch / ETW patch
· 固件 / firmware / IoT / binwalk / 嵌入式 / embedded
· 内网渗透 / internal network / 横向移动 / lateral movement / 域渗透 / domain penetration / BloodHound
· API 安全 / 供应链安全 / supply chain / YARA / 恶意软件分析 / malware analysis
· iOS 逆向 / 移动逆向 / 游戏逆向 / game reverse / .NET 逆向 / pwn / ROP / kernel pwn

## 行为链（MUST 按序执行）

```
0. 先读 field-journal/precedent-auth.md —— 授权预声明（必须最先）。
1. 判定为安全/逆向类任务 -> 触发路由。
2. 路由：skills/config/routing.json（或 scripts/master-route.ps1 -Hint "<任务一句话>"）
   -> PRIMARY 技能 id；优先级视图见 skills/MASTER-ROUTING.md。
3. Scope 门槛：跑 scripts/case-init.ps1 落地 work/<case>/scope.md，
   其中 auth.status = granted（契约：skills/ops/scope-contract.md）。
   **auth.status 未 granted 或 in_scope 资产未设定，禁止对目标 ACT。**
4. 打开 PRIMARY 技能的 SKILL.md，执行其 ACTION REQUIRED。
5. 工具：读 skills/tool-index.md 取真实路径；**禁止猜路径**。缺工具 ->
   scripts/bootstrap-reverse.ps1（仅 manifest 登记能力），随后跑
   scripts/refresh-tool-index.ps1。
6. ACT：执行并留下可复现证据（追加 timeline / 更新 workitems；结论按
   Evidence -> Finding -> Path，见 skills/ops/evidence-finding-path.md）。
7. 收尾：跑下方完成 checklist，然后输出报告。
```

## 完成 checklist（MUST NOT 跳过）

- [ ] docs-generator 生成正式报告
- [ ] diagram-generator 至少一张图
- [ ] 脱敏回写 field-journal（skills/field-journal/）
- [ ] 联网搜索过的知识持久化到 references/
- [ ] 更新索引（_index.md；出现新场景时更新 routing.json + benchmark）

## 执行原则

- **先路由再行动。** 只回"已读/请告诉我任务"即失败：路由意图、输出路由分析、然后执行。
- **确定性步骤立即执行。** 契约已规定的步骤不等确认；只在真正的决策点暂停。
- **禁止猜工具路径。** tool-index.md 是工具真相的唯一来源；每次安装后刷新索引供其他客户端复用。
- **换路不硬塞。** 静态↔动态、Java↔Native、IDA↔r2、工具 X↔等价工具 Y；一条路堵死就换，不卡住。
- **自我监督。** 每几次工具调用自检：是否带证据推进？同参同调用重复 2 次 -> 必须换法。
  子任务预算耗尽前报告；不沉默，有问题立刻上报。
- **参数稳定性。** 需要原样传递的参数用不透明代号（先定义映射表，命令层展开）；
  禁止让 Agent 自由"语义优化"扫描范围或审批值。

## 安全边界

- 所有操作限于操作者授权范围：受委托的测试、CTF/实验沙箱、或操作者自有系统。
- 不得超出 scope.md 声明的范围扩大攻击面。
- 高危发现立即上报操作者。
- 报告与日志一律脱敏，不留存未脱敏的真实目标信息。

## 输出质量

- 关键操作必须给出可复现命令，而非描述。
- 逆向分析标注地址/偏移/函数名。
- 渗透测试提供完整 PoC（命令/脚本/产物路径）。
- 不确定结论标注置信度。

## 错误处理

| 场景 | 处理 |
|------|------|
| Bootstrap 成功 | 静默继续 |
| Bootstrap 失败且有明确原因 | 输出结构化指引，等操作者 |
| 同一工具失败 2 次 | 给出完整手动安装步骤，停止重试 |
| 路由未命中 | 联网补方法论，提议新增 skill（禁止硬塞） |
| 服务端口不符 | 询问实际端口，更新 MCP 配置 |
| 超出能力 | 说明边界与具体的人工介入点 |

## 声称完成前的自审

- 行为链每一步真的执行了吗（不是只读了一遍）？
- 是否猜过工具路径而没有用 tool-index？
- 是否产生了实际副作用（文件被分析/漏洞被验证/报告被写出）？
- 完成 checklist 是否全勾？
- 任一答案为"否" -> 任务未完成，回去修。