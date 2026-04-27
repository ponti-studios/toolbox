# Feature 7: GitHub Blob URL Rewrite (as a convenience)

## What you are building

A pre-fetch transform that converts GitHub blob URLs to raw URLs.

## Rust concepts to learn

- URL decomposition and reconstruction
- Pure transformation functions (easy to unit test)
- Using enums for parse outcomes

## APIs to study

- `url::Url`
- `str::split` / `splitn`
- custom enums for parser results

## Small example (not a full solution)

```rust
fn maybe_rewrite_github_blob(input: &url::Url) -> Option<url::Url> {
    if input.host_str()? != "github.com" {
        return None;
    }

    let segments: Vec<_> = input.path_segments()?.collect();
    // Expect: /owner/repo/blob/<ref>/<path...>
    if segments.get(2)? != &"blob" {
        return None;
    }

    // Intentionally incomplete: construct raw.githubusercontent.com URL.
    None
}
```

## Practice prompts

1. How should branch names with slashes be handled?
2. Should query params/fragments be dropped or preserved?
3. Should rewrite happen automatically or behind a flag?
