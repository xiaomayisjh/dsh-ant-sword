# dsh-ant-sword

`@deepseek-ai/dsh-ant-sword-harness` 的独立分发仓库。它为 DeepSeek Harness 提供安全研究技能包、自主 loop、独立 Rewind 插件、MCP 管理界面、多智能体团队和插件市场。本仓库携带已构建的 `lib/`，Release 安装不需要在消费端编译。

## 一行安装

安装器下载最新 GitHub Release 的四个 tgz 与 SHA-256 manifest，校验完整后以离线模式安装到 `web` profile。需要本机已有 `gh`、`dsh`、Node.js 和 pnpm；私有仓库先执行 `gh auth login`。

Windows PowerShell：

```powershell
irm https://raw.githubusercontent.com/xiaomayisjh/dsh-ant-sword/main/install-ant-sword.ps1 | iex
```

Linux / macOS：

```bash
curl -fsSL https://raw.githubusercontent.com/xiaomayisjh/dsh-ant-sword/main/install-ant-sword.sh | bash
```

安装完成后运行：

```text
dsh web
```

可通过参数指定 profile 或 Release tag：

```powershell
& ([scriptblock]::Create((irm 'https://raw.githubusercontent.com/xiaomayisjh/dsh-ant-sword/main/install-ant-sword.ps1'))) -Profile web -Tag v0.1.0-rc.14
```

## 从本地 Release 安装

完整 Release 目录包含：

- `deepseek-ai-dsh-ant-sword-harness-<version>.tgz`
- `deepseek-ai-dsh-client-ui-autograph-<version>.tgz`
- `nanmicoder-dsh-agent-teams-0.1.4.tgz`
- `dshmarket-1.4.1.tgz`
- `ant-sword-release-manifest.json`

manifest 记录每项资产的包名、版本、文件名与 SHA-256。安装器在修改 profile 前拒绝缺失、重复、额外或哈希不匹配的 tgz。

```powershell
.\install-ant-sword.ps1 -Release C:\path\to\ant-sword-release
# 也可直接传 manifest：
.\install-ant-sword.ps1 -Release C:\path\to\ant-sword-release\ant-sword-release-manifest.json
```

```bash
./install-ant-sword.sh --release /path/to/ant-sword-release
```

## 能力

| 能力 | 内容 |
| --- | --- |
| 逆向 / CTF 技能包 | 93 个逆向工程、渗透测试、CTF 技能，注册到 `ctx.skills` |
| 独立 Rewind | 单独的 `@deepseek-ai/dsh-ant-sword-harness/rewind` Cordis 行，仅依赖 sessions、storageDomain、commands、tools |
| 红队 agent 预设 | `red-team` 与 `red-team-auto` 两个预设 |
| 自主 loop | `src/auto/` blackboard（Fact/Intent/Hint/Goal 图）驱动 |
| MCP 管理 | Codex 风格服务器列表与详情；可视化/JSON 双模式，支持直接粘贴常见 MCP JSON 格式；基础 DSH 未暴露私有 settings namespace 时自动使用仅限 loopback、仍复用同一 Host settings 事务的兼容桥接 |
| 多智能体团队 | `@nanmicoder/dsh-agent-teams` |
| 插件市场 | `dshmarket` |

## 仓库内容

- `skills/` — 技能包及 vendored 研究内容
- `preset/` — 红队预设
- `src/` — bundle TypeScript 源码
- `lib/` — bundle 已构建产物
- `vendor/ui-autograph/` — MCP/Autograph UI 源码与构建产物
- `vendor/mcp-client/` — standalone MCP client 快照
- `scripts/` — Release 生成、manifest 校验与 profile 安装模块
- `kali/`、`docs/`、`RULES*.md` — 平台引导与执行契约
- `.github/workflows/release.yml` — 手动触发的完整 Release 工作流

## 发版

Actions 中手动运行 **release** workflow；tag 默认取 `v<package.json version>`。工作流调用与本地相同的发布脚本，上传四个 tgz 与 manifest。

本地 dry-run 会保留可直接安装的 Release 目录，不上传 GitHub：

```powershell
node scripts/release-github.mjs --repo xiaomayisjh/dsh-ant-sword --tag v0.1.0-rc.14 --output .release\v0.1.0-rc.14 --dry-run
```

正式上传去掉 `--dry-run`。同一 tag 重跑会替换同名资产。

## 编辑源码

`src/` 或 `vendor/ui-autograph/src/` 的 TypeScript 改动应在 ant-dsh monorepo 中完成构建，并将对应 `lib/` 一并同步。本仓库的 `tsconfig.json` 自包含，可用于源码与测试工具解析；发布使用已提交的构建产物。