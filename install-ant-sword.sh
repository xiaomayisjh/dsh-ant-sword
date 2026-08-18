#!/usr/bin/env bash
set -euo pipefail

profile="${PROFILE:-web}"
repository="${REPOSITORY:-xiaomayisjh/dsh-ant-sword}"
tag="${TAG:-}"
release=""

usage() {
  echo "usage: install-ant-sword.sh [--profile web] [--repository owner/name] [--tag vX.Y.Z] [--release directory-or-manifest]" >&2
}

while (($# > 0)); do
  case "$1" in
    --profile|-p)
      profile="${2:?--profile requires a value}"
      shift 2
      ;;
    --repository|--repo)
      repository="${2:?--repository requires a value}"
      shift 2
      ;;
    --tag)
      tag="${2:?--tag requires a value}"
      shift 2
      ;;
    --release)
      release="${2:?--release requires a value}"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      usage
      exit 2
      ;;
  esac
done

for required in dsh pnpm node; do
  command -v "$required" >/dev/null 2>&1 || { echo "Required command not found: $required" >&2; exit 1; }
done

stop_stale_dsh_web() {
  local port="${1:-3080}"
  local pids
  if command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  elif command -v fuser >/dev/null 2>&1; then
    pids="$(fuser "$port"/tcp 2>/dev/null || true)"
  else
    return 0
  fi
  for pid in $pids; do
    case "$pid" in ''|*[!0-9]*) continue ;; esac
    local cmdline
    cmdline="$(ps -p "$pid" -o args= 2>/dev/null || true)"
    if echo "$cmdline" | grep -q 'dsh'; then
      echo "ant-sword: stopping stale dsh instance on port $port (PID $pid)"
      kill "$pid" 2>/dev/null || true
      sleep 0.5
    else
      echo "Warning: port $port is held by PID $pid ($cmdline), which is not dsh. Not stopping it automatically." >&2
    fi
  done
}

if [[ "$profile" == "web" ]]; then
  stop_stale_dsh_web 3080
fi

if [[ -n "$release" ]]; then
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  installer="$script_dir/scripts/install-profile.mjs"
  [[ -f "$installer" ]] || { echo "Installer module not found: $installer" >&2; exit 1; }
  node "$installer" --profile "$profile" --release "$release"
else
  for required in gh curl; do
    command -v "$required" >/dev/null 2>&1 || { echo "Required command not found: $required" >&2; exit 1; }
  done

  workspace="$(mktemp -d "${TMPDIR:-/tmp}/dsh-ant-sword.XXXXXX")"
  trap 'rm -rf "$workspace"' EXIT INT TERM

  download=(release download)
  [[ -n "$tag" ]] && download+=("$tag")
  download+=(
    --repo "$repository"
    --pattern '*.tgz'
    --pattern 'ant-sword-release-manifest.json'
    --dir "$workspace"
    --clobber
  )
  gh "${download[@]}"

  mkdir -p "$workspace/scripts"
  raw="https://raw.githubusercontent.com/$repository/main/scripts"
  curl -fsSL "$raw/install-profile.mjs" -o "$workspace/scripts/install-profile.mjs"
  curl -fsSL "$raw/release-artifacts.mjs" -o "$workspace/scripts/release-artifacts.mjs"
  node "$workspace/scripts/install-profile.mjs" --profile "$profile" --release "$workspace"
fi

if [[ "$profile" == "web" ]]; then
  echo "Ant Sword installed. Start with: dsh web"
else
  echo "Ant Sword installed. Start with: dsh --profile $profile"
fi
