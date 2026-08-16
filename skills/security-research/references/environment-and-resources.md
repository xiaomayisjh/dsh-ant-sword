# 环境与协作：工具缺失、Windows 兼容性、可索取资源

本机默认是 **Windows**。很多 CTF 工具面向 Linux，直接在 Windows 上跑常有兼容性问题。遇到关键工具缺失或跑不通时，不要硬啃或用蹩脚脚本凑合——先判断是找 Windows 替代品，还是请用户安装/提供资源，并附上可执行的指导。

## 工具缺失处理流程

1. 先用 `scripts/env_probe.py --category <domain>` 确认工具是否真的缺失，还是只是不在 PATH。发现的可执行文件仍可能配置错误或不可用，必要时跑一次最小自检。
2. 缺失时按以下顺序决策，而不是立刻自己造轮子：
   - **有等价的本机/标准库方案**：直接用（如用 Python 标准库替代一个小工具）。
   - **有可靠的 Windows 原生替代品**：见下方对照表，说明差异后使用。
   - **需要 WSL/容器**：多数 Linux-only 工具在 WSL2 里最省事，告知用户并给出命令。
   - **需要联网安装或需要用户本地资源**：停下来问用户，附安装指导（官方来源、锁定版本、校验方式）或说明需要什么资源。
3. 请用户安装时，给出**具体命令**而非"请自行安装"，并说明为什么需要它、装完如何验证。安装第三方工具遵循 `SKILL.md` 执行原则 10：确认官方来源、固定版本、核对校验值，不执行远程脚本管道。
4. 用户拒绝安装或环境受限时，明确说明这条路走不通的影响，转到证据允许的替代路线，不要假装工具存在。

> 让用户运行交互式命令（如登录、`wsl`、`pip install`）时，可提示在本会话输入行以 `! ` 前缀直接执行，输出会回到对话。

## Windows 兼容性对照

| 需求 | Linux 常用 | Windows 上怎么办 |
|---|---|---|
| 动态调试 pwn / GDB 脚本 | `gdb` + pwndbg/gef | 原生无 → **WSL2** 里装；或远程 gdbserver；或**交接云端 Linux agent**（见下） |
| pwntools 进程交互 | pwntools | Windows 可 `pip install pwntools`，但 `process()`/GDB 联动不稳 → 远程用 `remote()` 可行，本地起进程建议 WSL |
| 反汇编/反编译 | radare2、Ghidra、IDA | radare2/rizin、Ghidra、IDA 都有 Windows 版，直接用 |
| 固件/文件雕刻 | `binwalk`、`foremost` | binwalk 依赖多，Windows 有坑 → WSL；雕刻可用 **PhotoRec/TestDisk**（Windows 原生）替代 foremost |
| 隐写 | `steghide`、`zsteg`、`outguess` | steghide 无官方 Windows 包 → WSL；zsteg 装 Ruby 后可用；图像分析可用 **StegSolve**(Java)、`stegoveritas` |
| 内存取证 | Volatility3 | 跨平台 Python，Windows 直接 `pip install volatility3` |
| 密码/哈希爆破 | `john`、`hashcat` | 都有 Windows 版；hashcat 用 GPU 时 Windows 反而方便 |
| 数学/格 | SageMath | Windows 原生难 → **WSL** 或官方 Docker 镜像；轻量场景用 `sympy`/`pycryptodome`/`fpylll` |
| `file`/`strings`/`xxd`/`nc` 等 coreutils | 系统自带 | Windows 无 → 用 **Git Bash** 自带版本，或 PowerShell/Python 等价实现；`nc` 用 `ncat`(Nmap 自带) |
| 网络抓包 | tcpdump | Windows 用 **Wireshark/tshark**、`pktmon` |

选择原则：能用 Windows 原生就原生；Linux-only 且 WSL 可解就走 WSL 并告知用户；两者都要装的，先问用户。跨环境时记录工具版本和路径差异（WSL 与 Windows 的路径、换行、权限不同）。

## 跨环境交接（本地 Windows → 云端 Linux agent）

有些 pwn（以及需要真实 Linux 运行态的题）在 Windows 上做不了动态调试。分工：**本地做静态、云端做动态**，不要在 Windows 上硬啃 gdb。

- **本地（Windows 静态）**：checksec、逆向漏洞逻辑、静态偏移/坏字节/对齐推导、`exp.py` 骨架、用 pwntools 的 `ELF`/`ROP` 做纯解析（不起进程）。动调待填处标 `# TODO(cloud)`。
- **交接**：用 `assets/templates/cloud-handoff-prompt.md` 填提示词（云端假定为通用 agent，方法论自包含）；用 `scripts/reusable/pack_cloud_handoff.py` 把 exp 骨架 + 依赖文件（binary/libc/ld，版本要与分析时一致）打成 `handoff.zip`（含哈希 MANIFEST）。用户上传 zip、把 PROMPT.md 交给云端 agent。
- **云端（Linux 动态）**：gdb 验偏移、取真实 leak、算基址、逐 checkpoint 打通、本地对齐 libc/ld 后切远程、校验 flag。
- **回传**：最终 exp、已验证 flag、每个 checkpoint 真实输出、被修正的偏移、本地/远程差异。本地据此写 WriteUp（真实过程，非重建）。

## 主动向用户索取的资源

用户常常持有能大幅加速解题、但没主动提及的资源。当某一步会因此更快或更可靠时，**主动询问一次**（问清能否提供、放在哪），不要默默走慢路或假设没有。典型清单：

- **主办方提供的字典/词表**：很多比赛随题目发字典或提示密码规则。爆破、目录扫描、密码猜解前先问有没有专用 wordlist，再退到 rockyou 等通用表。
- **彩虹表 / 已建哈希库**：遇到无盐 MD5/SHA1/NTLM 等，先问用户本地是否有彩虹表或可用的在线查询（如 crackstation、hashes.com）额度，避免盲目本地爆破。
- **验证码/风控代过**：登录链或接口被验证码、行为验证、短信/OTP 挡住时，问用户能否人工代过一次（提供 cookie/token/一次性验证码），或是否有打码服务额度。拿到有效会话后再继续自动化，比硬刚风控高效。见 `experience/web-captcha.md`。
- **MCP 挂载 / 外部能力**：需要浏览器自动化、特定 API、数据库直连、云凭据或某个专用服务时，问用户能否挂载对应 MCP 或提供接入方式，而不是绕远路复刻。
- **靶机凭据与接入**：远程题的 SSH/RDP 账号、VPN 配置、内网跳板、API key、测试账号——需要时直接问，明确这是题目授权范围内的接入信息。
- **已有进度与上下文**：用户之前的解题记录、抓到的流量/样本、部分 flag、题目原始附件或 writeup 草稿。接手前先问，避免重复劳动。
- **算力/环境**：需要 GPU 爆破、长时间跑格规约、大内存取证时，问用户是否有更合适的机器或云环境。

询问要具体、可执行：说明**为什么需要**、**需要什么格式**、**拿到后怎么用**。用户明确不提供时，记录这条路受限的影响，转到证据支持的替代方案。所有索取的凭据、字典、会话只用于当前题目范围，不外传、不留存无关秘密（见 `scope-and-evidence.md`）。

## 本机已确认工具

以下是在本机（Windows）实测过的工具状态与调用契约，供直接复用。环境可能变化，首次使用时快速自检一次即可。

- **Python**：`D:\Run-env\Python`（3.13，pip 走阿里云镜像）。装包用 `python -m pip install <pkg>`。
- **winpwn**（Windows 本地 pwn 库，pwntools 的 Windows 对应）：已装并可 `import winpwn`。配套 `pefile`、`capstone`、`keystone-engine` 均可用。适合 Windows 本地调试与 shellcode/汇编；远程交互仍可直接用其 `remote`。
- **checksec.exe**（PyInstaller 打包的 checksec.py，非 Linux 的 checksec.sh）：**用户持有，默认未入 PATH，需要时向用户索取当前路径**。调用契约（实测）：
  - 用法是位置参数：`checksec.exe --json <目标文件>`，不是 `--file`。
  - **必须加 `--json`**：默认表格模式在 Git Bash / 管道等无真实控制台环境下会因 rich 渲染崩溃（`_windows_renderer`）；需要表格时在真实 PowerShell/cmd 里跑。
  - 启动时打印的 `Can't open '/lib/libc.so.6'` 等是它探测 ELF libc 路径的 stderr 噪声，Windows 上无害，解析 `--json` 输出时忽略。
  - 对 PE 正确报告 `nx/canary/aslr/dynamicbase` 等；ELF 需要配 libc 时用 `-s <libc>`。
  - `env_probe.py` 的通用 `checksec` 条目按 PATH 探测；此 exe 未入 PATH 时会如实报未找到，属预期，不代表不可用。
