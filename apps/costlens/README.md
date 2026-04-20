# costlens

Analyze CSV exports of LLM usage and costs.

## Install

Preferred distribution is via the studio Homebrew tap.

For local development:

```bash
cargo run -p costlens -- --help
```

## Examples

```bash
costlens dashboard --file usage.csv
costlens models --file usage.csv
costlens costs --file usage.csv
```

## Release

Release assets are published from tags like `costlens-v0.1.0`.
