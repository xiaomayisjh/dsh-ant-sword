---
title: "Protocol replay after captcha login needs post-login API header proof"
category: "web-js-protocol"
tags: ["geetest-v4", "protocol-replay", "post-login-api", "webpack-request-wrapper"]
created: 2026-06-30
source_task: "ThreatBook X pure protocol login and survey export"
reusable_script: ""
status: "candidate"
---

# Protocol replay after captcha login needs post-login API header proof

## Applies When
- A pure-protocol login succeeds through a captcha or SSO chain, but later business APIs still return wording such as `LOGIN`, `unauthorized`, `token missing`, or feature-gate errors.
- The frontend is a bundled Web app, and API requests pass through a shared request wrapper or interceptor that adds cookies, CSRF headers, user identity headers, or routed referers.
- The final deliverable must be Python `requests`/HTTP replay, while browser automation is allowed only for exploration or as a local SDK encryptor.
- Geetest v4 or a similar third-party captcha SDK produces an opaque verification field, and hand-forging that field would be slower than reusing the vendor SDK under a minimal local JS runtime.

## Evidence
- Runtime behavior: page login can render an authenticated initial state, while selected APIs fail until wrapper-added headers are replayed. A benign post-login endpoint returning account-specific or query-specific data is the proof point, not the login response alone.
- Network/file/process evidence: persisted cookie jar contains cross-host cookies and CSRF material; saved page HTML contains `window.__INITIAL_STATE__` with login identity; API probes show the exact server wording before and after adding suspected headers.
- Static/source evidence: the bundled request wrapper reads named cookies such as CSRF/session cookies and injects them as headers along with a user identity header and `credentials: include`; business modules call the wrapper for sensitive endpoints.

## Workflow
1. Split the flow into boot, captcha challenge, primary login, SSO/callback/token exchange, page initial-state load, and post-login business API validation. Do not mark the session usable until the business API phase succeeds.
2. For Geetest v4, first prove `/load -> visible solver -> local SDK submit -> /verify -> validate fields`. Use the SDK as a local encryptor for opaque fields such as `w`; do not hand-forge it before the submit boundary is known.
3. Save challenge artifacts in the project workspace only: `/load` payload, images, solver output, local SDK helper input/output, `/verify` response, and normalized validate object. Do not store solved tokens or account secrets in skill storage.
4. After login, request the target app page and parse `window.__INITIAL_STATE__`. Persist only reusable session facts needed for replay, such as `user_id`, page csrf, and login boolean; keep long-lived cookies/tokens in the project state file.
5. If some APIs succeed but sensitive/core APIs return `LOGIN`, search the frontend bundle for the exact endpoint and its imported request module. Then inspect that wrapper for cookie reads and header injection.
6. Reproduce wrapper headers one at a time: base cookies only, CSRF header, secondary CSRF/session header, user identity header, referer/origin, and optional XHR header. Record which combination flips the response from auth failure to success.
7. Keep endpoint spelling and parameter names exactly as served by the frontend, including typos. If the bundle calls `survery`, `pagesize`, or other nonstandard names, replay those exact names rather than normalizing them.
8. Validate pagination from real responses. Check default page size, maximum accepted `pagesize`, total-count field, empty-page behavior, and whether the frontend paginates locally or by API.

## Validation
- Command: run a session check that loads the real app page and confirms authenticated initial state, then run one benign business API with the wrapper-equivalent headers.
- Expected decisive output: the same endpoint that previously returned `LOGIN` returns `response_code: 0` or equivalent success and includes query-specific data, not merely a generic success shell.
- Command: run the final protocol exporter with a small page limit and then a full export.
- Expected decisive output: exported row count equals the API `totalCount`; raw pages include the metadata and every paged response; JSON/CSV files contain nonempty business fields from the first row.
- Additional check: compile or lint the replay scripts after edits, preferably with bytecode/cache output redirected outside read-only workspaces when needed.

## Pitfalls
- Treating login success, `/verify` success, or a valid-looking cookie jar as proof that post-login business APIs are usable.
- Copying random browser headers before locating the request wrapper. This hides the actual dependency and makes future breakage harder to diagnose.
- Ignoring identity headers derived from page state because cookies appear sufficient. Some APIs require both cookies and explicit user/context headers.
- Trusting source comments or friendly endpoint names over live behavior. Runtime API spelling and parameter names win over expected English spelling.
- Using page-size values from generic exporter code. Some endpoints silently reject or error on values other than the frontend's exact `pagesize`.
- Letting shell quoting remove syntax quotes from search queries. Prefer `--url` parsing, defaults, config files, or explicit escaping for query languages that use quotes.

## Reusable Assets
- Script: project-local Python `requests` client with cookie jar persistence, `window.__INITIAL_STATE__` parser, wrapper-equivalent API header helper, retrying JSON request helper, and page-by-page exporter.
- Config/template: store endpoint base, query, page size, retry count, timeout, state path, and output prefix as CLI parameters; never bake credentials or long-lived tokens into the reusable skill.

## Promotion Notes
- Promote to stable after the same pattern is reproduced on another Web app where post-login APIs require frontend-wrapper headers beyond the cookie jar.
- Stable candidate rule: "After captcha/SSO login replay, always validate one real business API and inspect the app request wrapper before assuming the session is complete."
