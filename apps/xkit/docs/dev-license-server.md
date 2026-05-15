# xkit dev license server

Use this server to test `xkit activate` and entitlement refresh locally.

## start the server

```bash
cd apps/xkit
go run ./cmd/xkit-license-server
```

The server listens on `http://127.0.0.1:8787` by default and logs the public key for `xkit`.

## export client env

```bash
export XKIT_LICENSE_BASE_URL=http://127.0.0.1:8787
export XKIT_LICENSE_PUBLIC_KEY="$(cd apps/xkit && go run ./cmd/xkit-license-server public-key)"
export X_CLIENT_ID=your-test-or-vendor-client-id
```

If you do not want to pass `X_CLIENT_ID`, set `XKIT_VENDOR_X_CLIENT_ID` before starting the server. `xkit login` then reads `x_client_id` from the entitlement.

## dev license keys

- `xkit_dev_single`: active single-pack entitlement
- `xkit_dev_multi`: active multi-pack entitlement
- `xkit_dev_empty`: active entitlement with zero remaining packs
- `xkit_dev_revoked`: revoked entitlement
- `xkit_dev_suspended`: suspended entitlement

## test the flow

```bash
xkit activate --license-key xkit_dev_single
xkit license-status
```

This server is for local development only. It uses a deterministic signing secret unless you override `XKIT_LICENSE_SIGNING_SECRET`.
