# CLI Tools Monorepo

A suite of open-source published CLI tools.

## Apps

| CLI | Language | Status | Description |
|-----|----------|--------|-------------|
| `chronicle` | Python | experimental | Calendar intelligence CLI for local-first Google Calendar enrichment |
| `costlens` | Rust | active | LLM cost analysis for CSV exports |
| `essay-classifier` | Go | active | Organize and classify markdown essays using embeddings and LLMs |
| `geo` | Rust | active | Geolocation lookup and CSV geocoding via OpenStreetMap Nominatim |
| `gimme` | Rust | active | Copy files from GitHub to the local filesystem |
| `netdebug` | Rust | active | Network debugging CLI with animated diagnostics |
| `voidline` | Rust | active | Utilities for frontmatter, calendar import, and local tooling |

## Shared Packages

| Package | Description |
|---------|-------------|
| `packages/cli-utils/` | Shared Rust utilities for CLI apps |

## Local Development

Requirements:

- Rust stable with `clippy` and `rustfmt`
- `just` for task shortcuts
- Python 3.12 (for chronicle)
- Go 1.25+ (for essay-classifier)

Rust commands:

```bash
just check
just build
just test
just lint
just fmt
just smoke
```

Run one binary during development:

```bash
cargo run -p geo -- --help
cargo run -p gimme -- owner/repo/path.txt@main
cargo run -p costlens -- dashboard --help
```

## Release Model

Each binary keeps its own version in its `Cargo.toml` or `pyproject.toml`.

- **Rust apps**: Use release-plz with GitHub Actions
- **Python app**: Publish to PyPI, install via pip or Homebrew
- **Go app**: Install via `go install` or Homebrew

Release tags use the format `<cli>-v<version>`.

Example:

```bash
git tag geo-v0.1.0
git push origin geo-v0.1.0
```

## Distribution

Homebrew is the primary distribution path.

- Formula templates live in `tooling/homebrew/`
- Release workflows in `.github/workflows/release.yml`

## Repo Layout

```
apps/                 CLI applications (Rust, Python, Go)
packages/             Shared internal libraries
tooling/homebrew/     Homebrew formula templates
.github/workflows/   CI and release automation
```