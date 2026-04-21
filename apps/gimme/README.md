# gimme

Fetch a file from GitHub and write it into the local filesystem.

## Install

Preferred distribution is via the studio Homebrew tap.

For local development:

```bash
cargo run -p gimme -- --help
```

## Usage

```bash
gimme <source> [destination]
```

**Arguments:**

| Argument | Description | Default |
|----------|-------------|---------|
| `<source>` | GitHub URL or `owner/repo/path@ref` (required) | - |
| `<destination>` | Destination directory | Current directory (`.`) |

**Source Formats:**

1. **Short format:** `owner/repo/path@ref`
2. **Full URL:** `https://github.com/owner/repo/blob/ref/path`

---

## Examples

### Short Format

```bash
# With branch
gimme owner/repo/file.txt@main

# With tag
gimme owner/repo/config.yaml@v1.0.0

# With commit hash
gimme owner/repo/script.py@abc123def

# Nested path
gimme owner/repo/src/utils/helper.rs@main

# Deep nested path
gimme owner/repo/packages/core/src/lib.rs@main
```

### Full URL Format

```bash
# Basic URL
gimme https://github.com/owner/repo/blob/main/file.txt

# URL with branch
gimme https://github.com/owner/repo/blob/develop/config.json

# URL with nested path
gimme https://github.com/owner/repo/blob/main/src/components/Button.tsx
```

### Destination Options

```bash
# Download to current directory (default)
gimme owner/repo/README.md@main

# Download to specific directory
gimme owner/repo/package.json@main ./config

# Download with relative path
gimme owner/repo/.github/workflows/ci.yml@main ./.github/workflows

# Download with absolute path
gimme owner/repo/file.txt@main /tmp/downloads

# Download to nested directory (auto-created)
gimme owner/repo/src/lib.rs@main ./project/src
```

### Real-World Examples

```bash
# Download a popular project's config
gimme vercel/next.js@main/package.json

# Download GitHub Actions workflow
gimme actions/setup-node@main/action.yml

# Download documentation file
gimme rust-lang/book@main/src/ch01-00-introduction.md

# Download to specific location
gimme microsoft/vscode@main/LICENSE.txt ./licenses
```

---

## Error Cases

### Invalid Repository

```bash
# Non-existent repo
gimme nonexistent-org/nonexistent-repo/file.txt@main
```

### Invalid Reference

```bash
# Non-existent branch
gimme owner/repo/file.txt@nonexistent-branch

# Non-existent tag
gimme owner/repo/file.txt@v999.999.999
```

### Invalid File Path

```bash
# Non-existent file
gimme owner/repo/nonexistent/path.txt@main

# Directory instead of file
gimme owner/repo/src@main
```

---

## Supported References

| Type | Example | Description |
|------|---------|-------------|
| Branch | `main` | Default branch |
| Branch | `develop` | Development branch |
| Tag | `v1.0.0` | Semantic version tag |
| Tag | `release-2024` | Release tag |
| Commit | `abc123def` | Full commit hash |
| Commit | `abc123` | Short commit hash |

---

## Build & Run

```bash
# Build
cargo build -p gimme

# Run from source
cargo run -p gimme -- owner/repo/file.txt@main

# Run binary directly
./target/debug/gimme owner/repo/file.txt@main

# Install globally
cargo install --path apps/gimme
```

---

## Testing Checklist

### Source Formats
- [ ] Short format with branch (`owner/repo/file@main`)
- [ ] Short format with tag (`owner/repo/file@v1.0.0`)
- [ ] Short format with commit hash (`owner/repo/file@abc123`)
- [ ] Full GitHub URL format

### File Types
- [ ] Text files (.txt, .md)
- [ ] Code files (.rs, .py, .js, .ts)
- [ ] Config files (.json, .yaml, .toml)
- [ ] Empty files
- [ ] Large files (>1MB)

### Destinations
- [ ] Current directory (default)
- [ ] Existing directory
- [ ] Non-existent directory (auto-create)
- [ ] Nested directory structure

### Error Handling
- [ ] Invalid repo (404)
- [ ] Invalid branch/tag (404)
- [ ] Invalid file path (404)
- [ ] Private repo without auth (404/403)

---

## Notes

- GitHub API rate limits: 60 requests/hour (unauthenticated), 5000/hour (authenticated)
- Creates parent directories automatically if they don't exist
- Overwrites existing files without warning
- No authentication required for public repositories

---

## Release

Release assets are published from tags like `gimme-v0.1.1`.

---

## Technical Notes

- Supports multiple GitHub source formats, including short `owner/repo/path@ref` and full GitHub blob URLs
- Fetches file content from GitHub and writes it directly to disk
- Creates parent directories automatically when needed
- Overwrites existing files without prompting
- Public repositories do not require authentication

## Related Files

- Source: `apps/gimme/src/main.rs`
- Parser: `apps/gimme/src/parser.rs`
- GitHub client: `apps/gimme/src/github.rs`
- Error handling: `apps/gimme/src/error.rs`
