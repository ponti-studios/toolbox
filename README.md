# CLI Tools Monorepo

Rust-based CLI tools consolidated into a single workspace.

## CLIs

| CLI | Description |
|-----|-------------|
| `geo` | Geolocation lookup via OpenStreetMap Nominatim |
| `gimme` | Copy files from GitHub to local filesystem |
| `voidline` | CLI utilities (frontmatter, finance, import) |
| `costlens` | LLM cost analysis |
| `labstools` | Token counting for text files |

## Development

```bash
# Build all
cargo build --workspace

# Test all
cargo test --workspace

# Lint
cargo clippy --workspace --all-targets -- -D warnings

# Format
cargo fmt --all
```

Or use `just`:
```bash
just build
just test
just lint
```

## Release

Release individual CLIs with version tags:
```bash
git tag geo-v1.0.0
git push origin geo-v1.0.0
```

This publishes to crates.io and creates a GitHub release.
