default:
    @just --list

build:
    cd apps/filekit && npm ci && npm run build
    cd apps/agentkit && npm run build
    if [ "$(uname)" = "Darwin" ] && [ -f apps/mediakit/Package.swift ]; then ./scripts/swift-package-clean-run.sh apps/mediakit swift build; fi
    if command -v go >/dev/null 2>&1; then if command -v mise >/dev/null 2>&1; then (cd apps/xkit && mise exec go@1.26.4 -- go build -trimpath -ldflags='-s -w' -o ../../target/xkit .); else (cd apps/xkit && go build -trimpath -ldflags='-s -w' -o ../../target/xkit .); fi; fi

build-filekit:
    cd apps/filekit && npm ci && npm run build

check:
    cd apps/filekit && npm ci && npm run typecheck

smoke:
    ./scripts/test-clis.sh --phase smoke

smoke-clis:
    ./scripts/test-clis.sh --phase smoke

test-clis:
    ./scripts/test-clis.sh --phase all

test-cli NAME:
    ./scripts/test-clis.sh --phase all --tool {{NAME}}

test-cli-phase NAME PHASE:
    ./scripts/test-clis.sh --phase {{PHASE}} --tool {{NAME}}

test:
    cd apps/filekit && npm ci && npm test
    if command -v go >/dev/null 2>&1; then if command -v mise >/dev/null 2>&1; then (cd apps/xkit && mise exec go@1.26.4 -- go test ./...); else (cd apps/xkit && go test ./...); fi; fi

run-filekit:
    cd apps/filekit && npm run build && node dist/index.js --help

clean:
    rm -rf apps/filekit/dist apps/agentkit/dist apps/mediakit/.build apps/mediakit/.swiftpm target

install NAME="all":
    #!/usr/bin/env bash
    set -euo pipefail
    command -v mise >/dev/null 2>&1 || { echo "Error: mise is required"; exit 1; }
    mise_shims="${HOME}/.local/share/mise/shims"
    mkdir -p "$mise_shims"
    case "{{NAME}}" in
      filekit) (cd apps/filekit && npm ci && npm run build); ln -sf "$(pwd)/apps/filekit/dist/index.js" "$mise_shims/filekit"; chmod +x "$mise_shims/filekit" ;;
      agentkit) (cd apps/agentkit && npm run build); ln -sf "$(pwd)/apps/agentkit/dist/index.js" "$mise_shims/agentkit"; chmod +x "$mise_shims/agentkit" ;;
      all) just install filekit; just install agentkit ;;
      *) echo "Unknown app: {{NAME}}"; exit 1 ;;
    esac
