default:
    @just --list

# Build all CLIs
build:
    cargo build --workspace

# Typecheck all crates
check:
    cargo check --workspace --all-targets

# Build release for current platform
build-release:
    cargo build --workspace --release

# Build specific CLI
build-cli CLI:
    cargo build --release -p {{CLI}}

# Smoke test every binary via --help
smoke:
    cargo run -p geo -- --help
    cargo run -p gimme -- --help
    cargo run -p voidline -- --help
    cargo run -p costlens -- --help
    cargo run -p chronicle -- --help

# Package a binary for a specific target
package-cli CLI TARGET:
    mkdir -p dist
    cargo build -p {{CLI}} --release --target {{TARGET}}
    tar -C target/{{TARGET}}/release -czf dist/{{CLI}}-{{TARGET}}.tar.gz {{CLI}}

# Run all tests
test:
    cargo test --workspace

# Run clippy lints
lint:
    cargo clippy --workspace --all-targets -- -D warnings

# Format code
fmt:
    cargo fmt --all

# Check formatting
fmt-check:
    cargo fmt --all --check

# Run a specific CLI
run CLI="geo":
    cargo run -p {{CLI}} -- --help

# Clean build artifacts
clean:
    cargo clean

# Add a new CLI
new-cli NAME:
    cargo new --bin apps/{{NAME}}
    @echo "Add to Cargo.toml workspace members: \"apps/{{NAME}}\""

# Symlink all CLI binaries to mise shims
symlink:
    #!/usr/bin/env bash
    set -e
    mise_shims="${HOME}/.local/share/mise/shims"
    mkdir -p "$mise_shims"

    clis="geo gimme voidline costlens netdebug"
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

# Alias for setup
install: setup

# Remove setup artifacts
clean-setup:
    #!/usr/bin/env bash
    set -e
    rm -f "${HOME}/.local/share/mise/shims/voidline"
    rm -f "${HOME}/.local/share/mise/shims/chronicle"
    rm -rf apps/chronicle/.venv
    echo "Removed setup artifacts for voidline and chronicle"
