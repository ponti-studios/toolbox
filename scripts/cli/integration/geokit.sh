#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)"
binary="$repo_root/apps/geokit/.build/debug/geokit"

if [[ ! -x "$binary" ]]; then
  echo "Missing geokit binary at $binary" >&2
  exit 1
fi

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

input_csv="$tmpdir/input.csv"
output_csv="$tmpdir/output.csv"

cat > "$input_csv" <<'EOF'
Name,Notes
,Test place
"   ",Still blank
EOF

"$binary" geocode-csv -f "$input_csv" -c Name -o "$output_csv" --include-json

python3 - "$output_csv" <<'PY'
import csv, sys

with open(sys.argv[1], "r", encoding="utf-8", newline="") as handle:
    rows = list(csv.reader(handle))

assert rows[0] == ["Name", "Notes", "lat", "lon", "city", "state", "country", "country_code", "apple_maps_json"], rows
assert rows[1] == ["", "Test place", "", "", "", "", "", "", ""], rows
assert rows[2] == ["   ", "Still blank", "", "", "", "", "", "", ""], rows
PY
