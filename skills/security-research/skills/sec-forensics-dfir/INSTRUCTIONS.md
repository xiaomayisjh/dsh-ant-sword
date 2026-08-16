# Forensics and DFIR Module

## Enter When

- evidence is primarily a disk, memory image, packet capture, log set, registry hive, document, image, audio/video, peripheral capture, or recovered filesystem artifact
- provenance, timeline, carving, hidden data, or cross-source correlation is decisive

## Required Inputs

- original artifact path and acquisition context
- expected question or fact to establish
- relevant time window, timezone, host/user identifiers, and known environment
- explicit output directory for derived artifacts

## Do

1. Hash and preserve the original before extraction or conversion.
2. Identify actual container and embedded formats by magic and structure, not extension alone.
3. Record tool versions, profiles, offsets, timestamps, timezone, and every extraction transform.
4. Choose one artifact-focused reference from `references/ctf/forensics/`.
5. Build a normalized timeline and correlate decisive claims across file, memory, log, network, or metadata sources.
6. Export recovered objects with source path/offset/stream and hash.

## Produce

- inventory and original hash
- timeline or extraction chain
- derived artifacts with provenance and hashes
- decisive evidence mapping to the challenge question
- complete decoder/carver when manual transforms are repeated

## Verification

- reopen derived files with an independent parser when possible
- validate checksums, protocol framing, image dimensions/channels, archive members, and decoded lengths
- confirm timezone and clock drift assumptions
- distinguish deleted/stale/unallocated data from active runtime state

## Exit When

The requested fact or payload is recovered with provenance, or a precise extracted artifact is handed to Crypto, Malware, Reverse, Web, or OSINT.

## Pivot When

- recovered object is encrypted: `sec-crypto`
- recovered code/config/traffic is malicious: `sec-malware`
- compiled logic must be understood: `sec-reverse`
- public-source corroboration is needed: `sec-osint`

## Read

- `../../references/ctf/forensics/index.md`
- exact artifact path from `../../references/routing.md`
