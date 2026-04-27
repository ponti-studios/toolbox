# Companion 2: Rust Patterns Cheat Sheet (for Gitkit)

## 1) `Result` + `?`

```rust
fn read_config(path: &std::path::Path) -> anyhow::Result<String> {
    let s = std::fs::read_to_string(path)?;
    Ok(s)
}
```

Use `?` when the caller can reasonably handle/propagate the error.

## 2) `Option` handling

```rust
let maybe_name: Option<&str> = url.path_segments().and_then(|mut s| s.next_back());
let filename = maybe_name.unwrap_or("download.bin");
```

Prefer `unwrap_or`/`ok_or_else` over `unwrap`.

## 3) Borrowing vs owning

```rust
fn normalize(input: &url::Url) -> url::Url {
    let mut out = input.clone();
    out.set_fragment(None);
    out
}
```

Borrow inputs (`&T`) and return owned outputs when transforming.

## 4) `Path` and `PathBuf`

```rust
let dest: std::path::PathBuf = base.join("nested").join("file.txt");
if let Some(parent) = dest.parent() {
    std::fs::create_dir_all(parent)?;
}
```

Use `Path` for read-only refs, `PathBuf` for construction/mutation.

## 5) Async call shape

```rust
async fn fetch(client: &reqwest::Client, url: &url::Url) -> anyhow::Result<reqwest::Response> {
    let resp = client.get(url.clone()).send().await?;
    Ok(resp)
}
```

Pass shared state by reference, avoid cloning client per call.

## 6) `match` with guards

```rust
match resp.status() {
    s if s.is_success() => { /* ... */ }
    s if s.is_server_error() => { /* retry? */ }
    _ => { /* fail */ }
}
```

Great for retry policy decisions.

## 7) Custom error enums

```rust
#[derive(thiserror::Error, Debug)]
enum FetchError {
    #[error("input: {0}")]
    Input(String),
    #[error("network: {0}")]
    Network(String),
}
```

Useful when you want stable error categories.
