# Pwn and Native Exploitation Module

## Enter When

- a native binary or kernel component exposes memory corruption, unsafe parsing, constrained execution, or an interactive challenge service
- the objective requires a leak, read/write primitive, control flow, syscall, allocator manipulation, or sandbox escape

## Required Inputs

- binary and dependency hashes
- architecture, loader/libc/runtime, mitigations, and execution command
- local/remote protocol framing and process lifetime
- resettable test environment

## Do

1. Reproduce exact input/output framing before sending cyclic or malformed data.
2. Record `checksec`, imports, strings, high-value functions, and runtime dependencies.
3. Obtain a deterministic crash/leak and calculate offsets, widths, endianness, bad bytes, and alignment.
4. Name the primitive precisely and identify the target object or address.
5. Select the smallest topic reference from `references/ctf/pwn/` using `references/routing.md`.
6. Build chains incrementally with checkpoints for leaks, base calculations, writes, pivots, and final calls.

## Produce

- binary/runtime manifest
- crash or leak proof
- primitive statement and controllable byte map
- complete exploit with configurable local/remote modes
- checkpoint log and final effect

## Verification

- repeat under a clean process with matching loader/libc
- confirm calculated bases or pointers against runtime maps
- verify stack alignment, allocator version, seccomp policy, timeouts, and I/O synchronization
- test a negative or near-miss input to rule out stale process state

## Exit When

The exploit reaches the challenge objective reproducibly, or the exact missing leak/object/function semantic is handed to Reverse.

## Hand Off to Cloud Linux When

本机是 Windows 而题目需要真实 Linux 动态调试（gdb 验偏移、真实 leak、getshell）时，本地做完静态部分再交接，不要在 Windows 上硬啃动调：

- 本地完成：checksec、逆向漏洞逻辑与类型、静态偏移/坏字节/gadget 推导、`exp.py` 骨架（连接收发框架 + 静态值，动调待填处标 `# TODO(cloud)`）。
- 用 `assets/templates/cloud-handoff-prompt.md` 填出交接提示词（对方是通用 agent，方法论要自包含），用 `scripts/reusable/pack_cloud_handoff.py` 把 exp 骨架 + 依赖文件（binary/libc/ld）打成 `handoff.zip`（内含带哈希的 MANIFEST），prompt 另附。
- 用户上传 zip + prompt，云端 Linux agent 接手动调打通。
- 云端**必须回传**：最终 exp、已验证 flag、每个 checkpoint 的真实输出、被推翻/修正的偏移、本地/远程差异——供本地据实写 WriteUp，不靠想象重建过程。

## Pivot When

- function, structure, VM, or algorithm semantics are unknown: `sec-reverse`
- exploit output must be correlated with a capture/dump: `sec-forensics-dfir`
- an encoded/encrypted protocol blocks I/O: `sec-crypto`

## Read

- `../../references/ctf/pwn/index.md`
- exact primitive document from `../../references/routing.md`
- 需要从逆向到可用 exploit 的完整武器化链（stack/heap/kernel 深度）时，转 `../sec-pwn-chain/INSTRUCTIONS.md` 及其 `references/{stack,heap,kernel}-pwn.md`
