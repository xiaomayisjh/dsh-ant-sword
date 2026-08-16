#!/usr/bin/env bash
# Register the portable MCP servers from mcp-manifest.json into host MCP configs
# (Claude ~/.claude/mcp.json, Codex ~/.codex/config.toml). Mirrors register.ps1.
# Everything resolves through %SKILL_ROOT% so the bundle stays movable.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_ROOT="$(dirname "$SCRIPT_DIR")"
MANIFEST="$SCRIPT_DIR/mcp-manifest.json"
REGISTERED="$SCRIPT_DIR/registered.json"
HOSTS=("${@:-claude codex}")

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required to register MCP servers" >&2
  exit 1
fi

DONE_HOSTS=""
for host in "${HOSTS[@]}"; do
  python3 - "$host" "$SKILL_ROOT" "$MANIFEST" <<'PY'
import json
import os
import sys

host, skill_root, manifest_path = sys.argv[1], sys.argv[2], sys.argv[3]
with open(manifest_path, encoding="utf-8") as fh:
    manifest = json.load(fh)

def expand(value):
    if not value:
        return value
    return value.replace("%SKILL_ROOT%", skill_root)

servers = manifest["servers"]
home = os.path.expanduser("~")

if host == "claude":
    path = os.path.join(home, ".claude", "mcp.json")
    config = {}
    if os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            config = json.load(fh)
    config.setdefault("mcpServers", {})
    for server in servers:
        definition = {
            "command": expand(server["command"]),
            "args": [expand(a) for a in server.get("args", [])],
        }
        env = {}
        for key, value in server.get("env", {}).items():
            if value.startswith("%") and value.endswith("%"):
                env_name = value.strip("%")
                if env_name in os.environ:
                    env[key] = os.environ[env_name]
            else:
                env[key] = expand(value)
        if server.get("dataDir"):
            env["CODEBASE_MEMORY_DATA_DIR"] = expand(server["dataDir"])
        if env:
            definition["env"] = env
        config["mcpServers"][server["name"]] = definition
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(config, fh, indent=2, ensure_ascii=False)
    print(f"claude: {len(servers)} server(s) registered at {path}")

elif host == "codex":
    path = os.path.join(home, ".codex", "config.toml")
    lines = []
    if os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            lines = fh.read().splitlines()
    out = []
    in_managed = False
    managed_names = {s["name"] for s in servers}
    for line in lines:
        if line.startswith("[mcp_servers."):
            in_managed = any(f'"{name}"' in line or line.endswith(f"{name}]") for name in managed_names)
            if in_managed:
                continue
        elif line.lstrip().startswith("["):
            in_managed = False
        if not in_managed:
            out.append(line)
    while out and not out[-1].strip():
        out.pop()
    for server in servers:
        env = {}
        for key, value in server.get("env", {}).items():
            if value.startswith("%") and value.endswith("%"):
                env_name = value.strip("%")
                if env_name in os.environ:
                    env[key] = os.environ[env_name]
            else:
                env[key] = expand(value)
        if server.get("dataDir"):
            env["CODEBASE_MEMORY_DATA_DIR"] = expand(server["dataDir"])
        args = ", ".join(json.dumps(expand(a)) for a in server.get("args", []))
        out.append("")
        out.append(f'[mcp_servers."{server["name"]}"]')
        out.append(f'command = "{expand(server["command"])}"')
        if args:
            out.append(f"args = [{args}]")
        if env:
            entries = ", ".join(f'"{k}" = "{v}"' for k, v in env.items())
            out.append(f"env = {{ {entries} }}")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(out) + "\n")
    print(f"codex: {len(servers)} server(s) registered at {path}")
PY
  DONE_HOSTS="$DONE_HOSTS $host"
done

python3 - "$SKILL_ROOT" "$MANIFEST" "$DONE_HOSTS" <<'PY'
import json
import sys

skill_root, manifest_path, hosts = sys.argv[1], sys.argv[2], sys.argv[3]
with open(manifest_path, encoding="utf-8") as fh:
    manifest = json.load(fh)
record = {
    "hosts": [h for h in hosts.split() if h],
    "servers": [s["name"] for s in manifest["servers"]],
}
with open(os.path.join(skill_root, "mcp", "registered.json"), "w", encoding="utf-8") as fh:
    json.dump(record, fh, indent=2)
PY
echo "registration record written to $REGISTERED"
echo "done"