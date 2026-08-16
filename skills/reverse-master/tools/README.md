# Embedded And External Tools

This directory contains quick-call integrations for reverse-engineering tools.

## Embedded

These tools are vendored for fast local use:

- `vendor/js-deobfuscator` from `kuizuo/js-deobfuscator` (MIT)
- `vendor/Androidmeda` from `In3tinct/Androidmeda` (Apache-2.0)

Launchers:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\launchers\run-js-deobfuscator.ps1 -InputFile .\sample.js -OutputDir .\out
powershell -ExecutionPolicy Bypass -File .\tools\launchers\run-js-deobfuscator-batch.ps1 -RootDir .\extension -OutputRoot .\reverse-output\js-deobfuscator-launcher
powershell -ExecutionPolicy Bypass -File .\tools\launchers\run-androidmeda.ps1 -SourceDir .\jadx\sources\com\example -OutputDir .\out -Provider ollama -Model llama3.2 -SaveCode
```

## Ask User First

These are not embedded:

- `ricardodeazambuja/deobfuscate-mcp-server`: requires MCP server setup and client configuration.
- `Fadi002/de4py`: upstream license is CC BY-NC 4.0; ask the user before installing or using it, especially in commercial contexts.

## Rules

- Run tools against copies of samples, not originals.
- Keep intermediate outputs in the active analysis workspace.
- Parse-check deobfuscated code when possible.
- Treat tool output as evidence to inspect, not automatic proof of behavior.
- For extension/project-wide JS cleanup, run the batch launcher before writing custom AST transforms.
