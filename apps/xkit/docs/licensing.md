# xkit paid entitlement contract

`xkit` uses direct X OAuth and a separate entitlement service. X tokens stay local. The entitlement service only handles paid access.

## launch pricing

- `launch-single` at `$19`: one cleanup pack, one active device, one X account at a time.
- `launch-multi` at `$49`: three cleanup packs, up to two active devices, priority support.

`cleanup_packs` are the metering unit. The CLI blocks destructive commands when `credits_remaining <= 0`.

## activation flow

1. The customer buys a license key.
2. They run `xkit activate --license-key ... --license-base-url ...`.
3. The CLI sends the license key, a stable device ID, and a friendly device name to `POST /v1/activations`.
4. The entitlement service validates billing state, device allowance, and remaining cleanup packs.
5. The service returns a signed Ed25519 compact JWS in `entitlement_token`.
6. The CLI verifies the signature with `XKIT_LICENSE_PUBLIC_KEY` and stores the token in the system keychain under the separate `xkit-license` service.
7. `xkit login` can use the `x_client_id` embedded in the entitlement.

## signed entitlement schema

The signed payload is a compact JWS with `alg=EdDSA` and `aud=xkit-cli`.

```json
{
  "iss": "https://licenses.example.com",
  "aud": "xkit-cli",
  "sub": "lic_123",
  "jti": "act_123",
  "plan": "launch-single",
  "status": "active",
  "scope": ["delete-posts"],
  "metering_mode": "cleanup_packs",
  "credits_remaining": 1,
  "credits_total": 1,
  "device_id": "xkit-abc123",
  "device_name": "charles-macbook-pro",
  "devices_allowed": 1,
  "x_client_id": "vendor-owned-x-client-id",
  "reason": "",
  "iat": 1770000000,
  "nbf": 1770000000,
  "refresh_after": 1770021600,
  "exp": 1770086400
}
```

## api contract

### `POST /v1/activations`

Request:

```json
{
  "license_key": "xkit_live_...",
  "device": {
    "id": "xkit-abc123",
    "name": "charles-macbook-pro"
  },
  "client": {
    "name": "xkit",
    "version": "dev"
  }
}
```

Response:

```json
{
  "entitlement_token": "<signed compact JWS>"
}
```

### `POST /v1/entitlements/refresh`

Request:

```json
{
  "entitlement_token": "<current signed compact JWS>",
  "device": {
    "id": "xkit-abc123",
    "name": "charles-macbook-pro"
  },
  "client": {
    "name": "xkit",
    "version": "dev"
  }
}
```

Response:

```json
{
  "entitlement_token": "<new signed compact JWS>"
}
```

## cache and refresh rules

- The CLI stores the signed token locally in the keychain.
- The entitlement service does not store X access or refresh tokens.
- `refresh_after` defaults to 6 hours before expiry when omitted.
- Launch TTL is `24h`.
- The CLI refreshes proactively when `refresh_after` is reached or when less than `10m` remain before expiry.
- If refresh fails and the cached token is still valid, the CLI uses the cached token until `exp`.

## revocation and expiry behavior

- `status=revoked`, `suspended`, or any non-`active` state blocks `delete-posts`.
- `exp` blocks destructive commands.
- `credits_remaining <= 0` blocks destructive commands with an out-of-packs message.
- Device mismatch blocks the CLI before it attempts destructive work.
- Recovery path: resolve billing or support issues, then run `xkit activate` again.

## support split

- X login issues: browser callback problems, invalid X scopes, expired X refresh token.
- License issues: activation denied, expired entitlement, revoked entitlement, no cleanup packs remaining.
