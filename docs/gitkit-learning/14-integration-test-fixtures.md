# Companion 6: Integration Test Fixture Setup

Goal: test behavior without depending on real internet.

## Tools to use

- `wiremock` for local HTTP server
- `tempfile` for temp dirs/files
- `assert_cmd` for CLI assertions

## Fixture pattern

1. Start mock server.
2. Register endpoint response(s).
3. Run CLI binary against mock URL.
4. Assert exit code + output file content.

## Small example (incomplete)

```rust
#[tokio::test]
async fn downloads_file_to_destination() {
    let server = wiremock::MockServer::start().await;
    // mount mock endpoint ...

    let tmp = tempfile::tempdir().unwrap();
    let out = tmp.path().join("out.txt");

    let mut cmd = assert_cmd::Command::cargo_bin("gitkit").unwrap();
    cmd.arg(format!("{}/file.txt", server.uri()))
       .arg(&out)
       .assert()
       .success();

    // assert file content ...
}
```

## What to test with fixtures

- Redirect behavior
- Retryable vs non-retryable statuses
- Timeout handling (delayed responses)
- Header forwarding
- Destination path creation

## Tip

Keep each integration test focused on one behavior. Avoid giant all-in-one tests.
