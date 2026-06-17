#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)"

cd "$repo_root/apps/xkit"

go test ./internal/licenseserver -run 'TestActivationReturnsSignedEntitlement'
go test ./internal/app -run 'TestActivateLicenseAgainstDevServer|TestRefreshEntitlementAgainstDevServer'
