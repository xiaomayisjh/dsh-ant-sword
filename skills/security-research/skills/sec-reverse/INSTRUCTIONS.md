# Reverse Engineering Module

## Enter When

- the task requires understanding compiled, packed, obfuscated, generated, mobile, browser, VM, firmware, or bytecode behavior
- a Web/Pwn/Malware task is blocked by an unknown writer, function, structure, algorithm, or runtime dependency

## Required Inputs

- original artifact and hash, or a real request/call/check boundary
- architecture/runtime/platform and known execution method
- current stage: locate, recover, runtime, or validation
- desired artifact: function, algorithm, hook, unpacked file, structure, key, or explanation

## Delegate First

Use the registered `reverse-master` skill when available for JS signatures, browser environment fitting, AST recovery, Androidmeda, Frida, IDA/IDAPython, symbol/structure recovery, Unicorn, DEX dumping, Unity IL2CPP, iOS dumping, or Python deobfuscation.

Provide this handoff:

```text
Target/hash:
Observed boundary:
Current reverse stage:
Known inputs/outputs:
Blocking unknown:
Required artifact:
Exit condition:
```

If `reverse-master` is unavailable, use the bundled fallback references below.

## Do

1. Triage format, architecture, entry, sections, imports/exports, strings, resources, compiler/runtime, and protection hints.
2. Prove a high-value boundary through xrefs, callers, breakpoints, hooks, or a real request/check sample.
3. Recover only the shell blocking the next proof; keep original and every meaningful intermediate.
4. For dynamic work, record module load timing, addresses relative to module bases, input state, and output checkpoints.
5. For recovered algorithms, compare intermediate values with a fixed runtime sample.

## Produce

- boundary/call-chain evidence
- named functions/structures or recovered transform contract
- hook, IDA script, emulator, decoder, or unpacked artifact as appropriate
- validation checkpoints and provenance

## Verification

- parse-check and hash derived binaries/scripts
- confirm dump magic, size, imports/relocations, entry, and downstream tool readability
- compare browser/native/runtime and local outputs at intermediate checkpoints
- do not accept final-output similarity when internal state diverges

## Exit When

The receiving domain has a callable contract, named primitive, validated artifact, or a precisely bounded runtime dependency.

## Read

- `../../references/ctf/reverse/index.md`
- `../../references/reverse.md`
- exact topic paths from `../../references/routing.md`
