# WriteUps 索引

> 本目录汇总各题解题记录。每道题一个子目录，内含 `writeup.md`、解题代码（`exp.py`/`solve.py` 等）以及派生物子目录 `artifacts/`（dump、解密、解包结果）。原始附件保持只读，不搬入本目录。
> 新增或归档一题后在下表补一行。`状态` 用 ✅ 已解 / 🚧 阶段 / ❌ 未解；未解出时 `Flag` 写“未获得”。题目列链接到各自 `writeup.md`。

| 题目 | 类型 | 比赛/来源 | 状态 | Flag | 突破口 |
|---|---|---|---|---|---|

格式示例（填表时照此写，题目列用 Markdown 链接指向该题 `writeup.md`）：

```markdown
| [babyrop](babyrop/writeup.md) | Pwn | 2026 XXCTF | ✅ | `flag{...}` | 格式化字符串泄漏 libc 后 ret2libc |
| [ez-crypto](ez-crypto/writeup.md) | Crypto | 2026 XXCTF | 🚧 | 未获得 | LWE 参数偏小，格规约进行中 |
```

目录结构：

```text
writeups/
├── README.md            # 本索引
├── babyrop/
│   ├── writeup.md
│   ├── exp.py
│   └── artifacts/       # 派生物：dump、解密结果等
└── ez-crypto/
    ├── writeup.md
    └── solve.py
```
