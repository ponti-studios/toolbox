default:
    @just --list

# Build all CLIs
build:
    cargo build --workspace
    if [ "$(uname)" = "Darwin" ] && [ -d apps/geokit ]; then ./scripts/swift-package-clean-run.sh apps/geokit swift build; fi
    if [ "$(uname)" = "Darwin" ] && [ -f apps/timekit/Package.swift ]; then ./scripts/swift-package-clean-run.sh apps/timekit swift build; fi
    if [ "$(uname)" = "Darwin" ] && [ -f apps/mediakit/Package.swift ]; then ./scripts/swift-package-clean-run.sh apps/mediakit swift build; fi
    if command -v go >/dev/null 2>&1; then (cd apps/xkit && go build -o ../../target/xkit .); else echo "Skipping xkit (go not installed)"; fi
    if command -v go >/dev/null 2>&1 && [ -d apps/resume ]; then (cd apps/resume && go build -o ../../target/resume ./cmd/resume); else echo "Skipping resume (go not installed or app missing)"; fi

# Build specific Rust CLI
build-cli CLI:
    cargo build --release -p {{CLI}}

# Build release for current platform
build-release:
    cargo build --workspace --release
    if [ "$(uname)" = "Darwin" ] && [ -d apps/geokit ]; then ./scripts/swift-package-clean-run.sh apps/geokit swift build -c release; fi
    if [ "$(uname)" = "Darwin" ] && [ -f apps/timekit/Package.swift ]; then ./scripts/swift-package-clean-run.sh apps/timekit swift build -c release; fi
    if [ "$(uname)" = "Darwin" ] && [ -f apps/mediakit/Package.swift ]; then ./scripts/swift-package-clean-run.sh apps/mediakit swift build -c release; fi
    if command -v go >/dev/null 2>&1; then (cd apps/xkit && go build -o ../../target/xkit .); else echo "Skipping xkit (go not installed)"; fi
    if command -v go >/dev/null 2>&1 && [ -d apps/resume ]; then (cd apps/resume && go build -o ../../target/resume ./cmd/resume); else echo "Skipping resume (go not installed or app missing)"; fi


# Typecheck all Rust crates
check:
    cargo check --workspace --all-targets

# Smoke test binaries via --help
smoke:
    if [ "$(uname)" = "Darwin" ] && [ -d apps/geokit ]; then (cd apps/geokit && swift run geokit -- --help); else echo "Skipping geokit smoke test on non-macOS"; fi
    if [ "$(uname)" = "Darwin" ] && [ -f apps/timekit/Package.swift ]; then (cd apps/timekit && swift run timekit -- --help); else echo "Skipping timekit smoke test on non-macOS"; fi
    if [ "$(uname)" = "Darwin" ] && [ -f apps/mediakit/Package.swift ]; then (cd apps/mediakit && swift run mediakit -- --help); else echo "Skipping mediakit smoke test on non-macOS"; fi
    cargo run -p bizkit -- --help
    cargo run -p filekit -- --help
    cargo run -p costkit -- --help
    cargo run -p netkit -- --help
    if command -v go >/dev/null 2>&1; then (cd apps/xkit && go run . --help); else echo "Skipping xkit smoke test (go not installed)"; fi
    if command -v go >/dev/null 2>&1 && [ -d apps/resume ]; then (cd apps/resume && go run ./cmd/resume --help); else echo "Skipping resume smoke test (go not installed or app missing)"; fi

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
    if [ "$(uname)" = "Darwin" ] && [ -d apps/geokit ]; then ./scripts/swift-package-clean-run.sh apps/geokit swift test; fi
    if [ "$(uname)" = "Darwin" ] && [ -f apps/timekit/Package.swift ]; then ./scripts/swift-package-clean-run.sh apps/timekit swift build; fi
    if [ "$(uname)" = "Darwin" ] && [ -f apps/mediakit/Package.swift ]; then ./scripts/swift-package-clean-run.sh apps/mediakit swift build; fi
    if command -v go >/dev/null 2>&1; then (cd apps/xkit && go test ./...); else echo "Skipping xkit tests (go not installed)"; fi
    if command -v go >/dev/null 2>&1 && [ -d apps/resume ]; then (cd apps/resume && go test ./...); else echo "Skipping resume tests (go not installed or app missing)"; fi

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
    rm -rf apps/geokit/.build
    rm -rf apps/timekit/.build apps/timekit/.swiftpm
    rm -rf apps/mediakit/.build apps/mediakit/.swiftpm

# Add a new Rust CLI
new-cli NAME:
    cargo new --bin apps/{{NAME}}
    @echo "Add to Cargo.toml workspace members: \"apps/{{NAME}}\""

# Build and install all CLI binaries to mise shims
install-all:
    #!/usr/bin/env bash
    set -euo pipefail

    command -v cargo >/dev/null 2>&1 || { echo "Error: cargo is required for install-all"; exit 1; }
    command -v mise >/dev/null 2>&1 || { echo "Error: mise is required for install-all"; exit 1; }

    mise_shims="${HOME}/.local/share/mise/shims"
    mkdir -p "$mise_shims"

    rust_clis="bizkit filekit costkit netkit"
    for cli in $rust_clis; do
        echo "Building $cli..."
        cargo build -p "$cli" --release
        ln -sf "$(pwd)/target/release/$cli" "$mise_shims/$cli"
        echo "  $cli -> $mise_shims/$cli"
    done

    if command -v go >/dev/null 2>&1; then
        echo "Building xkit..."
        (cd apps/xkit && go build -o ../../target/xkit .)
        ln -sf "$(pwd)/target/xkit" "$mise_shims/xkit"
        echo "  xkit -> $mise_shims/xkit"
    fi

    if [ "$(uname)" = "Darwin" ] && [ -d apps/geokit ]; then
        command -v swift >/dev/null 2>&1 || { echo "Error: swift is required for geokit"; exit 1; }
        echo "Building geokit..."
        ./scripts/swift-package-clean-run.sh apps/geokit swift build -c release
        ln -sf "$(pwd)/apps/geokit/.build/release/geokit" "$mise_shims/geokit"
        echo "  geokit -> $mise_shims/geokit"
    fi

    if [ "$(uname)" = "Darwin" ] && [ -f apps/timekit/Package.swift ]; then
        command -v swift >/dev/null 2>&1 || { echo "Error: swift is required for timekit"; exit 1; }
        echo "Building timekit..."
        ./scripts/swift-package-clean-run.sh apps/timekit swift build -c release
        ln -sf "$(pwd)/apps/timekit/.build/release/timekit" "$mise_shims/timekit"
        echo "  timekit -> $mise_shims/timekit"
    fi

    if [ "$(uname)" = "Darwin" ] && [ -f apps/mediakit/Package.swift ]; then
        command -v swift >/dev/null 2>&1 || { echo "Error: swift is required for mediakit"; exit 1; }
        echo "Building mediakit..."
        ./scripts/swift-package-clean-run.sh apps/mediakit swift build -c release
        ln -sf "$(pwd)/apps/mediakit/.build/release/mediakit" "$mise_shims/mediakit"
        echo "  mediakit -> $mise_shims/mediakit"
    fi

# Symlink all CLI binaries to mise shims
symlink: install-all

# Build resume in release-ready mode
build-resume:
    #!/usr/bin/env bash
    set -euo pipefail
    command -v go >/dev/null 2>&1 || { echo "Error: go is required for build-resume"; exit 1; }
    mkdir -p target
    (cd apps/resume && go build -o ../../target/resume ./cmd/resume)
    echo "Built target/resume"

# Install resume to dotfiles bin
install-resume:
    #!/usr/bin/env bash
    set -euo pipefail
    command -v go >/dev/null 2>&1 || { echo "Error: go is required for install-resume"; exit 1; }
    dotfiles_bin="${HOME}/.dotfiles/stow/bin/bin"
    mkdir -p "$dotfiles_bin" target
    (cd apps/resume && go build -o ../../target/resume ./cmd/resume)
    ln -sf "$(pwd)/target/resume" "$dotfiles_bin/resume"
    echo "  resume -> $dotfiles_bin/resume"

# Symlink resume into dotfiles bin
symlink-resume: install-resume

# Build geokit in release mode
build-geokit:
    ./scripts/swift-package-clean-run.sh apps/geokit swift build -c release

# Run geokit with a query
run-geokit QUERY:
    cd apps/geokit && swift run geokit -- {{QUERY}}

# Package geokit for the current macOS architecture
package-geokit:
    #!/usr/bin/env bash
    set -e
    command -v swift >/dev/null 2>&1 || { echo "Error: swift is required for package-geokit"; exit 1; }

    mkdir -p dist
    ./scripts/swift-package-clean-run.sh apps/geokit swift build -c release

    case "$(uname -m)" in
      arm64) target="aarch64-apple-darwin" ;;
      x86_64) target="x86_64-apple-darwin" ;;
      *) echo "Unsupported architecture: $(uname -m)"; exit 1 ;;
    esac

    artifact="dist/geokit-${target}.tar.gz"
    tar -C apps/geokit/.build/release -czf "$artifact" geokit
    echo "Wrote $artifact"

# Install geokit to mise shims
install-geokit:
    #!/usr/bin/env bash
    set -e
    command -v swift >/dev/null 2>&1 || { echo "Error: swift is required for install-geokit"; exit 1; }

    mise_shims="${HOME}/.local/share/mise/shims"
    mkdir -p "$mise_shims"

    echo "Building geokit..."
    ./scripts/swift-package-clean-run.sh apps/geokit swift build -c release
    ln -sf "$(pwd)/apps/geokit/.build/release/geokit" "$mise_shims/geokit"
    echo "  geokit -> $mise_shims/geokit"

# Install mediakit to mise shims
install-mediakit:
    #!/usr/bin/env bash
    set -e
    command -v swift >/dev/null 2>&1 || { echo "Error: swift is required for install-mediakit"; exit 1; }

    mise_shims="${HOME}/.local/share/mise/shims"
    mkdir -p "$mise_shims"

    echo "Building mediakit..."
    ./scripts/swift-package-clean-run.sh apps/mediakit swift build -c release
    ln -sf "$(pwd)/apps/mediakit/.build/release/mediakit" "$mise_shims/mediakit"
    echo "  mediakit -> $mise_shims/mediakit"

# Install all CLI binaries
install: install-all

# Remove setup artifacts
clean-setup:
    #!/usr/bin/env bash
    set -e
    rm -f "${HOME}/.local/share/mise/shims/filekit"
    rm -f "${HOME}/.local/share/mise/shims/timekit"
    rm -f "${HOME}/.local/share/mise/shims/geokit"
    rm -f "${HOME}/.local/share/mise/shims/mediakit"
    rm -f "${HOME}/.local/share/mise/shims/xkit"
    rm -rf apps/timekit/.build apps/timekit/.swiftpm
    rm -rf apps/mediakit/.build apps/mediakit/.swiftpm
    echo "Removed setup artifacts for filekit, timekit, geokit, and mediakit"
