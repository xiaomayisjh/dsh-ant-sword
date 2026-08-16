# RULES — reverse/CTF 任务执行契约（单一事实源）

> This file is the execution contract for the bundled reverse-engineering / CTF /
> pentest skill pack. Read it before any security task: it defines routing, the
> authorization gate, tool discipline, and the completion checklist. The machine
> routing table lives in `skills/config/routing.json`; the priority view in
> `skills/MASTER-ROUTING.md`; per-skill entry points under `skills/<module>/SKILL.md`.

## Trigger keywords (bilingual, ANY match routes)

APK / Android reverse / 反编译 / smali / jadx / apktool / Frida / Hook
· binary analysis / 二进制分析 / IDA / radare2 / disassembly / 反汇编 / reverse engineering / 逆向工程
· frontend signature / 前端签名 / JS reverse / JS 逆向 / jshookmcp / CDP / SourceMap
· packet capture / 抓包 / request replay / 请求重放
· CTF / Pwn / web pentest / Web 渗透 / exploit / 漏洞利用 / privilege escalation / 提权
· penetration testing / 渗透测试 / red team / 红队 / Nmap / Nuclei / SQLMap / FFUF / Hashcat / Metasploit
· SRC / Bug Bounty / 众测 / WAF bypass / IDOR / 越权
· BurpSuite / Intruder / Repeater / Collaborator
· LLM security / Prompt injection / jailbreak / Agent security / garak / PyRIT
· EDR bypass / 免杀 / AV bypass / direct syscall / AMSI patch / ETW patch
· firmware / 固件 / IoT / binwalk / embedded
· internal network / 内网渗透 / lateral movement / 横向移动 / domain penetration / 域渗透 / BloodHound
· API security / 供应链安全 / supply chain / YARA / malware analysis / 恶意软件分析
· iOS reverse / mobile reverse / game reverse / 游戏逆向 / .NET reverse / pwn / ROP / kernel pwn

## Canonical behavior chain (MUST follow in order)

```
0. Read field-journal/precedent-auth.md — authorization pre-declaration (first).
1. Identify the task as security/reverse type -> trigger routing.
2. Route: skills/config/routing.json (or scripts/master-route.ps1 -Hint "...")
   -> PRIMARY skill id; read skills/MASTER-ROUTING.md for the priority view.
3. Scope gate: run scripts/case-init.ps1 to land work/<case>/scope.md with
   auth.status = granted (contract: skills/ops/scope-contract.md). MUST NOT ACT
   against targets before auth.status = granted and in_scope assets are set.
4. Open the PRIMARY skill's SKILL.md and start its ACTION REQUIRED.
5. Tools: read skills/tool-index.md for real paths; NEVER guess paths. Missing
   tool -> scripts/bootstrap-reverse.ps1 (manifest-listed capabilities only),
   then scripts/refresh-tool-index.ps1.
6. ACT: execute with durable evidence (append timeline / workitems; conclusions
   as Evidence -> Finding -> Path per skills/ops/evidence-finding-path.md).
7. Complete: run the Completion Checklist below; then report.
```

## Completion checklist (MUST NOT skip)

- [ ] Formal report via docs-generator
- [ ] At least one diagram via diagram-generator
- [ ] Anonymized field-journal write-back (skills/field-journal/)
- [ ] Persist searched knowledge to references/ when web-searched
- [ ] Update indexes (_index.md; routing.json + benchmark if a new scenario matched)

## Execution principles

- **Route first, act second.** A bare "understood, tell me the task" reply is a
  failure: route the intent, output the routing analysis, then execute.
- **Deterministic steps run immediately.** Do not wait for confirmation on steps
  the contract already mandates; pause only at genuine decision points.
- **Never guess tool paths.** tool-index.md is the single source of tool truth;
  after any install, refresh it so other clients reuse the index.
- **Switch paths, don't force-fit.** Static<->dynamic, Java<->Native, IDA<->r2,
  tool X<->equivalent Y; one blocked path means switch, not stall.
- **Self-supervision.** Every few tool calls: am I progressing with evidence?
  Same call + same params twice -> change approach. Report before exhausting a
  subtask budget. Do not go silent; surface problems immediately.
- **Parameter stability.** When parameters must pass exactly, use opaque code
  words (mapping table first, expand at the command layer); never let the agent
  "semantically optimize" scan scope or approval values.

## Security boundaries

- All operations stay within the operator's authorized scope: sanctioned
  engagement, CTF/lab sandbox, or the operator's own systems.
- Do not expand the attack surface beyond the declared scope (scope.md).
- High-severity findings are reported to the operator immediately.
- Reports and journals are anonymized; no un-anonymized target data retained.

## Output quality

- Critical operations include reproducible commands, not descriptions.
- Reverse analysis annotates addresses/offsets/function names.
- Pentest provides complete PoCs (commands/scripts/artifact paths).
- Uncertain conclusions carry a confidence level.

## Error handling

| Scenario | Action |
|----------|--------|
| Bootstrap succeeds | Continue silently |
| Bootstrap fails, clear reason | Output structured guidance, wait for operator |
| Same tool fails 2 times | Declare manual install steps, stop retrying |
| Route not matched | Web-search methodology, propose a new skill (never force-fit) |
| Service port mismatch | Ask for the actual port, update the MCP config |
| Task exceeds capability | State limits and the specific human intervention point |

## Self-audit before claiming "done"

- Did I execute every step of the chain (not just read it)?
- Did I guess any tool paths instead of using tool-index?
- Did I produce actual side effects (files analyzed / vulns verified / reports written)?
- Is the Completion Checklist fully checked?
- Any "no" -> the task is NOT complete; go back and fix.