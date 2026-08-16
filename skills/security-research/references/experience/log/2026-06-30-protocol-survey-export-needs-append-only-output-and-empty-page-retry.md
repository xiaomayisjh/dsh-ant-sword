---
title: "Protocol survey export needs append only output and empty page retry"
category: "web-api"
tags: ["protocol-replay", "survey-export", "jsonl", "captcha", "resume"]
created: 2026-06-30
last_validated: null
source_task: "ThreatBook survey pure protocol export: target_url, stats, append output, auth refresh"
reusable_script: ""
status: "deprecated"
---

# Protocol survey export needs append only output and empty page retry

## Deprecation Notice

The original task scripts and fixtures were not retained with this entry, so its commands cannot be reproduced from the skill package. Keep the design notes as historical context only; create a new candidate with a generic fixture before reuse or promotion.

## Applies When
- A pure-protocol export script replays a web mapping/search API and must survive interruption.
- The browser UI shows a "jump/open target" link that is not present in API rows, but can be reconstructed from protocol/host/port fields.
- The UI shows top summary counters fed by side aggregation endpoints rather than the page-list response only.
- A business API may intermittently return login/risk/captcha wording, or a page endpoint can briefly return `totalCount:0` while summary endpoints still show results.

## Workflow
1. Keep the browser out of the business path. Use saved cookies/tokens and reproduce API headers, CSRF headers, Referer, and browser-like Sec-Fetch/Sec-CH-UA headers in the protocol client.
2. Fetch summary/aggregation endpoints before pages. Preserve raw responses as append-only JSONL so later field mapping can be audited.
3. Add derived row fields before writing. For survey-style rows, build `target_url` from `suveryDomain or ip`, `protocol`, and `port`; omit only default `http:80` and `https:443` ports.
4. Write rows append-only to `.jsonl` first, flush after each page, and append CSV rows with a stable field list. Generate full `.json` only at finalization by reading JSONL back.
5. Resume from existing JSONL count and page size. If the data source is volatile, treat resume as best-effort and use a fresh run for exact snapshots.
6. If page data is empty but summary/aggregation counters or `totalCount` prove there should be results, retry the page endpoint with equivalent parameter orders before marking the export complete. Keep request retry counts and empty-page retry counts as CLI/config options, not constants.
7. On `LOGIN`, captcha, Geetest, or risk wording, record the response prefix to a risk-events JSONL and refresh the protocol session via the known login + captcha solver path when credentials are available.

## Validation
- Command: unavailable; original scripts were not retained.
- Expected decisive output: JSONL and CSV contain the same row count; CSV imports without duplicate columns; first rows include `target_url`; meta contains UI counter labels and values.
- Observed transient: one run returned page payload `{"data":{"totalCount":0},"response_code":0}` while `summaryCount`/aggregations still showed tens of thousands of results. Treat this as retryable, not as a completed empty export.
- Observed implementation pitfall: if the list payload contains `totalCount > 0` but `details` is empty, returning it to the main export loop makes the caller mark the export complete. Treat that case as an empty-page retry condition while saved row count is still below `totalCount`.

## Pitfalls
- Do not trust the page-list endpoint alone for "no results"; check summary/aggregation counters first.
- Do not rewrite CSV on every page if the requirement is interruption safety. Use JSONL as the durable source of truth and keep CSV append-only with a stable header.
- Avoid storing real credentials, cookies, or long-lived tokens in reusable skill notes.
- Optional heavy aggregation endpoints can fail with service-side timeout wording such as `-4 耗时太长`; preserve the event but do not block row export if core stats are available elsewhere.
- Retrying only connection timeouts is too narrow for this API. Also retry HTTP `408/429/5xx` and temporary JSON payloads such as `response_code=-4`, `耗时`, `稍后`, `繁忙`, or equivalent "try again" wording.

## Reusable Assets
- Script: unavailable
- Notes: The implementation pattern is reusable for other authenticated search/export APIs: append JSONL rows, append raw-page JSONL, keep a meta JSON, and synthesize final JSON at the end.

## Promotion Notes
- Do not promote this entry. Recreate the workflow against a synthetic fixture, retain the implementation, and create a new candidate with a clean validation record.
