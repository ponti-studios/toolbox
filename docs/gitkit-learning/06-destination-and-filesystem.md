# Feature 6: Destination Path and File Writing

## What you are building

Write downloaded bytes to disk with automatic parent-directory creation.

## Rust concepts to learn

- `Path`/`PathBuf` operations (`join`, `parent`, `file_name`)
- Binary vs text writes (`Vec<u8>` vs `String`)
- Streaming I/O vs buffered full-body reads
- Defensive filesystem behavior (overwrite policy)

## APIs to study

- `std::fs::create_dir_all`
- `std::fs::write`
- `reqwest::Response::bytes`
- `tokio::fs` for async file writes

## Small example (not a full solution)

```rust
fn ensure_parent(path: &std::path::Path) -> anyhow::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    Ok(())
}
```

```rust
let bytes = response.bytes().await?;
ensure_parent(&dest)?;
std::fs::write(&dest, &bytes)?;
```

## Practice prompts

1. Should existing files be overwritten by default?
2. How will you infer filename when destination is a directory?
3. Should you verify content length before writing?
