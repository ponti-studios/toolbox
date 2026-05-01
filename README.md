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
│   ├── mediakit/
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
| [bizkit](./apps/bizkit/README.md) | Rust | Business modeling and scenario analysis |
| [filekit](./apps/filekit/README.md) | Rust | Frontmatter, calendar, file utilities, and essay classification |
| [costkit](./apps/costkit/README.md) | Rust | LLM cost analysis |
| [netkit](./apps/netkit/README.md) | Rust | Network diagnostics |
| [timekit](./apps/timekit/README.md) | Swift | Apple Calendar intelligence tooling |
| [mediakit](./apps/mediakit/README.md) | Swift | Video/audio transcription to Markdown |

## Shared Packages

- `packages/files` contains shared filesystem and traversal helpers.

## Development

### Build everything

```bash
just build
```

### Build and install all CLI binaries

```bash
just install
```

### Run the test suite

```bash
cargo test --workspace
```

### Run a specific tool

```bash
cd apps/geokit && swift run geokit -- geocode "New York"
cargo run -p bizkit -- init
cargo run -p filekit -- frontmatter walk
cargo run -p costkit -- dashboard
cargo run -p netkit -- -s google.com
```

### Swift tools

```bash
cd apps/timekit && swift build
cd apps/timekit && swift run timekit -- --help
cd apps/mediakit && swift build
cd apps/mediakit && swift run mediakit -- --help
just install-geokit
just install-mediakit
```

## Release Notes

- Release tags follow the pattern `<cli>-v<version>`
- `geokit` release assets are macOS binaries built from the Swift package in `apps/geokit`
- Rust tools continue to use the Cargo workspace and shared release flow
- `filekit` is the primary file-management and analysis CLI
- Swift tools build from their package directories; Rust tools continue to use the Cargo workspace and shared release flow

## Documentation

- Tool-specific command references live in each app’s `README.md`
- Additional CLI reference docs were consolidated into the app READMEs

## License

MIT
