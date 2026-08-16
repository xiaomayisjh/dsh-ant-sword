# Cryptography Module

## Enter When

- the decisive weakness is in encryption, signing, hashing, randomness, algebra, protocol proofs, or encoding between mathematical objects and bytes
- another domain has already extracted exact ciphertext, key material, oracle behavior, or transform code

## Required Inputs

- all samples in original byte form
- exact encodings, endianness, padding, nonce/IV, parameters, and message boundaries
- encryption/signing/verifying equations or implementation
- oracle response semantics and query constraints when applicable

## Do

1. Normalize inputs and write the complete transform chain in order.
2. Identify the construction and select one focused reference from `references/ctf/crypto/`.
3. Test structural properties before brute force: nonce/key reuse, related messages, weak parameters, small roots, linearity, bias, state leakage, parser/verifier mismatch, or oracle behavior.
4. Build a minimal solver that preserves exact byte/integer conversions.
5. Record seeds, precision, lattice bounds/scaling, retry count, query count, and probabilistic success rate.

## Produce

- equations and parameter table
- weakness statement tied to observed samples
- complete solver with dependency and invocation details
- recovered plaintext/key/forgery and verification vector

## Verification

- re-encrypt, decrypt, sign, verify, or predict held-out output
- test the solver on all supplied samples, not only one favorable case
- use exact arithmetic where possible and document numeric tolerance where not
- reject readable plaintext that fails the original verifier or format checks

## Exit When

Recovered material passes the original construction's verification or is handed back to its source domain with exact provenance.

## Pivot When

- ciphertext/sample extraction is incomplete: return to Forensics, Web, or Reverse
- the actual weakness is parser/auth trust rather than math: `sec-web-api`
- constrained expression or jail mechanics dominate: `sec-misc`

## Read

- `../../references/ctf/crypto/index.md`
- exact construction path from `../../references/routing.md`
