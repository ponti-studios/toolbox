# Feature 8: Remove GitHub Coupling from Core Logic

## What you are building

An internal architecture where generic HTTP fetch is core, and provider-specific behavior is optional adapters.

## Rust concepts to learn

- Module boundaries and public API design
- Trait-based abstraction for URL normalization
- Error enums that reflect domains (`Input`, `Network`, `Filesystem`)
- Incremental refactoring with tests as safety rails

## APIs to study

- `mod` organization
- `thiserror::Error`
- traits and trait objects (or generics)

## Small example (not a full solution)

```rust
pub trait UrlNormalizer {
    fn normalize(&self, input: &url::Url) -> url::Url;
}

pub struct Identity;
impl UrlNormalizer for Identity {
    fn normalize(&self, input: &url::Url) -> url::Url {
        input.clone()
    }
}
```

```rust
#[derive(thiserror::Error, Debug)]
pub enum FetchError {
    #[error("invalid input: {0}")]
    Input(String),
    #[error("network error: {0}")]
    Network(String),
    #[error("filesystem error: {0}")]
    Filesystem(String),
}
```

## Practice prompts

1. What modules should exist after refactor (`cli`, `fetch`, `normalize`, `output`)?
2. Which integration tests prove behavior is still correct?
3. How will you keep the CLI thin and push logic into testable units?
