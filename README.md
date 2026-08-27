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
│   ├── imagekit/   # primary — replaces iconkit + photokit
│   ├── iconkit/    # compat shim for @ponti-studios/iconkit
│   ├── agentkit/
│   ├── calendar/
│   └── openspeek/
├── packages/
│   └── files/
├── docs/
├── tooling/
└── justfile
```

## Tool Index

| Tool                                      | Language             | Description                                                                                      |
| ----------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------- |
| [filekit](./apps/filekit/README.md)       | TypeScript / Node 24 | Generic frontmatter and file utilities                                                           |
| [xkit](./apps/xkit/README.md)             | Go                   | Paid destructive X/Twitter post deletion                                                         |
| [mediakit](./apps/mediakit/README.md)     | Swift                | Video/audio transcription to Markdown via Apple Speech                                           |
| [datpiff](./apps/datpiff/README.md)       | Python               | Internet Archive crawler for DatPiff-style mixtape listings                                      |
| [imagekit](./apps/imagekit/README.md)     | TypeScript / Bun     | Image resizing, optimization, EXIF analysis, date repair, renaming, and web-icon generation     |
| [iconkit](./apps/iconkit/README.md)       | TypeScript (compat)  | Deprecated shim for `imagekit` — `iconkit` remains as a binary alias                           |
| [agentkit](./apps/agentkit/README.md)     | TypeScript           | AI agent usage and cost analytics across Claude Code, Codex, Copilot, and OpenRouter             |
| [calendar](./apps/calendar/README.md)     | TypeScript / macOS   | Apple Calendar CLI for managing calendars and events via EventKit                                |
| [openspeek](./apps/openspeek/README.md)   | TypeScript / Bun     | Markdown-to-audio narration using OpenRouter TTS and local fallbacks                             |

## Development

### Build the core toolchain

```bash
just build
```

`just build` currently builds FileKit, AgentKit, ImageKit (macOS, when Bun is
available), MediaKit on macOS, and XKit when Go is available. DatPiff, ImageKit, and OpenSpeek use their app-local commands below.

### Install core Node CLIs

```bash
just install
```

This installs FileKit and AgentKit into the active `mise` shim directory. It does not install
every app in the repository.

### Run the core test suite

```bash
just test
```

`just test` runs FileKit’s test suite and XKit’s Go tests when Go is available.

For app-local tests:

```bash
cd apps/imagekit && bun install --frozen-lockfile && bun run typecheck && bun run test
cd apps/openspeek && bun install && bun run typecheck && bun run test
cd apps/datpiff && python3 -m datpiff --help
```

ImageKit is macOS-specific because it uses `sips`. Its fixture corpus and reproducible manual
binary sweep live in `apps/imagekit/tests/fixtures/README.md`. `iconkit` and `photokit` remain as compatibility aliases for `imagekit`.

### Run manifest-driven CLI checks

```bash
just smoke-clis
just test-clis
just test-cli filekit
```

The checked-in manifest at `tooling/cli-test-manifest.json` is the source of truth for the
currently CI-managed CLI checks: FileKit, AgentKit, XKit, and MediaKit. It defines:

- tool metadata (`name`, `language`, `path`, and CI OS)
- build/unit/smoke/integration/release-smoke commands
- whether a CLI is allowed to rely on network or system integration during automation

CLI fixtures should stay tool-local. Use app-owned fixture directories such as
`apps/filekit/tests/fixtures` and `apps/imagekit/tests/fixtures` instead of introducing
machine-local dependencies.

The CLI runner activates `mise` automatically when it is available so local Go and other managed
toolchains match the versions you have configured. Swift package automation is executed through
`xcrun swift` to use the active Xcode toolchain instead of any ambient shell shim.

### Run a specific tool

```bash
npx @ponti-studios/filekit frontmatter walk
cd apps/datpiff && python3 -m datpiff scrape archiveorg --help
cd apps/xkit && go run . delete-posts --help
cd apps/imagekit && bun run build:test && .test-bin/imagekit --help
cd apps/openspeek && bun run build && node dist/openspeek.js --help
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
- `imagekit` is published to npm as `@ponti-studios/imagekit` (primary; `iconkit`/`photokit` are binary aliases)
- `@ponti-studios/iconkit` is a deprecated compatibility package depending on `@ponti-studios/imagekit`
- `openspeek` is published to npm as `@ponti-studios/openspeek`
- Node/Bun tools use their app-local lockfiles
- Swift tools build from their package directories
- `xkit` is a standalone Go CLI built from `apps/xkit`
- GitHub releases and Homebrew formula templates are wired to `ponti-studios/toolbox` where a
  release workflow exists.

## Documentation

- Tool-specific command references live in each app's `README.md`
- The manifest-driven CLI test runner lives at `scripts/test-clis.sh`
- App-specific fixtures and manual workflows live with the corresponding app.

## License

MIT
