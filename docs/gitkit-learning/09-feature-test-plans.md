# Companion 1: Feature Test Plans

Use this template before implementing each feature.

## Template

- Goal:
- Inputs:
- Expected output:
- Failure mode:

## URL-first CLI

Must-pass:

1. Valid `https://...` URL parses.
2. Valid `http://...` URL parses.
3. Destination omitted uses default behavior you define.
4. Destination path is accepted.
5. URL with query string still accepted.

Failure cases:

1. Non-URL input is rejected with clear error.
2. Unsupported scheme (`ftp`, `file`) is rejected.

## Redirects

Must-pass:

1. Single 301 resolves.
2. 302 chain resolves within redirect cap.
3. Final response body is downloaded.

Failure cases:

1. Redirect loop fails with useful message.
2. Redirect limit exceeded fails predictably.

## Retries/backoff

Must-pass:

1. 500 then 200 succeeds after retry.
2. Timeout then success succeeds.
3. Backoff duration increases per attempt.

Failure cases:

1. Non-retryable status fails immediately.
2. Max attempts reached returns terminal error.

## Timeouts

Must-pass:

1. Request under timeout succeeds.
2. Long request fails at configured timeout.
3. CLI timeout flag overrides default.

Failure cases:

1. Invalid timeout input rejected.
2. Zero/negative-style value policy enforced.

## Headers/auth

Must-pass:

1. Single custom header sent.
2. Multiple headers sent.
3. Bearer token attached when configured.

Failure cases:

1. Malformed header syntax rejected.
2. Invalid header value rejected.

## Destination/filesystem

Must-pass:

1. Parent dirs auto-created.
2. Binary file writes correctly.
3. Destination directory + inferred filename works.

Failure cases:

1. Permission denied is surfaced clearly.
2. Invalid path returns filesystem error.

## GitHub blob rewrite

Must-pass:

1. Blob URL rewrites to raw URL.
2. Non-GitHub URL is unchanged.
3. Already-raw URL is unchanged.

Failure cases:

1. Malformed blob URL not rewritten.
2. Missing path segments handled safely.
