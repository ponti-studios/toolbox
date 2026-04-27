# Companion 3: Error and Logging Style Guide

## Goals

- Users get actionable, concise errors.
- Developers get enough context for debugging.
- Secrets are never logged.

## User-facing error shape

- One-line summary
- One concrete next step

Examples:

- `download failed: timeout after 30s`
- `next step: retry with --timeout-secs 60`

- `download failed: 401 unauthorized`
- `next step: provide token via --token or env var`

## Internal context

Add context at boundaries:

```rust
let resp = client.get(url.clone()).send().await
    .with_context(|| format!("request failed for {}", url))?;
```

## Logging levels (if you add `tracing` later)

- `info`: start/end of download
- `debug`: retry attempts, redirect target
- `warn`: non-fatal retryable issues
- `error`: terminal failure

## Secret redaction

Never print raw token/header values.

```rust
fn redact(s: &str) -> &str {
    if s.is_empty() { "<empty>" } else { "<redacted>" }
}
```

## Consistency checklist

1. Does each error mention what failed?
2. Does it mention which URL/path (when safe)?
3. Does it suggest the next action?
4. Does it avoid secret leakage?
