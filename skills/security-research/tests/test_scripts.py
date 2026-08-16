from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
PYTHON = sys.executable


def run_script(relative: str, *arguments: str, cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    environment = {**os.environ, "PYTHONUTF8": "1"}
    return subprocess.run(
        [PYTHON, str(ROOT / relative), *arguments],
        cwd=str(cwd or ROOT),
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=environment,
        check=False,
        timeout=30,
    )


class SkillValidationTests(unittest.TestCase):
    def test_pack_validator_passes(self) -> None:
        arguments = [str(ROOT), "--json"]
        if (ROOT / "evals" / "evals.json").is_file():
            arguments.append("--require-evals")
        result = run_script("scripts/validate_skill.py", *arguments)
        self.assertEqual(result.returncode, 0, result.stderr or result.stdout)
        report = json.loads(result.stdout)
        self.assertTrue(report["valid"])
        self.assertEqual(report["counts"]["modules"], 11)
        self.assertEqual(report["counts"]["ctf_categories"], 10)

    def test_pack_contains_no_opaque_executable(self) -> None:
        forbidden = {".dll", ".exe", ".so", ".dylib", ".sys", ".scr", ".com"}
        found = [path.relative_to(ROOT) for path in ROOT.rglob("*") if path.is_file() and path.suffix.lower() in forbidden]
        self.assertEqual(found, [])

    def test_root_contract_has_no_legacy_scope_or_terminology_bypass(self) -> None:
        content = (ROOT / "SKILL.md").read_text(encoding="utf-8")
        for forbidden in (
            "<threat_target_attack>",
            "VPN 强制路由",
            "所有出站流量经主办方",
            "输出过滤机制",
            "拼音替换",
            "Unicode编码",
        ):
            self.assertNotIn(forbidden, content)
        self.assertIn("使用正常、准确的安全术语", content)

    def test_ctf_writeup_contract_requires_real_process_and_ai_disclosure(self) -> None:
        template = (ROOT / "assets" / "templates" / "ctf-writeup.md").read_text(encoding="utf-8")
        guide = (ROOT / "references" / "ctf" / "writeup" / "index.md").read_text(encoding="utf-8")
        reporting = (ROOT / "skills" / "sec-reporting" / "INSTRUCTIONS.md").read_text(encoding="utf-8")

        for heading in (
            "## 1. 题目信息",
            "## 2. 题目分析",
            "## 3. 解题思路",
            "## 4. 解题过程",
            "## 5. 解题代码",
            "## 6. AI 使用说明",
        ):
            self.assertIn(heading, template)

        self.assertIn("不能据此编写完整过程", guide)
        self.assertIn("不以规避 AI 检测为写作目标", guide)
        self.assertIn("AI 参与实质分析或代码时应明确写出", guide)
        self.assertIn("Never invent commands", reporting)
        self.assertIn("the AI disclosure matches", reporting)

    def test_environment_probe_has_no_native_loader_or_shell_execution(self) -> None:
        content = (SCRIPTS / "env_probe.py").read_text(encoding="utf-8")
        for forbidden in ("utils.dll", "ctypes", "RunFullProcess", "shell=True", "ping -"):
            self.assertNotIn(forbidden, content)


class EnvironmentProbeTests(unittest.TestCase):
    def test_default_json_has_safe_defaults(self) -> None:
        result = run_script("scripts/env_probe.py", "--category", "reverse", "--json")
        self.assertEqual(result.returncode, 0, result.stderr)
        report = json.loads(result.stdout)
        self.assertFalse(report["safe_defaults"]["network_probes"])
        self.assertFalse(report["safe_defaults"]["executed_discovered_tools"])
        self.assertFalse(report["safe_defaults"]["loaded_native_libraries"])
        self.assertTrue(report["tools"])


class ArtifactInventoryTests(unittest.TestCase):
    def test_inventory_hashes_and_detects_magic_with_size_limit(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            artifacts = root / "artifacts"
            artifacts.mkdir()
            (artifacts / "note.txt").write_text("hello", encoding="utf-8")
            (artifacts / "image.png").write_bytes(b"\x89PNG\r\n\x1a\n" + b"x" * 8)
            (artifacts / "large.bin").write_bytes(b"A" * 32)
            output = root / "inventory.json"

            result = run_script(
                "scripts/reusable/artifact_inventory.py",
                str(artifacts),
                "--hash-max-bytes",
                "16",
                "--output",
                str(output),
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            report = json.loads(output.read_text(encoding="utf-8"))
            entries = {entry["path"]: entry for entry in report["entries"]}
            self.assertEqual(entries["image.png"]["magic"], "png")
            self.assertEqual(entries["note.txt"]["sha256"], hashlib.sha256(b"hello").hexdigest())
            self.assertEqual(entries["large.bin"]["hash_status"], "skipped_size_limit")
            self.assertFalse(report["options"]["follow_symlinks"])


class RouteTaskTests(unittest.TestCase):
    def route(self, text: str) -> dict:
        result = run_script("scripts/reusable/route_task.py", "--text", text, "--json")
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_cross_domain_routes(self) -> None:
        cases = (
            ("HTTP JWT challenge using RSA signature and a captured HAR", "web", "crypto"),
            ("remote ELF format string libc leak with seccomp", "pwn", None),
            ("PCAP contains encrypted C2 beacon traffic", "forensics", "malware"),
            ("Prompt injection in a RAG Agent tool chain", "ai-ml", None),
            ("APK uses Frida checks and packed DEX", "reverse", None),
        )
        for text, primary, supporting in cases:
            with self.subTest(text=text):
                report = self.route(text)
                self.assertEqual(report["primary"], primary)
                if supporting:
                    self.assertIn(supporting, report["supporting"])
                self.assertFalse(report["classification_is_evidence"])
                self.assertEqual(report["recommended_stage"], "triage")

    def test_unknown_route_requests_evidence(self) -> None:
        report = self.route("Please inspect the supplied challenge.")
        self.assertIsNone(report["primary"])
        self.assertEqual(report["confidence"], "unknown")
        self.assertIn("Collect artifact magic", report["next_action"])


class HarSummaryTests(unittest.TestCase):
    def make_har(self) -> dict:
        return {
            "log": {
                "entries": [
                    {
                        "startedDateTime": "2026-07-10T10:00:00Z",
                        "time": 12.5,
                        "request": {
                            "method": "POST",
                            "url": "https://alice:correct-horse@example.test/api/v1/items|pipe?token=TOPSECRET&id=42",
                            "headers": [
                                {"name": "authorization", "value": "Bearer AUTHSECRET"},
                                {"name": "COOKIE", "value": "SID=COOKIESECRET; theme=dark"},
                                {
                                    "name": "Referer",
                                    "value": "https://bob:password@example.test/login?continue=PRIVATE&token=REFSECRET",
                                },
                                {"name": "Content-Type", "value": "application/json"},
                            ],
                            "postData": {
                                "mimeType": "application/json",
                                "text": json.dumps(
                                    {
                                        "username": "alice",
                                        "password": "BODYSECRET",
                                        "profile": {"email": "secret@example.test"},
                                    }
                                ),
                            },
                        },
                        "response": {
                            "status": 302,
                            "redirectURL": "https://carol:redacted@example.test/done?code=REDIRECTSECRET",
                            "headers": [{"name": "set-cookie", "value": "sid=NEWSECRET; Path=/; HttpOnly"}],
                            "content": {"mimeType": "application/json", "size": 20, "text": "RESPONSESECRET"},
                        },
                    }
                ]
            }
        }

    def test_summary_redacts_all_values_and_userinfo(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "capture.har"
            output = root / "summary.json"
            source.write_text(json.dumps(self.make_har()), encoding="utf-8")
            result = run_script("scripts/reusable/har_summary.py", str(source), "--json", str(output))
            self.assertEqual(result.returncode, 0, result.stderr)
            serialized = output.read_text(encoding="utf-8")
            for secret in (
                "TOPSECRET",
                "AUTHSECRET",
                "COOKIESECRET",
                "BODYSECRET",
                "REFSECRET",
                "REDIRECTSECRET",
                "RESPONSESECRET",
                "correct-horse",
            ):
                self.assertNotIn(secret, serialized)
            row = json.loads(serialized)["entries"][0]
            self.assertEqual(row["host"], "example.test")
            self.assertEqual(row["query_keys"], ["id", "token"])
            self.assertEqual(row["request_cookie_names"], ["SID", "theme"])
            self.assertEqual(row["set_cookie_names"], ["sid"])
            self.assertIn("profile.email", row["body_keys"])
            self.assertEqual(row["request_headers"]["authorization"], "<redacted>")
            self.assertIn("\\|", result.stdout)

    def test_size_limit_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary) / "large.har"
            source.write_text(json.dumps(self.make_har()), encoding="utf-8")
            result = run_script("scripts/reusable/har_summary.py", str(source), "--max-bytes", "10")
            self.assertEqual(result.returncode, 2)
            self.assertIn("exceeds --max-bytes", result.stderr)


class PeTriageTests(unittest.TestCase):
    def test_non_pe_is_hashed_and_returns_nonzero(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            sample = root / "sample.txt"
            output = root / "pe.json"
            sample.write_bytes(b"not a portable executable")
            result = run_script("scripts/reusable/pe_entropy_triage.py", str(sample), "--json", str(output))
            self.assertEqual(result.returncode, 1, result.stderr)
            report = json.loads(output.read_text(encoding="utf-8"))
            self.assertFalse(report["format_valid"])
            self.assertEqual(report["sha256"], hashlib.sha256(sample.read_bytes()).hexdigest())

    def test_size_limit_stops_before_analysis(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            sample = Path(temporary) / "large.exe"
            sample.write_bytes(b"MZ" + b"A" * 30)
            result = run_script("scripts/reusable/pe_entropy_triage.py", str(sample), "--max-bytes", "8")
            self.assertEqual(result.returncode, 2)
            self.assertIn("exceeds --max-bytes", result.stderr)


class ExperienceEntryTests(unittest.TestCase):
    def test_default_workspace_output_is_valid_and_no_clobber(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            arguments = (
                "--title",
                "HAR cookie\nscope mismatch",
                "--category",
                "web-api",
                "--tag",
                "har",
                "--date",
                "2026-07-10",
            )
            first = run_script("scripts/reusable/new_experience_entry.py", *arguments, cwd=root)
            self.assertEqual(first.returncode, 0, first.stderr)
            path = Path(first.stdout.strip())
            self.assertEqual(path.parent, root / "analysis" / "experience-candidates")
            content = path.read_text(encoding="utf-8")
            frontmatter = content.split("---", 2)[1]
            metadata = yaml.safe_load(frontmatter)
            self.assertEqual(metadata["title"], "HAR cookie scope mismatch")
            self.assertEqual(metadata["status"], "candidate")
            self.assertIn("## Does Not Apply When", content)

            second = run_script("scripts/reusable/new_experience_entry.py", *arguments, cwd=root)
            self.assertEqual(second.returncode, 2)
            self.assertIn("File exists", second.stderr)

    def test_dry_run_does_not_write(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            result = run_script(
                "scripts/reusable/new_experience_entry.py",
                "--title",
                "Dry run",
                "--category",
                "tooling",
                "--date",
                "2026-07-10",
                "--dry-run",
                cwd=root,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertFalse((root / "analysis").exists())


class ResultValidationTests(unittest.TestCase):
    def test_template_is_valid_unvalidated_state(self) -> None:
        result = run_script(
            "scripts/validate_result.py",
            str(ROOT / "assets" / "templates" / "research-result.json"),
            "--json",
        )
        self.assertEqual(result.returncode, 0, result.stderr or result.stdout)
        self.assertTrue(json.loads(result.stdout)["valid"])

    def test_validated_result_checks_evidence_and_file_hashes(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            artifact = root / "proof.txt"
            artifact.write_text("verified", encoding="utf-8")
            digest = hashlib.sha256(artifact.read_bytes()).hexdigest()
            data = json.loads((ROOT / "assets" / "templates" / "research-result.json").read_text(encoding="utf-8"))
            data.update(
                {
                    "objective": "Validate a fixture result.",
                    "samples": [{"path": "proof.txt", "sha256": digest, "role": "fixture"}],
                    "evidence": [
                        {
                            "id": "E-001",
                            "level": "observed",
                            "fact": "The fixture contains the expected bytes.",
                            "source": "proof.txt",
                        }
                    ],
                    "hypotheses": [
                        {
                            "id": "H-001",
                            "claim": "The fixture is reproducible.",
                            "status": "supported",
                            "supporting_evidence": ["E-001"],
                            "disconfirming_test": "Change the fixture bytes and rerun the hash check.",
                        }
                    ],
                    "reproduction": {
                        "environment": {"python": sys.version.split()[0]},
                        "commands": ["type proof.txt"],
                        "checkpoints": [
                            {"step": "hash", "expected": digest, "observed": digest, "passed": True}
                        ],
                    },
                    "validation": {
                        "status": "validated",
                        "clean_baseline": "fresh temporary directory",
                        "negative_control": "changed bytes fail the hash check",
                    },
                    "deliverables": [{"path": "proof.txt", "sha256": digest, "purpose": "test fixture"}],
                }
            )
            result_path = root / "result.json"
            result_path.write_text(json.dumps(data), encoding="utf-8")
            result = run_script(
                "scripts/validate_result.py",
                str(result_path),
                "--base-dir",
                str(root),
                "--strict-files",
                "--json",
            )
            self.assertEqual(result.returncode, 0, result.stderr or result.stdout)
            self.assertTrue(json.loads(result.stdout)["valid"])

            data["hypotheses"][0]["supporting_evidence"] = ["E-999"]
            result_path.write_text(json.dumps(data), encoding="utf-8")
            invalid = run_script("scripts/validate_result.py", str(result_path), "--json")
            self.assertEqual(invalid.returncode, 1)
            self.assertIn("unknown evidence", invalid.stdout)


if __name__ == "__main__":
    unittest.main(verbosity=2)
