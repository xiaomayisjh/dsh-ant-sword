#!/usr/bin/env python3
"""Validate the security-research skill pack and its progressive routes.

Checks UTF-8/YAML, the single-entry invariant, relative references, executable
assets, Python syntax, required package files, and stale installation paths.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Iterator

try:
    import yaml
except ImportError as exc:  # pragma: no cover - explicit dependency failure
    raise SystemExit("validate_skill.py requires PyYAML") from exc


ALLOWED_FRONTMATTER = {"name", "description", "license", "allowed-tools", "metadata", "compatibility"}
FORBIDDEN_EXECUTABLE_SUFFIXES = {".dll", ".exe", ".so", ".dylib", ".sys", ".scr", ".com"}
REQUIRED_PATHS = (
    "SKILL.md",
    "LICENSE",
    "NOTICE.md",
    "CHANGELOG.md",
    "agents/openai.yaml",
    "references/routing.md",
    "references/evidence-workflow.md",
    "references/scope-and-evidence.md",
    "references/reporting.md",
    "references/experience-index.md",
    "scripts/env_probe.py",
    "scripts/reusable/artifact_inventory.py",
    "scripts/reusable/route_task.py",
    "scripts/validate_result.py",
    "schemas/research-result.schema.json",
    "assets/templates/ctf-writeup.md",
    "assets/templates/research-result.json",
)
REQUIRED_MODULES = (
    "sec-web-api",
    "sec-pwn-native",
    "sec-reverse",
    "sec-crypto",
    "sec-forensics-dfir",
    "sec-malware",
    "sec-misc",
    "sec-osint",
    "sec-ai-security",
    "sec-assessment-tooling",
    "sec-reporting",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("skill", nargs="?", type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--require-evals", action="store_true", help="Require development behavior and trigger eval sets.")
    return parser.parse_args()


def add_issue(issues: list[dict[str, str]], level: str, code: str, message: str) -> None:
    issues.append({"level": level, "code": code, "message": message})


def read_utf8(path: Path, issues: list[dict[str, str]]) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        add_issue(issues, "error", "utf8", f"{path}: {exc}")
    except OSError as exc:
        add_issue(issues, "error", "read", f"{path}: {exc}")
    return None


def parse_frontmatter(content: str) -> tuple[dict[str, Any] | None, str | None]:
    match = re.match(r"^---\r?\n(.*?)\r?\n---(?:\r?\n|$)", content, re.DOTALL)
    if not match:
        return None, "missing or malformed YAML frontmatter"
    try:
        data = yaml.safe_load(match.group(1))
    except yaml.YAMLError as exc:
        return None, f"invalid YAML: {exc}"
    if not isinstance(data, dict):
        return None, "frontmatter must be a mapping"
    return data, None


def outside_fences(content: str) -> Iterator[tuple[int, str]]:
    fence: str | None = None
    for number, line in enumerate(content.splitlines(), 1):
        stripped = line.lstrip()
        marker = stripped[:3]
        if marker in {"```", "~~~"}:
            if fence is None:
                fence = marker
            elif fence == marker:
                fence = None
            continue
        if fence is None:
            yield number, line


def validate_markdown_links(root: Path, path: Path, content: str, issues: list[dict[str, str]]) -> None:
    link_re = re.compile(r"(?<!!)\[[^\]]+\]\(([^)]+)\)")
    for line_number, line in outside_fences(content):
        without_inline_code = re.sub(r"`[^`]*`", "", line)
        for match in link_re.finditer(without_inline_code):
            raw = match.group(1).strip()
            if raw.startswith("<") and ">" in raw:
                raw = raw[1 : raw.index(">")]
            else:
                raw = re.split(r"\s+[\"']", raw, maxsplit=1)[0]
            if not raw or raw.startswith("#") or re.match(r"^[a-z][a-z0-9+.-]*://", raw, re.I):
                continue
            target = raw.split("#", 1)[0]
            if not target:
                continue
            if re.match(r"^[A-Za-z]:[\\/]", target) or target.startswith(("/", "\\\\")):
                add_issue(issues, "error", "absolute-link", f"{path.relative_to(root)}:{line_number}: {raw}")
                continue
            resolved = (path.parent / target).resolve()
            try:
                resolved.relative_to(root)
            except ValueError:
                add_issue(issues, "error", "escaping-link", f"{path.relative_to(root)}:{line_number}: {raw}")
                continue
            if not resolved.exists():
                add_issue(issues, "error", "broken-link", f"{path.relative_to(root)}:{line_number}: {raw}")


def validate_literal_routes(root: Path, path: Path, content: str, issues: list[dict[str, str]]) -> None:
    if path.parts[-1] not in {"SKILL.md", "INSTRUCTIONS.md", "experience-index.md", "routing.md"}:
        return
    # Literal routes resolve against the closest owning scope, not always the pack root:
    #   * root-level files (SKILL.md, routing.md, references/experience-index.md) -> root
    #   * a sub-skill under skills/<module>/ referencing its OWN references/scripts/assets
    #     -> that module dir (sub-skills merged from reverse-skill bundle their own references/)
    #   * nested skill packs (ctf-orchestrator, pentest-tools) -> the file's own directory
    # A route is accepted if it exists under root OR under the local owning scope.
    rel_parts = path.relative_to(root).parts
    nested_roots = ("ctf-orchestrator", "pentest-tools")
    bases = [root]
    if any(part in nested_roots for part in rel_parts):
        bases.append(path.parent)
    elif len(rel_parts) >= 2 and rel_parts[0] == "skills":
        bases.append(root / "skills" / rel_parts[1])
    route_re = re.compile(r"`((?:references|skills|scripts|assets)/[^`\s]+)`")
    for line_number, line in outside_fences(content):
        for raw in route_re.findall(line):
            target = raw.rstrip(".,;:")
            if "*" in target or "{" in target or "}" in target:
                continue
            if not any((b / target).exists() for b in bases):
                add_issue(issues, "error", "broken-route", f"{path.relative_to(root)}:{line_number}: {target}")


def validate_python(path: Path, content: str, root: Path, issues: list[dict[str, str]]) -> None:
    try:
        compile(content, str(path), "exec")
    except SyntaxError as exc:
        add_issue(issues, "error", "python-syntax", f"{path.relative_to(root)}:{exc.lineno}: {exc.msg}")


def load_json(path: Path, root: Path, issues: list[dict[str, str]]) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        add_issue(issues, "error", "json", f"{path.relative_to(root)}: {exc}")
        return None


def validate_evals(root: Path, issues: list[dict[str, str]], require_evals: bool) -> tuple[int, int]:
    behavior_path = root / "evals" / "evals.json"
    trigger_path = root / "evals" / "trigger-evals.json"
    behavior_count = 0
    trigger_count = 0

    if behavior_path.exists():
        data = load_json(behavior_path, root, issues)
        if isinstance(data, dict):
            if data.get("skill_name") != root.name:
                add_issue(issues, "error", "eval-skill-name", "evals/evals.json skill_name must match the skill")
            evals = data.get("evals")
            if not isinstance(evals, list):
                add_issue(issues, "error", "eval-schema", "evals/evals.json requires an evals list")
            else:
                behavior_count = len(evals)
                ids: set[int] = set()
                for index, item in enumerate(evals):
                    if not isinstance(item, dict):
                        add_issue(issues, "error", "eval-schema", f"eval {index} is not an object")
                        continue
                    eval_id = item.get("id")
                    if not isinstance(eval_id, int) or eval_id in ids:
                        add_issue(issues, "error", "eval-id", f"eval {index} has a missing/duplicate integer id")
                    else:
                        ids.add(eval_id)
                    for field in ("prompt", "expected_output"):
                        if not isinstance(item.get(field), str) or not item[field].strip():
                            add_issue(issues, "error", "eval-schema", f"eval {eval_id} requires {field}")
                    expectations = item.get("expectations")
                    if not isinstance(expectations, list) or not expectations or not all(
                        isinstance(value, str) and value.strip() for value in expectations
                    ):
                        add_issue(issues, "error", "eval-schema", f"eval {eval_id} requires non-empty expectations")
                    files = item.get("files", [])
                    if not isinstance(files, list):
                        add_issue(issues, "error", "eval-schema", f"eval {eval_id} files must be a list")
                        continue
                    for raw in files:
                        if not isinstance(raw, str):
                            add_issue(issues, "error", "eval-file", f"eval {eval_id} has a non-string file")
                            continue
                        target = (root / raw).resolve()
                        try:
                            target.relative_to(root)
                        except ValueError:
                            add_issue(issues, "error", "eval-file", f"eval {eval_id} file escapes the skill: {raw}")
                            continue
                        if not target.is_file():
                            add_issue(issues, "error", "eval-file", f"eval {eval_id} missing file: {raw}")
                if behavior_count < 10:
                    add_issue(issues, "error", "eval-coverage", f"Expected at least 10 behavior evals; found {behavior_count}")
        elif data is not None:
            add_issue(issues, "error", "eval-schema", "evals/evals.json root must be an object")
    elif require_evals:
        add_issue(issues, "error", "eval-required", "Missing evals/evals.json")

    if trigger_path.exists():
        data = load_json(trigger_path, root, issues)
        if isinstance(data, list):
            trigger_count = len(data)
            queries: set[str] = set()
            positive = 0
            negative = 0
            for index, item in enumerate(data):
                if not isinstance(item, dict) or not isinstance(item.get("query"), str) or not isinstance(
                    item.get("should_trigger"), bool
                ):
                    add_issue(issues, "error", "trigger-schema", f"trigger eval {index} is malformed")
                    continue
                query = item["query"].strip()
                if not query or query in queries:
                    add_issue(issues, "error", "trigger-query", f"trigger eval {index} has an empty/duplicate query")
                queries.add(query)
                positive += item["should_trigger"]
                negative += not item["should_trigger"]
            if positive < 8 or negative < 8:
                add_issue(
                    issues,
                    "error",
                    "trigger-coverage",
                    f"Trigger evals need at least 8 positive and 8 negative cases; found {positive}/{negative}",
                )
        elif data is not None:
            add_issue(issues, "error", "trigger-schema", "evals/trigger-evals.json root must be a list")
    elif require_evals:
        add_issue(issues, "error", "eval-required", "Missing evals/trigger-evals.json")
    return behavior_count, trigger_count


def validate_root(root: Path, require_evals: bool = False) -> dict[str, Any]:
    issues: list[dict[str, str]] = []
    if not root.is_dir():
        add_issue(issues, "error", "root", f"Not a directory: {root}")
        return {"valid": False, "root": str(root), "issues": issues}

    for relative in REQUIRED_PATHS:
        if not (root / relative).exists():
            add_issue(issues, "error", "required-path", f"Missing {relative}")
    for module in REQUIRED_MODULES:
        path = root / "skills" / module / "INSTRUCTIONS.md"
        if not path.is_file():
            add_issue(issues, "error", "required-module", f"Missing {path.relative_to(root)}")

    skill_files = sorted(root.rglob("SKILL.md"))
    if skill_files != [root / "SKILL.md"]:
        rendered = ", ".join(str(path.relative_to(root)) for path in skill_files)
        add_issue(issues, "error", "single-entry", f"Expected only root SKILL.md; found: {rendered}")

    skill_path = root / "SKILL.md"
    skill_content = read_utf8(skill_path, issues) if skill_path.exists() else None
    if skill_content is not None:
        frontmatter, error = parse_frontmatter(skill_content)
        if error:
            add_issue(issues, "error", "frontmatter", error)
        else:
            assert frontmatter is not None
            unexpected = sorted(set(frontmatter) - ALLOWED_FRONTMATTER)
            if unexpected:
                add_issue(issues, "error", "frontmatter-keys", f"Unexpected keys: {', '.join(unexpected)}")
            if frontmatter.get("name") != root.name:
                add_issue(issues, "error", "name", f"name must equal directory name {root.name!r}")
            description = frontmatter.get("description")
            if not isinstance(description, str) or not description.strip():
                add_issue(issues, "error", "description", "description must be a non-empty string")
            elif len(description) > 1024 or "<" in description or ">" in description:
                add_issue(issues, "error", "description", "description exceeds 1024 chars or contains angle brackets")
        line_count = len(skill_content.splitlines())
        if line_count > 500:
            add_issue(issues, "error", "progressive-disclosure", f"SKILL.md has {line_count} lines; maximum is 500")

    markdown_count = 0
    python_count = 0
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        suffix = path.suffix.lower()
        if suffix in FORBIDDEN_EXECUTABLE_SUFFIXES:
            add_issue(issues, "error", "opaque-executable", f"Forbidden executable asset: {path.relative_to(root)}")
        if suffix == ".pyc" or "__pycache__" in path.parts:
            add_issue(issues, "error", "generated-python", f"Generated Python artifact: {path.relative_to(root)}")
        if suffix not in {".md", ".py", ".yaml", ".yml", ".json", ".ps1", ".txt", ""}:
            continue
        content = read_utf8(path, issues)
        if content is None:
            continue
        if suffix == ".md":
            markdown_count += 1
            validate_markdown_links(root, path, content, issues)
            validate_literal_routes(root, path, content, issues)
        elif suffix == ".py":
            python_count += 1
            validate_python(path, content, root, issues)
        if path.relative_to(root).as_posix() in {
            "SKILL.md",
            "references/experience-index.md",
            "references/source-provenance.md",
            *[f"skills/{module}/INSTRUCTIONS.md" for module in REQUIRED_MODULES],
        }:
            for pattern in (r"\.claude[/\\]skills", r"C:\\Users\\", r"/Users/[^/]+/", r"/home/[^/]+/"):
                if re.search(pattern, content, re.I):
                    add_issue(issues, "error", "stale-install-path", f"{path.relative_to(root)} matches {pattern}")

    category_dirs = list((root / "references" / "ctf").glob("*/index.md"))
    if len(category_dirs) != 10:
        add_issue(issues, "error", "ctf-categories", f"Expected 10 category indexes; found {len(category_dirs)}")

    agent_yaml = root / "agents" / "openai.yaml"
    if agent_yaml.exists():
        try:
            agent_data = yaml.safe_load(agent_yaml.read_text(encoding="utf-8"))
            if not isinstance(agent_data, dict) or "interface" not in agent_data:
                add_issue(issues, "error", "agent-yaml", "agents/openai.yaml requires an interface mapping")
        except (OSError, UnicodeDecodeError, yaml.YAMLError) as exc:
            add_issue(issues, "error", "agent-yaml", str(exc))

    behavior_evals, trigger_evals = validate_evals(root, issues, require_evals)

    errors = [item for item in issues if item["level"] == "error"]
    warnings = [item for item in issues if item["level"] == "warning"]
    return {
        "valid": not errors,
        "root": str(root),
        "counts": {
            "markdown": markdown_count,
            "python": python_count,
            "modules": len(REQUIRED_MODULES),
            "ctf_categories": len(category_dirs),
            "behavior_evals": behavior_evals,
            "trigger_evals": trigger_evals,
            "errors": len(errors),
            "warnings": len(warnings),
        },
        "issues": issues,
    }


def main() -> int:
    args = parse_args()
    result = validate_root(args.skill.expanduser().resolve(), require_evals=args.require_evals)
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        status = "PASS" if result["valid"] else "FAIL"
        print(f"{status}: {result['root']}")
        for issue in result["issues"]:
            print(f"[{issue['level'].upper()}] {issue['code']}: {issue['message']}")
        print(json.dumps(result.get("counts", {}), ensure_ascii=False))
    return 0 if result["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
