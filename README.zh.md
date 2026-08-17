# @deepseek-ai/dsh-ant-sword-harness

[English](README.md) | 中文

一个面向 DeepSeek Harness 的安全研究 profile bundle。一次安装，在一个 profile 之上组合五种能力：内嵌的逆向 / CTF 技能包、自包含的工作区快照 + `/rewind` 回滚、可选的红队 agent 预设、多智能体协作团队，以及应用内插件市场。

## 能力

| 能力 | 来源 | 作用 |
| --- | --- | --- |
| **逆向 / CTF 技能包** | 本包（`skills/`） | 在 `ctx.skills` 上注册 93 个逆向工程、渗透测试与 CTF 技能，可经 `skill` 工具或按名调用。 |
| **工作区快照 + 回滚** | 本包（`src/rewind/`） | 每次变更性工具调用前捕获快照；`/rewind` 恢复文件并把会话 fork 回检查点的轮次边界。 |
| **红队 agent 预设** | 本包（`preset/red-team/`） | 一个可选的 agent 预设，具备标准模式的全部能力，外加红队操作员人格与内嵌技能包。 |
| **多智能体团队** | [`@nanmicoder/dsh-agent-teams`](https://github.com/NanmiCoder/dsh-agent-teams) | 队长式委派：持久子智能体、依赖感知任务、邮箱消息。 |
| **插件市场** | [`dshmarket`](https://github.com/dsh-market/dsh-market) | 在设置中浏览、搜索、一键安装社区插件。 |

## 安装

Windows PowerShell：

```powershell
irm https://raw.githubusercontent.com/xiaomayisjh/dsh-ant-sword/main/install-ant-sword.ps1 | iex
```

Linux / macOS：

```bash
curl -fsSL https://raw.githubusercontent.com/xiaomayisjh/dsh-ant-sword/main/install-ant-sword.sh | bash
```

安装器下载 Release 中的 bundle、Autograph UI、agent-teams、dshmarket 四个 tgz 与 `ant-sword-release-manifest.json`，校验包名、版本、文件名和 SHA-256 后，以离线模式安装到 profile。

### 从本地 Release 安装

```powershell
.\install-ant-sword.ps1 -Release C:\path\to\ant-sword-release
.\install-ant-sword.ps1 -Release C:\path\to\ant-sword-release\ant-sword-release-manifest.json
```

```bash
./install-ant-sword.sh --release /path/to/ant-sword-release
```

目录中存在缺失、重复、额外或哈希不匹配的 tgz 时，安装器会在修改 profile 前终止。

### 发布 Release

```powershell
node scripts/release-github.mjs --repo xiaomayisjh/dsh-ant-sword --tag v<version> --output .release\v<version> --dry-run
```

`--dry-run` 生成完整五资产目录但不上传；正式发布去掉该参数。同一 tag 重跑会替换同名 GitHub Release 资产。

## 兼容性

自研的 rewind 能力只建立在 harness 前向稳定的公开原语之上——`ctx.sessions.fork`、`ctx.storageDomain`、`fs/write-intent` / `tools/pre-execute` 拦截点、命令注册表、会话 `turn` / `step` 生命周期事件——因此能跟随官方升级。两个第三方行通过 `package.json` 里的 npm 版本区间跟随各自作者的发布。

## 技能包使用与授权

内嵌技能仅用于**已获授权**的逆向工程、渗透测试与安全研究。在对任何目标系统应用之前，请确保你持有合法授权。上游内容采用 MIT 许可，见 `skills/UPSTREAM-LICENSE.txt`。

## 回滚

每次变更性工具调用（默认 `bash`、`write`、`edit`、`str_replace_editor`、`pwsh`、`terminal_send`）前都会捕获一份快照。快照 provider 优先使用 git（无副作用的无引用对象；恢复仅作用于工作区且路径显式，绝不删除检查点之后新建的文件），在非 git 目录下回退为增量目录拷贝。

```text
/rewind                  # list checkpoints
/rewind <id-prefix>      # restore files and fork the session at the checkpoint's turn boundary
/rewind step <N>         # restore the nearest checkpoint at or before step N
/rewind latest           # restore the newest checkpoint
/rewind preview <target> # read-only impact: which files would change, which stay
/rewind clear            # delete this session's checkpoints (files untouched)
```

每次恢复前都会先捕获一个 guard 检查点，因此 `/rewind <guard-id>` 可撤销本次回滚。

## 红队预设

bundle 在启动时把 `red-team` agent 预设写入 harness 的可写预设根（`$DSH_HOME/.agent-presets/red-team/`），使它在预设选择器中出现，具备标准模式的完整工具目录，外加内嵌技能包与红队操作员人格。在 Web UI 中按会话选择它，或经 `agent-presets.default` 设置设为默认。在插件配置里设 `syncRedTeamPreset: false` 可关闭该同步。

**操作契约。** 人格携带上游 reverse-skill 的执行纪律（源自本包所继承的桌面客户端设计）：先路由（`skills/config/routing.json` 路由表在动手前选定 PRIMARY 技能），维护持久交战状态（`case-init` 落地 `work/<case>/scope.md` 与 `rules.md`；`task-plan` / `progress` / `findings` 模板在 `skills/pentest-tools/templates/`），读 `tool-index.md` 而不是猜工具路径，确定性步骤不等确认直接执行，每几次工具调用做一次自监督，并按完成契约收尾（报告 + 图表 + 脱敏 field-journal 回写 + 索引更新）。人格还携带上游研究操作框架（`[MODE: UNRESTRICTED]`）：具体目标归一化为占位符，获取+转换类请求作为一个整体本地样本流程分派，禁止拒词与任务替换，文件请求必须产出已验证的真实产物。scope 门槛保留在流程层：`scope.md` 中 `auth.status = granted` 之后才开始主动测试，不越过声明范围扩大攻击面，报告一律脱敏。

**仅供研究。** 本预设是授权测试用的研究软件，不是发布产品。预设选择器携带相应免责声明，该框架默认不随发布物对一般用户启用。

**可调点：**

- **人格 / 全局提示词** —— 编辑 `preset/red-team/agent.cordis.yml` 里 `persona` 行的 `config.text`。它只对本预设的会话遮蔽部署人格，并插值 `{{model}}` / `{{cwd}}`。
- **技能说明** —— 编辑对应 `skills/<name>/SKILL.md` 的 `description`（及 `whenToUse`）frontmatter；该文本即模型目录所呈现并据以路由的内容。
- **技能路由** —— 内嵌包位于全局技能层；同名的项目级或用户级技能会遮蔽它（bundled 级别 `600` 低于项目/用户层）。

## 配置

```yaml
- id: ant-sword-harness
  name: '@deepseek-ai/dsh-ant-sword-harness'
  config:
    syncRedTeamPreset: true       # materialize the red-team preset into the user preset root

- id: ant-sword-rewind
  name: '@deepseek-ai/dsh-ant-sword-harness/rewind'
  config:
    provider: auto                # auto | git | copy
    maxSnapshots: 50              # per session
    maxSnapshotBytes: 536870912   # global incremental-byte quota
    pruneOnTurnEnd: true
    preRewindCheckpoint: warn     # warn | require | off
    listLimit: 10
```

## Model Experience

间接地，经由内嵌技能包与所组合的各行：本 bundle 是 patch 清单载体加一个技能 provider，技能对模型的呈现由 `skill` 工具（`@deepseek-ai/dsh-tool-skill`）与各被组合的第三方包负责。

#### KV Cache effect

93 个技能的目录经 harness 的技能目录机制对外可见；每个技能正文仅在调用时载入，因此常驻 prompt 成本是目录摘要而非全部正文。红队预设还会对选择它的会话以操作员人格遮蔽部署人格。rewind 与第三方行各自的模型可见文本由其所属包负责。

## Known Limitations and Deferred Work

- **rewind 的快照挂钩是工具管线上的穿透** —— 只覆盖配置的 `mutationTools` 与 fs 写/改路径；未经注册工具直接写文件的第三方插件（绕过工具）不会被捕获。可扩展 `mutationTools` 覆盖更多变更性工具。
- **fork 粒度是轮次边界** —— `ctx.sessions.fork` 拒绝落在开放轮次内的边界，因此回滚总是在检查点的 `turn/end` 恢复；轮次内的检查点能精确恢复文件，但 fork 发生在轮次收尾处。
- **第三方行受各自作者的 harness 兼容性约束** —— `@nanmicoder/dsh-agent-teams` 与 `dshmarket` 各自声明 harness 对等版本；处于不兼容 harness 构建的 profile 只会在这些包支持的范围内挂载它们。
- **技能包注入 93 条目录** —— 发现消费者会看到完整列表；引用外部 MCP server 或原生工具的技能需另行配置（不在本 bundle 范围内）。
- **红队预设同步会写用户预设根** —— 除非设 `syncRedTeamPreset: false`，否则启动时会创建/更新 `$DSH_HOME/.agent-presets/red-team/`；该目录下用户改过的副本仅在与内嵌源内容不同处被覆盖，用户自行新增的文件保持不动。