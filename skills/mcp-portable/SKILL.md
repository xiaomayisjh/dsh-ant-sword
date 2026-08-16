---
name: mcp-portable
description: Use when a task benefits from the bundled portable MCP servers — firecrawl (web scraping, crawling, search for recon/OSINT/document mining) or codebase-memory (persistent codebase knowledge-graph memory across sessions for long-running research). Explains registration, data portability, and usage.
---

# Portable MCP servers

The bundle embeds two MCP servers that travel with the package. Register them once per machine; all data stays inside this bundle, so copying the package carries the capability and its accumulated state together.

## firecrawl

Web scraping, crawling, and search. Use for recon, OSINT, documentation mining, and page-content extraction during authorized assessments.

```powershell
# one-time registration (also writes the Codex/Claude config):
powershell -NoProfile -ExecutionPolicy Bypass -File skills/mcp/register.ps1
```

- Requires `FIRECRAWL_API_KEY` set in the environment before registration; the script injects it into the host config.
- Runs via `npx -y firecrawl-mcp@3.24.0` — no local install, stateless.

## codebase-memory

Indexes codebases into a persistent knowledge graph (single static binary, sub-ms queries). Use it to keep long-running research memory across sessions: index a target codebase once, then query symbols, flows, and history without re-reading files.

```powershell
# install the binary into skills/mcp/bin/ (via the bundle bootstrap):
powershell -NoProfile -ExecutionPolicy Bypass -File skills/scripts/bootstrap-reverse.ps1 -Capability @('codebase-memory-mcp')
powershell -NoProfile -ExecutionPolicy Bypass -File skills/mcp/register.ps1
```

- Graph data persists at `skills/mcp/data/codebase-memory/` — copy the bundle and the memory comes along.
- No API key, no runtime dependencies.

## Portability contract

- All manifest paths resolve through `%SKILL_ROOT%` (this package), never absolute machine paths.
- Host configs (`~/.claude/mcp.json`, `~/.codex/config.toml`) receive only the sections this bundle declares; `unregister` removes exactly those.
- Experience journals (`field-journal/`, `reverse-master/references/experience/`, `security-research/references/experience/`) and this MCP data live inside the package: moving the bundle moves the accumulated work.

See `skills/mcp/README.md` for the registry details.