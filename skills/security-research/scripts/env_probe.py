#!/usr/bin/env python3
"""Inspect the local security-tool environment without network activity.

Purpose: Report available executables and Python packages for task planning.
Inputs: Optional category filters and an explicit output path.
Outputs: Human-readable text or structured JSON.
Dependencies: Python 3.9+ standard library.
Safe defaults: Locate tools only; do not execute them or probe the network.
Known limits: A discovered executable may still be misconfigured or unusable.
Example: python scripts/env_probe.py --category reverse --json
"""

from __future__ import annotations

import argparse
import importlib.metadata
import json
import os
import platform
import shutil
import subprocess
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable


@dataclass(frozen=True)
class ToolSpec:
    name: str
    command: str
    version_args: tuple[str, ...]
    category: str


TOOL_SPECS = (
    ToolSpec("IDA", "idat64", ("-v",), "reverse"),
    ToolSpec("Ghidra", "analyzeHeadless", ("-version",), "reverse"),
    ToolSpec("radare2", "r2", ("-v",), "reverse"),
    ToolSpec("Rizin", "rizin", ("-v",), "reverse"),
    ToolSpec("objdump", "objdump", ("--version",), "reverse"),
    ToolSpec("readelf", "readelf", ("--version",), "reverse"),
    ToolSpec("Detect It Easy", "diec", ("--version",), "reverse"),
    ToolSpec("FLOSS", "floss", ("--version",), "reverse"),
    ToolSpec("Frida", "frida", ("--version",), "reverse"),
    ToolSpec("GDB", "gdb", ("--version",), "pwn"),
    ToolSpec("LLDB", "lldb", ("--version",), "pwn"),
    ToolSpec("checksec", "checksec", ("--version",), "pwn"),
    ToolSpec("ROPgadget", "ROPgadget", ("--version",), "pwn"),
    ToolSpec("strace", "strace", ("--version",), "pwn"),
    ToolSpec("nmap", "nmap", ("--version",), "web"),
    ToolSpec("ffuf", "ffuf", ("-V",), "web"),
    ToolSpec("nuclei", "nuclei", ("-version",), "web"),
    ToolSpec("sqlmap", "sqlmap", ("--version",), "web"),
    ToolSpec("curl", "curl", ("--version",), "web"),
    ToolSpec("tshark", "tshark", ("--version",), "forensics"),
    ToolSpec("Volatility 3", "vol", ("--help",), "forensics"),
    ToolSpec("ExifTool", "exiftool", ("-ver",), "forensics"),
    ToolSpec("binwalk", "binwalk", ("--version",), "forensics"),
    ToolSpec("ffmpeg", "ffmpeg", ("-version",), "forensics"),
    ToolSpec("YARA", "yara", ("--version",), "malware"),
    ToolSpec("Hashcat", "hashcat", ("--version",), "crypto"),
    ToolSpec("John", "john", ("--list=build-info",), "crypto"),
    ToolSpec("SageMath", "sage", ("--version",), "crypto"),
)


PACKAGE_SPECS = {
    "reverse": ("capstone", "keystone-engine", "unicorn", "frida", "pefile", "pyelftools", "angr"),
    "pwn": ("pwntools", "ropper", "z3-solver"),
    "web": ("requests", "httpx", "flask-unsign"),
    "forensics": ("volatility3", "Pillow", "scapy", "yara-python"),
    "malware": ("yara-python", "pefile", "oletools", "dissect.cobaltstrike"),
    "crypto": ("pycryptodome", "sympy", "gmpy2", "fpylll", "py-ecc"),
    "ai-ml": ("torch", "transformers", "safetensors", "scikit-learn"),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--category",
        action="append",
        choices=("all", *sorted(PACKAGE_SPECS)),
        help="Limit results to a category; repeat for more than one.",
    )
    parser.add_argument(
        "--versions",
        action="store_true",
        help="Execute discovered tools with their version flag. No network probes are performed.",
    )
    parser.add_argument("--timeout", type=float, default=3.0, help="Per-tool version timeout in seconds.")
    parser.add_argument("--json", action="store_true", help="Emit JSON instead of text.")
    parser.add_argument("--output", type=Path, help="Write the report to this explicit path.")
    return parser.parse_args()


def selected_categories(values: list[str] | None) -> set[str]:
    if not values or "all" in values:
        return set(PACKAGE_SPECS)
    return set(values)


def safe_version(path: str, args: tuple[str, ...], timeout: float) -> dict[str, object]:
    try:
        completed = subprocess.run(
            [path, *args],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            check=False,
            env={**os.environ, "NO_COLOR": "1"},
        )
    except subprocess.TimeoutExpired:
        return {"status": "timeout", "version": None, "exit_code": None}
    except OSError as exc:
        return {"status": "error", "version": None, "exit_code": None, "error": str(exc)}

    output = " ".join(completed.stdout.split())[:240]
    return {
        "status": "ok" if completed.returncode == 0 else "nonzero",
        "version": output or None,
        "exit_code": completed.returncode,
    }


def inspect_tools(categories: set[str], run_versions: bool, timeout: float) -> list[dict[str, object]]:
    results: list[dict[str, object]] = []
    for spec in TOOL_SPECS:
        if spec.category not in categories:
            continue
        path = shutil.which(spec.command)
        result: dict[str, object] = {
            **asdict(spec),
            "version_args": list(spec.version_args),
            "found": path is not None,
            "path": path,
        }
        if path and run_versions:
            result.update(safe_version(path, spec.version_args, timeout))
        results.append(result)
    return results


def inspect_packages(categories: set[str]) -> list[dict[str, object]]:
    names = sorted({name for category in categories for name in PACKAGE_SPECS.get(category, ())})
    results: list[dict[str, object]] = []
    for name in names:
        try:
            version = importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError:
            version = None
        results.append({"name": name, "found": version is not None, "version": version})
    return results


def build_report(categories: set[str], run_versions: bool, timeout: float) -> dict[str, object]:
    return {
        "schema_version": 1,
        "safe_defaults": {
            "network_probes": False,
            "executed_discovered_tools": run_versions,
            "loaded_native_libraries": False,
        },
        "environment": {
            "os": platform.platform(),
            "architecture": platform.machine(),
            "python": sys.version.splitlines()[0],
            "python_executable": sys.executable,
            "cwd": str(Path.cwd()),
        },
        "categories": sorted(categories),
        "tools": inspect_tools(categories, run_versions, timeout),
        "python_packages": inspect_packages(categories),
    }


def render_text(report: dict[str, object]) -> str:
    lines = [
        "Security Research Environment",
        f"OS: {report['environment']['os']}",  # type: ignore[index]
        f"Architecture: {report['environment']['architecture']}",  # type: ignore[index]
        f"Python: {report['environment']['python']}",  # type: ignore[index]
        f"CWD: {report['environment']['cwd']}",  # type: ignore[index]
        "",
        "Tools:",
    ]
    for item in report["tools"]:  # type: ignore[assignment]
        marker = "FOUND" if item["found"] else "MISS"
        detail = item.get("version") or item.get("path") or ""
        lines.append(f"  [{marker}] {item['category']:<10} {item['name']:<20} {detail}")
    lines.extend(("", "Python packages:"))
    for item in report["python_packages"]:  # type: ignore[assignment]
        marker = "FOUND" if item["found"] else "MISS"
        lines.append(f"  [{marker}] {item['name']:<24} {item.get('version') or ''}")
    return "\n".join(lines) + "\n"


def write_output(content: str, output: Path | None) -> None:
    if output is None:
        sys.stdout.write(content)
        return
    output = output.expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(f".{output.name}.tmp")
    temporary.write_text(content, encoding="utf-8")
    temporary.replace(output)


def main() -> int:
    args = parse_args()
    if args.timeout <= 0:
        raise SystemExit("--timeout must be greater than zero")
    categories = selected_categories(args.category)
    report = build_report(categories, args.versions, args.timeout)
    content = json.dumps(report, ensure_ascii=False, indent=2) + "\n" if args.json else render_text(report)
    write_output(content, args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
