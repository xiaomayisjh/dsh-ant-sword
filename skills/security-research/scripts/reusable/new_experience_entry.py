#!/usr/bin/env python3
"""Create a structured, no-clobber security experience candidate.

Purpose: Scaffold reusable experience notes without overwriting prior entries.
Inputs: Title, category, tags, source task, and optional reusable script.
Outputs: One UTF-8 Markdown candidate under the current workspace by default.
Dependencies: Python 3.9+ standard library.
Safe defaults: Candidate status, atomic exclusive creation, and no credential collection.
Known limits: The generated content still requires technical validation and review.
Example: python scripts/reusable/new_experience_entry.py --title "HAR cookie scope mismatch" --category web-api
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
import unicodedata
from pathlib import Path


CATEGORIES = (
    "web-api",
    "pwn",
    "reverse",
    "crypto",
    "forensics",
    "malware",
    "misc",
    "osint",
    "ai-security",
    "identity-cloud",
    "mobile-firmware",
    "tooling",
    "other",
)
STATUSES = ("candidate", "stable", "deprecated")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--title", required=True)
    parser.add_argument("--category", choices=CATEGORIES, default="other")
    parser.add_argument("--tag", action="append", default=[])
    parser.add_argument("--source-task", default="")
    parser.add_argument("--reusable-script", default="")
    parser.add_argument("--status", choices=STATUSES, default="candidate")
    parser.add_argument(
        "--skill-root",
        type=Path,
        help="Explicit skill root for promotion; without it candidates stay in the current workspace.",
    )
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--date", help="ISO date override for deterministic fixtures.")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--overwrite", action="store_true", help="Explicitly replace an existing path.")
    return parser.parse_args()


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii").lower()
    slug = re.sub(r"[^a-z0-9]+", "-", normalized).strip("-")
    return slug[:80] or "experience"


def yaml_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def validate_date(value: str | None) -> str:
    if value is None:
        return dt.date.today().isoformat()
    try:
        return dt.date.fromisoformat(value).isoformat()
    except ValueError as exc:
        raise ValueError("--date must use YYYY-MM-DD") from exc


def render(args: argparse.Namespace, created: str) -> str:
    tags = ", ".join(yaml_string(str(tag)) for tag in args.tag)
    return f"""---
title: {yaml_string(args.title)}
category: {yaml_string(args.category)}
tags: [{tags}]
created: {created}
last_validated: null
source_task: {yaml_string(args.source_task)}
reusable_script: {yaml_string(args.reusable_script)}
status: {yaml_string(args.status)}
---

# {args.title}

## Applies When

- Signal:
- Required precondition:

## Does Not Apply When

- Counterexample:
- Invalidation signal:

## Workflow

1. Preserve the original input and record its hash.
2. 

## Validation

- Environment/tool version:
- Command:
- Expected decisive checkpoint:
- Sample or fixture SHA-256:
- Clean/reset baseline:
- Last validated:

## Pitfalls and Rollback

- Failure mode:
- Return to stage:

## Reusable Assets

- Script: {args.reusable_script}
- Inputs:
- Outputs:
- Dependencies:
- Safe defaults:
- Known limits:

## Promotion Notes

- Keep as `candidate` until a clean reproduction and either a second successful reuse or explicit user approval.
"""


def write_exclusive(path: Path, content: str, overwrite: bool) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if overwrite:
        temporary = path.with_name(f".{path.name}.tmp")
        temporary.write_text(content, encoding="utf-8")
        temporary.replace(path)
        return
    with path.open("x", encoding="utf-8", newline="\n") as handle:
        handle.write(content)


def main() -> int:
    args = parse_args()
    args.title = " ".join(args.title.split())
    if not args.title:
        print("new_experience_entry: --title cannot be empty", file=sys.stderr)
        return 2
    try:
        created = validate_date(args.date)
        if args.output_dir:
            output_dir = args.output_dir.expanduser().resolve()
        elif args.skill_root:
            output_dir = args.skill_root.expanduser().resolve() / "references" / "experience" / "log"
        else:
            output_dir = Path.cwd().resolve() / "analysis" / "experience-candidates"
        output = output_dir / f"{created}-{slugify(args.title)}.md"
        content = render(args, created)
        if args.dry_run:
            print(content, end="")
            print(f"# Would write: {output}", file=sys.stderr)
            return 0
        write_exclusive(output, content, args.overwrite)
    except (OSError, ValueError) as exc:
        print(f"new_experience_entry: {exc}", file=sys.stderr)
        return 2
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
