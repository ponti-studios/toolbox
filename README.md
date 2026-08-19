# toolbox

A monorepo for command-line tools and small local apps built in TypeScript, Swift, Go, and Python.

Repository: https://github.com/ponti-studios/toolbox

## Overview

This repository contains several CLI applications and local proof apps with a shared development workflow.
Each tool has its own README.

## Workspace Layout

```text
toolbox/
├── apps/
│   ├── filekit/
│   ├── xkit/
│   ├── mediakit/
│   ├── datpiff/
│   ├── photokit/
│   └── agentkit/
├── packages/
│   └── files/
├── docs/
├── tooling/
└── justfile
```

## Tool Index

| Tool                                  | Language             | Description                                                                          |
| ------------------------------------- | -------------------- | ------------------------------------------------------------------------------------ |
| [filekit](./apps/filekit/README.md)   | TypeScript / Node 24 | Generic frontmatter and file utilities                                               |
| [xkit](./apps/xkit/README.md)         | Go                   | Paid destructive X/Twitter post deletion                                             |
| [mediakit](./apps/mediakit/README.md) | Swift                | Video/audio transcription to Markdown via Apple Speech                               |
| [datpiff](./apps/datpiff/README.md)   | Python               | Internet Archive crawler for DatPiff-style mixtape listings                          |
| [photokit](./apps/photokit/README.md) | Python               | EXIF analysis, date repair from filenames, and date-based renaming                   |
| [agentkit](./apps/agentkit/README.md) | TypeScript           | AI agent usage and cost analytics across Claude Code, Codex, Copilot, and OpenRouter |

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
npm --prefix apps/filekit test
```

### Run manifest-driven CLI checks

```bash
just smoke-clis
just test-clis
just test-cli filekit
```

The checked-in manifest at `tooling/cli-test-manifest.json` is the source of truth for:

- tool metadata (`name`, `language`, `path`, and CI OS)
- build/unit/smoke/integration/release-smoke commands
- whether a CLI is allowed to rely on network or system integration during automation

CLI fixtures should stay tool-local. Existing tools use app-owned fixture directories such as
`apps/costkit/tests/fixtures`, and new CLI fixture work should follow the same pattern instead of
introducing machine-local dependencies.

The CLI runner activates `mise` automatically when it is available so local Go and other managed
toolchains match the versions you have configured. Swift package automation is executed through
`xcrun swift` to use the active Xcode toolchain instead of any ambient shell shim.

### Run a specific tool

```bash
npx @ponti-studios/filekit frontmatter walk
cd apps/datpiff && python3 -m datpiff scrape archiveorg --help
cd apps/xkit && go run . delete-posts --help
```

### Swift tools

```bash
cd apps/mediakit && swift build
cd apps/mediakit && swift run mediakit -- --help
just install-mediakit
```

## Releases

- Release tags follow the pattern `<cli>-v<version>`
- `filekit` is published to npm as `@ponti-studios/filekit`
- Node tools use their app-local npm lockfiles
- Swift tools build from their package directories
- `xkit` is a standalone Go CLI built from `apps/xkit`
- GitHub releases and Homebrew formula templates are wired to `ponti-studios/toolbox`

## Documentation

- Tool-specific command references live in each app's `README.md`
- The manifest-driven CLI test runner lives at `scripts/test-clis.sh`

## License

MIT
