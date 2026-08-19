#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)"
binary=(node "$repo_root/apps/filekit/dist/index.js")

if [[ ! -f "$repo_root/apps/filekit/dist/index.js" ]]; then
  echo "Missing Filekit build at $repo_root/apps/filekit/dist/index.js" >&2
  exit 1
fi

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

mkdir -p "$tmpdir/content" "$tmpdir/bin"

cat > "$tmpdir/content/one.md" <<'EOF'
---
status: draft
tags:
  - ai
  - rust
---

Hello
EOF

cat > "$tmpdir/content/two.md" <<'EOF'
---
status: published
tags:
  - rust
  - cli
---

World
EOF

"${binary[@]}" frontmatter aggregate "$tmpdir/content" -o "$tmpdir/frontmatter.json"

python3 - "$tmpdir/frontmatter.json" <<'PY'
import json, sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    data = json.load(handle)

lookup = {item["name"]: item["values"] for item in data}
assert lookup["status"] == ["draft", "published"], lookup
assert lookup["tags"] == ["ai", "cli", "rust"], lookup
PY

cat > "$tmpdir/bin/pandoc" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "--version" ]]; then
  echo "pandoc 3.0"
  exit 0
fi

input=""
output=""
extract_media=""

while (($#)); do
  case "$1" in
    --extract-media=*)
      extract_media="${1#--extract-media=}"
      ;;
    -o)
      output="${2:?missing output value}"
      shift
      ;;
    *)
      if [[ -z "$input" && -f "$1" ]]; then
        input="$1"
      fi
      ;;
  esac
  shift
done

if [[ -z "$input" || -z "$output" ]]; then
  echo "missing input or output" >&2
  exit 2
fi

if [[ "$input" == *"fail.docx" ]]; then
  echo "forced failure" >&2
  exit 1
fi

if [[ -n "$extract_media" ]]; then
  mkdir -p "$extract_media"
  printf 'media' > "$extract_media/example.txt"
fi

printf '# Converted\n\nsource=%s\n' "$input" > "$output"
EOF
chmod +x "$tmpdir/bin/pandoc"

printf 'stub docx content' > "$tmpdir/resume.docx"
PATH="$tmpdir/bin:$PATH" "${binary[@]}" docx to-md "$tmpdir/resume.docx"

test -f "$tmpdir/resume.md"
test -f "$tmpdir/resume_media/example.txt"
grep -q "Converted" "$tmpdir/resume.md"

printf 'stub failing docx content' > "$tmpdir/fail.docx"
if PATH="$tmpdir/bin:$PATH" "${binary[@]}" docx to-md "$tmpdir/fail.docx"; then
  echo "Expected docx conversion failure for fail.docx" >&2
  exit 1
fi
