# Security Research Experience Index

Read this file at the start of every `security-research` task. It is a routing index, not a request to load the whole knowledge base.

## Start Sequence

1. Classify the task from observed inputs: domain, current lifecycle stage, and expected deliverable.
2. Read one matching stable experience file when available.
3. Inspect `scripts/reusable/` before writing a new helper.
4. Read `experience/pitfalls.md` when evidence conflicts, a tool result is surprising, or two cycles fail to advance.
5. At task completion, decide whether a candidate experience or reusable script should be retained.

## Experience Routes

| Signals | Stable experience | Reusable helper |
|---|---|---|
| new challenge, new target, project setup, first contact with CTF problem | SKILL.md (项目脚手架 section) | `scripts/reusable/scaffold_project.py` |
| HAR, login chain, CAPTCHA, risk control, SDK `/load`/`/verify`, cookie transitions | `experience/web-captcha.md` | `scripts/reusable/har_summary.py` |
| PE/ELF/APK, packer, unpack, dump, OEP, IAT, PyInstaller, UPX | `experience/reverse-unpacking.md` | `scripts/reusable/pe_entropy_triage.py` |
| JS/Python/PowerShell/VBA obfuscation, eval, string table, marshal, base64/zlib | `experience/deobfuscation.md` | use registered `reverse-master` helpers when available |
| conflicting source/runtime evidence, tool misuse, repeated scan, non-reproducible result | `experience/pitfalls.md` | `scripts/reusable/new_experience_entry.py` |
| model refusal, safety warning, session blocked, guardrail trigger, sensitive domain (EDR/AV/exploit chain) | `experience/pitfalls.md` (Model Guardrail section) + `progressive-reasoning.md` | — |
| unfamiliar challenge attachments or mixed file types | `evidence-workflow.md` | `scripts/reusable/artifact_inventory.py` |
| ambiguous CTF category or cross-domain clue set | `routing.md` | `scripts/reusable/route_task.py` |
| missing/broken tool, Windows compatibility, need organizer wordlist / rainbow table / CAPTCHA relay / MCP / target credentials | `environment-and-resources.md` | `scripts/env_probe.py` |

## Domain Knowledge Routes

| Domain | Entry | Typical supporting references |
|---|---|---|
| Web/API | `ctf/web/index.md` | `pentest.md`, selected `ctf/web/*.md` |
| Pwn | `ctf/pwn/index.md` | selected `ctf/pwn/*.md`, `tools.md` |
| Reverse | `ctf/reverse/index.md` | `reverse.md`, registered `reverse-master` |
| Crypto | `ctf/crypto/index.md` | selected construction-specific document |
| Forensics/DFIR | `ctf/forensics/index.md` | selected artifact-specific document |
| Malware/protocol | `ctf/malware/index.md` | `malware.md`, `c2.md` |
| Misc | `ctf/misc/index.md` | selected jail/encoding/game/RF document |
| OSINT | `ctf/osint/index.md` | selected source/media document |
| AI/ML security | `ctf/ai-ml/index.md` | `ai-security.md` |
| Authorized assessment/tooling | `pentest.md` | `scanner.md`, `tools.md`, `../../pentest-tools/` |

Use `routing.md` to select exact topic files. Load one category entry and at most three topic references at a time.

## Deep Specialization Modules (merged from reverse-skill)

Enter from the matching domain only when the stage needs deep methodology or weaponization. See `routing.md` → 深度专项模块 for full signals.

| Module | Entry | Deep references |
|---|---|---|
| Pwn full chain | `../skills/sec-pwn-chain/INSTRUCTIONS.md` | `references/{stack,heap,kernel}-pwn.md` |
| N-day patch diff | `../skills/sec-patch-diff/INSTRUCTIONS.md` | `references/{patch-tuesday-workflow,diff-tools-comparison,root-cause-and-poc}.md` |
| Firmware / IoT (OWASP FSTM) | `../skills/sec-firmware/INSTRUCTIONS.md` | `references/{extraction-methodology,emulation-and-fuzz,emba-automated-analysis}.md` |
| EDR/AV bypass RE | `../skills/sec-edr-bypass/INSTRUCTIONS.md` | `references/{hook-survey,unhook-techniques,telemetry-blinding}.md` |
| Supply chain | `../skills/sec-supply-chain/INSTRUCTIONS.md` | `references/{sbom-sca-methodology,cicd-pipeline-security}.md` |
| Attack-chain orchestration | `../skills/sec-attack-chain/INSTRUCTIONS.md` | `references/{attack-playbooks,evasion-cheatsheet}.md` |
| Pentest weaponry | `../../pentest-tools/SKILL.md` | `src-hunter/references/playbooks/` (20), `payloader/` |
| Deep LLM/Agent sec | `../skills/sec-ai-security/references/llm-deep/` | OWASP LLM Top 10, prompt-injection methodology, agent testing |
| Deep malware | `../skills/sec-malware/references/malware-deep/` | YARA/Sigma, anti-analysis, sandbox orchestration |
| Deep API sec | `../skills/sec-web-api/references/api-deep/` | REST/GraphQL, JWT/OAuth testing |

**CTF competition orchestration**: for full multi-challenge competitions, enter `../../ctf-sandbox-orchestrator/SKILL.md` (45 `competition-*` sub-skills; GPLv3 subtree, see `../NOTICE.md`).

## Current Reusable Scripts

| Script | Purpose | Safe default |
|---|---|---|
| `scripts/reusable/artifact_inventory.py` | inventory explicit challenge roots, detect magic, hash files | read-only; no symlink traversal |
| `scripts/reusable/route_task.py` | score candidate domains from task text and filenames | classification only; executes no target code |
| `scripts/reusable/har_summary.py` | summarize request order, statuses, content types, parameters, and cookie changes | reads one HAR and writes explicit output |
| `scripts/reusable/pe_entropy_triage.py` | summarize PE headers, sections, imports, entropy, and entrypoint | static read-only parsing |
| `scripts/reusable/pack_cloud_handoff.py` | zip exp skeleton + deps with a hashed manifest for a cloud Linux agent | read-only inputs; refuses to overwrite without --force |
| `scripts/reusable/new_experience_entry.py` | create a structured candidate entry | no-clobber candidate; atomic UTF-8 write |
| `scripts/reusable/new-experience-entry.ps1` | PowerShell wrapper for the Python generator | inherits validation and no-clobber behavior |

## Candidate Experience Criteria

Create a candidate when at least one is true:

- the same script or command sequence was written again
- a stable tool limitation, environment difference, misleading signal, or recovery path was proven
- a reusable request, protocol, unpacking, decoding, exploitation, analysis, or validation method was formed
- an existing route failed to trigger for a repeatable reason

Do not create a candidate for an unverified guess, a one-off flag value, raw logs, or task secrets.

## Candidate Format

Use `experience-schema.md` and include:

- applies-when signals
- counterexamples and non-applicable conditions
- minimal workflow
- tool/runtime versions
- sample or fixture hash
- exact validation command and expected checkpoint
- known failure modes and rollback point
- last validation date
- promotion conditions

By default the generator writes candidates to the current workspace under `analysis/experience-candidates/`, not into the installed skill. Promote a reviewed entry with an explicit `--skill-root` only after a clean reproduction and either a second successful reuse or explicit user approval.

## Experience Completion Check

Before ending a task, answer internally:

1. Which step consumed the most time?
2. Which assumption was invalidated?
3. Which signal should route the next task faster?
4. Was an existing helper overlooked?
5. Can a new helper run with explicit inputs, structured output, and safe defaults?
6. Does the retained entry avoid credentials, tokens, private keys, and unrelated local state?

If no reusable knowledge emerged, record nothing. Experience quality matters more than entry count.
