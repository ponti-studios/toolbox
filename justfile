default:
    @just --list

# Build all CLIs
build:
    cargo build --workspace
    if [ "$(uname)" = "Darwin" ] && [ -d apps/geokit ]; then (cd apps/geokit && swift build); fi

# Build specific Rust CLI
build-cli CLI:
    cargo build --release -p {{CLI}}

# Build release for current platform
build-release:
    cargo build --workspace --release
    if [ "$(uname)" = "Darwin" ] && [ -d apps/geokit ]; then (cd apps/geokit && swift build -c release); fi


# Typecheck all Rust crates
check:
    cargo check --workspace --all-targets

# Smoke test binaries via --help
smoke:
    if [ "$(uname)" = "Darwin" ] && [ -d apps/geokit ]; then (cd apps/geokit && swift run geokit -- --help); else echo "Skipping geokit smoke test on non-macOS"; fi
    cargo run -p gitkit -- --help
    cargo run -p filekit -- --help
    cargo run -p costkit -- --help
    cargo run -p netkit -- --help

# Package a Rust binary for a specific target
package-cli CLI TARGET:
    mkdir -p dist
    cargo build -p {{CLI}} --release --target {{TARGET}}
    tar -C target/{{TARGET}}/release -czf dist/{{CLI}}-{{TARGET}}.tar.gz {{CLI}}

# Run tests
test:
    cargo test --workspace
    if [ "$(uname)" = "Darwin" ] && [ -d apps/geokit ]; then (cd apps/geokit && swift test); fi

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
run CLI="gitkit":
    cargo run -p {{CLI}} -- --help

# Clean build artifacts
clean:
    cargo clean
    rm -rf apps/geokit/.build

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

    if [ "$(uname)" = "Darwin" ] && [ -d apps/geokit ]; then
        echo "Building geokit..."
        (cd apps/geokit && swift build -c release)
        ln -sf "$(pwd)/apps/geokit/.build/release/geokit" "$mise_shims/geokit"
        echo "  geokit -> $mise_shims/geokit"
    else
        echo "Skipping geokit symlink on non-macOS"
    fi

    clis="gitkit filekit costkit netkit"
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

# Build and link the unified CLI setup (filekit + timekit)
setup:
    #!/usr/bin/env bash
    set -e
    command -v go >/dev/null 2>&1 || { echo "Error: go is required for setup"; exit 1; }
    command -v python3 >/dev/null 2>&1 || { echo "Error: python3 is required for setup"; exit 1; }
    command -v mise >/dev/null 2>&1 || { echo "Error: mise is required for setup"; exit 1; }

    mise_shims="${HOME}/.local/share/mise/shims"
    mkdir -p "$mise_shims"

    echo "Building filekit..."
    cargo build -p filekit --release
    ln -sf "$(pwd)/target/release/filekit" "$mise_shims/filekit"
    echo "  filekit -> $mise_shims/filekit"

    echo "Setting up timekit..."
    if [ ! -d "apps/timekit/.venv" ]; then
        python3 -m venv apps/timekit/.venv
    fi
    (cd apps/timekit && . .venv/bin/activate && python -m pip install -e .)
    ln -sf "$(pwd)/apps/timekit/.venv/bin/timekit" "$mise_shims/timekit"
    echo "  timekit -> $mise_shims/timekit"

# Build geokit in release mode
build-geokit:
    cd apps/geokit && swift build -c release

# Run geokit with a query
run-geokit QUERY:
    cd apps/geokit && swift run geokit -- {{QUERY}}

# Package geokit for the current macOS architecture
package-geokit:
    #!/usr/bin/env bash
    set -e
    command -v swift >/dev/null 2>&1 || { echo "Error: swift is required for package-geokit"; exit 1; }

    mkdir -p dist
    (cd apps/geokit && swift build -c release)

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
    (cd apps/geokit && swift build -c release)
    ln -sf "$(pwd)/apps/geokit/.build/release/geokit" "$mise_shims/geokit"
    echo "  geokit -> $mise_shims/geokit"

# Alias for setup
install: setup

# Remove setup artifacts
clean-setup:
    #!/usr/bin/env bash
    set -e
    rm -f "${HOME}/.local/share/mise/shims/filekit"
    rm -f "${HOME}/.local/share/mise/shims/timekit"
    rm -f "${HOME}/.local/share/mise/shims/geokit"
    rm -rf apps/timekit/.venv
    echo "Removed setup artifacts for filekit, timekit, and geokit"
