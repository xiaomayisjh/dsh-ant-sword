# Source Provenance and Maintenance

## Upgrade Basis

This skill was restructured on 2026-07-10 from the existing `security-research` skill and the security/CTF skills present in the `Creater-Studio` workspace.

The upgrade uses these sources as design inputs:

| Source | Use in this package |
|---|---|
| `ctf-web` | copied under `references/ctf/web/` and indexed by exact bug family |
| `ctf-pwn` | copied under `references/ctf/pwn/` and indexed by primitive/runtime |
| `ctf-reverse` | copied under `references/ctf/reverse/` as bundled fallback knowledge |
| `ctf-crypto` | copied under `references/ctf/crypto/` and indexed by construction |
| `ctf-forensics` | copied under `references/ctf/forensics/` and indexed by artifact type |
| `ctf-malware` | copied under `references/ctf/malware/` and indexed by sample/protocol type |
| `ctf-misc` | copied under `references/ctf/misc/` and indexed by constraint family |
| `ctf-osint` | copied under `references/ctf/osint/` and indexed by evidence source |
| `ctf-ai-ml` | copied under `references/ctf/ai-ml/` and indexed by attacked plane |
| `ctf-writeup` | copied under `references/ctf/writeup/` and complemented by `reporting.md` |
| `solve-challenge` | category heuristics and cross-domain pivot concepts; broken installer link was not copied |
| `reverse-master-skills` | single-entry routing, minimal reference loading, and output-contract patterns; large tools were not copied |
| `rev-js-workflow` | stage enter/produce/exit contracts and evidence-gate pattern |
| `mission-keeper` | Observed/Inferred/Assumed labels, stall detection, and strategy switching; package code was not copied |
| `skill-creator` | progressive disclosure, structural validation, evaluation, and packaging workflow |

## Bundled Knowledge

The `references/ctf/` tree contains 10 categories and 117 Markdown files copied from the workspace sources. Category root files were renamed from `SKILL.md` to `index.md` so this package has one importable root `SKILL.md`.

The original category frontmatter remains as source metadata inside reference files. It is not interpreted as nested skill metadata.

## Preserved Existing Assets

The previous reusable scripts and experience entries were retained when they met the new scope and provenance rules:

- `scripts/reusable/har_summary.py`
- `scripts/reusable/pe_entropy_triage.py`
- `scripts/reusable/new-experience-entry.ps1`
- `references/experience/`
- general domain references such as `pentest.md`, `malware.md`, and `ai-security.md`

The broad legacy `ctf.md` remains available for backward reference but is no longer the primary CTF router.

## Removed Assets

The upgrade intentionally excludes:

- `scripts/utils.dll`, an unsigned binary with no source, license, vendor metadata, or documented need in the active workflow
- the old output-filter reference and instructions that renamed or encoded normal security terminology
- hard-coded legacy installation-specific invocation paths
- assumptions that every public-looking asset is automatically in scope without regard to the task's stated authorization and evidence

The pre-upgrade snapshot is stored outside the distributable skill in `security-research-workspace/skill-snapshot/` for comparison and incident review.

## Maintenance Rules

1. Keep only one root `SKILL.md`.
2. Put internal domain execution contracts in `skills/*/INSTRUCTIONS.md`, never nested `SKILL.md` files.
3. Keep the root skill below 500 lines and route detailed material progressively.
4. Add a route before adding a new reference; unindexed knowledge is effectively unavailable.
5. Add executable code to `scripts/` with inputs, outputs, dependencies, safe defaults, known limits, and an example.
6. Do not add opaque executables or shared libraries. If a binary asset is unavoidable, add source provenance, license, hash, version, purpose, and an explicit opt-in invocation path.
7. Run `scripts/validate_skill.py`, script tests, official `quick_validate.py`, and evaluation prompts before packaging.
8. Preserve source license notices when importing new external material.

## Source Refresh

When refreshing a category from the workspace:

1. diff the existing category directory against the source
2. copy Markdown only unless executable assets are separately reviewed
3. rename the category root `SKILL.md` to `index.md`
4. update `routing.md` for new or renamed topics
5. run the link and route validators
6. rerun at least the category's routing and behavior evaluations
7. record the refresh date and source revision/hash when available
