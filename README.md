# dsh-ant-sword

`@deepseek-ai/dsh-ant-sword-harness` 的独立分发仓库：一个面向 DeepSeek Harness 的安全研究 profile bundle。本仓库**自足**——携带编译产物 `lib/`，可直接从源码安装，无需构建。

> ⚠ 授权安全研究专用。仅对已获授权的目标（自有系统 / 实验沙箱 / CTF / 受委托测试）使用，并对全部行为及后果负责。

## 安装（三选一）

### 1. Release tarball（推荐，一行）

```powershell
# 私有仓库：先设只读 token
$env:GH_TOKEN = "<read-pat>"
dsh plugin --profile <name> add "https://github.com/xiaomayisjh/dsh-ant-sword/releases/download/v0.1.0-rc.5/deepseek-ai-dsh-ant-sword-harness-0.1.0-rc.5.tgz?access_token=$env:GH_TOKEN"
```

### 2. 源码直装（仓库已含 lib/ 产物）

```powershell
# 私有仓库的 git 源需要消费端持有读凭据（gh auth login 或凭据管理器）
dsh plugin --profile <name> add "github:xiaomayisjh/dsh-ant-sword#main"
```

仓库携带 `lib/` 编译产物，`dsh plugin add` 转发给 pnpm 后直接可用，无构建步骤。

### 3. 本地目录（开发）

```powershell
dsh plugin --profile <name> add link:C:\path\to\dsh-ant-sword
```

装完 **重启 `dsh web`** 生效（`dsh --profile <name>`）。

## 能力

| 能力 | 内容 |
| --- | --- |
| 逆向 / CTF 技能包 | 93 个逆向工程、渗透测试、CTF 技能，注册到 `ctx.skills` |
| 工作区快照 + 回滚 | 每次变更性工具调用前捕获快照，`/rewind` 恢复 |
| 红队 agent 预设 | `red-team` 与 `red-team-auto`（自主 loop）两个预设 |
| 自主 loop | `src/auto/` blackboard（Fact/Intent/Hint 图）驱动 |
| 内嵌 MCP | 8 个 Kali/逆向 MCP 服务器（`mcpServers` 配置可逐台启停） |
| 多智能体团队 | `@nanmicoder/dsh-agent-teams` |
| 插件市场 | `dshmarket` |

## 仓库内容

- `skills/` — 93 个技能（含 vendored 研究内容，保持上游风格）
- `preset/` — 红队预设
- `src/` — TypeScript 源码（rewind / auto loop / mcp-servers / skills provider）
- `lib/` — **编译产物（已入库，支撑源码直装）**
- `kali/`、`docs/`、`RULES*.md` — 平台引导与执行契约
- `.github/workflows/release.yml` — 手动触发的 release workflow

## 发版（维护者）

在 Actions 标签页手动运行 **release** workflow，可选填 tag（默认 `v<package.json version>`）。workflow 直接打包仓库当前内容（含已入库的 `lib/`）并发 release 资产。

或本地：

```powershell
node scripts/release-github.mjs --repo xiaomayisjh/dsh-ant-sword --profile <name>
```

## 编辑源码

`src/` 的 TS 改动需在 ant-dsh monorepo 里重建 `lib/`（bundle 依赖 monorepo 的 workspace 引用与 vendored cordis 编译上下文），再把更新后的 `lib/` 一并提交回本仓库。直接改 `skills/`、`preset/`、`*.md` 等数据文件则无需重建。