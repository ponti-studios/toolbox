# Feature 1: URL-First CLI (`gitkit <url> [destination]`)

## What you are building

A command shape where the first positional argument is any HTTP(S) URL and the second optional argument is a destination path.

## Rust concepts to learn

- Structs and field ownership with `String` and `PathBuf`
- Derive macros (`#[derive(Parser)]`)
- Option types (`Option<PathBuf>`)
- Error propagation with `Result<T, E>` and `?`
- Input validation with `url::Url`

## APIs to study

- `clap::Parser`
- `std::path::PathBuf`
- `url::Url::parse`

## Small example (not a full solution)

```rust
use clap::Parser;
use std::path::PathBuf;

#[derive(Parser, Debug)]
struct Args {
    url: String,
    destination: Option<PathBuf>,
}

fn parse_url(raw: &str) -> anyhow::Result<url::Url> {
    let url = url::Url::parse(raw)?;
    if !matches!(url.scheme(), "http" | "https") {
        anyhow::bail!("Only http/https are supported");
    }
    Ok(url)
}
```

## Practice prompts

1. How should `destination` behave when omitted?
2. What should happen if the URL has no obvious filename?
3. Where should URL validation live: `main.rs`, a parser module, or a domain type?
