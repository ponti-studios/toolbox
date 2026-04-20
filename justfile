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
    clis="geo gimme voidline costlens netdebug"
    for cli in $clis; do
        src="target/release/$cli"
        dst="$mise_shims/$cli"
        if [ ! -f "$src" ]; then
            echo "Building $cli..."
            cargo build -p "$cli" --release
        fi
        echo "Symlinking $cli to mise shims..."
        mkdir -p "$mise_shims"
        ln -sf "$(pwd)/$src" "$dst"
        echo "  $cli -> $dst"
    done
