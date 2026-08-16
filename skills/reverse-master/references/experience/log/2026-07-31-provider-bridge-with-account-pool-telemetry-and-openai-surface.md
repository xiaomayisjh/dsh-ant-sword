---
title: "provider bridge with account pool telemetry and OpenAI surface"
category: "web-protocol"
tags: ["provider-bridge", "openai-compatible", "account-pool", "telemetry", "desktop-client"]
created: 2026-07-31
source_task: "H:\Playground\qoder-research tools\qoder_api_bridge"
reusable_script: "tools\qoder_api_bridge\qoder_codex_bridge.py"
status: "candidate"
---

# provider bridge with account pool telemetry and OpenAI surface

## Applies When
- A desktop-client provider should be exposed as `/v1/models`, `/v1/chat/completions`, and `/v1/responses` without running the original IDE shell.
- Existing OAuth/account JSON and device-profile files are available, and provider requests require account headers plus stable device identity headers.
- The exact model endpoint may still be under capture, so endpoint paths and payload shape should be template-configurable.

## Evidence
- Runtime behavior: local fixture test validated model list conversion, quota conversion, chat conversion, vendor-system prompt removal, device header injection, and telemetry endpoint calls.
- Network/file/process evidence: fixture upstream observed model, quota, chat, status, plan, and heartbeat requests; chat request body omitted the vendor prompt and kept the Codex prompt.
- Static/source evidence: Qoder static catalog exposed candidate model/quota/status endpoints and local chat RPC method names; bridge code keeps the cloud chat path configurable.

## Workflow
1. Reuse the existing account-pool normalizer to load enabled account JSON files and extract bearer/device/security tokens plus device profiles.
2. Provide an OpenAI-compatible local surface: `/v1/models`, `/v1/chat/completions`, `/v1/responses`, and a quota endpoint.
3. Build provider headers from the selected account: bearer token, security token, machine id, machine token, machine type, machine code, client type, and extra headers.
4. Filter vendor-specific system/developer prompts using marker lists while preserving client prompts such as Codex/OpenAI prompts.
5. Convert OpenAI chat/responses bodies into a template provider payload with `requestId`, `sessionId`, `modelKey`, `messages`, `prompt`, and `stream`.
6. Add telemetry scheduler hooks before/after model requests and timer-based status/model/quota/heartbeat probes.
7. Keep endpoint paths in JSON config until a captured request provides the final cloud path and body contract.

## Validation
- Command: `python -m py_compile tools\qoder_api_bridge\qoder_codex_bridge.py tools\qoder_api_bridge\selftest_qoder_bridge.py`
- Command: `python tools\qoder_api_bridge\selftest_qoder_bridge.py`
- Expected decisive output: JSON with `"ok": true`, converted model id, converted quota availability, chat content, and fixture hit count including heartbeat.
- Sample or artifact hash: target-specific credentials and captures are kept in the project workspace only.

## Pitfalls
- Separate file-path root calculation from directory-path root calculation; `Path(__file__).parents[...]` and `HERE.parents[...]` differ by one level.
- Localhost tests through `urllib` may bypass proxy logic, so provider bridge tests should use direct fixture URLs rather than OS proxy behavior.
- Treat SSE conversion separately from blocking JSON; read event streams line by line and convert `data:{answer/content/text/delta}` to OpenAI chunks.
- Keep the cloud chat path configurable when static strings only show format candidates such as `/api/v2/service/pro/%s/%s`.

## Reusable Assets
- Script: `tools\qoder_api_bridge\qoder_codex_bridge.py`
- Config/template: `tools\qoder_api_bridge\bridge_config.sample.json`
- Test: `tools\qoder_api_bridge\selftest_qoder_bridge.py`

## Promotion Notes
- Promote to stable after a live capture confirms the final provider endpoint and the bridge is reused for another desktop-client provider.
