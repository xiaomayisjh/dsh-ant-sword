#!/usr/bin/env python3
"""
Purpose: Safely peel common static encoding/compression layers without executing recovered code.
Inputs: Text or binary file.
Outputs: Per-round decoded candidates and manifest JSON.
Dependencies: Python standard library only.
Safe defaults: Writes to an explicit output directory; stops after a bounded number of rounds.
Known limits: Does not handle encrypted layers without keys or custom algorithms.
Example:
  python layer_decoder.py sample.txt -o decoded --max-rounds 8
"""

from __future__ import annotations

import argparse
import base64
import binascii
import codecs
import gzip
import json
import re
import zlib
from pathlib import Path


PRINTABLE_RE = re.compile(rb"^[\x09\x0a\x0d\x20-\x7e]+$")


def score(data: bytes) -> float:
    if not data:
        return 0.0
    printable = sum(1 for b in data if b in (9, 10, 13) or 32 <= b <= 126)
    return printable / len(data)


def maybe_text(data: bytes) -> str:
    for enc in ("utf-8", "utf-16le", "latin1"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    return data.decode("latin1", errors="replace")


def transforms(data: bytes) -> list[tuple[str, bytes]]:
    out: list[tuple[str, bytes]] = []
    stripped = b"".join(data.split())
    if stripped and re.fullmatch(rb"[A-Za-z0-9+/=_-]+", stripped) and len(stripped) >= 8:
        for name, altchars in (("base64", None), ("base64url", b"-_")):
            try:
                padded = stripped + b"=" * ((4 - len(stripped) % 4) % 4)
                decoded = base64.b64decode(padded, altchars=altchars, validate=False)
                if decoded and decoded != data:
                    out.append((name, decoded))
            except (binascii.Error, ValueError):
                pass
    if stripped and re.fullmatch(rb"(?:0x)?[0-9a-fA-F\s]+", data) and len(stripped.replace(b"0x", b"")) % 2 == 0:
        try:
            hex_text = stripped.replace(b"0x", b"")
            decoded = binascii.unhexlify(hex_text)
            if decoded and decoded != data:
                out.append(("hex", decoded))
        except (binascii.Error, ValueError):
            pass
    for name, func in (
        ("zlib", zlib.decompress),
        ("raw-deflate", lambda x: zlib.decompress(x, -15)),
        ("gzip", gzip.decompress),
    ):
        try:
            decoded = func(data)
            if decoded and decoded != data:
                out.append((name, decoded))
        except Exception:
            pass
    try:
        text = data.decode("utf-8")
        rot = codecs.decode(text, "rot_13").encode()
        if rot != data and PRINTABLE_RE.match(rot[:200] or b""):
            out.append(("rot13", rot))
    except Exception:
        pass
    return out


def write_candidate(out_dir: Path, round_no: int, method: str, data: bytes) -> Path:
    safe_method = re.sub(r"[^A-Za-z0-9_.-]+", "_", method)
    suffix = ".txt" if score(data) >= 0.85 else ".bin"
    path = out_dir / f"round{round_no:02d}_{safe_method}{suffix}"
    path.write_bytes(data)
    return path


def decode_layers(input_path: Path, out_dir: Path, max_rounds: int) -> list[dict]:
    out_dir.mkdir(parents=True, exist_ok=True)
    seen = set()
    queue: list[tuple[int, str, bytes]] = [(0, "input", input_path.read_bytes())]
    manifest: list[dict] = []
    while queue:
        round_no, parent, data = queue.pop(0)
        digest = binascii.hexlify(zlib.crc32(data).to_bytes(4, "big")).decode()
        if digest in seen or round_no >= max_rounds:
            continue
        seen.add(digest)
        for method, decoded in transforms(data):
            decoded_digest = binascii.hexlify(zlib.crc32(decoded).to_bytes(4, "big")).decode()
            if decoded_digest in seen:
                continue
            path = write_candidate(out_dir, round_no + 1, method, decoded)
            item = {
                "round": round_no + 1,
                "method": method,
                "parent": parent,
                "path": str(path),
                "bytes": len(decoded),
                "printable_score": round(score(decoded), 4),
                "preview": maybe_text(decoded[:160]),
            }
            manifest.append(item)
            queue.append((round_no + 1, str(path), decoded))
    (out_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description="Peel common static encoding/compression layers.")
    parser.add_argument("input", type=Path)
    parser.add_argument("-o", "--out-dir", type=Path, default=Path("decoded_layers"))
    parser.add_argument("--max-rounds", type=int, default=6)
    args = parser.parse_args()

    manifest = decode_layers(args.input, args.out_dir, args.max_rounds)
    print(f"Wrote {len(manifest)} candidate layers to {args.out_dir}")
    for item in manifest:
        print(f"[round {item['round']}] {item['method']} -> {item['path']} score={item['printable_score']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
