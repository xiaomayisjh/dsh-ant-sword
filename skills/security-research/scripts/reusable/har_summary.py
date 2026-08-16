#!/usr/bin/env python3
"""Summarize a HAR into redacted request-chain evidence.

Purpose: Extract request order, route shape, parameter keys, content types, and cookie-name changes.
Inputs: One HAR JSON file.
Outputs: Redacted Markdown to stdout and optional structured JSON.
Dependencies: Python 3.9+ standard library.
Safe defaults: Never emit query/body/cookie/token values, URL userinfo, or response bodies.
Known limits: Nested body keys are summarized only to a configurable depth.
Example: python scripts/reusable/har_summary.py capture.har --json analysis/har-summary.json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


DEFAULT_MAX_BYTES = 200 * 1024 * 1024
SENSITIVE_KEY = re.compile(
    r"(?:auth|bearer|cookie|csrf|xsrf|token|secret|pass(?:word|wd)?|session|jwt|api[-_]?key|credential|signature|sign)",
    re.IGNORECASE,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("har", type=Path)
    parser.add_argument("--json", dest="json_out", type=Path, help="Write redacted structured JSON.")
    parser.add_argument("--max-bytes", type=int, default=DEFAULT_MAX_BYTES)
    parser.add_argument("--max-entries", type=int, default=100_000)
    parser.add_argument("--body-key-depth", type=int, default=2)
    return parser.parse_args()


def header_multimap(items: Any) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {}
    if not isinstance(items, list):
        return result
    for item in items:
        if not isinstance(item, dict):
            continue
        name = item.get("name")
        value = item.get("value")
        if isinstance(name, str) and isinstance(value, str):
            result.setdefault(name.lower(), []).append(value)
    return result


def safe_host(parts: Any) -> str:
    hostname = parts.hostname or ""
    try:
        port = parts.port
    except ValueError:
        port = None
    return f"{hostname}:{port}" if port is not None else hostname


def redacted_url(url: str) -> dict[str, Any]:
    try:
        parts = urlsplit(url)
    except ValueError:
        return {"scheme": "", "host": "", "path": "<invalid-url>", "query_keys": [], "template": "<invalid-url>"}
    query_keys = sorted({key for key, _ in parse_qsl(parts.query, keep_blank_values=True)})
    query_template = urlencode([(key, "<redacted>") for key in query_keys])
    host = safe_host(parts)
    template = urlunsplit((parts.scheme, host, parts.path or "/", query_template, ""))
    return {
        "scheme": parts.scheme,
        "host": host,
        "path": parts.path or "/",
        "query_keys": query_keys,
        "template": template,
    }


def safe_header_value(name: str, values: list[str]) -> str:
    if SENSITIVE_KEY.search(name):
        return "<redacted>"
    value = values[-1] if values else ""
    if name in {"origin", "referer"}:
        return redacted_url(value)["template"]
    normalized = " ".join(value.split())
    return normalized[:160] + ("..." if len(normalized) > 160 else "")


def cookie_names_from_headers(headers: dict[str, list[str]], response: bool) -> list[str]:
    names: set[str] = set()
    key = "set-cookie" if response else "cookie"
    for value in headers.get(key, []):
        parts = [value] if response else value.split(";")
        for part in parts:
            candidate = part.split(";", 1)[0].strip() if response else part.strip()
            if "=" in candidate:
                name = candidate.split("=", 1)[0].strip()
                if name:
                    names.add(name)
            if response:
                break
    return sorted(names)


def nested_keys(value: Any, depth: int, prefix: str = "") -> set[str]:
    if depth < 0:
        return set()
    if isinstance(value, dict):
        result: set[str] = set()
        for key, child in value.items():
            label = f"{prefix}.{key}" if prefix else str(key)
            result.add(label)
            if depth:
                result.update(nested_keys(child, depth - 1, label))
        return result
    if isinstance(value, list) and value and depth:
        return nested_keys(value[0], depth - 1, f"{prefix}[]" if prefix else "[]")
    return set()


def body_keys(post_data: Any, depth: int) -> list[str]:
    if not isinstance(post_data, dict) or not post_data:
        return []
    params = post_data.get("params")
    if isinstance(params, list):
        names = {item.get("name") for item in params if isinstance(item, dict) and isinstance(item.get("name"), str)}
        if names:
            return sorted(names)
    mime = str(post_data.get("mimeType") or "").lower()
    text = post_data.get("text")
    if not isinstance(text, str) or not text:
        return []
    if "json" in mime:
        try:
            return sorted(nested_keys(json.loads(text), depth))
        except (json.JSONDecodeError, RecursionError):
            return ["<invalid-json-body>"]
    if "x-www-form-urlencoded" in mime:
        return sorted({key for key, _ in parse_qsl(text, keep_blank_values=True)})
    if "multipart/form-data" in mime:
        return ["<multipart-body>"]
    return [f"<raw-body:{len(text.encode('utf-8', errors='replace'))} bytes>"]


def summarize_entry(entry: Any, index: int, depth: int) -> dict[str, Any]:
    if not isinstance(entry, dict):
        return {"index": index, "error": "entry is not an object"}
    request = entry.get("request") if isinstance(entry.get("request"), dict) else {}
    response = entry.get("response") if isinstance(entry.get("response"), dict) else {}
    url_info = redacted_url(str(request.get("url") or ""))
    request_headers = header_multimap(request.get("headers"))
    response_headers = header_multimap(response.get("headers"))
    interesting: dict[str, str] = {}
    for name in ("origin", "referer", "content-type", "authorization", "cookie", "x-csrf-token", "x-xsrf-token"):
        if name in request_headers:
            interesting[name] = safe_header_value(name, request_headers[name])
    content = response.get("content") if isinstance(response.get("content"), dict) else {}
    return {
        "index": index,
        "started_utc": entry.get("startedDateTime") if isinstance(entry.get("startedDateTime"), str) else None,
        "method": str(request.get("method") or ""),
        **url_info,
        "status": response.get("status") if isinstance(response.get("status"), (int, str)) else None,
        "response_mime": str(content.get("mimeType") or ""),
        "response_size": content.get("size") if isinstance(content.get("size"), int) else None,
        "body_keys": body_keys(request.get("postData"), depth),
        "request_headers": interesting,
        "request_cookie_names": cookie_names_from_headers(request_headers, response=False),
        "set_cookie_names": cookie_names_from_headers(response_headers, response=True),
        "redirect": redacted_url(str(response.get("redirectURL") or ""))["template"] if response.get("redirectURL") else None,
        "time_ms": entry.get("time") if isinstance(entry.get("time"), (int, float)) else None,
    }


def load_har(path: Path, max_bytes: int, max_entries: int, depth: int) -> list[dict[str, Any]]:
    resolved = path.expanduser().resolve()
    size = resolved.stat().st_size
    if size > max_bytes:
        raise ValueError(f"HAR is {size} bytes; exceeds --max-bytes {max_bytes}")
    data = json.loads(resolved.read_text(encoding="utf-8-sig"))
    if not isinstance(data, dict):
        raise ValueError("HAR root must be an object")
    entries = data.get("log", {}).get("entries") if isinstance(data.get("log"), dict) else None
    if not isinstance(entries, list):
        raise ValueError("HAR does not contain a log.entries list")
    if len(entries) > max_entries:
        raise ValueError(f"HAR has {len(entries)} entries; exceeds --max-entries {max_entries}")
    return [summarize_entry(entry, index, depth) for index, entry in enumerate(entries, 1)]


def md_escape(value: Any, code: bool = False) -> str:
    text = " ".join(str(value if value is not None else "").split()).replace("|", "\\|")
    if code:
        escaped = text.replace("`", "\\`")
        return f"`{escaped}`"
    return text


def render_markdown(rows: list[dict[str, Any]]) -> str:
    lines = [
        "| # | Method | Host | Path | Status | Query Keys | Body Keys | Set-Cookie Names |",
        "|---:|---|---|---|---:|---|---|---|",
    ]
    for row in rows:
        if "error" in row:
            lines.append(f"| {row['index']} | | | | | | | {md_escape(row['error'])} |")
            continue
        lines.append(
            "| {index} | {method} | {host} | {path} | {status} | {query} | {body} | {cookies} |".format(
                index=row["index"],
                method=md_escape(row["method"]),
                host=md_escape(row["host"]),
                path=md_escape(row["path"], code=True),
                status=md_escape(row["status"]),
                query=md_escape(", ".join(row["query_keys"])),
                body=md_escape(", ".join(row["body_keys"])),
                cookies=md_escape(", ".join(row["set_cookie_names"])),
            )
        )
    return "\n".join(lines) + "\n"


def atomic_write(path: Path, content: str) -> None:
    resolved = path.expanduser().resolve()
    resolved.parent.mkdir(parents=True, exist_ok=True)
    temporary = resolved.with_name(f".{resolved.name}.tmp")
    temporary.write_text(content, encoding="utf-8")
    temporary.replace(resolved)


def main() -> int:
    args = parse_args()
    if args.max_bytes <= 0 or args.max_entries <= 0 or args.body_key_depth < 0:
        print("har_summary: limits must be positive and depth cannot be negative", file=sys.stderr)
        return 2
    try:
        rows = load_har(args.har, args.max_bytes, args.max_entries, args.body_key_depth)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"har_summary: {exc}", file=sys.stderr)
        return 2
    sys.stdout.write(render_markdown(rows))
    if args.json_out:
        atomic_write(args.json_out, json.dumps({"schema_version": 1, "entries": rows}, ensure_ascii=False, indent=2) + "\n")
    return 1 if any("error" in row for row in rows) else 0


if __name__ == "__main__":
    raise SystemExit(main())
