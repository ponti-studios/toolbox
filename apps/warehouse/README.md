# warehouse

Personal data warehouse CLI — manage finances, career timeline, people graph,
and music library enrichment from a single SQLite database.

## Install

```bash
uv pip install -e ".[dev]"
```

## Setup

Warehouse reads its database path from `~/.hominem/config.yml`:

```yaml
# ~/.hominem/config.yml
database_path: ~/.hominem/warehouse.db
```

Create this file and initialize the database:

```bash
mkdir -p ~/.hominem
echo 'database_path: ~/.hominem/warehouse.db' > ~/.hominem/config.yml
sqlite3 ~/.hominem/warehouse.db < migrations/00001_initial_schema.sql
```

For development or testing, set `WAREHOUSE_DATABASE_PATH` to override the
config file:

```bash
export WAREHOUSE_DATABASE_PATH=/tmp/test-warehouse.db
```

## CLI

```bash
# Finance: canonical ledger import, health checks, and net worth
uv run warehouse finance import transactions.csv
uv run warehouse finance doctor
uv run warehouse finance net-worth
uv run warehouse finance accounts list
uv run warehouse finance accounts alias "Amex Gold" "American Express Gold"
uv run warehouse finance categories list
uv run warehouse finance reconcile add 12 2026-06-30 15234.22 \
  --period-start-on 2026-06-01 \
  --opening-balance 14990.10
uv run warehouse finance reconcile check
uv run warehouse finance analyze ledger-audit

# Career timeline
uv run warehouse career add "Acme Corp" "Senior Engineer" --start-date "Jan 2020" --current
uv run warehouse career timeline

# People graph
uv run warehouse people add "Jane Smith"
uv run warehouse people backfill-name-parts --dry-run
uv run warehouse people normalize-phone-numbers --dry-run
uv run warehouse people normalize-sort-names --dry-run

# Spotify lookup and enrichment
export SPOTIFY_CLIENT_ID=...
export SPOTIFY_CLIENT_SECRET=...
uv run warehouse spotify track-info --artist "Khruangbin" --track "Pelota"
uv run warehouse spotify enrich --limit 100
```

## Command Groups

| Group | Description |
|-------|-------------|
| `version` | Show version information |
| `finance` | Bank-grade ledger import, doctor, net worth, accounts, categories, reconciliation, audit |
| `career` | Add positions and print a career timeline |
| `people` | Add people, backfill name parts, normalize phones and sort names |
| `spotify` | Track metadata lookup and music library enrichment (requires Spotify API credentials) |

### `finance`

- `finance import` — import transactions from CSV (Copilot or generic)
- `finance doctor` — run data-quality checks on the finance ledger
- `finance net-worth` — compute account balances and net worth
- `finance accounts list` `add` `alias` — manage account identities and labels
- `finance categories list` `add` — manage spend categories
- `finance reconcile add` `list` `check` — track statement-period balances
- `finance analyze ledger-audit` — duplicate, transfer, and lifecycle audit

### `career`

- `career add` — add an employment or project position
- `career timeline` — print a terminal table of employment and project history

### `people`

- `people add` — add a person (auto-parses name parts and sort name)
- `people backfill-name-parts` — parse display names into first/middle/last
- `people normalize-phone-numbers` — normalize phone numbers to E.164
- `people normalize-sort-names` — normalize sort names (Last, First)

### `spotify`

- `spotify track-info` — fetch track metadata from the Spotify Web API
- `spotify enrich` — enrich `music_tracks` with Spotify metadata

## Database

The `00001_initial_schema.sql` migration creates 175 tables covering finance,
music, people, career, calendar, media, places, health, tasks, books, art,
travel, and more. The `finance`, `people`, `career`, and `music_*` tables
are actively managed by the CLI.

## Configuration

Warehouse reads from `~/.hominem/config.yml`:

```yaml
database_path: ~/.hominem/warehouse.db
```

Spotify credentials must be set as environment variables:

```bash
export SPOTIFY_CLIENT_ID=your-client-id
export SPOTIFY_CLIENT_SECRET=your-client-secret
```

## Development

```bash
pytest
ruff check warehouse tests
mypy warehouse
```
