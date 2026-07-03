#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

echo "=== warehouse integration smoke ==="

# Version shows correctly
warehouse version

# Each subcommand group shows help
for cmd in finance career people spotify; do
  warehouse "$cmd" --help > /dev/null
  echo "  warehouse $cmd --help OK"
done

echo "PASS: warehouse integration"
