#!/usr/bin/env python3
"""Pack a cross-environment pwn handoff: zip the exploit skeleton plus dependency
files, emit a hashed manifest, and place the cloud prompt alongside the zip.

Purpose: Bundle what a cloud Linux agent needs to continue a locally-analyzed pwn task.
Inputs: --exp exp.py, --file each dependency (binary/libc/ld), --prompt filled prompt md,
        --out output directory (created if absent).
Outputs: <out>/handoff.zip (exp + deps + MANIFEST.txt) and <out>/PROMPT.md (copied).
Dependencies: Python 3.9+ standard library only.
Safe defaults: read-only on inputs; refuses to overwrite an existing zip unless --force.
Known limits: does not fetch libc/ld for you; you pass the exact files used in analysis.
Example: python scripts/reusable/pack_cloud_handoff.py --exp exp.py --file ./chall \
         --file ./libc.so.6 --file ./ld.so --prompt HANDOFF.md --out ./handoff
"""

from __future__ import annotations

import argparse
import hashlib
import shutil
import sys
import zipfile
from pathlib import Path


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--exp", type=Path, required=True, help="Exploit skeleton (exp.py).")
    p.add_argument("--file", type=Path, action="append", default=[],
                   help="Dependency file to include (binary/libc/ld); repeatable.")
    p.add_argument("--prompt", type=Path, required=True, help="Filled cloud handoff prompt (markdown).")
    p.add_argument("--out", type=Path, required=True, help="Output directory.")
    p.add_argument("--force", action="store_true", help="Overwrite an existing handoff.zip.")
    return p.parse_args()


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    args = parse_args()
    members: list[Path] = [args.exp, *args.file]
    missing = [str(p) for p in [*members, args.prompt] if not p.is_file()]
    if missing:
        print("error: input file(s) not found:\n  " + "\n  ".join(missing), file=sys.stderr)
        return 2

    args.out.mkdir(parents=True, exist_ok=True)
    zip_path = args.out / "handoff.zip"
    if zip_path.exists() and not args.force:
        print(f"error: {zip_path} exists; pass --force to overwrite.", file=sys.stderr)
        return 2

    # Build manifest first so it travels inside the zip.
    manifest_lines = ["# Handoff manifest", "# name  sha256  bytes", ""]
    seen: dict[str, Path] = {}
    for m in members:
        if m.name in seen:
            print(f"error: duplicate archive name '{m.name}' from {m} and {seen[m.name]}", file=sys.stderr)
            return 2
        seen[m.name] = m
        manifest_lines.append(f"{m.name}\t{sha256(m)}\t{m.stat().st_size}")
    manifest_text = "\n".join(manifest_lines) + "\n"

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for m in members:
            z.write(m, arcname=m.name)
        z.writestr("MANIFEST.txt", manifest_text)

    prompt_out = args.out / "PROMPT.md"
    shutil.copyfile(args.prompt, prompt_out)

    print(f"wrote {zip_path}  ({zip_path.stat().st_size} bytes)")
    print(f"wrote {prompt_out}")
    print(f"included {len(members)} file(s):")
    for line in manifest_lines[3:]:
        print("  " + line.replace("\t", "  "))
    print("\nUpload handoff.zip and give the cloud agent PROMPT.md.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
