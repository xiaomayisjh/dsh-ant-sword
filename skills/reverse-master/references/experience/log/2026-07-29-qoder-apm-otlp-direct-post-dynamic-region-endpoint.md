---
title: "Qoder APM OTLP direct post dynamic region endpoint"
category: "js-protocol"
tags: ["qoder", "apm", "otlp", "region-cache", "signature"]
created: 2026-07-29
source_task: "H:\\Playground\\qoder-research APM OTLP 403 Authentication validate failed"
reusable_script: "H:\\Playground\\qoder-research\\scripts\\qoder_client_sim.py claim-diagnosis --send-trace"
status: "candidate"
---

# Qoder APM OTLP direct post dynamic region endpoint

## Applies When
- Qoder Desktop APM/OTLP direct POST returns `403 Authentication validate failed` after the HMAC signature format has already been corrected.
- The direct poster is using product defaults such as `https://api2.qoder.sh/apm`, but the local Qoder client has selected a different dynamic inference region.

## Evidence
- Runtime behavior:
  - `https://api2.qoder.sh/apm/trace/opentelemetry/v1/traces` returned `403 Authentication validate failed`.
  - Local region cache selected `preferredInferenceNode.endpoint=https://api1.qoder.sh`.
  - `https://api1.qoder.sh/apm/trace/opentelemetry/v1/traces` returned HTTP 200 with the same signer family.
- Network/file/process evidence:
  - `%APPDATA%\Qoder\SharedClientCache\cache\cache.json` contains `regionConfig.preferredInferenceNode.endpoint`.
  - `%APPDATA%\Qoder\User\globalStorage\storage.json#telemetry.machineId` is the machine id used by `TraceTelemetryService.configureHeaders`.
- Static/source evidence:
  - `TraceTelemetryService` signs with salt `apm`, productVersion, machine id, method, URL pathname, request id, timestamp, and SHA256(contentLengthString).
  - The signature path must be the actual URL pathname, e.g. `/apm/trace/opentelemetry/v1/traces` when endpoint is `<inference>/apm`.

## Workflow
1. Read `%APPDATA%\Qoder\SharedClientCache\cache\cache.json`.
2. If `regionConfig.preferredInferenceNode.endpoint` exists, set `trace_base=<preferredInferenceNode.endpoint>/apm`.
3. Sign POST path from the final URL pathname, not the static suffix alone.
4. Read telemetry machine id from `%APPDATA%\Qoder\User\globalStorage\storage.json` key `telemetry.machineId`.
5. Validate with `qoder_client_sim.py claim-diagnosis --send-trace --execute` and inspect `apm_trace_otlp` status.

## Validation
- Command:
  - `python .\scripts\qoder_client_sim.py claim-diagnosis --source-secret .\experiments\oauth_poll_secret_*.json --simulate-events --send-trace --execute`
- Expected decisive output:
  - Report `region_cache.used=true`.
  - `trace_base` equals `<preferredInferenceNode.endpoint>/apm`.
  - `apm_trace_otlp.status=200`.
- Sample artifact:
  - `H:\Playground\qoder-research\experiments\claim_diagnosis_redacted_20260729-202824.json`

## Pitfalls
- A correct newline-separated HMAC can still hit 403 when sent to the wrong regional APM endpoint.
- The static product endpoint is only an initial default; the running client updates trace endpoint from dynamic inference region.
- Signing `/trace/opentelemetry/v1/traces` instead of `/apm/trace/opentelemetry/v1/traces` produces a different auth error class.

## Reusable Assets
- Script: `H:\Playground\qoder-research\scripts\qoder_client_sim.py`
- Added helper: `apply_region_cache_defaults()`

## Promotion Notes
- Promote after reproducing on another Qoder install or after a second region switch proves the same default-to-cache fix.
