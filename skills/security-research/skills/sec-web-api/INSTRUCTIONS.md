# Web and API Module

## Enter When

- the decisive surface is HTTP, WebSocket, GraphQL, browser state, an API, admin bot, upload, webhook, or identity flow
- source includes routes, templates, frontend bundles, controllers, middleware, serializers, or proxy configuration

## Required Inputs

- base URL or source root
- available role/session/credential state
- one normal user action and its expected response
- reset method for state-changing tests

If any item is unavailable, collect it passively before fuzzing.

## Do

1. Capture entry HTML, response headers, cookies, browser storage, loaded assets, service workers, and one normal request chain.
2. Build a route and trust-boundary map: browser, CDN/proxy, middleware, application, async worker, database, internal service.
3. Compare UI-submitted fields and methods with what the backend parser accepts.
4. Select one candidate family from `references/routing.md`; read `references/ctf/web/index.md` plus at most three matching topic files.
5. Prove the smallest primitive before chaining: object read, role bypass, internal request, template evaluation, parser disagreement, file write/read, or browser sink.
6. Preserve cookies, origin/referer, content type, redirect history, timing, and account role with every decisive request.

## Produce

- route/trust-boundary map
- normal and minimal failing request/response pair
- proven primitive with preconditions
- complete reproducer or exploit when requested
- backend effect and reset evidence

## Verification

- replay from a clean low-privilege or unauthenticated state
- change one field at a time and include a negative control
- verify a backend object/action or privileged browser effect, not just frontend text
- after login or token forgery, call one read-only business endpoint to confirm session usability

## Exit When

The objective is reproduced, or the exact remaining blocker and receiving module are named.

## Pivot When

- JS/WASM/signature logic blocks progress: `sec-reverse`
- custom token math is decisive: `sec-crypto`
- native parser corruption or sandbox becomes decisive: `sec-pwn-native`
- historical logs/captures/backups are decisive: `sec-forensics-dfir`

## Read

- `../../references/ctf/web/index.md`
- exact topic paths from `../../references/routing.md`
- `../../references/pentest.md` for broader authorized assessment context

### Deep references (API security, merged)

进入 REST/GraphQL API 或 JWT/OAuth 深度测试阶段时按需取用：

- `references/api-deep/rest-graphql-testing.md` — REST/GraphQL API 测试方法论
- `references/api-deep/jwt-oauth-testing.md` — JWT/OAuth 令牌与授权流测试
- `references/api-deep/_api-security-workflow.md` — 完整 API 安全作业流程
- 实战 payload 见 `../../../pentest-tools/src-hunter/references/playbooks/api-rest.md`、`oauth-saml-jwt.md`、`graphql.md`
