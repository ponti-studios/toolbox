#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UPSTREAM_DIR="${1:-${HOME}/Developer/geo}"
DEST_DIR="${ROOT_DIR}/apps/geokit"

if [[ ! -f "${UPSTREAM_DIR}/Package.swift" ]]; then
  echo "Expected geokit upstream at ${UPSTREAM_DIR}" >&2
  exit 1
fi

rsync -a --delete \
  --exclude '.git' \
  --exclude '.build' \
  --exclude '.swiftpm' \
  --exclude '.DS_Store' \
  "${UPSTREAM_DIR}/" "${DEST_DIR}/"

echo "Synced geokit from ${UPSTREAM_DIR} -> ${DEST_DIR}"
