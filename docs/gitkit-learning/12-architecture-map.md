# Companion 4: Minimal Architecture Map

Keep the CLI thin and move behavior into modules.

## Suggested module layout

- `src/main.rs`
- `src/cli.rs`
- `src/fetch/mod.rs`
- `src/fetch/client.rs`
- `src/fetch/retry.rs`
- `src/normalize/mod.rs`
- `src/output/mod.rs`
- `src/error.rs`

## Responsibility split

- `cli`: parse args into typed config.
- `normalize`: convert user input URL to final fetch URL.
- `fetch`: network behavior (redirect, retry, timeout, headers).
- `output`: destination path and disk writes.
- `error`: domain error types and formatting.

## Data flow

1. Parse CLI -> config.
2. Normalize URL.
3. Build client/request options.
4. Fetch bytes.
5. Resolve destination.
6. Write bytes.
7. Print success summary.

## Tiny skeleton

```rust
async fn run(cfg: Config) -> anyhow::Result<()> {
    let url = normalize::to_fetch_url(&cfg.url)?;
    let bytes = fetch::download(&url, &cfg.fetch).await?;
    let dest = output::resolve_destination(&url, cfg.destination.as_ref())?;
    output::write(&dest, &bytes)?;
    Ok(())
}
```
