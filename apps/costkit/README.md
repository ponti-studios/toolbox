# costkit

Analyze OpenRouter activity CSV exports and count local tokens.

## Install

Preferred distribution is via the Ponti Studios Homebrew tap.

For local development:

```bash
cargo run -p costkit -- --help
```

## Supported Input

`costkit` is designed for the OpenRouter activity CSV export format.
It reads the OpenRouter column names directly and ignores extra columns it does not use.

Core columns consumed by the analytics commands:

- `created_at`
- `cost_total`
- `cost_cache`
- `tokens_prompt`
- `tokens_completion`
- `tokens_reasoning`
- `tokens_cached`
- `model_permaslug`
- `provider_name`
- `cancelled`
- `streamed`
- `finish_reason_normalized`
- `generation_time_ms`
- `time_to_first_token_ms`
- `app_name`
- `api_key_name`

If `app_name` is blank, `costkit` falls back to `api_key_name`.

## Commands

### `dashboard`

Show aggregate OpenRouter usage metrics and breakdowns.

```bash
costkit dashboard [OPTIONS]
```

Options:

- `-f, --file <FILE>`: OpenRouter activity CSV path. Default: `data.csv`
- `-m, --model <MODEL>`: Fuzzy filter by model
- `-p, --provider <PROVIDER>`: Fuzzy filter by provider
- `-a, --app <APP>`: Fuzzy filter by app or API key name
- `-l, --limit <LIMIT>`: Limit breakdown rows. Default: `20`
- `--output <text|json>`: Output format. Default: `text`

Examples:

```bash
costkit dashboard -f openrouter_activity.csv
costkit dashboard -f openrouter_activity.csv -m gpt5
costkit dashboard -f openrouter_activity.csv --output json
```

### `models`

Compare model costs across the CSV.

```bash
costkit models [OPTIONS]
```

Options:

- `-f, --file <FILE>`: OpenRouter activity CSV path. Default: `data.csv`
- `--tier <TIER>`: `all`, `large`, or `small`. Default: `all`
- `--threshold <THRESHOLD>`: Completion-cost threshold for tiering. Default: `50.0`
- `-m, --model <MODEL>`: Fuzzy filter by model
- `-p, --provider <PROVIDER>`: Fuzzy filter by provider
- `-l, --limit <LIMIT>`: Limit rows. Default: `20`
- `--output <text|json>`: Output format. Default: `text`

Examples:

```bash
costkit models -f openrouter_activity.csv
costkit models -f openrouter_activity.csv --tier large
costkit models -f openrouter_activity.csv --output json
```

### `costs`

Bucket spend over time.

```bash
costkit costs [OPTIONS]
```

Options:

- `-f, --file <FILE>`: OpenRouter activity CSV path. Default: `data.csv`
- `--interval <INTERVAL>`: `minute`, `hour`, or `day`. Default: `hour`
- `-m, --model <MODEL>`: Fuzzy filter by model
- `-p, --provider <PROVIDER>`: Fuzzy filter by provider
- `--output <text|json>`: Output format. Default: `text`

Examples:

```bash
costkit costs -f openrouter_activity.csv --interval day
costkit costs -f openrouter_activity.csv -p openai
costkit costs -f openrouter_activity.csv --output json
```

### `tokens`

Count `cl100k_base` tokens in local files.

```bash
costkit tokens [FOLDER]
```

Examples:

```bash
costkit tokens
costkit tokens ./src
```

## Build & Run

```bash
cargo build -p costkit
cargo run -p costkit -- dashboard -f openrouter_activity.csv
./target/debug/costkit dashboard -f openrouter_activity.csv
```
