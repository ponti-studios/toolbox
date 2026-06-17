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
│   ├── careerkit/
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
| [filekit](./apps/filekit/README.md) | Rust | Frontmatter, calendar, file utilities, and essay classification |
| [costkit](./apps/costkit/README.md) | Rust | LLM cost analysis |
| [careerkit](./apps/careerkit/README.md) | Go | Markdown-to-DOCX resume builder, verifier, and reviewer |
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

### Build and install careerkit

```bash
just build-careerkit
just install-careerkit
```

### Run the test suite

```bash
cargo test --workspace
```

### Run manifest-driven CLI checks

```bash
just smoke-clis
just test-clis
just test-cli filekit
just test-cli-phase geokit integration
```

The checked-in manifest at `tooling/cli-test-manifest.json` is the source of truth for:

- tool metadata (`name`, `language`, `path`, and CI OS)
- build/unit/smoke/integration/release-smoke commands
- whether a CLI is allowed to rely on network or system integration during automation

CLI fixtures should stay tool-local. Existing tools use app-owned fixture directories such as
`apps/costkit/tests/fixtures` and `apps/careerkit/fixtures`, and new CLI fixture work should
follow the same pattern instead of introducing machine-local dependencies.

The CLI runner activates `mise` automatically when it is available so local Go and other managed
toolchains match the versions you have configured. Swift package automation is executed through
`xcrun swift` to use the active Xcode toolchain instead of any ambient shell shim.

### Run a specific tool

```bash
cd apps/geokit && swift run geokit -- geocode "New York"
cargo run -p filekit -- frontmatter walk
cargo run -p costkit -- dashboard
cd apps/careerkit && go run ./cmd/careerkit --help
cd apps/xkit && go run . delete-posts --help
```

### Swift tools

```bash
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
- `careerkit` is a standalone Go CLI built from `apps/careerkit/cmd/careerkit`
- GitHub releases and Homebrew formula templates are wired to `ponti-studios/toolbox`

## Documentation

- Tool-specific command references live in each app’s `README.md`
- The manifest-driven CLI test runner lives at `scripts/test-clis.sh`

## License

MIT
