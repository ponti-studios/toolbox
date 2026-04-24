# Timekit JSON Contract

`timekit` uses JSON over stdio between the Rust CLI and the Python engine.

## Transport

- Rust writes exactly one JSON request object to the Python engine's stdin.
- Python writes exactly one JSON response object to stdout.
- Human-readable logs belong on stderr, not stdout.

## Request Envelope

```json
{
  "request_id": "req_123",
  "command": "doctor",
  "args": {}
}
```

Fields:

- `request_id`: caller-generated string for correlation.
- `command`: stable engine command name.
- `args`: command-specific object.

## Success Response

```json
{
  "request_id": "req_123",
  "ok": true,
  "data": {},
  "warnings": []
}
```

Fields:

- `request_id`: echoed from the request.
- `ok`: `true` for a successful engine invocation.
- `data`: command-specific response payload.
- `warnings`: optional machine-readable warnings.

## Error Response

```json
{
  "request_id": "req_123",
  "ok": false,
  "error": {
    "code": "INVALID_JSON",
    "message": "Invalid JSON request"
  }
}
```

Fields:

- `request_id`: echoed from the request when available.
- `ok`: `false`.
- `error.code`: stable programmatic error code.
- `error.message`: human-readable error message.

## M1 Command Shapes

### `doctor`

Request:

```json
{
  "request_id": "req_doctor",
  "command": "doctor",
  "args": {
    "config_root": "/Users/example/Library/Application Support/timekit",
    "cache_root": "/Users/example/Library/Caches/timekit/models"
  }
}
```

### `sync`

Request:

```json
{
  "request_id": "req_sync",
  "command": "sync",
  "args": {
    "database_path": "/Users/example/Library/Application Support/timekit/timekit.db"
  }
}
```

### `analyze`

Request:

```json
{
  "request_id": "req_analyze",
  "command": "analyze",
  "args": {
    "profile": "fast",
    "database_path": "/Users/example/Library/Application Support/timekit/timekit.db"
  }
}
```

### `export`

Request:

```json
{
  "request_id": "req_export",
  "command": "export",
  "args": {
    "format": "jsonl",
    "output_path": "/Users/example/Library/Application Support/timekit/exports/events.jsonl"
  }
}
```

## Warning Shape

```json
{
  "code": "NOT_IMPLEMENTED",
  "message": "Command handling is not implemented yet."
}
```

Warnings should not change process exit status on their own.
