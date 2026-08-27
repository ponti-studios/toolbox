#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)"
binary="$repo_root/apps/imagekit/.test-bin/imagekit"
fixtures="$repo_root/apps/imagekit/tests/fixtures"

if [[ ! -x "$binary" ]]; then
  echo "Missing imagekit test binary at $binary (run: cd apps/imagekit && bun run build:test)" >&2
  exit 1
fi

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

# resize a PNG fixture to exact dimensions
"$binary" resize "$fixtures/rgb-landscape.png" -s 100x100 -o "$tmpdir"
test -f "$tmpdir/rgb-landscape.100x100.png"

# convert a TIFF fixture to PNG
"$binary" convert "$fixtures/conversion-source.tiff" -f png -o "$tmpdir"
test -f "$tmpdir/conversion-source.png"

# strip EXIF from a JPEG copy (strips in place)
cp "$fixtures/metadata-exif.jpg" "$tmpdir/photo.jpg"
"$binary" strip "$tmpdir/photo.jpg"
"$binary" info "$tmpdir/photo.jpg" | grep -qi "photo.jpg"

# version surfaces with the imagekit identity
"$binary" --version | grep -q "1.0.0"