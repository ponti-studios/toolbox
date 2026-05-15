# xkit paid CLI launch checklist

Use this list before shipping a paid `xkit` build or rotating licensing policy.

## release checklist

- Confirm the vendor-owned X app uses the production loopback redirect URI.
- Confirm `XKIT_LICENSE_PUBLIC_KEY` in the shipped build matches the active signing key.
- Confirm the entitlement service issues `aud=xkit-cli` Ed25519 tokens with `x_client_id`.
- Verify `xkit activate`, `xkit login`, `xkit license-status`, and `xkit delete-posts --dry-run` on a clean machine.
- Verify a revoked or exhausted license blocks `delete-posts` with a human-readable error.
- Verify a second run during an active delete cooldown logs the stored resume time before any API work.

## support playbook

- Ask for `xkit license-status` output for entitlement issues.
- Ask for `xkit whoami` output for X auth issues.
- Treat browser callback failures, X consent failures, and refresh-token failures as X auth issues.
- Treat activation denial, expired entitlement, revoked entitlement, device-binding mismatch, and zero cleanup packs as license issues.

## revocation and recovery

- If a charge is refunded or fraud is detected, mark the entitlement `revoked` and force the next refresh to return a non-active status.
- If a customer changes machines within plan limits, instruct them to run `xkit deactivate` on the old device when possible, then `xkit activate` on the new one.
- If the license backend is briefly down, rely on the locally cached entitlement until `exp`, then restore service before expiry or issue replacement entitlements.

## user-facing expectations

- Remind users that X auth is direct and X tokens remain in the macOS keychain.
- Remind users that large deletion jobs can span multiple 15-minute windows because X limits deletes to 50 requests per 15 minutes per user.
- Recommend `--dry-run` before every destructive cleanup.
