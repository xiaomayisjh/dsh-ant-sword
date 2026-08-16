# Experience Schema

用这个格式保存长期可复用经验。目标是让后续任务能快速判断“能不能套用、怎么套用、怎么验证”。

## Playbook 文件

稳定经验放在 `references/experience/<topic>.md`，结构建议：

```markdown
# Topic

## Applies When
- 触发信号 1
- 触发信号 2

## Quick Decision
| Signal | Action | Validation |
|---|---|---|

## Workflow
1. 被动采集证据。
2. 定位关键边界。
3. 使用最小脚本验证。
4. 保存原始、中间、最终产物。

## Reusable Scripts
| Script | Inputs | Outputs | Notes |
|---|---|---|---|

## Pitfalls
- 失败条件和回退点。

## Verification
- 干净基线复现步骤。
```

## 单次经验条目

候选经验优先由跨平台的 `scripts/reusable/new_experience_entry.py` 生成；PowerShell 可使用 `new-experience-entry.ps1` 包装器。默认写入当前任务工作区的 `analysis/experience-candidates/`，避免未经复验直接污染已安装 skill。审核通过后才用显式 `--skill-root` 晋级到 `references/experience/log/`。

```yaml
---
title: short descriptive title
category: web-api | pwn | reverse | crypto | forensics | malware | misc | osint | ai-security | identity-cloud | mobile-firmware | tooling | other
tags: [ctf, js, har]
created: 2026-06-27
last_validated: null
source_task: short task name or path
reusable_script: scripts/reusable/example.py
status: candidate | stable | deprecated
---
```

正文必须包含：

- `Applies when`：适用信号和必要前置条件
- `Does not apply when`：反例、失效信号和不适用条件
- `Workflow`：最小步骤
- `Validation`：复现命令、样本哈希、版本、干净基线和关键输出
- `Pitfalls and rollback`：失败条件和应退回的最早阶段
- `Promotion notes`：什么时候可以从 candidate 升级为 stable

## 可复用脚本头部

脚本放 `scripts/reusable/`，头部注释写清：

```text
Purpose:
Inputs:
Outputs:
Dependencies:
Safe defaults:
Known limits:
Example:
```

脚本应满足：

- 默认只读或只写到显式输出目录
- 不修改原始样本
- 输出结构化 JSON/CSV/Markdown 中至少一种
- 失败时给出明确错误，不吞异常
- 示例命令能直接复制运行

## 研究成果保存位置

| 类型 | 推荐位置 |
|---|---|
| 稳定 playbook | `references/experience/<topic>.md` |
| 当前任务候选经验 | 当前工作区 `analysis/experience-candidates/YYYY-MM-DD-title.md` |
| 已审核候选经验 | `references/experience/log/YYYY-MM-DD-title.md` |
| 可复用脚本 | `scripts/reusable/<name>` |
| 当前任务中间产物 | 当前项目 `analysis/`、`reverse-output/` 或用户指定目录 |
| 第三方工具说明 | `references/tools.md` 或具体 playbook |

## 去敏规则

长期经验库中使用占位符：`<target>`, `<host>`, `<cookie>`, `<token>`, `<captcha_id>`。如果必须记录挑战样本，保存哈希、字段结构和可再生成命令，不保存长期可用凭据。
