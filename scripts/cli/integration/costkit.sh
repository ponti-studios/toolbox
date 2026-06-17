#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)"
binary="$repo_root/target/debug/costkit"
fixture="$repo_root/apps/costkit/tests/fixtures/openrouter_activity_fixture.csv"

if [[ ! -x "$binary" ]]; then
  echo "Missing costkit binary at $binary" >&2
  exit 1
fi

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

"$binary" dashboard -f "$fixture" --output json > "$tmpdir/dashboard.json"
"$binary" costs -f "$fixture" --interval day --output json > "$tmpdir/costs.json"

python3 - "$tmpdir/dashboard.json" "$tmpdir/costs.json" <<'PY'
import json, sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    dashboard = json.load(handle)
with open(sys.argv[2], "r", encoding="utf-8") as handle:
    costs = json.load(handle)

assert dashboard["summary"]["total_requests"] == 3, dashboard
assert dashboard["app_breakdown"][0]["app"] == "nexus.dev", dashboard
assert len(dashboard["finish_reasons"]) == 2, dashboard

assert len(costs["rows"]) == 1, costs
assert costs["rows"][0]["time"] == "2026-06-15", costs
assert costs["rows"][0]["requests"] == 3, costs
assert costs["rows"][0]["tokens"] == 83878, costs
PY
