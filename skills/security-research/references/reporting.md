# Reporting and Handoff

## General Result

Use this compact order unless the user requested a specific format:

```markdown
# Result

[One paragraph: what was proven or recovered.]

## Key Evidence

- Observed E-001: [decisive fact and artifact path]
- Observed E-002: [decisive fact and artifact path]
- Inferred H-001: [conclusion supported by evidence IDs]

## Reproduction

Environment:
Inputs and hashes:
Command:
Expected decisive output:
Reset / clean baseline:

## Open Items

[Unproven facts, invalidated routes, residual environment dependency, or next action.]
```

Keep raw logs in artifact files. Quote only lines needed to establish the conclusion.

## CTF Solution

Use this format for organizer submissions, team archives, public challenge notes, and requests containing WriteUp, 题解, 解题报告, or 复盘. The document should show the real reasoning and verification path, not merely restate the final flag or transform an AI answer into polished prose.

Save the WriteUp under the challenge workspace at `writeups/<challenge-slug>/writeup.md`, keep the solver/Exp in the same subdirectory, and place derived artifacts under `writeups/<challenge-slug>/artifacts/`. Maintain a master index `writeups/README.md` (start from `assets/templates/writeups-index.md`) with one row per challenge — name, category, event/source, status, flag (or “未获得”), and a one-line breakthrough — linking to each `writeup.md`. Do not scatter writeups or solver scripts across the project root; keep original attachments read-only in place.

```markdown
# [Challenge]

## 1. 题目信息

- 题目名称：[name]
- 题目类型：[primary category; add a supporting category only when it matters]
- 一句话打法：[one line naming the whole chain so the reader sees the shape before the detail, e.g. "leak canary then ret2win"]
- 最终 Flag：`<validated flag>`
- 题目附件/服务：[minimal identifying information]

## 2. 题目分析

[Describe observed file characteristics, program/request flow, vulnerability location,
cryptographic structure, forensic trace, or other decisive findings. Explain how the
evidence supports the conclusion.]

## 3. 解题思路

[Explain the breakthrough, why it became the primary route, and which condition made
the method applicable. Include a failed route only when it explains a meaningful pivot.]

## 4. 解题过程

### 4.1 [Observed step]

[Command, request, debugger action, decompiler excerpt, derivation, or payload.]

~~~text
[Only the decisive output lines]
~~~

[Interpret the result and connect it to the next action. Repeat subsections as needed.]

## 5. 解题代码

`writeups/<challenge-slug>/solve.py` / `exp.py` / [actual artifact path]

~~~python
[Complete necessary solver, Exp, or decryption program]
~~~

Run:

~~~bash
[exact invocation]
~~~

[Explain the core logic, inputs, dependencies, and expected checkpoint.]

## 6. AI 使用说明

[Accurately state what AI assisted with, what the author performed or verified, and how
the decisive result was reproduced. When the work was author-driven with AI as a
conversational advisor, state it as 对话式/顾问式 AI 辅助; do not misreport the mode.
Keep this specific and brief.]
```

WriteUp evidence rules:

- Build the process from session history, captured shell history, saved requests/logs, scripts, screenshots, decompiler output, debugger notes, or user-provided records. Do not invent a plausible chronology from the final flag.
- If the user provides only a flag or an AI answer, state that the analysis record is insufficient and identify the minimum missing material. A partial draft may mark items as `未记录` or `待根据原始记录补充`; never fill them with imagined actions.
- Preserve the actual causal chain: observation -> interpretation -> action -> checkpoint. This creates a readable human narrative without sacrificing reproducibility.
- Read like a person by leading with the detail that actually drew attention, letting sentence and paragraph length track content, and making every transition carry cause. Avoid AI-tells: template openings, `综上所述` / `值得注意的是` / `显而易见`, uniform bullet density, and predict-then-restate padding.
- Make it effective, not just human: open with a one-line attack summary (`一句话打法`) so the reader sees the whole chain first; give the terrain up front (checksec/protections for pwn, hash/arch for reverse, params/encoding for crypto, routes/auth state for web); quote only the decisive decompiler/request/output lines and attach "which means…" right after each, instead of pasting a block and explaining later; show how offsets, addresses, and magic numbers were derived rather than dropping bare constants. A concrete test: after removing the specific values, an AI-tell sentence still reads fine, while a real one collapses because its content was the evidence.
- Keep the three sections functionally distinct (mechanism / route choice / evidence-and-actions) instead of restating the same fact in each.
- Use first-person claims only when the user supplied that experience or explicitly confirms it. Neutral phrasing such as “先检查……” is preferable when authorship is uncertain.
- Include real failed attempts selectively. A dead end belongs only when it changed the next decision or prevents teammates from repeating costly work.
- Keep decisive raw output, request bodies, offsets, equations, and decompiler excerpts exact. Summarize surrounding noise instead of pasting full logs.
- Prefer one complete solver/Exp that starts from provided challenge data and reaches the flag. If manual debugger or browser steps are essential, document their exact checkpoints before the script.
- Do not add deliberate typos, fake uncertainty, invented timestamps, fabricated tool versions, or stylistic noise to imitate a person or beat authorship detectors. These are high-confidence detector features and being caught is worse than reading like AI; a real, reproducible process is the strongest evidence of human authorship.
- Humor and personal voice are welcome when they sit on real events — self-deprecation about how long a beginner challenge actually took, a dry jab at the challenge's real nature ("this SSTI filter is basically nothing"), a pun that follows the challenge theme, or an honest end-of-writeup "mistakes I made" recap of dead ends actually walked. Test: if deleting the joke leaves a true technical fact standing (real time spent, real dead end, real difficulty gap), it is fine. Never manufacture a struggle, hesitation, or timeline for the sake of a laugh — that crosses the fabrication redline. Keep jokes sparse, keep commands and offsets exact regardless, and dial the tone down for organizer submissions versus team archives.
- Make the AI disclosure proportional and truthful. Name substantive help such as vulnerability analysis, algorithm derivation, exploit debugging, or code generation, not only “润色”, when those occurred. When the work was genuinely author-driven with AI acting as a conversational advisor (author sets direction, runs commands, and verifies; AI only suggests, explains, or drafts in chat), state it accurately as 对话式/顾问式 AI 辅助. Do not misreport the assistance mode to fit reviewer preference — if an automated agent independently drove key analysis, do not claim it was chat-only.

Example disclosure:

```text
本题由作者主导分析与调试，AI 仅在对话中协助梳理调试记录并检查 solve.py 的边界条件；漏洞定位、关键请求复现与 Flag 校验以文中命令及附件结果为准，由作者执行核对。
```

Adapt the statement to the actual division of work. Do not reuse the example when it is inaccurate.

Do not report a random flag-like string as solved. Verify its source, expected prefix/format, relationship to the intended workflow, and uniqueness among challenge artifacts. Use `assets/templates/ctf-writeup.md` as the editable starting point.

## Vulnerability Finding

```markdown
# [Finding Title]

Severity:
Confidence: confirmed | high | medium | low
Affected component/build:

## Summary
[What boundary fails and what an in-scope actor gains.]

## Evidence
- E-001:
- E-002:

## Reproduction
Preconditions:
Steps:
Expected result:
Negative control:

## Impact
[Demonstrated impact first; plausible extensions separately.]

## Root Cause
[Code/config/state explanation with references.]

## Remediation
[Concrete fix plus regression test.]

## Residual Risk
[What remains untested or environment-specific.]
```

Do not inflate severity based on a hypothetical chain that was not demonstrated. State the primitive and proven impact separately.

## Malware / Sample Analysis

```markdown
# Sample Analysis

## Identity
Filename:
SHA-256:
Format/architecture:
Analysis environment:

## Behavior
- Observed:
- Inferred:

## Configuration and IoCs
| Type | Value | Provenance | Confidence |
|---|---|---|---|

## Extraction
[Commands/scripts and output hashes.]

## Detection
[YARA/Sigma/network rule path and test results.]

## Limitations
[Packed/unreached branches, anti-analysis, missing runtime, false-positive risks.]
```

IoCs from generic libraries, build paths, examples, test data, and dead code need corroboration before being attributed to runtime behavior.

## Reverse Handoff

```text
Target and hash:
Architecture/runtime:
Current stage:
Observed entry/boundary:
Recovered contract:
Key addresses/functions/fields:
Dynamic checkpoints:
Derived artifacts:
Invalidated hypotheses:
Open question:
Next exit condition:
```

## Pwn Handoff

```text
Binary / libc / loader hashes:
Architecture and mitigations:
Protocol framing:
Crash/leak offset:
Primitive:
Controllable bytes:
Target object/address:
Constraints:
Local checkpoint:
Remote difference:
Next exit condition:
```

## Crypto Handoff

```text
Inputs and exact encodings:
Equations:
Parameters:
Weakness/oracle:
Recovered value:
Verification vector:
Precision/seed/retries:
Open assumption:
```

## Forensics Handoff

```text
Original hash and acquisition source:
Format/profile/timezone:
Derived artifacts and hashes:
Timeline anchors:
Correlated evidence:
Recovery gaps:
Next question:
```

## Detection Rule Quality

For YARA, Sigma, Suricata, Zeek, or custom detections, report:

- exact rule path and version
- feature provenance: where each condition came from
- positive samples tested
- benign or neighboring negative samples tested
- expected false-positive boundary
- performance constraints
- fields that may change between builds or deployments

Avoid rules based only on a common compiler string, library import, file size, or a single public IP/domain without context.

## Reproduction Quality Checklist

- inputs and important outputs have hashes
- command lines include required arguments and working directory assumptions
- versions include runtime, loader/libc, browser, model, or tool when relevant
- stateful dependencies such as cookies, accounts, queues, caches, clocks, and random seeds are recorded
- expected checkpoints appear before final success
- failures return non-zero exit codes or explicit error messages
- the original artifact is not modified
- secrets unrelated to the challenge are absent

## Handoff States

Use one of these states:

- `evidence-partial`: real observations exist but the decisive boundary is incomplete
- `evidence-complete`: the relevant input-to-boundary chain is proven
- `primitive-proven`: a minimal effect repeats
- `chain-complete`: the objective is reachable from known state
- `validated`: clean-baseline reproduction passed
- `blocked`: exact missing input or external dependency is named

Do not use `solved` as a substitute for verification details.

## Structured Result

For long, automated, or cross-team work, create `research-result.json` from `assets/templates/research-result.json`. The schema records scope, route, samples, evidence IDs, hypotheses, primitive, reproduction checkpoints, validation state, deliverables, residual risks, and experience action.

Validate it with:

```bash
python scripts/validate_result.py analysis/research-result.json --base-dir . --strict-files
```

`validation.status: validated` requires a clean baseline, a negative control, at least one successful checkpoint, and a reproduction command. File hashes are checked when `--strict-files` is used.
