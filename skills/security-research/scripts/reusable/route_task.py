#!/usr/bin/env python3
"""Score candidate security-task domains from explicit text and artifact names.

Purpose: Produce an evidence-backed initial route when a challenge category is unclear.
Inputs: Task text, an explicit artifact path, or an artifact_inventory JSON report.
Outputs: Ranked domain candidates with matched signals and recommended module paths.
Dependencies: Python 3.9+ standard library.
Safe defaults: Read names/metadata only; do not execute files or inspect file contents.
Known limits: Scores are routing hints, not proof of a vulnerability or final category.
Example: python scripts/reusable/route_task.py --text "HTTP JWT challenge with RSA" --json
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


@dataclass(frozen=True)
class Domain:
    key: str
    label: str
    module: str
    entry: str
    patterns: tuple[tuple[str, int], ...]
    extensions: tuple[tuple[str, int], ...]
    magic: tuple[tuple[str, int], ...] = ()


DOMAINS = (
    Domain(
        "web",
        "Web / API",
        "skills/sec-web-api/INSTRUCTIONS.md",
        "references/ctf/web/index.md",
        (
            (r"\b(?:https?|api|websocket|graphql|cookie|session)\b|接口|网页|网站", 2),
            (r"\b(?:xss|sqli|sql[ -]?injection|ssti|ssrf|xxe|csrf|idor)\b|注入|越权", 4),
            (r"\b(?:jwt|jwe|oauth|oidc|saml|cors|upload|webhook)\b|上传|鉴权|认证", 3),
            (r"prototype pollution|request smuggling|admin bot|原型链|请求走私", 4),
        ),
        ((".html", 2), (".php", 3), (".jsp", 3), (".asp", 3), (".aspx", 3), (".twig", 2), (".ejs", 2)),
        (("ooxml-docx", 1),),
    ),
    Domain(
        "pwn",
        "Pwn / Native",
        "skills/sec-pwn-native/INSTRUCTIONS.md",
        "references/ctf/pwn/index.md",
        (
            (r"\bpwn\b|二进制利用|内存破坏", 4),
            (r"buffer overflow|stack overflow|heap overflow|栈溢出|堆溢出", 5),
            (r"\b(?:rop|ret2libc|ret2win|srop|fsop|shellcode|seccomp|canary)\b", 4),
            (r"format string|use.after.free|double free|格式化字符串|释放后使用", 5),
            (r"\b(?:libc|pwntools|checksec|one_gadget)\b", 2),
        ),
        ((".so", 3),),
        (("elf", 4),),
    ),
    Domain(
        "reverse",
        "Reverse",
        "skills/sec-reverse/INSTRUCTIONS.md",
        "references/ctf/reverse/index.md",
        (
            (r"reverse engineering|\breverse\b|逆向|反编译", 4),
            (r"\b(?:ida|ghidra|frida|x64dbg|idapython|unicorn)\b", 4),
            (r"\b(?:apk|dex|wasm|mach-o|il2cpp|pyc|bytecode|firmware)\b|固件|字节码", 3),
            (r"packer|unpack|obfuscat|deobfuscat|anti-debug|脱壳|加壳|混淆|反调试", 4),
            (r"jsvmp|webpack|worker|sign(?:ature)? generation|签名算法|补环境", 4),
        ),
        ((".apk", 5), (".dex", 5), (".wasm", 5), (".pyc", 4), (".ipa", 5), (".class", 3), (".jar", 2)),
        (("pe/dos", 3), ("elf", 3), ("wasm", 5), ("android-dex", 5), ("mach-o-32-le", 4), ("mach-o-64-le", 4)),
    ),
    Domain(
        "crypto",
        "Crypto",
        "skills/sec-crypto/INSTRUCTIONS.md",
        "references/ctf/crypto/index.md",
        (
            (r"\b(?:rsa|aes|des|ecc|ecdsa|lwe|lfsr|rc4|zkp|prng)\b", 4),
            (r"\b(?:cipher|encrypt|decrypt|cryptograph|nonce|padding oracle)\b|密码学|加密|解密|预言机", 3),
            (r"\b(?:lattice|coppersmith|wiener|modulus|prime|finite field)\b|格攻击|模数|有限域", 4),
            (r"signature forgery|hash collision|key reuse|签名伪造|密钥复用|哈希碰撞", 5),
        ),
        ((".sage", 5),),
    ),
    Domain(
        "forensics",
        "Forensics / DFIR",
        "skills/sec-forensics-dfir/INSTRUCTIONS.md",
        "references/ctf/forensics/index.md",
        (
            (r"\b(?:forensics|dfir|pcap|pcapng|wireshark|volatility|evtx)\b|取证|流量分析", 4),
            (r"memory dump|disk image|registry hive|filesystem timeline|内存镜像|磁盘镜像|注册表|时间线", 4),
            (r"steganograph|\bstego\b|carv(?:e|ing)|metadata|隐写|文件恢复", 3),
            (r"usb hid|bluetooth|spectrogram|side.channel|频谱|旁信道", 3),
        ),
        (
            (".pcap", 6), (".pcapng", 6), (".evtx", 6), (".e01", 6), (".dd", 4),
            (".dmp", 4), (".mem", 4), (".raw", 2), (".ad1", 5), (".vmdk", 4),
            (".png", 1), (".jpg", 1), (".jpeg", 1), (".wav", 1),
        ),
        (("pcap-le", 6), ("pcap-be", 6), ("pcapng", 6), ("png", 1), ("jpeg", 1)),
    ),
    Domain(
        "malware",
        "Malware",
        "skills/sec-malware/INSTRUCTIONS.md",
        "references/ctf/malware/index.md",
        (
            (r"\bmalware\b|恶意(?:代码|软件|样本)|木马|病毒", 5),
            (r"\b(?:c2|beacon|rat|botnet|ransomware|rootkit)\b|勒索|僵尸网络", 4),
            (r"\b(?:yara|sigma|ioc|persistence|process injection)\b|持久化|进程注入", 3),
            (r"config extraction|c2 protocol|配置提取|通信协议", 3),
            (r"powershell.*obfuscat|vba.*macro|恶意宏", 4),
        ),
        ((".ps1", 2), (".vbs", 2), (".vba", 2), (".docm", 4), (".xlsm", 4)),
        (("pe/dos", 1), ("ole-cfb", 2)),
    ),
    Domain(
        "misc",
        "Misc",
        "skills/sec-misc/INSTRUCTIONS.md",
        "references/ctf/misc/index.md",
        (
            (r"\b(?:pyjail|bashjail|jail escape|restricted shell)\b|沙箱逃逸|受限字符", 5),
            (r"\b(?:esolang|brainfuck|encoding chain|unicode puzzle)\b|编码链|二维码|脑洞", 3),
            (r"\b(?:rf|sdr|iq samples?|qam|radio)\b|无线电|信号处理", 4),
            (r"custom game|custom vm|constraint solving|\bz3\b|博弈|约束求解", 3),
            (r"\bctfd\b", 2),
        ),
        ((".iq", 5),),
    ),
    Domain(
        "osint",
        "OSINT",
        "skills/sec-osint/INSTRUCTIONS.md",
        "references/ctf/osint/index.md",
        (
            (r"\bosint\b|公开情报", 5),
            (r"geolocat|reverse image|street view|what3words|地理定位|反向图片", 4),
            (r"social media|username enumeration|wayback|whois|社交媒体|用户名枚举|网页存档", 3),
            (r"public records?|find (?:this )?(?:person|place)|公开记录|查找地点", 3),
        ),
        (),
    ),
    Domain(
        "ai-ml",
        "AI / ML Security",
        "skills/sec-ai-security/INSTRUCTIONS.md",
        "references/ctf/ai-ml/index.md",
        (
            (r"prompt injection|indirect injection|提示注入", 5),
            (r"\b(?:llm|rag|agent|lora|transformer)\b|大模型|智能体|检索增强", 3),
            (r"adversarial (?:example|patch)|model extraction|membership inference|data poisoning|对抗样本|模型提取|成员推断|数据投毒", 5),
            (r"model weights?|safetensors|inference api|模型权重|推理接口", 3),
        ),
        ((".pt", 4), (".pth", 4), (".onnx", 4), (".safetensors", 5), (".gguf", 4)),
    ),
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--text", action="append", default=[], help="Task text; repeatable.")
    parser.add_argument("--text-file", type=Path, action="append", default=[], help="Explicit UTF-8 task text file.")
    parser.add_argument("--path", type=Path, action="append", default=[], help="Artifact path; names only are inspected.")
    parser.add_argument("--inventory", type=Path, action="append", default=[], help="artifact_inventory JSON report.")
    parser.add_argument("--max-paths", type=int, default=10_000)
    parser.add_argument("--json", action="store_true", help="Emit JSON to stdout.")
    parser.add_argument("--output", type=Path, help="Write output to this explicit path.")
    return parser.parse_args()


def path_names(root: Path, maximum: int) -> list[str]:
    root = root.expanduser().resolve()
    if not root.exists() and not root.is_symlink():
        raise FileNotFoundError(f"Artifact path does not exist: {root}")
    if root.is_file() or root.is_symlink():
        return [root.name]
    names: list[str] = []
    for current, dirnames, filenames in os.walk(root, followlinks=False):
        current_path = Path(current)
        dirnames[:] = sorted(name for name in dirnames if not (current_path / name).is_symlink())
        for name in sorted(filenames):
            names.append((current_path / name).relative_to(root).as_posix())
            if len(names) >= maximum:
                return names
    return names


def load_inventory(path: Path) -> tuple[list[str], list[str]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    entries = data.get("entries")
    if not isinstance(entries, list):
        raise ValueError(f"Inventory has no entries list: {path}")
    names: list[str] = []
    magic: list[str] = []
    for item in entries:
        if not isinstance(item, dict):
            continue
        if isinstance(item.get("path"), str):
            names.append(item["path"])
        if isinstance(item.get("magic"), str):
            magic.append(item["magic"])
    return names, magic


def add_signal(
    scores: dict[str, int],
    matches: dict[str, list[dict[str, Any]]],
    domain: Domain,
    signal: str,
    source: str,
    weight: int,
) -> None:
    key = (signal, source)
    if any((item["signal"], item["source"]) == key for item in matches[domain.key]):
        return
    scores[domain.key] += weight
    matches[domain.key].append({"signal": signal, "source": source, "weight": weight})


def score_inputs(texts: list[str], names: list[str], magic_values: list[str]) -> dict[str, Any]:
    scores: dict[str, int] = defaultdict(int)
    matches: dict[str, list[dict[str, Any]]] = defaultdict(list)
    combined_text = "\n".join(texts)
    combined_names = "\n".join(names)

    for domain in DOMAINS:
        for pattern, weight in domain.patterns:
            regex = re.compile(pattern, re.IGNORECASE)
            text_match = regex.search(combined_text)
            if text_match:
                add_signal(scores, matches, domain, text_match.group(0), "task_text", weight)
            name_match = regex.search(combined_names)
            if name_match:
                add_signal(scores, matches, domain, name_match.group(0), "artifact_name", max(1, weight - 1))

        extension_weights = dict(domain.extensions)
        for name in names:
            suffix = Path(name).suffix.lower()
            if suffix in extension_weights:
                add_signal(scores, matches, domain, suffix, "extension", extension_weights[suffix])

        magic_weights = dict(domain.magic)
        for magic in magic_values:
            if magic in magic_weights:
                add_signal(scores, matches, domain, magic, "magic", magic_weights[magic])

    ranked_domains = sorted(DOMAINS, key=lambda domain: (-scores[domain.key], domain.key))
    ranked = [
        {
            "domain": domain.key,
            "label": domain.label,
            "score": scores[domain.key],
            "module": domain.module,
            "entry": domain.entry,
            "matched_signals": matches[domain.key],
        }
        for domain in ranked_domains
        if scores[domain.key] > 0
    ]
    top_score = ranked[0]["score"] if ranked else 0
    second_score = ranked[1]["score"] if len(ranked) > 1 else 0
    if top_score >= 8 and top_score - second_score >= 3:
        confidence = "high"
    elif top_score >= 4:
        confidence = "medium"
    elif top_score:
        confidence = "low"
    else:
        confidence = "unknown"

    supporting = [item["domain"] for item in ranked[1:3] if item["score"] >= max(2, top_score * 0.45)]
    return {
        "schema_version": 1,
        "classification_is_evidence": False,
        "recommended_stage": "triage",
        "primary": ranked[0]["domain"] if ranked else None,
        "supporting": supporting,
        "confidence": confidence,
        "mixed_domain": bool(supporting),
        "ranked": ranked,
        "next_action": (
            "Read the primary module, confirm one real boundary, and revise the route if runtime evidence disagrees."
            if ranked
            else "Collect artifact magic, entry behavior, and one normal input/output sample before routing."
        ),
    }


def render_text(result: dict[str, Any]) -> str:
    lines = [
        f"Primary: {result['primary'] or 'unknown'}",
        f"Supporting: {', '.join(result['supporting']) or 'none'}",
        f"Confidence: {result['confidence']}",
        "Current stage: triage",
    ]
    for item in result["ranked"][:5]:
        signals = ", ".join(f"{match['signal']}[{match['source']}:+{match['weight']}]" for match in item["matched_signals"])
        lines.append(f"- {item['domain']}: {item['score']} -> {item['module']} ({signals})")
    lines.append(f"Next: {result['next_action']}")
    return "\n".join(lines) + "\n"


def write_output(content: str, output: Path | None) -> None:
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
    if args.max_paths <= 0:
        print("route_task: --max-paths must be positive", file=sys.stderr)
        return 2
    try:
        texts = list(args.text)
        texts.extend(path.read_text(encoding="utf-8") for path in args.text_file)
        names: list[str] = []
        for path in args.path:
            names.extend(path_names(path, args.max_paths - len(names)))
            if len(names) >= args.max_paths:
                break
        magic_values: list[str] = []
        for path in args.inventory:
            inventory_names, inventory_magic = load_inventory(path)
            names.extend(inventory_names[: max(0, args.max_paths - len(names))])
            magic_values.extend(inventory_magic)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"route_task: {exc}", file=sys.stderr)
        return 2

    result = score_inputs(texts, names, magic_values)
    content = json.dumps(result, ensure_ascii=False, indent=2) + "\n" if args.json else render_text(result)
    write_output(content, args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
