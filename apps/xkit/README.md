# xkit

CLI for deleting the authenticated user's X posts.

## Features

- Activates a paid entitlement
- Logs in with OAuth 2.0 Authorization Code + PKCE
- Stores X tokens in the system keychain
- Stores the entitlement separately in the system keychain
- Refreshes tokens automatically
- Respects `Retry-After` and X rate-limit reset headers
- Shows operational logs
- Uses a countdown UI while waiting for auth and retry windows
- Fetches posts from `GET /2/users/me/tweets`
- Deletes each post with `DELETE /2/tweets/{id}`
- Shows a confirmation preview before deletion

X app-only bearer tokens cannot delete posts. `xkit` uses user-context OAuth tokens.

## Installation

```bash
cd apps/xkit && mise exec go@1.26.4 -- go build -trimpath -ldflags='-s -w' -o ../../target/xkit .
```

When `mise` is unavailable, use the repository's `just build` target; it falls back to the installed Go toolchain.

## Configuration

`xkit` loads env vars from:

- `.env` in the current directory
- `apps/xkit/.env` when run from the repo root
- the process environment

Set these env vars or pass the matching login flags:

- `X_CLIENT_ID`
- `X_CLIENT_SECRET` optional for confidential clients
- `X_REDIRECT_URI` optional, default `http://127.0.0.1:8765/callback`
- `XKIT_LICENSE_BASE_URL` required for activation / refresh
- `XKIT_LICENSE_PUBLIC_KEY` required for local entitlement verification
- `XKIT_DEVICE_NAME` optional override for the activation display name
- `XKIT_DEVICE_ID` optional override for the stable local device binding

Example `.env`:

```bash
XKIT_LICENSE_BASE_URL=https://licenses.example.com
XKIT_LICENSE_PUBLIC_KEY=base64-or-pem-ed25519-public-key
X_CLIENT_ID=vendor_or_test_client_id
X_CLIENT_SECRET=your_client_secret
X_REDIRECT_URI=http://127.0.0.1:8765/callback
```

You can omit `X_CLIENT_ID` when the saved entitlement includes `x_client_id`.

The X app must have the redirect URI registered in the developer console.

## Commands

```bash
xkit activate --license-key <key> --license-base-url https://licenses.example.com
xkit login
xkit license-status
xkit whoami
xkit delete-posts --dry-run
xkit delete-posts --yes
xkit deactivate
xkit logout
```

## Session storage

- X session: keychain service `xkit`
- Paid entitlement: keychain service `xkit-license`

## Paid flow

1. Buy a launch license key.
2. Run `xkit activate` to bind that license to the current device and cache a signed entitlement locally.
3. Run `xkit login` to authenticate directly with X using the vendor-owned client ID from the entitlement.
4. Run `xkit delete-posts --dry-run` and then `xkit delete-posts --yes`.

`delete-posts` refuses to run when the entitlement is missing, expired, revoked, or out of cleanup packs.

## Delete-post flags

| Flag              | Description                                                   | Default               |
| ----------------- | ------------------------------------------------------------- | --------------------- |
| `--user-id`       | Override the authenticated user ID                            | saved user ID         |
| `--base-url`      | X API base URL                                                | `https://api.x.com/2` |
| `--max-results`   | Posts to fetch per page                                       | `100`                 |
| `--exclude`       | Comma-separated post types to exclude (`replies`, `retweets`) | none                  |
| `--dry-run`       | List posts without deleting them                              | `false`               |
| `--yes`           | Skip safety confirmation requirement                          | `false`               |
| `--limit`         | Maximum number of posts to delete                             | `0`                   |
| `--preview-count` | Number of IDs shown in the confirmation preview               | `10`                  |
| `--timeout`       | HTTP timeout per request                                      | `30s`                 |

## Examples

```bash
# Log in
xkit login --client-id 123 --redirect-uri http://127.0.0.1:8765/callback

# Show the saved identity
xkit whoami

# Dry run
xkit delete-posts --dry-run

# Delete all posts for the logged-in user
xkit delete-posts --yes

# Delete only a subset
xkit delete-posts --limit 100 --yes

# Skip replies and reposts
xkit delete-posts --exclude replies,retweets --yes
```

## Safety

This command is destructive. Run `--dry-run` first. Run `--yes` only after review.

Deleting reposts or retweets is a separate X API flow.

## Product model

- `launch-single` is `$19` for one cleanup pack on one active device.
- `launch-multi` is `$49` for three cleanup packs and up to two active devices.

See [docs/licensing.md](./docs/licensing.md) for the full entitlement contract, refresh behavior, revocation rules, and support split.

See [docs/launch-checklist.md](./docs/launch-checklist.md) for the release and support checklist.

See [docs/dev-license-server.md](./docs/dev-license-server.md) for the local entitlement backend used in development.
