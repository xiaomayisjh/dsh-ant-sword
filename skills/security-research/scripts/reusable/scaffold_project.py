#!/usr/bin/env python3
"""
scaffold_project.py — CTF / 安全研究项目脚手架生成器

用法:
    python scaffold_project.py <题目短名> [--contest <比赛名>] [--type <类型>] [--target <URL或文件>]

示例:
    python scaffold_project.py ctfmanage --contest DASCTF --type web --target "http://xxx.dasctf.com:80"
    python scaffold_project.py babyrop --contest NepCTF --type pwn --target ./babyrop

输出:
    在当前目录下创建 <题目短名>/ 项目结构，包含 README.md 和子目录。
    已存在的目录和文件不会被覆盖。

依赖: 无（纯标准库）
"""

import argparse
import os
import sys
from pathlib import Path
from datetime import datetime


DIRS = [
    "attachments",
    "evidence",
    "scripts",
    "artifacts",
    "writeups",
]

README_TEMPLATE = """# {name}

- **比赛/来源**: {contest}
- **类型**: {challenge_type}
- **目标**: {target}
- **成功条件**: 获取 flag
- **时限**: {deadline}
- **附件**: `attachments/` 目录
- **状态**: 进行中
- **创建时间**: {created}

## 已知信息

<!-- 题目描述、提示、已有线索 -->

## 分析日志

| 时间 | 操作 | 结果 | 标签 |
|------|------|------|------|
| {created} | 立项 | 项目结构已创建 | Observed |
"""


def main():
    parser = argparse.ArgumentParser(description="CTF/安全研究项目脚手架生成器")
    parser.add_argument("name", help="题目短名（小写连字符 slug，如 babyrop、ez-crypto）")
    parser.add_argument("--contest", default="未指定", help="比赛/平台名称")
    parser.add_argument("--type", dest="challenge_type", default="未分类",
                        choices=["web", "pwn", "reverse", "crypto", "forensics",
                                 "misc", "osint", "ai-ml", "malware", "未分类"],
                        help="题目类型")
    parser.add_argument("--target", default="待确认", help="目标 URL、文件名或服务地址")
    parser.add_argument("--deadline", default="未指定", help="时限/截止时间")
    parser.add_argument("--base-dir", default=".", help="项目创建的父目录（默认当前目录）")

    args = parser.parse_args()

    project_dir = Path(args.base_dir) / args.name

    # 创建目录结构
    created_dirs = []
    for d in DIRS:
        dir_path = project_dir / d
        if not dir_path.exists():
            dir_path.mkdir(parents=True, exist_ok=True)
            created_dirs.append(str(dir_path))

    # 写 README
    readme_path = project_dir / "README.md"
    if readme_path.exists():
        print(f"[skip] {readme_path} 已存在，不覆盖", file=sys.stderr)
    else:
        readme_content = README_TEMPLATE.format(
            name=args.name,
            contest=args.contest,
            challenge_type=args.challenge_type.upper(),
            target=args.target,
            deadline=args.deadline,
            created=datetime.now().strftime("%Y-%m-%d %H:%M"),
        )
        readme_path.write_text(readme_content, encoding="utf-8")
        created_dirs.append(str(readme_path))

    # 写 writeup 骨架
    writeup_path = project_dir / "writeups" / "writeup.md"
    if not writeup_path.exists():
        writeup_path.write_text(
            f"# {args.name} — WriteUp\n\n"
            f"**比赛**: {args.contest}\n"
            f"**类型**: {args.challenge_type.upper()}\n\n"
            "## 一句话打法\n\n<!-- TODO -->\n\n"
            "## 分析过程\n\n<!-- 引用 ../evidence/ 和 README.md 分析日志 -->\n\n"
            "## Exploit / Solver\n\n<!-- 引用 ../scripts/ -->\n\n"
            "## Flag\n\n`未获得`\n",
            encoding="utf-8",
        )
        created_dirs.append(str(writeup_path))

    # 输出结果
    if created_dirs:
        print(f"[ok] 项目已创建: {project_dir}")
        for p in created_dirs:
            print(f"  + {p}")
    else:
        print(f"[ok] 项目已存在: {project_dir}（无需创建）")

    return 0


if __name__ == "__main__":
    sys.exit(main())
