---
name: reverse-skill-pack
description: Entry hub of the bundled reverse/CTF skill pack. Read first when the task is reverse engineering, exploitation, penetration testing, CTF, malware, mobile, firmware, or security research, and route to the PRIMARY skill before acting.
---

# Reverse/CTF 技能包总控入口

本包收录逆向工程 / 渗透测试 / CTF 相关的技能模块，每个子目录是独立模块（内含 `SKILL.md`）。

## 路由执行契约（读完后立即执行，禁止只回"已读"）

按顺序执行：

1. `NOW`：读 [MASTER-ROUTING.md](MASTER-ROUTING.md)（或跑 `scripts/master-route.ps1 -Hint "<任务一句话>"`）定 PRIMARY；疑难再读 [routing.md](routing.md) 三轴表。
2. `NOW`：`scripts/case-init.ps1` 落地 `work/<case>/scope.md`（契约见 [ops/scope-contract.md](ops/scope-contract.md)）；**auth 未 granted 禁止对目标 ACT**。
3. `NOW`：按 [ops/role-map.md](ops/role-map.md) 标 lead/specialist；立即打开 PRIMARY 子模块 `SKILL.md` 执行 ACTION REQUIRED。
4. `NEXT`：涉及本机工具时读 `tool-index.md`；**禁止猜路径**；缺工具 → `bootstrap-reverse.ps1`（仅 manifest 登记的能力）。
5. `ACT`：执行并**追加 timeline / 更新 workitems**；结论用 Evidence→Finding→Path（[ops/evidence-finding-path.md](ops/evidence-finding-path.md)）。
6. 结束：`docs-generator` 报告 + 脱敏 `field-journal` 回写；阶段菜单 3-6 项。

路由未命中 → 先联网补方法论并**提议新增 skill**，禁止硬塞到不匹配模块。

## 指令语义（RFC 2119）

- `MUST`：必须执行，违背即任务失败。
- `MUST NOT`：禁止执行，违背即安全违规。
- `SHOULD`：原则上要做，不做必须说明原因。
- `MAY`：可选动作。

## 模块总表

完整模块表与优先级见 [MASTER-ROUTING.md](MASTER-ROUTING.md)；三轴路由矩阵见 [routing.md](routing.md)。
领域覆盖对照：`references/domain-coverage-map.md`；社区 skill 生态对照：`references/community-security-skills.md`；
外部 skill/MCP 安装门闩：`ops/skill-supply-chain.md`。

## 身份与边界

- 身份与定位：见 [ops/IDENTITY.md](ops/IDENTITY.md)（轻量路由包 + 工具自举 + journal；**不是** Z3r0 式平台）。
- 授权硬门槛：scope 未 granted 时只允许读文档/路由，**禁止**对目标主动扫描、Hook、利用。

## 关联资源

- 本机工具可用性以 `tool-index.md`（`scripts/refresh-tool-index.ps1` 生成）为准。
- MCP 服务（anything-analyzer / idapro / burpsuite 等）按各自 skill 文档接入。
- 操作先例库：`field-journal/precedent-auth.md`（每次启动必读）→ `precedent-reverse.md` / `precedent-pentest.md`（按需懒加载）。

## 按需自举

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\bootstrap-reverse.ps1" -Capability @('工具名') -StartServices
```

支持的能力以 `scripts/bootstrap-manifest.json` 为准；未登记的工具 MUST 走手动安装步骤，禁止假装可 bootstrap。
自举完成后自动刷新 `tool-index`。