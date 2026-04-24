# CLI Tools Monorepo

A polyglot monorepo for independent command-line tools built in Rust, Swift, Go, and Python.

## Overview

This repository contains several focused CLI applications that share a common release and development workflow.
Each tool has its own README with full command reference, examples, and testing guidance.

## Workspace Layout

```text
toolbox/
├── apps/
│   ├── geo/
│   ├── gimme/
│   ├── voidline/
│   ├── costlens/
│   ├── netdebug/
│   └── chronicle/
├── packages/
│   └── cli-utils/
├── docs/
├── tooling/
└── justfile
```

## Tool Index

| Tool | Language | Description |
|------|----------|-------------|
| [geo](./apps/geo/README.md) | Swift | Apple Maps geolocation lookup and CSV geocoding |
| [gimme](./apps/gimme/README.md) | Rust | Fetch files from GitHub |
| [voidline](./apps/voidline/README.md) | Rust | Frontmatter, calendar, and essay classification utilities |
| [costlens](./apps/costlens/README.md) | Rust | LLM cost analysis |
| [netdebug](./apps/netdebug/README.md) | Rust | Network diagnostics |
| [chronicle](./apps/chronicle/README.md) | Python | Calendar intelligence tooling |

## Shared Package

- `packages/cli-utils` contains shared Rust utilities used across the Rust tools.

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
cd apps/geo && swift run geo -- geocode "New York"
cargo run -p gimme -- owner/repo/file.txt@main
cargo run -p voidline -- frontmatter walk
cargo run -p costlens -- dashboard
cargo run -p netdebug -- -s google.com
```

### Python tool

```bash
cd apps/chronicle
pip install -e .
pytest
```

## Release Notes

- Release tags follow the pattern `<cli>-v<version>`
- `geo` release assets are macOS binaries built from the Swift package in `apps/geo`
- Rust tools continue to use the Cargo workspace and shared release flow
- `voidline` is the primary file-management and analysis CLI
- Python tools follow their own package-specific workflows

## Documentation

- Tool-specific command references live in each app’s `README.md`
- Additional CLI reference docs were consolidated into the app READMEs

## License

MIT
