# Research Log Template

Use this structure for candidate notes in `references/experience/log/`.

```markdown
---
title: short reusable lesson
category: captcha-replay | unpacking | deobfuscation | frida | ida | android | ios | python | js | other
tags: [ctf, js, geetest]
created: YYYY-MM-DD
source_task: project or challenge name
reusable_script: scripts/reusable/example
status: candidate
---

# Title

## Applies When
- Observable signal that should trigger this memory.

## Evidence
- Runtime behavior:
- Network/file/process evidence:
- Source or static evidence:

## Workflow
1. Minimal reproducible step.
2. Script or tool command.
3. Validation step.

## Reusable Assets
- Script:
- Config template:
- Output contract:

## Pitfalls
- Failure condition:
- False positive:
- Rollback point:

## Promotion Notes
- What must be reproduced before this becomes stable.
```

Use `scripts/reusable/new-research-entry.ps1 -Title "..." -Category js -Tags ctf,webpack` to create a filled copy.
