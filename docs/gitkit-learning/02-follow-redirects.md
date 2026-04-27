# Feature 2: Follow Redirects

## What you are building

Download logic that handles HTTP 3xx redirects safely.

## Rust concepts to learn

- Builder pattern (`reqwest::Client::builder()`)
- Config structs and defaults (`impl Default`)
- Borrowing immutable client state across requests
- Inspecting status codes (`StatusCode`)

## APIs to study

- `reqwest::redirect::Policy`
- `reqwest::ClientBuilder`
- `reqwest::Response::status`

## Small example (not a full solution)

```rust
use reqwest::redirect::Policy;

let client = reqwest::Client::builder()
    .redirect(Policy::limited(10))
    .build()?;

let resp = client.get(url).send().await?;
if resp.status().is_redirection() {
    // Intentionally left unfinished: decide whether this path should happen
    // if client redirects automatically.
}
```

## Practice prompts

1. What maximum redirect depth is reasonable?
2. Should you allow protocol downgrade (https -> http)?
3. How will you surface redirect-loop errors to the user?
