default:
    @just --list

# Build all CLIs
build:
    cargo build --workspace
    if [ "$(uname)" = "Darwin" ] && [ -f apps/mediakit/Package.swift ]; then ./scripts/swift-package-clean-run.sh apps/mediakit swift build; fi
    if command -v go >/dev/null 2>&1; then (cd apps/xkit && go build -o ../../target/xkit .); else echo "Skipping xkit (go not installed)"; fi

# Build specific Rust CLI
build-cli CLI:
    cargo build --release -p {{CLI}}

# Build agentkit (TypeScript) locally
build-agentkit:
    #!/usr/bin/env bash
    set -euo pipefail
    cd apps/agentkit && npm run build

# Build release for current platform
build-release:
    cargo build --workspace --release
    if [ "$(uname)" = "Darwin" ] && [ -f apps/mediakit/Package.swift ]; then ./scripts/swift-package-clean-run.sh apps/mediakit swift build -c release; fi
    if command -v go >/dev/null 2>&1; then (cd apps/xkit && go build -o ../../target/xkit .); else echo "Skipping xkit (go not installed)"; fi

# Typecheck all Rust crates
check:
    cargo check --workspace --all-targets

# Smoke test binaries via --help
smoke:
    ./scripts/test-clis.sh --phase smoke

# Manifest-driven CLI smoke tests
smoke-clis:
    ./scripts/test-clis.sh --phase smoke

# Manifest-driven CLI unit, build, smoke, and integration checks
test-clis:
    ./scripts/test-clis.sh --phase all

# Run all CLI checks for one tool
test-cli NAME:
    ./scripts/test-clis.sh --phase all --tool {{NAME}}

# Run one CLI phase for one tool
test-cli-phase NAME PHASE:
    ./scripts/test-clis.sh --phase {{PHASE}} --tool {{NAME}}

# Print the xkit dev license server public key
xkit-license-public-key:
    if command -v go >/dev/null 2>&1; then (cd apps/xkit && go run ./cmd/xkit-license-server public-key); else echo "Skipping xkit license server key (go not installed)"; fi

# Package a Rust binary for a specific target
package-cli CLI TARGET:
    mkdir -p dist
    cargo build -p {{CLI}} --release --target {{TARGET}}
    tar -C target/{{TARGET}}/release -czf dist/{{CLI}}-{{TARGET}}.tar.gz {{CLI}}

# Run tests
test:
    cargo test --workspace
    if [ "$(uname)" = "Darwin" ] && [ -f apps/mediakit/Package.swift ]; then ./scripts/swift-package-clean-run.sh apps/mediakit swift build; fi
    if command -v go >/dev/null 2>&1; then (cd apps/xkit && go test ./...); else echo "Skipping xkit tests (go not installed)"; fi

# Run clippy lints
lint:
    cargo clippy --workspace --all-targets -- -D warnings

# Format Rust code
fmt:
    cargo fmt --all

# Check Rust formatting
fmt-check:
    cargo fmt --all --check

# Run a specific Rust CLI
run CLI="filekit":
    cargo run -p {{CLI}} -- --help

# Clean build artifacts
clean:
    cargo clean
    rm -rf apps/mediakit/.build apps/mediakit/.swiftpm

# Add a new Rust CLI
new-cli NAME:
    cargo new --bin apps/{{NAME}}
    @echo "Add to Cargo.toml workspace members: \"apps/{{NAME}}\""

# Build and install a CLI to mise shims.
# Usage:
#   just install          # Install all CLIs
#   just install agentkit # Install a single CLI
install NAME="all":
    #!/usr/bin/env bash
    set -euo pipefail

    command -v mise >/dev/null 2>&1 || { echo "Error: mise is required"; exit 1; }

    mise_shims="${HOME}/.local/share/mise/shims"
    mkdir -p "$mise_shims"
    NAME="{{NAME}}"

    case "$NAME" in
      filekit)
        command -v cargo >/dev/null 2>&1 || { echo "Error: cargo is required for filekit"; exit 1; }
        echo "Building filekit (Rust)..."
        cargo build -p "filekit" --release
        ln -sf "$(pwd)/target/release/filekit" "$mise_shims/filekit"
        echo "  filekit -> $mise_shims/filekit"
        ;;

      xkit)
        command -v go >/dev/null 2>&1 || { echo "Error: go is required for $NAME"; exit 1; }
        echo "Building xkit (Go)..."
        (cd apps/xkit && go build -o ../../target/xkit .)
        ln -sf "$(pwd)/target/xkit" "$mise_shims/xkit"
        echo "  xkit -> $mise_shims/xkit"
        ;;

      agentkit)
        echo "Building agentkit (TypeScript)..."
        (cd apps/agentkit && npm run build)
        ln -sf "$(pwd)/apps/agentkit/dist/index.js" "$mise_shims/agentkit"
        chmod +x "$mise_shims/agentkit"
        echo "  agentkit -> $mise_shims/agentkit"
        ;;

      mediakit)
        if [ "$(uname)" != "Darwin" ]; then echo "Error: mediakit requires macOS"; exit 1; fi
        command -v swift >/dev/null 2>&1 || { echo "Error: swift is required for $NAME"; exit 1; }
        echo "Building mediakit (Swift)..."
        ./scripts/swift-package-clean-run.sh apps/mediakit swift build -c release
        ln -sf "$(pwd)/apps/mediakit/.build/release/mediakit" "$mise_shims/mediakit"
        echo "  mediakit -> $mise_shims/mediakit"
        ;;

      all)
        # Install all CLIs
        if command -v cargo >/dev/null 2>&1; then
          echo "Building filekit..."
          cargo build -p "filekit" --release
          ln -sf "$(pwd)/target/release/filekit" "$mise_shims/filekit"
          echo "  filekit -> $mise_shims/filekit"
        fi
        if command -v go >/dev/null 2>&1; then
          echo "Building xkit..."
          (cd apps/xkit && go build -o ../../target/xkit .)
          ln -sf "$(pwd)/target/xkit" "$mise_shims/xkit"
          echo "  xkit -> $mise_shims/xkit"
        fi
        if [ -f apps/agentkit/package.json ]; then
          echo "Building agentkit..."
          (cd apps/agentkit && npm run build)
          ln -sf "$(pwd)/apps/agentkit/dist/index.js" "$mise_shims/agentkit"
          chmod +x "$mise_shims/agentkit"
          echo "  agentkit -> $mise_shims/agentkit"
        fi
        if [ "$(uname)" = "Darwin" ] && [ -f apps/mediakit/Package.swift ]; then
          if command -v swift >/dev/null 2>&1; then
            echo "Building mediakit..."
            ./scripts/swift-package-clean-run.sh apps/mediakit swift build -c release
            ln -sf "$(pwd)/apps/mediakit/.build/release/mediakit" "$mise_shims/mediakit"
            echo "  mediakit -> $mise_shims/mediakit"
          fi
        fi
        ;;

      *)
        echo "Unknown app: $NAME"
        echo "Available: filekit, agentkit, xkit, mediakit"
        exit 1
        ;;
    esac

# Scrape the DatPiff collection from Internet Archive
scrape-datpiff:
    cd apps/datpiff && python3 -m datpiff scrape archiveorg --query "collection:hiphopmixtapes"
