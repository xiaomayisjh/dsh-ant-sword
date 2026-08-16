# Evidence-Driven Workflow

## Lifecycle

Use this lifecycle for CTF and authorized security research:

```text
intake -> triage -> evidence -> primitive -> chain -> verify -> report -> retain
```

The lifecycle is not strictly linear. New evidence may return the task to an earlier stage. Record why the previous hypothesis was invalidated instead of silently changing the story.

## 1. Intake

### Enter when

- a new task, artifact, target, or question arrives
- the success condition or scope is ambiguous
- a resumed task lacks reliable state

### Do

- extract the objective, expected artifact, flag format, target, credentials, constraints, and known failed attempts
- create a scope card from `scope-and-evidence.md`
- identify which inputs are available now and which are merely described
- assign complexity:
  - `L1`: one artifact or transparent path
  - `L2`: one domain with a hidden boundary or simple state
  - `L3`: multiple stages, runtime dependencies, or cross-domain chain
  - `L4`: adversarial protection, distributed state, repeated resets, or several plausible routes

### Produce

- one-sentence objective
- explicit success condition
- input and scope list
- first concrete action

### Exit when

The next action can produce evidence rather than more general discussion.

## 2. Triage

### Enter when

The real file type, service shape, execution entry, build, or primary category is unknown.

### Do

- inventory filenames, sizes, hashes, magic, timestamps, archive members, and metadata
- inspect manifests, startup files, routes, imports, strings, sections, and service banners
- choose one primary domain and at most two supporting domains
- state what observation would change the route

### Produce

- artifact manifest
- primary and secondary route with matched evidence
- short list of highest-value unknowns

### Exit when

There is enough evidence to choose a domain module and a narrow boundary to trace.

## 3. Evidence

### Enter when

- the request, call, state, parser, crash, transform, or provenance chain is still guessed
- source and runtime disagree
- several hypotheses exist but none has a decisive observation

### Do

- capture one normal end-to-end sample
- trace input to the first decisive branch, mutation, sink, or transform
- label claims Observed, Inferred, or Assumed
- save the trigger action, state, raw input, raw output, time, build, and tool version

### Produce

- a real chain with named boundaries
- an evidence ledger
- a falsifiable hypothesis for the smallest useful primitive

### Exit when

The next blocker is creating or validating a primitive, not discovering where behavior occurs.

## 4. Primitive

### Enter when

A candidate weakness, controllable value, oracle, decode path, corruption, or trust boundary is located.

### Do

- reduce the proof to one effect: one bit leak, one file read, one role change, one controlled return, one decrypted block, one recovered key byte, one carved artifact
- change one variable at a time
- define positive and negative controls
- identify environmental constraints and destructive side effects

### Produce

- minimal reproducer
- input-to-effect explanation
- success, failure, and reset conditions

### Exit when

The primitive repeats and its capability is known precisely.

## 5. Chain

### Enter when

The primitive is proven but the challenge objective needs additional state transitions or domains.

### Do

- list each step, required state, produced artifact, and failure recovery
- minimize dependencies and request count
- validate each handoff between domains
- preserve intermediate values needed for replay

### Produce

- ordered chain
- complete script or exact command sequence
- checkpoint output for every decisive transition

### Exit when

The target effect or flag source is reachable from a known baseline.

## 6. Verify

### Enter when

The solution appears to work but could be stale state, chance, cache, a decoy, or environment-specific.

### Do

- reset or use a clean instance
- replay with fixed inputs and recorded versions
- compare intermediate checkpoints, not only final text
- run a negative control and at least one alternate sample when feasible
- validate flag candidates by source, format, uniqueness, and intended workflow

### Produce

- validation record
- exact reproduction command
- artifact hashes and expected decisive output
- residual uncertainty

### Exit when

Another researcher can reproduce the result without relying on hidden session state.

## 7. Report

### Enter when

The technical conclusion is verified or the investigation must hand off with a clearly bounded blocker.

### Do

- lead with outcome
- include only decisive evidence in the main report
- link to full artifacts instead of pasting long logs
- distinguish confirmed impact from plausible impact
- include failed routes that would otherwise be repeated

### Produce

A writeup, finding, analysis report, extraction result, or handoff matching `reporting.md`.

### Exit when

The result, evidence, verification, and next action are clear to a teammate.

## 8. Retain

### Enter when

- a script, command sequence, detection, pitfall, environment fix, or decision rule is likely reusable
- the same work has been repeated
- a tool limitation or misleading signal was proven

### Do

- create a candidate entry with `scripts/reusable/new_experience_entry.py`
- remove task secrets and unrelated environment details
- include applies-when signals, counterexamples, versions, validation, and promotion conditions
- put executable helpers in `scripts/reusable/`

### Produce

A candidate experience entry or tested reusable script.

### Exit when

The entry is indexed, reproducible, and does not contain sensitive task state.

## Domain First Passes

### Web / API

1. Save entry HTML, headers, cookies, storage, service worker, loaded scripts, and one normal flow.
2. Extract routes from served assets and compare UI fields with backend-accepted fields.
3. Map authentication, authorization, object ownership, async jobs, uploads, callbacks, exports, and internal fetches.
4. Test one trust boundary at a time: parser mismatch, access control, injection, file path, template, deserialization, proxy header, redirect, or browser sink.
5. Verify through the backend effect, not only frontend output.

### Pwn / Native

1. Record binary hash, architecture, loader, libc, mitigations, protocol, and expected process lifetime.
2. Reproduce a deterministic crash or leak and calculate exact offset/width/endian assumptions.
3. Name the primitive: read, write, control flow, allocation overlap, format read/write, syscall, or sandbox escape.
4. Build the smallest chain that respects bad bytes, stack alignment, calling convention, seccomp, and I/O framing.
5. Test locally with matching runtime, then remote with timeouts and synchronization logged.

### Reverse

1. Identify format, architecture, packer, entry, imports, strings, sections, resources, and likely data boundaries.
2. Follow xrefs and runtime callers around a high-value boundary rather than reading linearly.
3. Recover only the shell that blocks the current proof.
4. Compare dynamic and static facts; account for module load and generated code.
5. Validate unpacked/decompiled output and recovered algorithms with fixed checkpoints.

### Crypto

1. Normalize every value into explicit bytes, integer representation, endianness, and encoding.
2. Write the encryption/signing/verification equations before selecting an attack.
3. Identify reused randomness, related messages, algebraic structure, oracle response, weak parameters, or state leakage.
4. Validate recovered material by encryption, decryption, signing, verification, or known vector.
5. Record probabilistic parameters, seeds, retries, precision, and bounds.

### Forensics / DFIR

1. Hash and preserve the original.
2. Identify container, filesystem, capture, image, database, log, and compression formats.
3. Build a normalized timeline with timezone and clock assumptions.
4. Correlate at least two evidence sources for decisive claims.
5. Export recovered objects with provenance and hashes.

### Malware

1. Perform static triage before execution: headers, imports, strings, resources, packer, signatures, config candidates.
2. Use an isolated, resettable runtime when dynamic analysis is needed.
3. Trace persistence, process, filesystem, registry, network, injection, and configuration behavior.
4. Separate observed IoCs from generic library artifacts and decoys.
5. Test YARA/Sigma/network detections on the sample and at least one benign counterexample.

### OSINT

1. Define the exact fact to establish and the allowed public sources.
2. Preserve URLs, timestamps, archive snapshots, image crops, and metadata.
3. Use independent corroboration; do not merge similarly named identities without a linking fact.
4. Record uncertainty and source freshness.
5. Stop when the challenge fact is proven; do not collect unrelated personal data.

### AI / ML

1. Identify the attacked plane and success metric.
2. Freeze model/version, prompt/template, tool permissions, dataset split, seed, and query budget.
3. Establish a benign baseline and negative controls.
4. Change one attack variable per experiment and store structured results.
5. Re-evaluate against held-out data or a clean Agent session.

## Stall Detection

Treat the task as stalled when two consecutive cycles produce no new evidence, repeat the same command/payload, or leave the blocker untestable.

Switch strategy explicitly:

1. return to the last Observed fact
2. reduce to the smallest falsifiable question
3. test the cheapest branch of a hypothesis tree
4. switch static/dynamic, black-box/source, client/server, or disk/memory/network viewpoints
5. inspect raw artifacts rather than summaries
6. use a different tool to verify the same fact
7. reset state and replay one narrow flow

Record what changed so the old failed path is not repeated unchanged.
