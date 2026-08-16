# Notices

This package integrates and restructures security and CTF skill material found in the accompanying `Creater-Studio` workspace. The bundled `references/ctf/` category sources declare the MIT license in their original frontmatter.

The architecture also draws on workflow patterns from the local `reverse-master-skills`, `rev-js-workflow`, `mission-keeper`, and `skill-creator` packages. Their large tools and third-party vendor trees are not redistributed here.

See `references/source-provenance.md` for the source map, retained assets, excluded assets, and refresh procedure.

## Merged from the `reverse-skill` pack (2026-07 upgrade)

The following modules were merged from the `reverse-skill` router pack. Each retains the license of its origin; the `security-research` MIT license does not override them.

| Bundled path | Origin | License | Obligation |
|---|---|---|---|
| `ctf-orchestrator/` | `CTF-Sandbox-Orchestrator` | **GNU GPLv3** | Kept its own `ctf-orchestrator/LICENSE`. This subtree stays GPLv3; redistribution of this subtree must follow GPLv3. The rest of `security-research` remains MIT. |
| `skills/sec-assessment-tooling/pentest-tools/` | `reverse-skill/skills/pentest-tools` | Mixed; payload/playbook text + tool MCP docs | The `src-hunter` payload/playbook corpus is reference data. Pentest Swarm AI (AGPL-3.0) is only invoked via CLI/MCP, not vendored here. Third-party tools (nmap, nuclei, sqlmap, ffuf, hashcat, etc.) follow their own official licenses. |
| `skills/sec-pwn-chain/`, `sec-patch-diff/`, `sec-firmware/`, `sec-edr-bypass/`, `sec-supply-chain/`, `sec-attack-chain/` | `reverse-skill/skills/{pwn-chain,patch-diff-exploit,firmware-pentest,edr-bypass-re,supply-chain-security,attack-chain}` | MIT (reverse-skill main) | Path references were rewritten to this pack's anchor files; technical content unchanged. |
| `skills/sec-ai-security/references/llm-deep/`, `sec-malware/references/malware-deep/`, `sec-web-api/references/api-deep/` | `reverse-skill/skills/{llm-security,malware-analysis,api-security}` | MIT (reverse-skill main) | Deep reference material folded under existing sub-skills. |

All merged material is for legally authorized security research, learning, and CTF competition only. See `references/source-provenance.md` for the full source map.
