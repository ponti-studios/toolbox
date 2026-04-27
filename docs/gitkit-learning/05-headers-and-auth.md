# Feature 5: Custom Headers and Auth Tokens

## What you are building

Ability to pass headers (for APIs/CDNs) and optional bearer token auth.

## Rust concepts to learn

- Newtypes for safer secret handling
- Parsing repeated CLI flags into typed collections
- Converting strings into `HeaderName` and `HeaderValue`
- Avoiding accidental secret logging

## APIs to study

- `reqwest::header::{HeaderMap, HeaderName, HeaderValue, AUTHORIZATION}`
- `std::str::FromStr`

## Small example (not a full solution)

```rust
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, AUTHORIZATION};

fn build_headers(pairs: &[String], token: Option<&str>) -> anyhow::Result<HeaderMap> {
    let mut headers = HeaderMap::new();

    for p in pairs {
        let (k, v) = p.split_once(':').ok_or_else(|| anyhow::anyhow!("bad header"))?;
        headers.insert(
            HeaderName::from_bytes(k.trim().as_bytes())?,
            HeaderValue::from_str(v.trim())?,
        );
    }

    if let Some(t) = token {
        let value = format!("Bearer {t}");
        headers.insert(AUTHORIZATION, HeaderValue::from_str(&value)?);
    }

    Ok(headers)
}
```

## Practice prompts

1. Should CLI accept `--header "K: V"` multiple times?
2. Should token come from flag, env var, or both?
3. How will you redact secrets in logs/errors?
