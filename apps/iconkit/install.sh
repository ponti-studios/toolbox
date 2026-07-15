#!/usr/bin/env bash
set -euo pipefail

REPO="ponti-studios/toolbox"
BRANCH="main"
SCRIPT="apps/iconkit/iconkit"
URL="https://raw.githubusercontent.com/$REPO/$BRANCH/$SCRIPT"

install_dir=""
for candidate in "$HOME/.local/bin" "/usr/local/bin" "$HOME/bin"; do
  if [[ -d "$candidate" ]]; then
    install_dir="$candidate"
    break
  fi
done

if [[ -z "$install_dir" ]]; then
  install_dir="$HOME/.local/bin"
  mkdir -p "$install_dir"
fi

dest="$install_dir/iconkit"

echo "  repo:  $REPO"
echo "  dest:  $dest"

if command -v curl &>/dev/null; then
  curl -fsSL "$URL" -o "$dest"
elif command -v wget &>/dev/null; then
  wget -q "$URL" -O "$dest"
else
  echo "Error: need curl or wget" >&2
  exit 1
fi

chmod +x "$dest"

echo ""
echo "  ✓ iconkit installed"

if ! command -v iconkit &>/dev/null; then
  echo ""
  echo "  ! Add $install_dir to your PATH:"
  echo "      export PATH=\"$install_dir:\$PATH\""
fi

echo ""
iconkit --version
