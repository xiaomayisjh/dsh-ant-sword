# Portable MCP registry

本目录是 bundle 的**便携 MCP 注册中心**：所有内嵌 MCP server 的定义、数据目录与注册/注销脚本都随包走。把整个 bundle（或整个 dsh 插件目录）拷贝到另一台机器，重新执行一次注册即可即插即用。

## 内嵌服务器

| server | 用途 | 运行方式 | 数据 |
|---|---|---|---|
| `firecrawl` | 网页抓取 / 爬取 / 搜索（recon、OSINT、文档挖掘） | `npx -y firecrawl-mcp@3.24.0`（远程包，免本地安装） | 无状态 |
| `codebase-memory` | 代码库知识图谱 MCP（单静态二进制，158 语言，亚毫秒查询） | 本地二进制，安装到 `bin/codebase-memory/` | `data/codebase-memory/`（知识图谱随包携带） |

## 注册 / 注销

```powershell
# Windows（PowerShell）
powershell -NoProfile -ExecutionPolicy Bypass -File skills/mcp/register.ps1        # 写入 Claude + Codex 配置
powershell -NoProfile -ExecutionPolicy Bypass -File skills/mcp/unregister.ps1      # 移除
powershell -NoProfile -ExecutionPolicy Bypass -File skills/mcp/register.ps1 -Hosts codex   # 只写 Codex
```

```bash
# Linux / Kali（Bash）
bash skills/mcp/register.sh
bash skills/mcp/unregister.sh
```

写入位置：Claude `~/.claude/mcp.json`；Codex `~/.codex/config.toml`（`[mcp_servers."<name>"]` 段，只增删本清单声明的段，不碰其他配置）。注册记录落在 `registered.json`，供注销使用。

## 密钥

`firecrawl` 需要 `FIRECRAWL_API_KEY`：注册前在环境变量中设置，脚本会自动注入宿主配置（未设置则跳过 env，需手动补）。`codebase-memory` 无密钥、无外部依赖。

## 数据目录（便携）

- `data/codebase-memory/` —— codebase-memory 的知识图谱持久化目录。经验积累随包走：整包拷贝到新机器后图谱直接可用。
- `bin/` —— codebase-memory 本地二进制安装位置（`bootstrap-reverse.ps1` / `bootstrap-reverse.sh` 的 `codebase-memory-mcp` 能力安装到此）。

## 与 bootstrap 的联动

`skills/scripts/bootstrap-manifest.json`（Windows）与 `kali/scripts/bootstrap-manifest.json`（Kali）登记了对应能力：

- `firecrawl-mcp`（npm-mcp，pin `3.24.0`）
- `codebase-memory-mcp`（github-release 二进制，pin `v0.10.5`，`installDir` 指向本目录 `bin/`）

安装后运行 `refresh-tool-index` 使 `tool-index.md` 记录真实路径。所有路径均以 `%SKILL_ROOT%` 相对解析，机器无关。