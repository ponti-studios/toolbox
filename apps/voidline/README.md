# voidline

General-purpose utility CLI for frontmatter, calendar import, and local tooling workflows.

## Install

Preferred distribution is via the studio Homebrew tap.

For local development:

```bash
cargo run -p voidline -- --help
```

## Examples

```bash
voidline frontmatter walk --root .
voidline frontmatter aggregate ./notes --output frontmatter.json
voidline frontmatter validate --root ./notes --schema personal --output json
voidline frontmatter migrate --root ./notes --schema personal --strategy fill
voidline frontmatter slug --detect --root ./notes --scope project
voidline frontmatter slug --resolve --slug note --existing-slugs note --existing-slugs note-2
voidline cal doctor
```

## Release

Release assets are published from tags like `voidline-v0.1.0`.
