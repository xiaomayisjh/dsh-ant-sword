# Reporting Module

## Enter When

- a solution, finding, sample analysis, extraction, detection, or investigation must be handed to another person
- the task is verified or blocked on one exact missing dependency
- the user asks for a CTF WriteUp, 题解, 解题报告, 复盘, or submission material, including when only part of the solve record is available

## Offer Proactively

When a CTF challenge reaches a validated flag (clean-baseline reproduction passed), proactively ask the user whether to write a WriteUp before the exploration trail goes stale — the session still holds the real commands, requests, outputs, and pivots, so a writeup composed now is complete and accurate rather than reconstructed later. Ask once; if declined, do not repeat. Do the same when a challenge is abandoned but has a reusable partial trail worth archiving.

## Required Inputs

- success condition and current handoff state
- decisive evidence IDs and artifact paths
- reproduction command, environment, and checkpoints
- invalidated hypotheses and residual uncertainty
- for CTF WriteUps: challenge metadata, the actual investigation trail, decisive commands/output, final solver or Exp, validated flag, and the real scope of AI assistance

## Do

1. Select the matching format from `references/reporting.md`.
2. For a CTF WriteUp, also read `../../references/ctf/writeup/index.md` and start from `../../assets/templates/ctf-writeup.md`. Save every CTF WriteUp under the challenge workspace as `writeups/<challenge-slug>/writeup.md`; keep the solver/Exp in the same subdirectory and derived artifacts under `writeups/<challenge-slug>/artifacts/`. Do not scatter writeups or solver scripts across the project root. Create or update the master index `writeups/README.md` (from `../../assets/templates/writeups-index.md`) with a row for the challenge.
3. Lead general reports with the verified outcome. For a WriteUp, preserve the evidence-backed reasoning order so the reader can see why each next action was taken.
4. Separate Observed facts, Inferred conclusions, and Assumed/open items during drafting; express them as normal technical prose unless explicit evidence labels improve clarity.
5. Include only decisive log lines; link to raw artifacts.
6. Make reproduction start from a clean/reset baseline.
7. For CTF flags, verify format, source, uniqueness, and intended path.
8. Never invent commands, output, dead ends, timestamps, tool versions, personal reactions, or first-person actions. Mark missing facts as unrecorded and request them only when they are essential.
9. Write naturally by connecting observation, judgment, action, and result; lead with the detail that drew attention, vary sentence and paragraph length, and let transitions carry cause. Avoid AI-tells (template openings, `综上所述`/`值得注意的是`, uniform bullets, predict-then-restate padding). Do not simulate human authorship with deliberate errors, fake hesitation, slang, or detector-evasion tricks — a real reproducible process is the strongest signal of human authorship. Also make it effective: open with a one-line attack summary, give the terrain up front (checksec/hash/params/routes as the category needs), and attach "which means…" to each decisive excerpt instead of pasting blocks then explaining. Humor and personal voice are welcome when they sit on real events (self-deprecation about real time spent, a dry jab at the challenge's real nature, a theme pun, an honest "mistakes" recap of dead ends actually walked); never manufacture a struggle or timeline for a laugh, keep jokes sparse and commands exact, and soften the tone for organizer submissions. See `../../references/ctf/writeup/index.md` (自然写作规范 → 让 writeup 更有效 / 正反示例对照 / 幽默与个人风格) for worked before/after examples.
10. Include a concise, accurate AI 使用说明 that names substantive assistance as well as organization or wording help; do not claim no AI use when AI contributed. When work was genuinely author-driven with AI as a conversational advisor, state it as 对话式/顾问式 AI 辅助; do not misreport the assistance mode to fit reviewer preference.
11. For findings, separate demonstrated impact from hypothetical extensions.

## Produce

- concise result/report or an evidence-backed, process-oriented CTF WriteUp
- for a CTF WriteUp: `writeups/<challenge-slug>/writeup.md` plus its solver/Exp and `artifacts/`, and an updated `writeups/README.md` master index
- reproduction and validation record
- artifact/evidence index
- next action only when unresolved work remains
- for long or cross-team work, a `research-result.json` matching `../../schemas/research-result.schema.json`

## Verification

- commands and paths exist
- hashes and versions match the analyzed artifacts
- expected checkpoints are stated
- no unrelated credentials, tokens, private keys, or local secrets are retained
- another researcher can follow the report without hidden context
- a CTF WriteUp contains 题目信息、题目分析、解题思路、解题过程、解题代码 and AI 使用说明, or explicitly marks unavailable fields
- the CTF WriteUp lives at `writeups/<challenge-slug>/writeup.md` (not the project root) and is listed as a row in `writeups/README.md`
- every quoted command, output, decompiler excerpt, request, and claimed dead end is traceable to the session, user notes, or saved artifacts
- the AI disclosure matches the assistance actually provided
- structured results pass `../../scripts/validate_result.py`

## Exit When

The handoff is `validated` or `blocked` with one precise missing input/dependency.

## Read

- `../../references/reporting.md`
- `../../references/ctf/writeup/index.md` for competition-style writeups
