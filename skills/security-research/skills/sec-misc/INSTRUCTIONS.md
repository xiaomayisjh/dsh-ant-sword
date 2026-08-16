# Miscellaneous CTF Module

## Enter When

- the task is a jail, encoding chain, esolang, RF/SDR problem, custom game/VM, DNS puzzle, constraint problem, container puzzle, or genuinely cross-category challenge
- no single Web/Pwn/Crypto/Reverse/Forensics route explains the decisive constraint

## Required Inputs

- exact parser/service behavior or original artifact
- allowed characters, operations, messages, timing, or state transitions
- win/escape/decode success condition
- sample input/output pairs

## Do

1. Model the constraint before searching payloads or transforms.
2. Separate syntax restrictions, semantic restrictions, state restrictions, and transport encoding.
3. Choose one focused reference from `references/ctf/misc/`.
4. Build small probes that isolate parser order, object reachability, numeric behavior, protocol state, or signal parameters.
5. Automate search/solve steps with deterministic seeds and explicit limits.
6. Preserve the ordered transform or state-transition chain.

## Produce

- constraint/state model
- minimal probe results
- complete solver/escape/decoder
- checkpoints and final validation

## Verification

- replay from reset state
- validate every transform layer independently
- for solvers, check candidate output in the original verifier/service
- for RF/signal work, record sample rate, synchronization, modulation, and decode parameters

## Exit When

The objective is reproduced or the challenge has been decomposed into a precise handoff to another module.

## Read

- `../../references/ctf/misc/index.md`
- exact topic path from `../../references/routing.md`
