#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
repo_root="$(cd "$script_dir/.." && pwd -P)"
manifest_path="$repo_root/tooling/cli-test-manifest.json"

phase="all"
tool_filter=""
list_only=false

usage() {
  cat <<'EOF'
Usage: scripts/test-clis.sh [--phase <all|unit|smoke|integration|release-smoke>] [--tool <name>] [--list]

Run manifest-driven CLI checks for toolbox tools on the current platform.

Options:
  --phase <phase>  Phase to run. Default: all
  --tool <name>    Limit to one tool
  --list           List tools eligible on the current platform
  -h, --help       Show this help
EOF
}

while (($#)); do
  case "$1" in
    --phase)
      phase="${2:-}"
      shift 2
      ;;
    --tool)
      tool_filter="${2:-}"
      shift 2
      ;;
    --list)
      list_only=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

case "$phase" in
  all|unit|smoke|integration|release-smoke)
    ;;
  *)
    echo "Invalid phase: $phase" >&2
    usage >&2
    exit 2
    ;;
esac

host_os="$(python3 - <<'PY'
import platform
system = platform.system()
if system == "Darwin":
    print("macos-14")
elif system == "Linux":
    print("ubuntu-latest")
else:
    print(system.lower())
PY
)"

manifest_tool_names() {
  python3 - "$manifest_path" "$host_os" "$tool_filter" <<'PY'
import json, sys

manifest_path, host_os, tool_filter = sys.argv[1:]
with open(manifest_path, "r", encoding="utf-8") as handle:
    manifest = json.load(handle)

def supported_locally(tool):
    if host_os == "macos-14":
        return True
    if host_os == "ubuntu-latest":
        return tool["language"] != "swift"
    return tool["os"] == host_os

tools = []
for tool in manifest["tools"]:
    if not supported_locally(tool):
        continue
    if tool_filter and tool["name"] != tool_filter:
        continue
    tools.append(tool["name"])

for name in tools:
    print(name)
PY
}

manifest_get_field() {
  local tool_name="$1"
  local field_name="$2"
  python3 - "$manifest_path" "$tool_name" "$field_name" <<'PY'
import json, sys

manifest_path, tool_name, field_name = sys.argv[1:]
with open(manifest_path, "r", encoding="utf-8") as handle:
    manifest = json.load(handle)

for tool in manifest["tools"]:
    if tool["name"] == tool_name:
        value = tool.get(field_name)
        if value is None:
            print("")
        elif isinstance(value, bool):
            print("true" if value else "false")
        else:
            print(value)
        break
else:
    raise SystemExit(f"unknown tool: {tool_name}")
PY
}

tools=()
while IFS= read -r line; do
  [[ -n "$line" ]] && tools+=("$line")
done < <(manifest_tool_names)

if [[ "$list_only" == true ]]; then
  printf '%s\n' "${tools[@]}"
  exit 0
fi

if ((${#tools[@]} == 0)); then
  if [[ -n "$tool_filter" ]]; then
    echo "No manifest entry for tool '$tool_filter' on $host_os" >&2
  else
    echo "No manifest entries for $host_os" >&2
  fi
  exit 1
fi

run_command() {
  local tool_name="$1"
  local label="$2"
  local command="$3"

  if [[ -z "$command" ]]; then
    echo "[SKIP] $tool_name $label"
    return 0
  fi

  echo "[RUN ] $tool_name $label"
  if bash -c '
    set -euo pipefail
    if command -v mise >/dev/null 2>&1; then
      eval "$(mise activate bash 2>/dev/null)"
    fi
    cd "'"$repo_root"'"
    '"$command"'
  '; then
    echo "[PASS] $tool_name $label"
    return 0
  fi

  echo "[FAIL] $tool_name $label" >&2
  return 1
}

phase_steps_for() {
  case "$1" in
    all)
      printf '%s\n' build unit smoke integration
      ;;
    smoke)
      printf '%s\n' build smoke
      ;;
    integration)
      printf '%s\n' build integration
      ;;
    unit)
      printf '%s\n' unit
      ;;
    release-smoke)
      printf '%s\n' release_smoke
      ;;
  esac
}

step_field_name() {
  case "$1" in
    build) echo "build_command" ;;
    unit) echo "unit_command" ;;
    smoke) echo "smoke_command" ;;
    integration) echo "integration_command" ;;
    release_smoke) echo "release_smoke_command" ;;
  esac
}

total=0
passed=0
failed=0
skipped=0

selected_steps=()
while IFS= read -r line; do
  [[ -n "$line" ]] && selected_steps+=("$line")
done < <(phase_steps_for "$phase")

for tool_name in "${tools[@]}"; do
  language="$(manifest_get_field "$tool_name" "language")"
  tool_path="$(manifest_get_field "$tool_name" "path")"
  echo
  echo "==> $tool_name ($language, $tool_path)"

  for step in "${selected_steps[@]}"; do
    field_name="$(step_field_name "$step")"
    command="$(manifest_get_field "$tool_name" "$field_name")"
    total=$((total + 1))

    if [[ -z "$command" ]]; then
      echo "[SKIP] $tool_name $step"
      skipped=$((skipped + 1))
      continue
    fi

    if run_command "$tool_name" "$step" "$command"; then
      passed=$((passed + 1))
    else
      failed=$((failed + 1))
    fi
  done
done

echo
echo "Summary: $passed passed, $skipped skipped, $failed failed ($total steps)"

if ((failed > 0)); then
  exit 1
fi
