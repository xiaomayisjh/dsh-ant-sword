# routing.md — 三轴路由矩阵（目标类型 × 用户意图 × 工具链）

> **单一事实源**：机器路由表是 `config/routing.json`（`routes` + `priority`），
> 由 `scripts/master-route.ps1` 读取并计算 PRIMARY。本文件说明**三轴判定思路**与
> 规则结构，帮助模型在未跑脚本时也能正确分流；具体关键词规则一律以
> `config/routing.json` 为准（`verify-routing-coherence.ps1` 校验二者一致）。

## 三轴判定

| 轴 | 问题 | 示例 |
|----|------|------|
| 目标类型 | 对象是什么？ | APK / ELF / PE / JS bundle / 固件 / 移动端 / Web API / 域环境 |
| 用户意图 | 要做什么？ | 解包、反编译、Hook、签名定位、补丁差分、漏洞利用、报告 |
| 工具链 | 用哪条链？ | jadx+apktool / IDA / radare2 / Frida / Burp / Ghidra / 纯静态 |

判定顺序：

1. 目标类型先过滤候选路由（例如 `.so` → R6 二进制静态；APK → R1）。
2. 用户意图定主任务（逆向 vs 渗透 vs 报告：R20/R39 是收尾路由）。
3. 工具链决定同域内的实现路径（静态↔动态、Java↔Native、IDA↔r2，一条路堵死就换一条）。

## 规则结构（routing.json）

- 每条规则含 `must`（命中正则）、可选的 `mustAll`（全部命中才成立）、`exclude`（命中即排除，防误伤）。
- 多规则命中同路由 → 加分；按 `priority` 顺序取分数最高者为 PRIMARY；并列时 priority 靠前者胜出。
- 未命中任何规则 → 回退 `fallbackId`（R0 通用逆向）。

## 执行门闩（路由之后、ACT 之前）

- `scripts/case-init.ps1` 落地 `work/<case>/scope.md`（契约见 [ops/scope-contract.md](ops/scope-contract.md)）；**auth 未 granted 禁止对目标 ACT**。
- 本机工具路径一律读 `tool-index.md`（`scripts/refresh-tool-index.ps1` 生成），**禁止猜路径**。
- 身份与边界见 [ops/IDENTITY.md](ops/IDENTITY.md)；先例库 `field-journal/precedent-auth.md` 每次启动必读。

## 未命中处理

路由无法命中 → 禁止硬塞到不匹配模块；先联网补充方法论，按
[ops/skill-supply-chain.md](ops/skill-supply-chain.md) 的门闩评估后**提议新增 skill**（含 routing.json 新路由 + benchmark 用例）。