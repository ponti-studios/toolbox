default:
    @just --list

# Build all CLIs
build:
    cargo build --workspace

# Build release for current platform
build-release:
    cargo build --release

# Build specific CLI
build-cli CLI:
    cargo build --release -p {{CLI}}

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
