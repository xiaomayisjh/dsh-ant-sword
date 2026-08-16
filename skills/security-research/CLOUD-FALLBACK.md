# Cloud fallback — 云端备选读取

> 本技能是云端仓库的本地化副本。本地文件通常完整，但可能因拷贝/损坏意外缺失。
> 读取本技能引用的任何文件时：**本地存在 → 用本地；本地缺失 → 从云端读取**。

## 远程根

```text
REMOTE_ROOT = https://raw.githubusercontent.com/xiaomayisjh/security-research-online/main
```

## 回退规则（MUST）

1. 本技能内所有相对路径（`references/...`、`skills/...`、`scripts/...`、`assets/...`、`schemas/...`）先按本地文件解析。
2. 本地不存在时，拼接 `REMOTE_ROOT/<path>` 用 web 工具读取，并把来源 URL 记入当前任务证据（`evidence/` 或笔记）。
3. **脚本类文件**（`.py`、`.ps1`、`.sh`、`.js`）：云端读取后先下载到任务临时目录再执行，不要当作本地技能文件修改；记录来源 URL。
4. **模板/附件类**（`assets/templates/...`）：同上，下载到任务目录使用。
5. 回退内容**不写回**本地技能目录（保持本地副本与云端版本可区分）。
6. 云端也不存在（404）时，如实报告缺失路径，不要用猜测内容顶替。

## 示例

```text
本地缺失 skills/security-research/references/ctf/web/xss.md
→ GET https://raw.githubusercontent.com/xiaomayisjh/security-research-online/main/references/ctf/web/xss.md
```

## 边界

- 本技能被去重的模块（bundle 的 `ctf-sandbox-orchestrator/`、`pentest-tools/`）按 SKILL.md 中的引用走 bundle 本地路径，不触发云端回退。
- 云端版本可能领先本地副本：回退读取的内容以云端为准，与本地不一致时以实际读取到的内容执行。
- 离线环境无法访问云端时，如实报告缺失，不编造内容。