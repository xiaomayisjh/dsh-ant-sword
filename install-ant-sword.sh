#!/usr/bin/env bash
set -euo pipefail

profile="${PROFILE:-web}"
for command in gh dsh pnpm node; do
  command -v "$command" >/dev/null 2>&1 || { echo "Required command not found: $command" >&2; exit 1; }
done

workspace="$(mktemp -d "${TMPDIR:-/tmp}/dsh-ant-sword.XXXXXX")"
trap 'rm -rf "$workspace"' EXIT INT TERM

gh release download --repo xiaomayisjh/dsh-ant-sword \
  --pattern 'deepseek-ai-dsh-ant-sword-harness-*.tgz' \
  --dir "$workspace" --clobber
bundle="$(find "$workspace" -maxdepth 1 -name 'deepseek-ai-dsh-ant-sword-harness-*.tgz' -print -quit)"
[[ -n "$bundle" ]] || { echo 'Release contains no Ant Sword bundle tarball' >&2; exit 1; }

dsh plugin --profile "$profile" add "$bundle"
dsh_home="${DSH_HOME:-$HOME/.dsh}"
profile_dir="$dsh_home/profiles/$profile"
pnpm --dir "$profile_dir" add '@nanmicoder/dsh-agent-teams@^0.1.4' 'dshmarket@^1.4.1'
node -e "const fs=require('fs');const p=process.argv[1];const m=JSON.parse(fs.readFileSync(p,'utf8'));const b=m.dsh?.profile?.bundles;if(Array.isArray(b))m.dsh.profile.bundles=b.filter(x=>!['@nanmicoder/dsh-agent-teams','dshmarket'].includes(x));fs.writeFileSync(p,JSON.stringify(m,null,2)+'\n')" "$profile_dir/package.json"

echo 'Ant Sword installed. Start with: dsh web'