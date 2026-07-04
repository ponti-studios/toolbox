# Trackie

Trackie is a small local-first personal finance app.

## What it does

- HTTP API under `/api/v1`
- CLI for listing and creating accounts and transactions
- SQLite-backed persistence with automatic local schema setup
- Minimal API for accounts and transactions

## Quick start

1. Copy the sample env file if you want to customize paths or port:

```bash
cp .env.example .env
```

2. Start the app:

```bash
go run ./cmd/server
```

3. By default the app listens on port 8080. Trackie shares the warehouse database.

   Optional settings:

   - `PORT` to change the server port

## CLI

Point the CLI at the API:

```bash
export TRACKIE_API_URL=http://localhost:8080

go run ./cmd/cli accounts list
go run ./cmd/cli transactions list
```

Create commands take JSON in `--payload`.

## Main endpoints

- `GET /api/v1/accounts`
- `POST /api/v1/accounts`
- `PUT /api/v1/accounts/:id`
- `DELETE /api/v1/accounts/:id`
- `GET /api/v1/transactions`
- `POST /api/v1/transactions`
- `PUT /api/v1/transactions/:id`
- `DELETE /api/v1/transactions/:id`

## Notes

- Trackie initializes its schema on startup.
- Trackie shares the warehouse database. It resolves the path with the same precedence
  as the [warehouse](apps/warehouse) Python app:
  1. `WAREHOUSE_DATABASE_PATH` env var
  2. `database_path` from `~/.hominem/config.yml`
  3. Default: `~/.hominem/warehouse.db`
