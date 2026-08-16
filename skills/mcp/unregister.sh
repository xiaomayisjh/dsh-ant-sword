#!/usr/bin/env bash
# Remove the portable MCP servers registered by register.sh from host configs.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_ROOT="$(dirname "$SCRIPT_DIR")"
REGISTERED="$SCRIPT_DIR/registered.json"
HOSTS=("${@:-}")

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required to unregister MCP servers" >&2
  exit 1
fi

NAMES="firecrawl codebase-memory"
if [ -z "${HOSTS[*]:-}" ] && [ -f "$REGISTERED" ]; then
  HOSTS=($(python3 -c "import json;print(' '.join(json.load(open('$REGISTERED'))['hosts']))"))
fi
if [ -z "${HOSTS[*]:-}" ]; then
  HOSTS=(claude codex)
fi

for host in "${HOSTS[@]}"; do
  python3 - "$host" "$NAMES" <<'PY'
import json
import os
import sys

host, names = sys.argv[1], sys.argv[2].split()
home = os.path.expanduser("~")

if host == "claude":
    path = os.path.join(home, ".claude", "mcp.json")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            config = json.load(fh)
        removed = [n for n in names if n in config.get("mcpServers", {})]
        for n in removed:
            del config["mcpServers"][n]
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(config, fh, indent=2, ensure_ascii=False)
        print(f"claude: removed {', '.join(removed)} from {path}")

elif host == "codex":
    path = os.path.join(home, ".codex", "config.toml")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            lines = fh.read().splitlines()
        out = []
        skip = False
        for line in lines:
            if line.startswith("[mcp_servers."):
                skip = any(f'"{n}"' in line or line.endswith(f"{n}]") for n in names)
                if skip:
                    continue
            elif line.lstrip().startswith("["):
                skip = False
            if not skip:
                out.append(line)
        with open(path, "w", encoding="utf-8") as fh:
            fh.write("\n".join(out) + "\n")
        print(f"codex: removed {names} from {path}")
PY
done

rm -f "$REGISTERED"
echo "done"