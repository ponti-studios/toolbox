default:
    @just --list

# Build all CLIs
build:
    cargo build --workspace
    if [ "$(uname)" = "Darwin" ] && [ -d apps/geo ]; then (cd apps/geo && swift build); fi

# Build specific Rust CLI
build-cli CLI:
    cargo build --release -p {{CLI}}

# Build release for current platform
build-release:
    cargo build --workspace --release
    if [ "$(uname)" = "Darwin" ] && [ -d apps/geo ]; then (cd apps/geo && swift build -c release); fi


# Typecheck all Rust crates
check:
    cargo check --workspace --all-targets

# Smoke test binaries via --help
smoke:
    if [ "$(uname)" = "Darwin" ] && [ -d apps/geo ]; then (cd apps/geo && swift run geo -- --help); else echo "Skipping geo smoke test on non-macOS"; fi
    cargo run -p gimme -- --help
    cargo run -p voidline -- --help
    cargo run -p costlens -- --help
    cargo run -p netdebug -- --help

# Package a Rust binary for a specific target
package-cli CLI TARGET:
    mkdir -p dist
    cargo build -p {{CLI}} --release --target {{TARGET}}
    tar -C target/{{TARGET}}/release -czf dist/{{CLI}}-{{TARGET}}.tar.gz {{CLI}}

# Run tests
test:
    cargo test --workspace
    if [ "$(uname)" = "Darwin" ] && [ -d apps/geo ]; then (cd apps/geo && swift test); fi

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
run CLI="gimme":
    cargo run -p {{CLI}} -- --help

# Clean build artifacts
clean:
    cargo clean
    rm -rf apps/geo/.build

# Add a new Rust CLI
new-cli NAME:
    cargo new --bin apps/{{NAME}}
    @echo "Add to Cargo.toml workspace members: \"apps/{{NAME}}\""

# Symlink all CLI binaries to mise shims
symlink:
    #!/usr/bin/env bash
    set -e
    mise_shims="${HOME}/.local/share/mise/shims"
    mkdir -p "$mise_shims"

    if [ "$(uname)" = "Darwin" ] && [ -d apps/geo ]; then
        echo "Building geo..."
        (cd apps/geo && swift build -c release)
        ln -sf "$(pwd)/apps/geo/.build/release/geo" "$mise_shims/geo"
        echo "  geo -> $mise_shims/geo"
    else
        echo "Skipping geo symlink on non-macOS"
    fi

    clis="gimme voidline costlens netdebug"
    for cli in $clis; do
        source="target/release/$cli"
        destination="$mise_shims/$cli"
        if [ ! -f "$source" ]; then
            echo "Building $cli..."
            cargo build -p "$cli" --release
        fi
        echo "Symlinking $cli to mise shims..."
        ln -sf "$(pwd)/$source" "$destination"
        echo "  $cli -> $destination"
    done

# Build and link the unified CLI setup (voidline + chronicle)
setup:
    #!/usr/bin/env bash
    set -e
    command -v go >/dev/null 2>&1 || { echo "Error: go is required for setup"; exit 1; }
    command -v python3 >/dev/null 2>&1 || { echo "Error: python3 is required for setup"; exit 1; }
    command -v mise >/dev/null 2>&1 || { echo "Error: mise is required for setup"; exit 1; }

    mise_shims="${HOME}/.local/share/mise/shims"
    mkdir -p "$mise_shims"

    echo "Building voidline..."
    cargo build -p voidline --release
    ln -sf "$(pwd)/target/release/voidline" "$mise_shims/voidline"
    echo "  voidline -> $mise_shims/voidline"

    echo "Setting up chronicle..."
    if [ ! -d "apps/chronicle/.venv" ]; then
        python3 -m venv apps/chronicle/.venv
    fi
    (cd apps/chronicle && . .venv/bin/activate && python -m pip install -e .)
    ln -sf "$(pwd)/apps/chronicle/.venv/bin/chronicle" "$mise_shims/chronicle"
    echo "  chronicle -> $mise_shims/chronicle"

# Build geo in release mode
build-geo:
    cd apps/geo && swift build -c release

# Run geo with a query
run-geo QUERY:
    cd apps/geo && swift run geo -- {{QUERY}}

# Package geo for the current macOS architecture
package-geo:
    #!/usr/bin/env bash
    set -e
    command -v swift >/dev/null 2>&1 || { echo "Error: swift is required for package-geo"; exit 1; }

    mkdir -p dist
    (cd apps/geo && swift build -c release)

    case "$(uname -m)" in
      arm64) target="aarch64-apple-darwin" ;;
      x86_64) target="x86_64-apple-darwin" ;;
      *) echo "Unsupported architecture: $(uname -m)"; exit 1 ;;
    esac

    artifact="dist/geo-${target}.tar.gz"
    tar -C apps/geo/.build/release -czf "$artifact" geo
    echo "Wrote $artifact"

# Install geo to mise shims
install-geo:
    #!/usr/bin/env bash
    set -e
    command -v swift >/dev/null 2>&1 || { echo "Error: swift is required for install-geo"; exit 1; }

    mise_shims="${HOME}/.local/share/mise/shims"
    mkdir -p "$mise_shims"

    echo "Building geo..."
    (cd apps/geo && swift build -c release)
    ln -sf "$(pwd)/apps/geo/.build/release/geo" "$mise_shims/geo"
    echo "  geo -> $mise_shims/geo"

# Alias for setup
install: setup

# Remove setup artifacts
clean-setup:
    #!/usr/bin/env bash
    set -e
    rm -f "${HOME}/.local/share/mise/shims/voidline"
    rm -f "${HOME}/.local/share/mise/shims/chronicle"
    rm -f "${HOME}/.local/share/mise/shims/geo"
    rm -rf apps/chronicle/.venv
    echo "Removed setup artifacts for voidline, chronicle, and geo"
