#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UPSTREAM_DIR="${1:-${HOME}/Developer/voidline}"
DEST_DIR="${ROOT_DIR}/apps/warehouse"

if [[ ! -f "${UPSTREAM_DIR}/pyproject.toml" ]]; then
  echo "Expected warehouse upstream at ${UPSTREAM_DIR}" >&2
  exit 1
fi

rsync -a --delete \
  --exclude '.git' \
  --exclude '.pytest_cache' \
  --exclude '.ruff_cache' \
  --exclude '__pycache__' \
  --exclude '.venv' \
  --exclude '.DS_Store' \
  "${UPSTREAM_DIR}/" "${DEST_DIR}/"

echo "Synced warehouse from ${UPSTREAM_DIR} -> ${DEST_DIR}"
