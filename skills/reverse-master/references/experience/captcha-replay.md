# Captcha SDK And Login Replay Experience

Use this when reverse work touches captcha SDKs, HAR-based login replay, SSO handoff, dynamic validation fields, or browser/runtime-only challenge logic.

## Decision Rules

| Signal | Route | Validation |
|---|---|---|
| `w`, `validate`, `captcha_output`, `pass_token`, `gen_time` from SDK | Use vendor SDK as local encryptor after locating submit boundary | `/verify` accepts generated fields |
| HAR contains login plus SSO ticket exchange | Split boot/session, challenge, login, SSO, app token, business API | A benign business API returns identity/report data |
| Challenge type rotates | Solver type, retries, dump dir, and provider command must be configurable | Multiple clean runs succeed |
| Static SDK search fails | Use request boundary, XHR/fetch breakpoint, or call stack from business code | Writer boundary found |

## Profile Fingerprints

Before reusing a saved profile, compare:

- provider style and endpoint family
- SDK URL and hash
- `captcha_id` or equivalent site key
- static path, gct path, asset hash
- decoded string table anchors
- internal submit function
- `/load` response keys
- `/verify` request keys

If any hard fingerprint differs, use old notes only as a rediscovery checklist.

## Minimal Workflow

1. Capture one complete browser flow as HAR.
2. Summarize request chain and cookies.
3. Prove challenge chain: load -> solver -> SDK submit -> verify.
4. Prove credential transform separately from captcha transform.
5. Prove SSO/app token exchange separately from login success.
6. Validate with a small benign business API.
7. Save profile fields, script path, config, and failure phrases.

## Artifacts To Save In Project Workspace

```text
analysis/
  har/
  sdk/
  images/
  solver-output/
  replay-config.json
  validation.json
```

Do not store long-lived cookies, real credentials, or target-specific solved tokens in the skill pack.

## Pitfalls

- Hand-forging SDK output before proving the SDK submit boundary.
- Reusing a profile without checking SDK hash and endpoint field shape.
- Treating `/verify` success as full business authentication.
- Not recording coordinate normalization for slider/click-order challenges.
- Mixing browser state and protocol state in one script, making failures impossible to localize.
