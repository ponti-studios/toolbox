# costkit

Analyze CSV exports of LLM usage and costs.

## Install

Preferred distribution is via the studio Homebrew tap.

For local development:

```bash
cargo run -p costkit -- --help
```

---

## Commands

### `dashboard` - Show usage dashboard

```bash
costkit dashboard [OPTIONS]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-f, --file <FILE>` | CSV data file | `data.csv` |
| `-m, --model <MODEL>` | Filter by model (fuzzy match) | - |
| `-p, --provider <PROVIDER>` | Filter by provider (fuzzy match) | - |
| `-a, --app <APP>` | Filter by app (fuzzy match) | - |
| `-l, --limit <LIMIT>` | Limit results in breakdowns | `20` |

**Examples:**

```bash
# Basic dashboard
costkit dashboard

# Custom data file
costkit dashboard -f openrouter_data.csv

# Filter by model
costkit dashboard -m gpt-4

# Filter by provider
costkit dashboard -p openai

# Filter by app
costkit dashboard -a vscode

# Multiple filters
costkit dashboard -m claude -p anthropic -a cursor

# Limit results
costkit dashboard -l 10
```

**Dashboard Metrics:**

1. Total Spend
2. Total Requests
3. Average Cost/Request
4. Total Cache Savings
5. Net Cost (after cache)
6. Total Prompt Tokens
7. Total Completion Tokens
8. Total Cached Tokens
9. Average Prompt/Request
10. Average Completion/Request
11. Cache Hit Rate (%)
12. Requests with Cache
13. Average Generation Time
14. Average Time to First Token
15. Cost/1M Prompt Tokens
16. Cost/1M Completion Tokens
17. Overall Cache %
18. Cancelled Requests
19. Streamed Requests

---

### `models` - Model cost analysis

```bash
costkit models [OPTIONS]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-f, --file <FILE>` | CSV data file | `data.csv` |
| `--tier <TIER>` | Model tier filter | `all` |
| `--threshold <THRESHOLD>` | Cost threshold for tier classification | `50.0` |
| `-m, --model <MODEL>` | Filter by model (fuzzy match) | - |
| `-p, --provider <PROVIDER>` | Filter by provider (fuzzy match) | - |
| `-l, --limit <LIMIT>` | Limit results | `20` |

**Tier Classification:**

| Tier | Description |
|------|-------------|
| `all` | Show all models |
| `large` | Models with cost per 1M completion tokens >= threshold |
| `small` | Models with cost per 1M completion tokens < threshold |

**Examples:**

```bash
# All models
costkit models

# Large tier models only
costkit models --tier large

# Small tier models only
costkit models --tier small

# Custom threshold
costkit models --threshold 75.0

# Filter by model
costkit models -m gpt-4

# Filter by provider
costkit models -p anthropic
```

---

### `costs` - Cost over time analysis

```bash
costkit costs [OPTIONS]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-f, --file <FILE>` | CSV data file | `data.csv` |
| `--interval <INTERVAL>` | Time interval | `hour` |
| `-m, --model <MODEL>` | Filter by model (fuzzy match) | - |
| `-p, --provider <PROVIDER>` | Filter by provider (fuzzy match) | - |

**Intervals:**

| Interval | Description | Example Bucket |
|----------|-------------|----------------|
| `minute` | Group by minute | `2026-03-30 02:37` |
| `hour` | Group by hour | `2026-03-30 02` |
| `day` | Group by day | `2026-03-30` |

**Examples:**

```bash
# Hourly costs (default)
costkit costs

# Daily costs
costkit costs --interval day

# Minute-level costs
costkit costs --interval minute

# Filter by model
costkit costs -m gpt-4 --interval day

# Filter by provider
costkit costs -p openai --interval hour
```

---

### `tokens` - Count tokens in files

```bash
costkit tokens [FOLDER]
```

**Arguments:**

| Argument | Description | Default |
|----------|-------------|---------|
| `<FOLDER>` | Folder to analyze | `.` |

**Examples:**

```bash
# Count tokens in current directory
costkit tokens

# Count tokens in specific folder
costkit tokens ./src

# Count tokens in project
costkit tokens /path/to/project

# Nested directory
costkit tokens ./docs/guides
```

**Output:** Shows token count per file and total

**Token Encoding:** Uses `cl100k_base` encoding (same as GPT-4, GPT-3.5-turbo)

---

## CSV Schema

### Required Columns

| Column | Type | Description |
|--------|------|-------------|
| `cost_total` | float | Total cost of the request |
| `cost_cache` | float | Cache credit (negative value) |
| `tokens_prompt` | int | Prompt token count |
| `tokens_completion` | int | Completion token count |

### Optional Columns

| Column | Type | Description |
|--------|------|-------------|
| `tokens_reasoning` | int | Reasoning token count |
| `tokens_cached` | int | Cached token count |
| `generation_time_ms` | int | Generation time in milliseconds |
| `time_to_first_token_ms` | int | Time to first token |
| `provider_name` | string | Provider name |
| `model_permaslug` | string | Model identifier |
| `app_name` | string | Application name |
| `cancelled` | string | Cancelled flag (`true`/`false`) |
| `streamed` | string | Streamed flag (`true`/`false`) |
| `finish_reason_normalized` | string | Finish reason |
| `created_at` | string | Timestamp |

### Sample CSV

```csv
cost_total,cost_cache,tokens_prompt,tokens_completion,provider_name,model_permaslug,app_name,created_at
0.01,0.0,100,200,openai,gpt-4-turbo,vscode,2026-03-30 02:37:51.271
0.02,-0.005,150,250,anthropic,claude-3-opus,cursor,2026-03-30 03:37:51.271
```

---

## Build & Run

```bash
# Build
cargo build -p costkit

# Run from source
cargo run -p costkit -- dashboard

# Run binary directly
./target/debug/costkit dashboard -f my_data.csv

# Install globally
cargo install --path apps/costkit
```

---

## Testing Checklist

### dashboard command
- [ ] Default CSV file (`data.csv`)
- [ ] Custom CSV file
- [ ] Model filter (exact match)
- [ ] Model filter (fuzzy match)
- [ ] Provider filter
- [ ] App filter
- [ ] Multiple filters combined
- [ ] Limit results

### models command
- [ ] All models (default)
- [ ] Large tier only
- [ ] Small tier only
- [ ] Custom threshold
- [ ] Model filter
- [ ] Provider filter

### costs command
- [ ] Hourly interval (default)
- [ ] Daily interval
- [ ] Minute interval
- [ ] Model filter
- [ ] Provider filter

### tokens command
- [ ] Current directory
- [ ] Specific folder
- [ ] Nested directories
- [ ] Mixed file types

---

## Notes

- Fuzzy matching is case-insensitive and matches subsequences
- Cache credits are negative values in `cost_cache` column
- Timestamps are parsed from `created_at` column for time-based grouping
- Token counting uses tiktoken's `cl100k_base` encoding
- All monetary values are in USD

---

## Release

Release assets are published from tags like `costkit-v0.1.0`.

---

## Technical Notes

- Aggregates usage data across provider, model, app, and time dimensions
- Fuzzy filters are case-insensitive and match subsequences
- Cache credits are represented as negative values in `cost_cache`
- Time grouping supports minute, hour, and day intervals
- Token counting uses `cl100k_base` encoding

## Related Files

- Source: `apps/costkit/src/main.rs`
- Tests: `apps/costkit/src/main.rs` (inline tests)
