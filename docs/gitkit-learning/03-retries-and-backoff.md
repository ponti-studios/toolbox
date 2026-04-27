# Feature 3: Retries with Backoff

## What you are building

Retry transient failures (timeouts, 429, 5xx) with increasing delays.

## Rust concepts to learn

- Async loops with mutable state
- Pattern matching on errors/status classes
- Separating pure retry policy from I/O execution
- `tokio::time::sleep` and `Duration`

## APIs to study

- `tokio::time::sleep`
- `reqwest::Error` helpers (`is_timeout`, etc.)
- `http::StatusCode`

## Small example (not a full solution)

```rust
use std::time::Duration;

fn backoff_delay(attempt: u32) -> Duration {
    let base_ms = 200u64;
    Duration::from_millis(base_ms.saturating_mul(2u64.pow(attempt)))
}

for attempt in 0..max_retries {
    let result = client.get(url.clone()).send().await;
    match result {
        Ok(resp) if resp.status().is_success() => {
            // return success
        }
        Ok(resp) if resp.status().as_u16() == 429 || resp.status().is_server_error() => {
            tokio::time::sleep(backoff_delay(attempt)).await;
        }
        Err(err) if err.is_timeout() => {
            tokio::time::sleep(backoff_delay(attempt)).await;
        }
        _ => {
            // fail fast
        }
    }
}
```

## Practice prompts

1. Which errors are retryable vs fatal?
2. Should backoff include jitter?
3. How do you prevent retry storms in CI pipelines?
