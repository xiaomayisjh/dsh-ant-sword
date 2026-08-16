# VSCode / Cursor Extension Reverse Audit

Use this reference when the target is a VSCode/Cursor extension, an unpacked `.vsix`, or a local extension folder and the user asks to deobfuscate all JS, map full logic, or check for backdoors.

## Intake

Collect these facts first:

```text
Extension root:
package.json path:
Main entry:
Activation events:
First-party JS/MJS files:
Output directory:
User goal: logic map / backdoor check / both
```

Prefer local evidence. Do not assume an extension is safe because behavior appears in the UI, and do not call a behavior a backdoor until the code path and trigger are clear.

## Deobfuscation First Pass

For whole-extension JS cleanup, prefer the bundled `js-deobfuscator` before writing custom AST transforms.

Single file:

```powershell
powershell -ExecutionPolicy Bypass -File <skill-root>\tools\launchers\run-js-deobfuscator.ps1 -InputFile <input.js> -OutputDir <out-dir>
```

Batch:

```powershell
powershell -ExecutionPolicy Bypass -File <skill-root>\tools\launchers\run-js-deobfuscator-batch.ps1 -RootDir <extension-root> -OutputRoot reverse-output/js-deobfuscator-launcher
```

Recommended excludes:

```text
node_modules
.git
reverse-output
vendor
coverage
.vscode-test
```

If the launcher stalls on first run, check whether dependency install/build is still in progress. After dependencies exist, rerun the launcher before falling back to a custom script.

Keep custom AST scripts as comparison or targeted cleanup only after the bundled tool output exists.

## Validation

Run syntax checks on every generated output:

```powershell
Get-ChildItem -Path reverse-output/js-deobfuscator-launcher -Recurse -Filter output.js |
  ForEach-Object { node --check $_.FullName }
```

Record:

```text
Tool used:
Input files:
Output directory:
Parse check:
Known failed files:
Fallback scripts:
```

## Logic Mapping Checklist

Start from `package.json`:

- `main`
- `activationEvents`
- `extensionKind`
- contributed commands
- views/webviews
- configuration keys
- scripts such as postinstall, compile, obfuscate
- dependencies that imply privileged behavior: `child_process`, `fs`, `sql.js`, `ws`, `node-notifier`, native modules

Then inspect the deobfuscated main entry for:

- command registrations
- webview providers and `onDidReceiveMessage`
- filesystem writes and deletes
- `child_process.exec`, `execSync`, `spawn`
- local HTTP/WebSocket servers
- network endpoints
- update/license checks
- credential/token reads
- DB access
- config rewrite logic
- injected scripts or patching of host app files

For webviews, separate UI commands from privileged extension-host handlers. The webview usually cannot access the filesystem directly, but it can ask the extension host to perform sensitive actions.

For MCP-style extensions, map:

- `.cursor/mcp.json` writes
- MCP server command/args/env
- per-channel/session env vars
- queue files
- tool schemas
- prompt injection or mandatory instruction text
- reply/heartbeat/done files

## Backdoor / Risk Triage

Classify each sensitive behavior with four fields:

```text
Behavior:
Trigger:
User-visible setting or command:
Risk:
```

High-risk findings in extension audits often include:

- reads auth tokens from app state DBs or keychains
- stores access/refresh tokens locally
- rewrites auth state databases
- injects code into VSCode/Cursor/Electron workbench files
- starts local HTTP servers that bridge privileged state
- starts remote chat or bot bridges
- listens for arbitrary remote messages without an allowlist
- rewrites workspace MCP config or rules
- runs detached helper processes
- downloads or executes new code
- installs persistence through registry, scheduled tasks, startup folder, services, shell profiles, or launch agents

Do not overstate:

- "High-risk remote bridge" is not the same as "hidden backdoor" if it is gated by a documented setting and no stealth trigger is found.
- "License server contact" is not token exfiltration unless the request body includes sensitive tokens.
- Obfuscation increases suspicion but is not proof by itself.

State confirmed and unconfirmed items separately.

## External Surface Search

Search all deobfuscated outputs for:

```text
https?://
fetch(
http.request
https.request
WebSocket
ws://
wss://
child_process
execSync
spawn
state.vscdb
cursorAuth
mcpServers
writeFileSync
readFileSync
copyFileSync
unlinkSync
setInterval
createServer
listen(
127.0.0.1
localhost
api.telegram.org
```

Summarize endpoints as:

```text
License/update:
Vendor official APIs:
Remote bridge/bot:
Local listeners:
Unknown/suspicious:
```

## Report Template

```markdown
# Extension Reverse Report

## Deobfuscation Outputs
- Tool:
- Output directory:
- Files:
- Parse check:

## Verdict
- Confirmed:
- Not confirmed:
- Risk rating:

## Entry And Activation

## Main Extension Logic

## Webview Logic

## MCP / Queue Logic

## Account / Credential Logic

## Bridge / Remote Control Logic

## Local Injection / Host Patching

## External Network Surface

## Backdoor Assessment

## Defensive Recommendations
```

Always include enough file paths and line anchors for the next analyst to verify the claim.
