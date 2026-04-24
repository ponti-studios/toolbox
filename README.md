# CLI Tools Monorepo

A polyglot monorepo for independent command-line tools built in Rust, Swift, Go, and Python.

## Overview

This repository contains several focused CLI applications that share a common release and development workflow.
Each tool has its own README with full command reference, examples, and testing guidance.

## Workspace Layout

```text
toolbox/
├── apps/
│   ├── geokit/
│   ├── gitkit/
│   ├── filekit/
│   ├── costkit/
│   ├── netkit/
│   └── timekit/
├── packages/
│   └── files/
├── docs/
├── tooling/
└── justfile
```

## Tool Index

| Tool | Language | Description |
|------|----------|-------------|
| [geokit](./apps/geokit/README.md) | Swift | Apple Maps geolocation lookup and CSV geocoding |
| [gitkit](./apps/gitkit/README.md) | Rust | Fetch files from GitHub |
| [filekit](./apps/filekit/README.md) | Rust | Frontmatter, calendar, and essay classification utilities |
| [costkit](./apps/costkit/README.md) | Rust | LLM cost analysis |
| [netkit](./apps/netkit/README.md) | Rust | Network diagnostics |
| [timekit](./apps/timekit/README.md) | Python | Calendar intelligence tooling |

## Shared Packages

- `packages/files` contains shared filesystem and traversal helpers.

## Development

### Build everything

```bash
just build
```

### Run the test suite

```bash
cargo test --workspace
```

### Run a specific tool

```bash
cd apps/geokit && swift run geokit -- geocode "New York"
cargo run -p gitkit -- owner/repo/file.txt@main
cargo run -p filekit -- frontmatter walk
cargo run -p costkit -- dashboard
cargo run -p netkit -- -s google.com
```

### Python tool

```bash
cd apps/timekit
pip install -e .
pytest
```

## Release Notes

- Release tags follow the pattern `<cli>-v<version>`
- `geokit` release assets are macOS binaries built from the Swift package in `apps/geokit`
- Rust tools continue to use the Cargo workspace and shared release flow
- `filekit` is the primary file-management and analysis CLI
- Python tools follow their own package-specific workflows

## Documentation

- Tool-specific command references live in each app’s `README.md`
- Additional CLI reference docs were consolidated into the app READMEs

## License

MIT
