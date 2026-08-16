---
name: rev-js-deobfuscator-cli
description: External CLI/API integration guide for kuizuo/js-deobfuscator. Use for JavaScript deobfuscation with a maintained Babel-based tool before or alongside the bundle js-reverse skill's custom transforms, especially for common obfuscator.io, string-array, control-flow, and formatting cleanup jobs.
---

# rev-js-deobfuscator-cli

Use this skill when the user wants to integrate or run `kuizuo/js-deobfuscator` as an external JavaScript deobfuscation tool.

Repository: `https://github.com/kuizuo/js-deobfuscator`

## When To Use

Use this tool when:
- the target is a local JavaScript file or bundle
- common JS obfuscation should be cleaned quickly before manual analysis
- the user wants a CLI or library-based deobfuscation pass
- the bundle js-reverse skill would otherwise start with boilerplate transforms that the tool can handle

Use the bundle js-reverse skill after this tool when:
- the output still has target-specific dispatcher logic
- custom semantic-preserving transforms are needed
- validation requires intermediate checkpoints

## Embedded Tool

This skill pack vendors `kuizuo/js-deobfuscator` under:

```text
tools/vendor/js-deobfuscator
```

Prefer the bundled launcher:

```powershell
powershell -ExecutionPolicy Bypass -File tools/launchers/run-js-deobfuscator.ps1 -InputFile <input.js> -OutputDir <out-dir>
```

For a directory of first-party JS files, prefer the bundled batch launcher:

```powershell
powershell -ExecutionPolicy Bypass -File tools/launchers/run-js-deobfuscator-batch.ps1 -RootDir <project-or-extension-root> -OutputRoot reverse-output/js-deobfuscator-launcher
```

The launcher installs dependencies with `pnpm install` on first run. If `pnpm` is missing, ask the user to enable it with `corepack enable` or install pnpm.

## Workflow

1. Copy the target JS into a project workspace, not into the vendored tool repository.
2. Run `tools/launchers/run-js-deobfuscator.ps1` against one file, or `tools/launchers/run-js-deobfuscator-batch.ps1` for a project/extension directory.
3. Save outputs under an intermediate directory:

```text
source/original/<name>.js
intermediate/<name>.js-deobfuscator.js
source/deobfuscated/<name>.final.js
```

4. Parse and compare:
   - file parses without syntax errors
   - expected functions/exports still exist
   - suspicious strings/functions are easier to inspect
5. If the first launcher run times out, check whether dependencies were being installed or built, then rerun before falling back.
6. If the output changes behavior or fails to parse, fall back to the bundle js-reverse skill's step-by-step recovery.

## VSCode / Cursor Extension Pattern

When the target is an unpacked VSCode/Cursor extension or `.vsix`:

1. Run the batch launcher over the extension root and keep `reverse-output/js-deobfuscator-launcher` as the primary evidence directory.
2. Exclude `node_modules`, `.git`, `reverse-output`, `vendor`, `coverage`, and `.vscode-test`.
3. Run `node --check` over every generated `output.js`.
4. Then read `references/vscode-cursor-extension-audit.md` for the logic-map and backdoor-audit checklist.
5. Treat custom AST scripts as targeted cleanup or comparison only after the bundled tool output exists.

## Output Contract

```text
Tool:
Install/status:
Input file:
Output file:
Transforms observed:
Parse check:
Behavior/equivalence checks:
Next step:
```

For batch extension work, use:

```text
Tool:
Input root:
Files processed:
Output root:
Summary file:
Parse check:
Sensitive surfaces found:
Next reference:
```

## Fallback

If the bundled launcher fails due to dependencies or unsupported input, fall back to the bundle js-reverse skill for step-by-step custom transforms.

## License Note

The upstream project is vendored in `tools/vendor/js-deobfuscator` under MIT. See `NOTICE.md` and the upstream `LICENSE`.
