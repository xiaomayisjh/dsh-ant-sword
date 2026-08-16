---
title: "Legacy COSY provider port parity"
category: "protocol-replay"
tags: ["go-to-python", "cosy", "sse", "compatibility"]
created: 2026-08-04
source_task: "Local provider protocol migration"
reusable_script: "project scripts/qoder_direct_api.py"
status: "candidate"
---

# Legacy COSY provider port parity

## Applies When
- A working provider client in one language must be reimplemented directly in another language.
- A superficially similar endpoint fails signature checks even though account tokens are valid.

## Evidence
- Runtime behavior: the old endpoint returned HTTP 403 with a signature error; the parity port returned HTTP 200, exact text, reasoning, and tool calls.
- Network/file/process evidence: the successful request used one Python process and no provider executable or forwarding listener.
- Static/source evidence: success required keeping endpoint generation, sign-path normalization, client version, custom body encoding, encrypted identity, and the nested SSE envelope as one contract.

## Workflow
1. Record one failed request and one successful reference request as fixed checkpoints.
2. Build a field matrix for host, request path, query, sign path, version headers, body bytes, authorization construction, and response envelope.
3. Port low-level codecs and crypto helpers first; compare deterministic intermediate values where possible.
4. Port the exact request template and message/tool/image mappings without mixing fields from the failed protocol generation.
5. Validate text, reasoning, tool calls, usage, JSON responses, and each streaming facade.
6. Prove process independence by checking the retired executable is absent and no related process is running.

## Validation
- Command: compile plus offline double-envelope fixture, followed by literal-output live requests.
- Expected decisive output: old HTTP 403 versus new HTTP 200, exact requested text, and a structured function call.
- Sample or artifact hash: store target-specific hashes in the active project verification record, not in this skill note.

## Pitfalls
- A valid bearer token does not prove the model endpoint signature contract.
- Signing the host, query, or route prefix when the reference signs only the service path causes misleading authentication failures.
- A nested SSE body must be parsed twice; generic recursive text extraction loses tool fragments and usage.
- Buffered compatibility SSE must close its local connection after the terminal event.

## Reusable Assets
- Script: project scripts/qoder_direct_api.py
- Config/template: baseline/modified command pair, redacted verification JSON, hash manifest, and destination-root rollback script.

## Promotion Notes
- Promote to stable after clean reproduction or repeated reuse.
