# gimme

Fetch a file from GitHub and write it into the local filesystem.

## Install

Preferred distribution is via the studio Homebrew tap.

For local development:

```bash
cargo run -p gimme -- --help
```

## Example

```bash
gimme owner/repo/path/to/file.txt@main ./output
```

## Release

Release assets are published from tags like `gimme-v0.1.1`.
