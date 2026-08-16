# Deobfuscation Experience

Use this for JavaScript, Python, Android Java, native string/config recovery, and mixed runtime/static deobfuscation.

## First Principle

Recover only the shell that blocks the next proof. If the request writer, decoder entry, or branch boundary is unknown, find that boundary before deobfuscating the whole target.

## JavaScript

Before writing a new AST transform:

```bash
node scripts/reusable/js/obfuscation-fingerprint.js target.js --json fp.json
```

Decision:

- common string-array/control-flow/obfuscator.io: use `rev-js-deobfuscator-cli` first
- precise custom transform: use the bundle js-reverse skill
- large bundle orientation: use `rev-js-deobfuscate-mcp`
- browser/local divergence: use `rev-js-env`
- known parameter writer only: use the bundle js-reverse skill

Keep:

- original file
- formatted step0
- each transform script
- each intermediate output
- parse-check logs
- behavior checkpoint samples

## Python

Use `scripts/reusable/python/layer_decoder.py` for simple encoded/compressed layers. For marshal/bytecode/PyInstaller, keep Python version evidence because bytecode and marshal formats are version-sensitive.

Validation:

- output compiles with the matching Python
- recovered entrypoint names make sense
- strings/configs match runtime observations

## Android / Java

Use `rev-android-androidmeda` for Java source-level deobfuscation and report triage. Move to Frida/DEX/native only when Java findings prove a runtime or native boundary.

## Native

For string/config decryptors:

- identify caller and buffer ownership
- trace input/output buffers
- emulate focused routines with Unicorn when dependencies are small
- hook real decryptor returns with Frida when runtime context is heavy
- save plaintext plus decryptor address, arguments, and sample hash

## Pitfalls

- Running arbitrary obfuscated code directly in Node/Python instead of a sandbox or local copy.
- Applying transforms without parse-checking after each step.
- Treating deobfuscated output as behaviorally equivalent without samples.
- Renaming variables semantically when the evidence only supports structural names.
- Discarding intermediate files, making one bad transform expensive to debug.
