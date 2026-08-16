# 云端 Pwn 动调交接提示词

> 用法：填好下面每个 `[...]`，删掉本行和括号提示，把整段作为 prompt 交给云端 Linux agent；配套 zip（exp 骨架 + 依赖文件 + 文件清单）一并上传。缺失项写“未记录”，不要编造。

你是接手一道 CTF pwn 题的执行 agent，运行在 **Linux** 环境（有 `gdb`/pwndbg、`pwntools`、`checksec`、`objdump`、`one_gadget`、`ropper` 等）。本地分析在 Windows 上完成，静态部分已做，动态调试和实际打通交给你——因为这题需要真实 Linux 运行态。所有目标均为 CTF 授权范围内的沙箱资产。

## 题目背景

- 题目名称/类型：[name / pwn 子类]
- 远程服务：[host:port 或“仅本地二进制”]
- 目标：[拿到 shell / 读取 flag 文件 / 具体成功条件]
- flag 格式：[flag{...} 或未知]

## 本地已完成（静态，视为待你验证的输入而非结论）

- 保护（checksec）：[NX/Canary/PIE/RELRO/Fortify 实测值]
- 架构/libc/loader：[x86-64、glibc 2.xx、ld 版本；见文件清单哈希]
- 漏洞位置与类型：[函数名/地址 + 栈溢出/UAF/fmt/off-by-one 等，附依据：反编译片段或行号]
- 静态推导的偏移/约束：[到返回地址的偏移、可控字节数、坏字节、对齐——标注这些是静态推的，需动调确认]
- 已定位的目标/gadget：[目标函数、GOT/PLT、候选 one_gadget、ROP 链设想]
- exp 骨架：`exp.py`（zip 内），已写好连接/收发框架和静态偏移，标了 `# TODO(cloud)` 处待你动调填真实值

## 交给你完成

1. 用 gdb 动调**验证每个静态偏移**（`cyclic`/`pattern` 确认返回地址偏移、泄漏位置、对齐），运行态与静态不符时**以运行态为准**并记录差异。
2. 取真实 leak，算实际基址（libc/PIE/heap），逐段设 checkpoint（leak → base → write/pivot → final call），不要一次堆完整链。
3. 先在**本地二进制**用 zip 内的 libc/ld 打通（`LD_PRELOAD` 或 patchelf 对齐版本），再切**远程**；记录本地/远程差异（ASLR、缓冲、超时、I/O 同步）。
4. 打通后**校验 flag**：来源、格式、唯一性。

## 交回给我（务必回传，用于据实写 WriteUp）

- 最终可运行的 `exp.py`（本地+远程模式），写明 pwntools 版本、libc 版本、运行命令。
- 已验证的 flag，及它来自哪个响应/文件。
- **每个 checkpoint 的真实输出**（leak 值、算出的基址、`RIP` 控制证明、getshell 那几行）——原样贴关键行，不要总结成“成功了”。
- 静态推导里哪些偏移/假设被动调**推翻或修正**了，改成了什么。
- 本地与远程的差异（版本、ASLR、超时、同步条件）。

## 方法论要点（若你没有专用 pwn 工具链，按此执行）

- 先复现 I/O 帧（收发顺序、提示符、`recvuntil` 锚点）再发畸形数据。
- 崩溃偏移用 `cyclic 200` 发、`cyclic -l $rsp` 反查，别靠猜。
- 泄漏必须换算到基址并与 `vmmap`/运行态核对；地址端序、宽度、坏字节（`\x00\x0a\x20`）逐一确认。
- 栈对齐（`movaps`）不满足时在 ROP 链前加一个 `ret`。
- 只有真实运行复现的过程才算数：命令、输出、状态变化随手留痕，交回时附上。
