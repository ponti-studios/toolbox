# toolbox

A monorepo for command-line tools built in Rust, Swift, and Go.

Repository: https://github.com/ponti-studios/toolbox

## Overview

This repository contains several CLI applications with a shared development and release workflow.
Each tool has its own README.

## Workspace Layout

```text
toolbox/
├── apps/
│   ├── geokit/
│   ├── mediakit/
│   ├── filekit/
│   ├── costkit/
│   ├── netkit/
│   ├── timekit/
│   └── xkit/
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
| [xkit](./apps/xkit/README.md) | Go | Local-first paid X post deletion CLI |

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
cd apps/xkit && go run . delete-posts --help
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

## Releases

- Release tags follow the pattern `<cli>-v<version>`
- `geokit` release assets are macOS binaries built from the Swift package in `apps/geokit`
- `filekit` is the primary file-management and analysis CLI
- Rust tools use the Cargo workspace
- Swift tools build from their package directories
- `xkit` is a standalone Go CLI built from `apps/xkit`
- GitHub releases and Homebrew formula templates are wired to `ponti-studios/toolbox`

## Documentation

- Tool-specific command references live in each app’s `README.md`

## License

MIT
