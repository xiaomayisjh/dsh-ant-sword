---
name: mission-keeper
description: Keep Codex aligned during long reverse-engineering, penetration-testing lab, vulnerability research, code auditing, debugging, incident analysis, and multi-turn technical investigations. Use when the task may involve long logs, large decompiled output, many hypotheses, repeated failed attempts, hallucination risk, loss of objective, or needing periodic recap, evidence tracking, stall detection, and strategy switching.
---

# Mission Keeper

Use this skill to keep long technical investigations anchored, evidence-based, and moving forward. It is especially useful for reverse engineering, authorized penetration-testing labs, exploitability analysis, code auditing, malware triage, protocol analysis, and complex debugging.

## Mission state

At the start of the task, create a compact mission state. If filesystem work is useful, save it as `work/mission-state.md` using `references/mission-state-template.md`.

Track:

- Primary objective
- Current subgoal
- Scope and boundaries
- Success criteria
- Known facts
- Evidence collected
- Hypotheses
- Failed attempts
- Current blocker
- Next concrete action

Keep this state short and update it after meaningful progress.

## Reverse-engineering focus

For reverse-engineering tasks, track:

- Target file, architecture, format, packer/protector hints, and entry point
- Interesting strings, imports, exports, sections, resources, and metadata
- High-value functions, call chains, control flow, and data flow
- Dynamic observations from debugger, sandbox, traces, logs, or runtime behavior
- Unresolved questions and candidate next pivots

Prefer following evidence-rich paths over reading large decompiled blocks linearly. Summarize large function bodies into purpose, inputs, outputs, side effects, and callers/callees.

## Penetration-testing focus

For penetration-testing or security assessment tasks, track:

- Authorized scope, target assets, environment, and test boundaries
- Discovered hosts, ports, services, versions, routes, parameters, roles, and authentication state
- Verified findings versus unverified vulnerability hypotheses
- Failed payloads, scans, assumptions, and dead ends
- Risk, impact, reproducibility, and confidence for each finding

Rank next actions by evidence, likely impact, reproducibility, and cost. Avoid repeating scans or payloads that were already recorded as failed unless a new condition changed.

## Evidence labels

Label important claims with one of:

- `Observed`: Directly seen in user input, files, logs, commands, tool output, screenshots, network responses, debugger output, or source material.
- `Inferred`: Reasoned from observed evidence.
- `Assumed`: Plausible but not verified.

Do not present an `Assumed` item as a conclusion. Before relying on it, propose or run a verification step.

## Periodic recall

Every 3 assistant turns, after a very large input/output block, or before changing direction, briefly restate:

1. Main objective
2. Current subgoal
3. Confirmed evidence
4. Open uncertainties
5. Failed paths to avoid repeating
6. Next concrete action

Keep the recap concise unless the user asks for detail.

## Hallucination checks

Before making a key conclusion about a function, vulnerability, exploitability, protocol behavior, root cause, or remediation, check:

- What exact evidence supports this?
- Did I observe it directly, infer it, or assume it?
- Is there an alternate explanation?
- Can I verify it with a command, file inspection, debugger step, reproduction, log, source, or citation?

If confidence is low, mark the conclusion as tentative and make verification the next action.

## Stall detection

Treat the task as stalled if 2 consecutive cycles show any of these signs:

- No new evidence is collected.
- The same command, scan, payload, hypothesis, or decompiler path repeats without new information.
- The response summarizes but does not advance.
- A blocker remains vague.
- The next step is not concrete or testable.

When stalled, explicitly switch strategy.

## Strategy switching

When stalled, choose one pivot:

1. Return to the last verified fact.
2. Reduce the problem to the smallest testable subproblem.
3. Build a hypothesis tree and test the cheapest branch first.
4. Change viewpoint: static to dynamic, dynamic to static, black-box to source, source to logs, logs to reproduction.
5. Change tool or data source.
6. Inspect raw artifacts instead of summaries.
7. Create a minimal reproduction or minimal input.
8. Ask one targeted question only if progress truly depends on user-provided information.

Record why the old path failed and what changed in the new path.

## Operating loop

For long tasks, use this loop:

1. State the current subgoal in one sentence.
2. Take one concrete action.
3. Record new evidence.
4. Update hypotheses and failed attempts.
5. Check for hallucination risk.
6. Check for stall risk.
7. Choose the next concrete action.
8. Periodically update `work/mission-state.md` when useful.

## Response style

Be concise, technical, and action-oriented. Prefer concrete artifacts: file paths, commands, observed outputs, function names, offsets, endpoints, parameters, request/response evidence, and test results. End long investigative turns with a clear next action.
