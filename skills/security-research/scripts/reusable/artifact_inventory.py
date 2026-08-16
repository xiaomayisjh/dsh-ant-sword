#!/usr/bin/env python3
"""Create a read-only manifest for an explicit challenge artifact root.

Purpose: Preserve file provenance before deeper analysis.
Inputs: One file or directory path plus optional limits/exclusions.
Outputs: JSON or Markdown containing paths, sizes, hashes, magic types, and errors.
Dependencies: Python 3.9+ standard library.
Safe defaults: Do not follow symlinks; hash files up to 256 MiB; execute nothing.
Known limits: Magic detection is intentionally small and does not replace a full parser.
Example: python scripts/reusable/artifact_inventory.py ./challenge -o analysis/inventory.json
"""

from __future__ import annotations

import argparse
import datetime as dt
import fnmatch
import hashlib
import json
import os
import stat
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Iterator


DEFAULT_HASH_MAX = 256 * 1024 * 1024


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path, help="File or directory to inventory.")
    parser.add_argument("-o", "--output", type=Path, help="Explicit report output path.")
    parser.add_argument("--format", choices=("json", "markdown"), default="json")
    parser.add_argument("--max-files", type=int, default=10_000)
    parser.add_argument("--hash-max-bytes", type=int, default=DEFAULT_HASH_MAX)
    parser.add_argument("--exclude", action="append", default=[], help="Relative glob to exclude; repeatable.")
    parser.add_argument("--follow-symlinks", action="store_true", help="Follow symlinks explicitly.")
    return parser.parse_args()


def iso_time(timestamp: float) -> str:
    return dt.datetime.fromtimestamp(timestamp, tz=dt.timezone.utc).isoformat()


def detect_magic(header: bytes, suffix: str) -> str:
    checks = (
        (b"\x7fELF", "elf"),
        (b"MZ", "pe/dos"),
        (b"\x00asm", "wasm"),
        (b"dex\n", "android-dex"),
        (b"PK\x03\x04", "zip"),
        (b"7z\xbc\xaf\x27\x1c", "7z"),
        (b"Rar!\x1a\x07", "rar"),
        (b"\x1f\x8b\x08", "gzip"),
        (b"BZh", "bzip2"),
        (b"\xfd7zXZ\x00", "xz"),
        (b"%PDF-", "pdf"),
        (b"\x89PNG\r\n\x1a\n", "png"),
        (b"\xff\xd8\xff", "jpeg"),
        (b"GIF87a", "gif"),
        (b"GIF89a", "gif"),
        (b"SQLite format 3\x00", "sqlite"),
        (b"\xd4\xc3\xb2\xa1", "pcap-le"),
        (b"\xa1\xb2\xc3\xd4", "pcap-be"),
        (b"\x0a\x0d\x0d\x0a", "pcapng"),
        (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1", "ole-cfb"),
        (b"\xca\xfe\xba\xbe", "java-class-or-fat-mach-o"),
        (b"\xfe\xed\xfa\xce", "mach-o-32-be"),
        (b"\xce\xfa\xed\xfe", "mach-o-32-le"),
        (b"\xfe\xed\xfa\xcf", "mach-o-64-be"),
        (b"\xcf\xfa\xed\xfe", "mach-o-64-le"),
    )
    for signature, label in checks:
        if header.startswith(signature):
            if label == "zip":
                return {
                    ".apk": "android-apk",
                    ".jar": "java-jar",
                    ".docx": "ooxml-docx",
                    ".xlsx": "ooxml-xlsx",
                    ".pptx": "ooxml-pptx",
                }.get(suffix.lower(), label)
            return label
    if header.startswith(b"#!"):
        return "script"
    if header and b"\x00" not in header[:1024]:
        return "text"
    return "unknown"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def excluded(relative: str, patterns: list[str]) -> bool:
    normalized = relative.replace("\\", "/")
    return any(fnmatch.fnmatch(normalized, pattern) for pattern in patterns)


def iter_paths(root: Path, follow_symlinks: bool) -> Iterator[Path]:
    if root.is_file() or root.is_symlink():
        yield root
        return
    for current, dirnames, filenames in os.walk(root, followlinks=follow_symlinks):
        current_path = Path(current)
        if not follow_symlinks:
            symlink_dirs = [name for name in dirnames if (current_path / name).is_symlink()]
            for name in sorted(symlink_dirs):
                yield current_path / name
            dirnames[:] = [name for name in dirnames if name not in symlink_dirs]
        dirnames.sort()
        for name in sorted(filenames):
            yield current_path / name


def inspect_path(path: Path, root: Path, hash_max: int, follow_symlinks: bool) -> dict[str, Any]:
    relative = path.name if root.is_file() or root.is_symlink() else path.relative_to(root).as_posix()
    entry: dict[str, Any] = {"path": relative}
    try:
        info = path.stat() if follow_symlinks else path.lstat()
    except OSError as exc:
        return {**entry, "error": str(exc)}

    entry.update(
        {
            "size": info.st_size,
            "mtime_utc": iso_time(info.st_mtime),
            "mode": oct(stat.S_IMODE(info.st_mode)),
        }
    )
    if stat.S_ISLNK(info.st_mode):
        entry.update({"kind": "symlink", "target": os.readlink(path), "sha256": None})
        return entry
    if not stat.S_ISREG(info.st_mode):
        entry.update({"kind": "other", "sha256": None})
        return entry

    try:
        with path.open("rb") as handle:
            header = handle.read(4096)
    except OSError as exc:
        return {**entry, "kind": "file", "error": str(exc), "sha256": None}

    entry.update(
        {
            "kind": "file",
            "extension": path.suffix.lower(),
            "magic": detect_magic(header, path.suffix),
        }
    )
    if info.st_size <= hash_max:
        try:
            entry.update({"sha256": sha256_file(path), "hash_status": "complete"})
        except OSError as exc:
            entry.update({"sha256": None, "hash_status": "error", "error": str(exc)})
    else:
        entry.update({"sha256": None, "hash_status": "skipped_size_limit"})
    return entry


def build_manifest(args: argparse.Namespace) -> dict[str, Any]:
    root = args.root.expanduser().resolve()
    if not root.exists() and not root.is_symlink():
        raise FileNotFoundError(f"Root does not exist: {root}")
    if args.max_files <= 0 or args.hash_max_bytes < 0:
        raise ValueError("--max-files must be positive and --hash-max-bytes cannot be negative")

    entries: list[dict[str, Any]] = []
    truncated = False
    for path in iter_paths(root, args.follow_symlinks):
        relative = path.name if root.is_file() or root.is_symlink() else path.relative_to(root).as_posix()
        if excluded(relative, args.exclude):
            continue
        if len(entries) >= args.max_files:
            truncated = True
            break
        entries.append(inspect_path(path, root, args.hash_max_bytes, args.follow_symlinks))

    magic_counts = Counter(item.get("magic", item.get("kind", "error")) for item in entries)
    extension_counts = Counter(item.get("extension", "") for item in entries if item.get("kind") == "file")
    return {
        "schema_version": 1,
        "generated_utc": dt.datetime.now(tz=dt.timezone.utc).isoformat(),
        "root": str(root),
        "options": {
            "follow_symlinks": args.follow_symlinks,
            "max_files": args.max_files,
            "hash_max_bytes": args.hash_max_bytes,
            "exclude": args.exclude,
        },
        "summary": {
            "entries": len(entries),
            "regular_files": sum(item.get("kind") == "file" for item in entries),
            "total_regular_bytes": sum(item.get("size", 0) for item in entries if item.get("kind") == "file"),
            "errors": sum("error" in item for item in entries),
            "truncated": truncated,
            "magic_counts": dict(sorted(magic_counts.items())),
            "extension_counts": dict(sorted(extension_counts.items())),
        },
        "entries": entries,
    }


def markdown(manifest: dict[str, Any]) -> str:
    summary = manifest["summary"]
    lines = [
        "# Artifact Inventory",
        "",
        f"Root: `{manifest['root']}`",
        f"Generated: `{manifest['generated_utc']}`",
        f"Entries: {summary['entries']}; regular files: {summary['regular_files']}; errors: {summary['errors']}",
        "",
        "| Path | Size | Magic | SHA-256 | Status |",
        "|---|---:|---|---|---|",
    ]
    for item in manifest["entries"]:
        path = str(item["path"]).replace("|", "\\|")
        digest = item.get("sha256") or ""
        status = item.get("error") or item.get("hash_status") or item.get("kind") or ""
        lines.append(f"| `{path}` | {item.get('size', '')} | {item.get('magic', item.get('kind', ''))} | `{digest}` | {status} |")
    return "\n".join(lines) + "\n"


def write_report(content: str, output: Path | None) -> None:
    if output is None:
        sys.stdout.write(content)
        return
    resolved = output.expanduser().resolve()
    resolved.parent.mkdir(parents=True, exist_ok=True)
    temporary = resolved.with_name(f".{resolved.name}.tmp")
    temporary.write_text(content, encoding="utf-8")
    temporary.replace(resolved)


def main() -> int:
    args = parse_args()
    try:
        manifest = build_manifest(args)
    except (OSError, ValueError) as exc:
        print(f"artifact_inventory: {exc}", file=sys.stderr)
        return 2
    content = markdown(manifest) if args.format == "markdown" else json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
    write_report(content, args.output)
    return 1 if manifest["summary"]["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
