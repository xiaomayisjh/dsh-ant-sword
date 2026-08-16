# OSINT Module

## Enter When

- a CTF asks to establish a fact about a public webpage, domain, username, social post, image, location, archive, or public record
- the decisive work is source discovery and corroboration rather than active exploitation

## Required Inputs

- exact proposition to prove
- supplied clue and its original metadata/source
- permitted public-source scope
- expected answer/flag format and relevant time period

## Do

1. Decompose the proposition into independently verifiable facts.
2. Preserve source URLs, timestamps, archive snapshots, search terms, image crops, and metadata.
3. Choose `social-media.md`, `geolocation-and-media.md`, or `web-and-dns.md`.
4. Use multiple independent sources for identity or location claims.
5. Track source freshness, deleted/edited content, naming collisions, and uncertainty.
6. Stop when the challenge fact is proven; avoid unrelated personal-data collection.

## Produce

- evidence table with URL/source, captured time, fact, and confidence
- reconstruction of the clue-to-answer chain
- archived/cropped supporting artifacts when needed
- validated answer or precise remaining uncertainty

## Verification

- corroborate identity/location with a unique linking fact rather than name similarity
- verify coordinates, dates, timezones, and archive timestamps
- distinguish original content from reposts, mirrors, and generated media
- preserve enough context for a teammate to reopen the source

## Exit When

The requested public fact is independently supported and mapped to the expected answer format.

## Read

- `../../references/ctf/osint/index.md`
- exact source path from `../../references/routing.md`
