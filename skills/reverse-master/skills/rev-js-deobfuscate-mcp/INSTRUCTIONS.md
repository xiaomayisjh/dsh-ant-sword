---
name: rev-js-deobfuscate-mcp
description: External MCP integration guide for ricardodeazambuja/deobfuscate-mcp-server. Use when JavaScript deobfuscation benefits from an MCP server that navigates bundled/minified JS, maps webpack/browserify-style modules, locates functions/classes/imports/exports/strings, or provides source-level code intelligence before AST transforms.
---

# rev-js-deobfuscate-mcp

Use this skill when the user wants to integrate or use `ricardodeazambuja/deobfuscate-mcp-server` as an external MCP helper for JavaScript reverse engineering.

Repository: `https://github.com/ricardodeazambuja/deobfuscate-mcp-server`

## When To Use

Use this tool before heavy AST rewriting when the current blocker is orientation:
- a large bundle is hard to navigate
- the task needs function, class, import/export, variable, string, or module discovery
- the user wants an MCP-accessible deobfuscation/navigation server
- the bundle js-reverse skill needs a better map of where to apply transforms

Prefer the bundle js-reverse skill directly when the target is already a local file and the next step is deterministic Babel transforms.

## Integration Pattern

1. Treat the repository as an external dependency. Do not assume it is already installed.
2. Check whether an MCP server entry already exists in the user's MCP config.
3. If not installed or not configured, ask the user for permission and the target MCP config location before changing MCP setup.
4. Start the MCP server according to its README.
5. Use it for navigation and discovery, then hand off transform work to the bundle js-reverse skill or runtime work to `rev-js-env`.

## Workflow

1. Record target file(s), URL(s), and the user's goal.
2. Use the MCP server to inventory code structure:
   - modules and entrypoints
   - exported/imported names
   - functions/classes
   - strings and suspicious constants
   - likely obfuscation dispatchers
3. Produce a short map:

```text
Target:
Entrypoint candidates:
Interesting modules/functions:
Suspicious strings/constants:
Recommended next skill:
Evidence:
```

4. Route:
   - parameter writer or request sink unknown -> the bundle js-reverse skill
   - AST transforms needed -> the bundle js-reverse skill
   - browser/local divergence -> `rev-js-env`
   - request-chain stage unclear -> the bundle js-reverse skill

## Verification

The integration is useful only if it improves target selection. Before claiming success, provide:
- server availability or install status
- the exact file/bundle inspected
- at least one concrete located module/function/string/entrypoint
- the next action tied to that evidence

## License Note

This skill does not bundle upstream source because MCP server setup is environment-specific. It references the external project only. Check the upstream repository license before vendoring or redistributing its code.
