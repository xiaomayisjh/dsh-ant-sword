#!/usr/bin/env python3
"""Perform bounded, read-only PE triage for unpacking decisions.

Purpose: Report hashes, entropy, sections, imports, entrypoint, overlay, signatures, and structural signals.
Inputs: One PE file.
Outputs: Human-readable summary and optional JSON.
Dependencies: Python 3.9+; optional pefile for PE structure parsing.
Safe defaults: Stream the file once, reject files over 1 GiB, and cap import names.
Known limits: Signals indicate triage priorities and are not proof that a file is packed or malicious.
Example: python scripts/reusable/pe_entropy_triage.py sample.exe --json analysis/pe.json
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import math
import sys
from pathlib import Path
from typing import Any


DEFAULT_MAX_BYTES = 1024 * 1024 * 1024
IMAGE_SCN_MEM_EXECUTE = 0x20000000
IMAGE_SCN_MEM_READ = 0x40000000
IMAGE_SCN_MEM_WRITE = 0x80000000


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("sample", type=Path)
    parser.add_argument("--json", dest="json_out", type=Path)
    parser.add_argument("--max-bytes", type=int, default=DEFAULT_MAX_BYTES)
    parser.add_argument("--allow-large", action="store_true")
    parser.add_argument("--max-import-names", type=int, default=50)
    return parser.parse_args()


def entropy_from_counts(counts: list[int], total: int) -> float:
    if not total:
        return 0.0
    return -sum((count / total) * math.log2(count / total) for count in counts if count)


def entropy(data: bytes) -> float:
    counts = [0] * 256
    for byte in data:
        counts[byte] += 1
    return entropy_from_counts(counts, len(data))


def stream_identity(path: Path) -> dict[str, Any]:
    digest = hashlib.sha256()
    counts = [0] * 256
    total = 0
    header = b""
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            if not header:
                header = chunk[:64]
            digest.update(chunk)
            total += len(chunk)
            for byte in chunk:
                counts[byte] += 1
    return {
        "path": str(path),
        "size": total,
        "sha256": digest.hexdigest(),
        "overall_entropy": round(entropy_from_counts(counts, total), 4),
        "mz_header": header.startswith(b"MZ"),
    }


def section_permissions(characteristics: int) -> str:
    return "".join(
        flag
        for flag, bit in (("R", IMAGE_SCN_MEM_READ), ("W", IMAGE_SCN_MEM_WRITE), ("X", IMAGE_SCN_MEM_EXECUTE))
        if characteristics & bit
    ) or "-"


def timestamp_iso(value: int) -> str | None:
    try:
        return dt.datetime.fromtimestamp(value, tz=dt.timezone.utc).isoformat()
    except (OverflowError, OSError, ValueError):
        return None


def rva_section_name(pe: Any, rva: int) -> str | None:
    section = pe.get_section_by_rva(rva)
    if section is None:
        return None
    return section.Name.rstrip(b"\x00").decode(errors="replace")


def pe_summary(path: Path, identity: dict[str, Any], max_import_names: int) -> dict[str, Any]:
    import pefile  # type: ignore

    pe = pefile.PE(str(path), fast_load=True)
    try:
        directories = [
            pefile.DIRECTORY_ENTRY["IMAGE_DIRECTORY_ENTRY_IMPORT"],
            pefile.DIRECTORY_ENTRY["IMAGE_DIRECTORY_ENTRY_RESOURCE"],
            pefile.DIRECTORY_ENTRY["IMAGE_DIRECTORY_ENTRY_EXCEPTION"],
            pefile.DIRECTORY_ENTRY["IMAGE_DIRECTORY_ENTRY_SECURITY"],
            pefile.DIRECTORY_ENTRY["IMAGE_DIRECTORY_ENTRY_BASERELOC"],
            pefile.DIRECTORY_ENTRY["IMAGE_DIRECTORY_ENTRY_DEBUG"],
            pefile.DIRECTORY_ENTRY["IMAGE_DIRECTORY_ENTRY_TLS"],
        ]
        pe.parse_data_directories(directories=directories)
        result = {**identity, "format_valid": True, "pefile_available": True}
        result.update(
            {
                "machine": hex(pe.FILE_HEADER.Machine),
                "characteristics": hex(pe.FILE_HEADER.Characteristics),
                "timestamp": pe.FILE_HEADER.TimeDateStamp,
                "timestamp_utc": timestamp_iso(pe.FILE_HEADER.TimeDateStamp),
                "image_base": hex(pe.OPTIONAL_HEADER.ImageBase),
                "entry_point_rva": hex(pe.OPTIONAL_HEADER.AddressOfEntryPoint),
                "entry_point_section": rva_section_name(pe, pe.OPTIONAL_HEADER.AddressOfEntryPoint),
                "subsystem": pe.OPTIONAL_HEADER.Subsystem,
                "checksum": hex(pe.OPTIONAL_HEADER.CheckSum),
            }
        )

        sections: list[dict[str, Any]] = []
        for section in pe.sections:
            raw = section.get_data()
            characteristics = int(section.Characteristics)
            sections.append(
                {
                    "name": section.Name.rstrip(b"\x00").decode(errors="replace"),
                    "virtual_address": hex(section.VirtualAddress),
                    "virtual_size": int(section.Misc_VirtualSize),
                    "raw_offset": int(section.PointerToRawData),
                    "raw_size": int(section.SizeOfRawData),
                    "entropy": round(entropy(raw), 4),
                    "sha256": hashlib.sha256(raw).hexdigest(),
                    "characteristics": hex(characteristics),
                    "permissions": section_permissions(characteristics),
                }
            )
        result["sections"] = sections

        imports: list[dict[str, Any]] = []
        total_imports = 0
        if hasattr(pe, "DIRECTORY_ENTRY_IMPORT"):
            for entry in pe.DIRECTORY_ENTRY_IMPORT:
                names: list[str] = []
                total_imports += len(entry.imports)
                for item in entry.imports[:max_import_names]:
                    names.append(item.name.decode(errors="replace") if item.name else f"ord_{item.ordinal}")
                imports.append(
                    {
                        "dll": entry.dll.decode(errors="replace"),
                        "count": len(entry.imports),
                        "names": names,
                        "names_truncated": len(entry.imports) > max_import_names,
                    }
                )
        result["imports"] = imports
        result["import_count"] = total_imports

        overlay_offset = pe.get_overlay_data_start_offset()
        overlay_size = identity["size"] - overlay_offset if overlay_offset is not None else 0
        security_directory = pe.OPTIONAL_HEADER.DATA_DIRECTORY[
            pefile.DIRECTORY_ENTRY["IMAGE_DIRECTORY_ENTRY_SECURITY"]
        ]
        result["overlay"] = {"offset": overlay_offset, "size": overlay_size}
        result["signed_data_present"] = bool(security_directory.VirtualAddress and security_directory.Size)
        result["directories"] = {
            "tls": hasattr(pe, "DIRECTORY_ENTRY_TLS"),
            "resources": hasattr(pe, "DIRECTORY_ENTRY_RESOURCE"),
            "debug": hasattr(pe, "DIRECTORY_ENTRY_DEBUG"),
            "relocations": hasattr(pe, "DIRECTORY_ENTRY_BASERELOC"),
        }

        high_entropy = [section["name"] for section in sections if section["entropy"] >= 7.2]
        rwx = [section["name"] for section in sections if "RWX" == section["permissions"]]
        executable_writable = [
            section["name"] for section in sections if "W" in section["permissions"] and "X" in section["permissions"]
        ]
        ep_section = result["entry_point_section"]
        ep_details = next((section for section in sections if section["name"] == ep_section), None)
        result["signals"] = {
            "high_entropy_sections": high_entropy,
            "rwx_sections": rwx,
            "writable_executable_sections": executable_writable,
            "sparse_imports": total_imports <= 10,
            "tls_directory": result["directories"]["tls"],
            "entry_point_outside_sections": ep_section is None,
            "entry_point_in_writable_section": bool(ep_details and "W" in ep_details["permissions"]),
            "overlay_present": overlay_size > 0,
            "overlay_ratio": round(overlay_size / identity["size"], 4) if identity["size"] else 0.0,
            "unsigned": not result["signed_data_present"],
        }
        result["signal_note"] = "Signals prioritize manual review; they do not prove packing or maliciousness."
        return result
    finally:
        pe.close()


def raw_or_invalid(path: Path, identity: dict[str, Any], note: str, format_valid: bool) -> dict[str, Any]:
    return {
        **identity,
        "format_valid": format_valid,
        "pefile_available": False,
        "note": note,
        "sections": [],
        "imports": [],
        "signals": {},
    }


def render(summary: dict[str, Any]) -> str:
    lines = [
        f"Path: {summary['path']}",
        f"Size: {summary['size']}",
        f"SHA256: {summary['sha256']}",
        f"Overall entropy: {summary['overall_entropy']}",
        f"PE valid: {summary['format_valid']}",
    ]
    if summary.get("note"):
        lines.append(f"Note: {summary['note']}")
    if not summary.get("pefile_available"):
        return "\n".join(lines) + "\n"
    lines.extend(
        (
            f"Machine: {summary['machine']}",
            f"ImageBase: {summary['image_base']}",
            f"EntryPoint: {summary['entry_point_rva']} ({summary['entry_point_section']})",
            f"Overlay: {summary['overlay']['size']} bytes",
            f"Signed data present: {summary['signed_data_present']}",
            "Sections:",
        )
    )
    for section in summary["sections"]:
        lines.append(
            f"  {section['name']}: {section['permissions']} raw={section['raw_size']} "
            f"virt={section['virtual_size']} entropy={section['entropy']}"
        )
    lines.append("Imports:")
    for item in summary["imports"]:
        lines.append(f"  {item['dll']}: {item['count']}")
    lines.append("Signals:")
    for name, value in summary["signals"].items():
        lines.append(f"  {name}: {value}")
    return "\n".join(lines) + "\n"


def atomic_write(path: Path, content: str) -> None:
    resolved = path.expanduser().resolve()
    resolved.parent.mkdir(parents=True, exist_ok=True)
    temporary = resolved.with_name(f".{resolved.name}.tmp")
    temporary.write_text(content, encoding="utf-8")
    temporary.replace(resolved)


def main() -> int:
    args = parse_args()
    sample = args.sample.expanduser().resolve()
    if args.max_bytes <= 0 or args.max_import_names <= 0:
        print("pe_entropy_triage: limits must be positive", file=sys.stderr)
        return 2
    try:
        size = sample.stat().st_size
        if size > args.max_bytes and not args.allow_large:
            raise ValueError(f"sample is {size} bytes; exceeds --max-bytes {args.max_bytes}")
        identity = stream_identity(sample)
        if not identity["mz_header"]:
            summary = raw_or_invalid(sample, identity, "not a PE file: missing MZ header", False)
        else:
            try:
                summary = pe_summary(sample, identity, args.max_import_names)
            except ImportError:
                summary = raw_or_invalid(sample, identity, "pefile is not installed; only raw identity is available", True)
            except Exception as exc:
                if exc.__class__.__name__ != "PEFormatError":
                    raise
                summary = raw_or_invalid(sample, identity, f"invalid PE structure: {exc}", False)
    except (OSError, ValueError) as exc:
        print(f"pe_entropy_triage: {exc}", file=sys.stderr)
        return 2

    sys.stdout.write(render(summary))
    if args.json_out:
        atomic_write(args.json_out, json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
    return 0 if summary["format_valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
