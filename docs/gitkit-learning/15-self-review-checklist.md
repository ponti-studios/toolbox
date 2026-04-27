# Companion 7: Self-Review Checklist

Run this before every commit.

## Correctness

1. Does the happy path work for a real public URL?
2. Do invalid URLs fail clearly?
3. Is destination handling deterministic?

## Reliability

1. Are retries bounded?
2. Is timeout configurable and enforced?
3. Are redirects controlled by policy?

## Security and safety

1. Are tokens/secrets redacted from logs?
2. Are custom headers validated?
3. Are file writes constrained to explicit destination logic?

## Code quality

1. Is `main.rs` mostly wiring?
2. Are modules small and focused?
3. Are errors categorized clearly?

## Tests

1. Unit tests for pure transforms (URL normalization, filename inference)
2. Integration tests for network behavior (mock server)
3. Failure tests for timeout/auth/path errors

## Tooling

1. `cargo fmt --all`
2. `cargo clippy --all-targets -- -D warnings`
3. `cargo test`
