# Companion 5: Progressive Milestone Plan

Implement in layers so you always have something working.

## Milestone 0: Basic fetch works

- Parse URL arg
- GET request
- Write response to a destination file
- No retries/headers yet

Exit criteria:

- Can download one public file URL successfully.

## Milestone 1: Better correctness

- Validate `http/https`
- Better destination behavior
- Good user-facing errors

Exit criteria:

- Clear errors for invalid URL and invalid destination.

## Milestone 2: Reliability

- Redirect policy
- Timeout config
- Retry with bounded backoff

Exit criteria:

- Retry and timeout tests pass consistently.

## Milestone 3: Power-user features

- Custom headers
- Bearer token
- Optional GitHub blob rewrite convenience

Exit criteria:

- Header/token integration tests pass.

## Milestone 4: Cleanup/refactor

- Module split
- Error enum polish
- Remove dead code and tighten tests

Exit criteria:

- `cargo test`, `clippy`, and formatting all pass.
