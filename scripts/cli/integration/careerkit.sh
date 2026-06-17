#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)"
binary="$repo_root/target/careerkit"
fixture="$repo_root/apps/careerkit/fixtures/md-to-docx/generic.md"

if [[ ! -x "$binary" ]]; then
  echo "Missing careerkit binary at $binary" >&2
  exit 1
fi

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

docx_output="$tmpdir/generic.docx"

"$binary" build --input "$fixture" --output "$docx_output" > "$tmpdir/build.log"
test -f "$docx_output"
grep -q "built .*generic.md ->" "$tmpdir/build.log"

"$binary" review --input "$fixture" > "$tmpdir/review.log"
grep -q "metric coverage" "$tmpdir/review.log"
