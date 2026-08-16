---
title: "Captcha RSA OAEP capacity and compact wire build validation"
category: "web-js"
tags: ["captcha-sdk", "rsa-oaep", "compact-wire", "build-validation"]
created: 2026-07-11
source_task: "Owned captcha SDK integration diagnosis"
reusable_script: ""
status: "candidate"
---

# Captcha RSA OAEP capacity and compact wire build validation

## Applies When
- A captcha SDK fetches and imports an RSA public key successfully but never sends the session-creation request.
- A source-to-source build rewrites a readable long-field protocol into a compact wire format.

## Evidence
- Runtime behavior: `importKey`, AES key generation, and key export succeed; RSA-OAEP encryption fails with `OperationError`.
- Network/file/process evidence: the public-key request returns 200, but no session POST appears until the RSA plaintext is reduced.
- Static/source evidence: a long public selector was included in the RSA plaintext; exact string replacements could rewrite the compact response path while retaining long request fields.

## Workflow
1. Instrument WebCrypto calls and record the first failed operation instead of labeling the whole flow as a decode failure.
2. Calculate the RSA-OAEP limit as `modulusBytes - 2 * hashBytes - 2`; RSA-2048 with SHA-256 allows 190 plaintext bytes.
3. Keep only secret session material, nonce, and freshness data inside RSA. Send an already-public site/front key beside the ciphertext and validate it server-side.
4. Preserve server compatibility with the legacy encrypted selector while clients migrate to the outer field.
5. For compact builds, assert required compact anchors and forbidden long-field anchors before minification or obfuscation.
6. Compute manifest hashes, SRI, build IDs, and content-hash filenames from final file bytes, after platform newline conversion and all wrappers are applied.
7. Validate the built artifact through `public-key -> session -> challenge`, then confirm decoded image dimensions and nonblank canvas pixels.

## Validation
- Command: run the compact build, syntax checks, SDK integration clients, and a clean browser request capture.
- Expected decisive output: session and challenge requests return 200; the session body uses one consistent wire format; image canvas/piece dimensions are nonzero.
- Sample or artifact hash: target-specific hashes intentionally omitted.

## Pitfalls
- HTTP 200 and valid Base64URL/SPKI do not prove the failure is decoding; inspect the next crypto operation.
- JavaScript syntax checks cannot detect a mixed long/compact protocol caused by partial textual replacement.
- Do not put unbounded public metadata inside a fixed-capacity RSA-OAEP plaintext.
- Hashing the pre-write string can produce invalid SRI metadata when the platform rewrites line endings, or make the content-hash filename disagree with the manifest.

## Reusable Assets
- Script: none; prefer build-time protocol assertions in the owning repository.
- Config/template: required/forbidden anchor checks plus an end-to-end browser request-chain test.

## Promotion Notes
- Promote to stable after clean reproduction or repeated reuse.
