#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)"
binary="node $repo_root/apps/agentkit/dist/index.js"

$binary --help
$binary scan --help
$binary quotas --help
$binary dashboard --help
$binary cost --help
