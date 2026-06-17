#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)"
binary="$repo_root/apps/mediakit/.build/debug/mediakit"

if [[ ! -x "$binary" ]]; then
  echo "Missing mediakit binary at $binary" >&2
  exit 1
fi

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

missing_input="$tmpdir/missing.mp4"

if "$binary" transcribe "$missing_input" > "$tmpdir/stdout.log" 2> "$tmpdir/stderr.log"; then
  echo "Expected mediakit transcribe to fail for a missing file" >&2
  exit 1
fi

grep -q "missing" "$tmpdir/stderr.log"
