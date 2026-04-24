# gitkit

Fetch a file from GitHub and write it into the local filesystem.

## Install

Preferred distribution is via the studio Homebrew tap.

For local development:

```bash
cargo run -p gitkit -- --help
```

## Usage

```bash
gitkit <source> [destination]
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
gitkit owner/repo/file.txt@main

# With tag
gitkit owner/repo/config.yaml@v1.0.0

# With commit hash
gitkit owner/repo/script.py@abc123def

# Nested path
gitkit owner/repo/src/utils/helper.rs@main

# Deep nested path
gitkit owner/repo/packages/core/src/lib.rs@main
```

### Full URL Format

```bash
# Basic URL
gitkit https://github.com/owner/repo/blob/main/file.txt

# URL with branch
gitkit https://github.com/owner/repo/blob/develop/config.json

# URL with nested path
gitkit https://github.com/owner/repo/blob/main/src/components/Button.tsx
```

### Destination Options

```bash
# Download to current directory (default)
gitkit owner/repo/README.md@main

# Download to specific directory
gitkit owner/repo/package.json@main ./config

# Download with relative path
gitkit owner/repo/.github/workflows/ci.yml@main ./.github/workflows

# Download with absolute path
gitkit owner/repo/file.txt@main /tmp/downloads

# Download to nested directory (auto-created)
gitkit owner/repo/src/lib.rs@main ./project/src
```

### Real-World Examples

```bash
# Download a popular project's config
gitkit vercel/next.js@main/package.json

# Download GitHub Actions workflow
gitkit actions/setup-node@main/action.yml

# Download documentation file
gitkit rust-lang/book@main/src/ch01-00-introduction.md

# Download to specific location
gitkit microsoft/vscode@main/LICENSE.txt ./licenses
```

---

## Error Cases

### Invalid Repository

```bash
# Non-existent repo
gitkit nonexistent-org/nonexistent-repo/file.txt@main
```

### Invalid Reference

```bash
# Non-existent branch
gitkit owner/repo/file.txt@nonexistent-branch

# Non-existent tag
gitkit owner/repo/file.txt@v999.999.999
```

### Invalid File Path

```bash
# Non-existent file
gitkit owner/repo/nonexistent/path.txt@main

# Directory instead of file
gitkit owner/repo/src@main
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
cargo build -p gitkit

# Run from source
cargo run -p gitkit -- owner/repo/file.txt@main

# Run binary directly
./target/debug/gitkit owner/repo/file.txt@main

# Install globally
cargo install --path apps/gitkit
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

Release assets are published from tags like `gitkit-v0.1.1`.

---

## Technical Notes

- Supports multiple GitHub source formats, including short `owner/repo/path@ref` and full GitHub blob URLs
- Fetches file content from GitHub and writes it directly to disk
- Creates parent directories automatically when needed
- Overwrites existing files without prompting
- Public repositories do not require authentication

## Related Files

- Source: `apps/gitkit/src/main.rs`
- Parser: `apps/gitkit/src/parser.rs`
- GitHub client: `apps/gitkit/src/github.rs`
- Error handling: `apps/gitkit/src/error.rs`
