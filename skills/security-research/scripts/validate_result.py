#!/usr/bin/env python3
"""Validate a security research result without external schema libraries.

Purpose: Enforce evidence, route, reproduction, validation, and deliverable contracts.
Inputs: One research-result JSON and an optional artifact base directory.
Outputs: Human-readable or JSON validation report.
Dependencies: Python 3.9+ standard library.
Safe defaults: Read-only; file existence/hash checks require --strict-files.
Example: python scripts/validate_result.py analysis/research-result.json --strict-files --base-dir .
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any


MODES = {"ctf", "lab", "authorized-assessment", "sample-analysis", "defensive-review", "tool-development"}
DOMAINS = {"web", "pwn", "reverse", "crypto", "forensics", "malware", "misc", "osint", "ai-ml", "assessment-tooling"}
STAGES = {"intake", "triage", "evidence", "primitive", "chain", "verify", "report", "retain"}
LEVELS = {"observed", "inferred", "assumed"}
VALIDATION = {"untested", "partial", "validated", "failed"}
EVIDENCE_ID = re.compile(r"^E-[0-9]{3}$")
HYPOTHESIS_ID = re.compile(r"^H-[0-9]{3}$")
SHA256 = re.compile(r"^[0-9a-fA-F]{64}$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("result", type=Path)
    parser.add_argument("--base-dir", type=Path)
    parser.add_argument("--strict-files", action="store_true")
    parser.add_argument("--json", action="store_true")
    return parser.parse_args()


def file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate(data: Any, base_dir: Path, strict_files: bool) -> list[str]:
    errors: list[str] = []
    if not isinstance(data, dict):
        return ["root must be an object"]

    required = {
        "schema_version", "objective", "mode", "scope", "route", "samples", "evidence", "hypotheses",
        "primitive", "reproduction", "validation", "deliverables", "residual_risks", "experience_action",
    }
    missing = sorted(required - set(data))
    if missing:
        errors.append(f"missing fields: {', '.join(missing)}")
    if data.get("schema_version") != 1:
        errors.append("schema_version must be 1")
    if not isinstance(data.get("objective"), str) or not data.get("objective", "").strip():
        errors.append("objective must be a non-empty string")
    if data.get("mode") not in MODES:
        errors.append(f"mode must be one of {sorted(MODES)}")

    scope = data.get("scope")
    if not isinstance(scope, dict):
        errors.append("scope must be an object")
    else:
        for field in ("in_scope", "out_of_scope", "allowed_state_changes"):
            if not isinstance(scope.get(field), list) or not all(isinstance(value, str) for value in scope.get(field, [])):
                errors.append(f"scope.{field} must be a string list")
        if not isinstance(scope.get("reset_method"), str):
            errors.append("scope.reset_method must be a string")

    route = data.get("route")
    if not isinstance(route, dict):
        errors.append("route must be an object")
    else:
        if route.get("primary_domain") not in DOMAINS:
            errors.append(f"route.primary_domain must be one of {sorted(DOMAINS)}")
        supporting = route.get("supporting_domains")
        if not isinstance(supporting, list) or not all(value in DOMAINS for value in supporting):
            errors.append("route.supporting_domains contains an invalid domain")
        elif len(supporting) != len(set(supporting)):
            errors.append("route.supporting_domains must be unique")
        if route.get("stage") not in STAGES:
            errors.append(f"route.stage must be one of {sorted(STAGES)}")
        read_now = route.get("read_now")
        if not isinstance(read_now, list) or len(read_now) > 4 or not all(isinstance(value, str) for value in read_now):
            errors.append("route.read_now must be a string list with at most four entries")
        if not isinstance(route.get("exit_condition"), str) or not route.get("exit_condition", "").strip():
            errors.append("route.exit_condition must be non-empty")

    evidence_ids: set[str] = set()
    evidence = data.get("evidence")
    if not isinstance(evidence, list):
        errors.append("evidence must be a list")
    else:
        for index, item in enumerate(evidence):
            if not isinstance(item, dict):
                errors.append(f"evidence[{index}] must be an object")
                continue
            evidence_id = item.get("id")
            if not isinstance(evidence_id, str) or not EVIDENCE_ID.match(evidence_id) or evidence_id in evidence_ids:
                errors.append(f"evidence[{index}].id must be unique E-NNN")
            else:
                evidence_ids.add(evidence_id)
            if item.get("level") not in LEVELS:
                errors.append(f"evidence[{index}].level is invalid")
            for field in ("fact", "source"):
                if not isinstance(item.get(field), str) or not item[field].strip():
                    errors.append(f"evidence[{index}].{field} must be non-empty")

    hypothesis_ids: set[str] = set()
    hypotheses = data.get("hypotheses")
    if not isinstance(hypotheses, list):
        errors.append("hypotheses must be a list")
    else:
        for index, item in enumerate(hypotheses):
            if not isinstance(item, dict):
                errors.append(f"hypotheses[{index}] must be an object")
                continue
            hypothesis_id = item.get("id")
            if not isinstance(hypothesis_id, str) or not HYPOTHESIS_ID.match(hypothesis_id) or hypothesis_id in hypothesis_ids:
                errors.append(f"hypotheses[{index}].id must be unique H-NNN")
            else:
                hypothesis_ids.add(hypothesis_id)
            if item.get("status") not in {"open", "supported", "invalidated"}:
                errors.append(f"hypotheses[{index}].status is invalid")
            refs = item.get("supporting_evidence")
            if not isinstance(refs, list) or any(ref not in evidence_ids for ref in refs):
                errors.append(f"hypotheses[{index}].supporting_evidence references unknown evidence")
            for field in ("claim", "disconfirming_test"):
                if not isinstance(item.get(field), str) or not item[field].strip():
                    errors.append(f"hypotheses[{index}].{field} must be non-empty")

    for collection_name in ("samples", "deliverables"):
        collection = data.get(collection_name)
        if not isinstance(collection, list):
            errors.append(f"{collection_name} must be a list")
            continue
        for index, item in enumerate(collection):
            if not isinstance(item, dict) or not isinstance(item.get("path"), str) or not item["path"]:
                errors.append(f"{collection_name}[{index}] requires path")
                continue
            digest = item.get("sha256")
            if digest is not None and (not isinstance(digest, str) or not SHA256.match(digest)):
                errors.append(f"{collection_name}[{index}].sha256 is invalid")
            path = Path(item["path"])
            resolved = path if path.is_absolute() else (base_dir / path).resolve()
            if strict_files:
                if not resolved.is_file():
                    errors.append(f"{collection_name}[{index}] missing file: {resolved}")
                elif digest and file_hash(resolved).lower() != digest.lower():
                    errors.append(f"{collection_name}[{index}] hash mismatch: {resolved}")

    reproduction = data.get("reproduction")
    checkpoints: list[Any] = []
    reproduction_commands: list[Any] = []
    if not isinstance(reproduction, dict):
        errors.append("reproduction must be an object")
    else:
        if not isinstance(reproduction.get("environment"), dict) or not all(
            isinstance(key, str) and isinstance(value, str) for key, value in reproduction.get("environment", {}).items()
        ):
            errors.append("reproduction.environment must map strings to strings")
        reproduction_commands = reproduction.get("commands")
        if not isinstance(reproduction_commands, list) or not all(isinstance(value, str) for value in reproduction_commands):
            errors.append("reproduction.commands must be a string list")
            reproduction_commands = []
        checkpoints = reproduction.get("checkpoints")
        if not isinstance(checkpoints, list):
            errors.append("reproduction.checkpoints must be a list")
            checkpoints = []
        for index, item in enumerate(checkpoints):
            if not isinstance(item, dict) or not isinstance(item.get("passed"), bool):
                errors.append(f"reproduction.checkpoints[{index}] is malformed")

    validation = data.get("validation")
    if not isinstance(validation, dict) or validation.get("status") not in VALIDATION:
        errors.append(f"validation.status must be one of {sorted(VALIDATION)}")
    elif validation["status"] == "validated":
        if not validation.get("clean_baseline") or not validation.get("negative_control"):
            errors.append("validated results require clean_baseline and negative_control")
        if not checkpoints or any(not item.get("passed", False) for item in checkpoints if isinstance(item, dict)):
            errors.append("validated results require at least one passing-only checkpoint set")
        if not reproduction_commands:
            errors.append("validated results require a reproduction command")

    if not isinstance(data.get("residual_risks"), list) or not all(isinstance(value, str) for value in data.get("residual_risks", [])):
        errors.append("residual_risks must be a string list")
    action = data.get("experience_action")
    if not isinstance(action, dict) or action.get("action") not in {"none", "candidate", "promote", "deprecate"}:
        errors.append("experience_action.action is invalid")
    elif action["action"] != "none" and not action.get("path"):
        errors.append("experience_action.path is required when action is not none")
    return errors


def main() -> int:
    args = parse_args()
    try:
        result_path = args.result.expanduser().resolve()
        data = json.loads(result_path.read_text(encoding="utf-8"))
        base_dir = args.base_dir.expanduser().resolve() if args.base_dir else result_path.parent
        errors = validate(data, base_dir, args.strict_files)
    except (OSError, json.JSONDecodeError) as exc:
        errors = [str(exc)]
    report = {"valid": not errors, "errors": errors}
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print("PASS" if not errors else "FAIL")
        for error in errors:
            print(f"- {error}")
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
