---
title: "mitmproxy account pool with Windows proxy snapshot restore"
category: "web-protocol"
tags: ["mitmproxy", "windows-proxy", "desktop-client", "account-pool", "device-profile"]
created: 2026-07-31
source_task: "H:\Playground\qoder-research tools\qoder_proxy_pool"
reusable_script: "tools\qoder_proxy_pool\qoder_proxy_gui.py"
status: "candidate"
---

# mitmproxy account pool with Windows proxy snapshot restore

## Applies When
- A Windows desktop Electron/Chromium client must be routed through a local mitmproxy add-on while preserving the user's existing system proxy such as Clash.
- The tool needs an account/profile pool stored as JSON files, with each imported OAuth callback bound to a fresh local device profile.
- The client may reuse an already-running Chromium process, so process restart and explicit proxy flags are needed for stable capture.

## Evidence
- Runtime behavior: local fixture sent user/plan/model/quota/telemetry requests through a real `mitmdump.exe` process; add-on injected device and credential headers, rewrote selected JSON responses, and short-circuited telemetry to `{}`.
- Network/file/process evidence: raw HTTP absolute-URI calls to `127.0.0.1:proxy_port` avoided Windows localhost proxy bypass during validation; upstream fixture received four business requests and did not receive the telemetry shortcut request.
- Static/source evidence: account normalization, request injection, response rewrite, Windows registry proxy snapshot/restore, and Qoder launch flags are implemented under the project workspace.

## Workflow
1. Normalize account JSON: recursively extract `redirect_url`, OAuth callback fields, and token-like values; preserve `extra` exactly; generate a fresh device profile if one is missing.
2. Start mitmproxy with add-on options for account path, log path, compat/observe mode, and telemetry behavior.
3. Before switching Windows proxy, snapshot `HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings` values: `ProxyEnable`, `ProxyServer`, `ProxyOverride`, `AutoConfigURL`, `AutoDetect`.
4. If no upstream is typed in the GUI, parse the previous `ProxyServer` snapshot and run mitmproxy in upstream mode so the chain is `client -> local mitm -> old system proxy -> target`.
5. Launch the Electron client with explicit `--proxy-server=http://127.0.0.1:PORT`, local bypass list, environment proxy variables, and `--disable-quic`; stop stale client processes first when the GUI option is selected.
6. On stop, close mitmproxy and restore the registry snapshot; keep a disk snapshot for a manual restore button after abnormal GUI exits.

## Validation
- Command: `python -m py_compile tools\qoder_proxy_pool\pool_core.py tools\qoder_proxy_pool\qoder_proxy_addon.py tools\qoder_proxy_pool\qoder_proxy_gui.py`
- Command: run a local HTTP fixture through the real `mitmdump.exe` and assert fixed checkpoints.
- Expected decisive output: `ok: true`, status list all `200`, upstream hit count equals business-request count, telemetry response body equals `{}`, device header equals generated profile, Authorization is present, request body device fields are rewritten, and response fields show the configured compat values.
- Sample or artifact hash: target-specific fixtures are transient and kept out of durable skill storage.

## Pitfalls
- Python `urllib` and Windows proxy settings can bypass proxies for localhost even when an explicit proxy handler is configured; raw socket requests with an absolute URI give a better local fixture.
- If account normalization treats an existing `extra` object as an unknown key, host-marker configuration becomes nested under `extra.extra`; preserve and merge `extra` explicitly.
- `python -m mitmproxy.tools.main` may exit immediately in some installs; prefer discovered `mitmdump.exe` from PATH, Python Scripts, or user-base Scripts, then use the Python entrypoint only as fallback.
- If the Electron client is already running, a new launch may attach to the old process and skip new proxy flags; end existing process tree before launching through the managed proxy.

## Reusable Assets
- Script: `tools\qoder_proxy_pool\qoder_proxy_gui.py`
- Config/template: `tools\qoder_proxy_pool\accounts\sample_account.json`

## Promotion Notes
- Promote to stable after the proxy snapshot/restore workflow is reproduced on a second Windows machine or reused for another Electron client.
