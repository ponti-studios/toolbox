# Feature 4: Timeout Control

## What you are building

User-configurable timeouts so slow endpoints fail predictably.

## Rust concepts to learn

- Duration parsing and typed config
- Request-level vs client-level timeout settings
- Cancellation semantics in async Rust

## APIs to study

- `std::time::Duration`
- `reqwest::ClientBuilder::timeout`
- `tokio::time::timeout`

## Small example (not a full solution)

```rust
#[derive(clap::Parser, Debug)]
struct Args {
    #[arg(long, default_value_t = 30)]
    timeout_secs: u64,
}

let timeout = std::time::Duration::from_secs(args.timeout_secs);
let client = reqwest::Client::builder().timeout(timeout).build()?;
```

```rust
let fut = client.get(url).send();
let resp = tokio::time::timeout(timeout, fut).await;
```

## Practice prompts

1. Do you need separate connect/read timeouts?
2. Which error message best explains timeout failures to users?
3. Should timeout be global or per-request override?
