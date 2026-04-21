# voidline

General-purpose utility CLI for frontmatter, calendar import, and local tooling workflows.

## Install

Preferred distribution is via the studio Homebrew tap.

For local development:

```bash
cargo run -p voidline -- --help
```

---

## Table of Contents

1. [Frontmatter Commands](#frontmatter-commands)
   - [walk](#frontmatter-walk)
   - [aggregate](#frontmatter-aggregate)
   - [validate](#frontmatter-validate)
   - [migrate](#frontmatter-migrate)
   - [slug](#frontmatter-slug)
   - [update](#frontmatter-update)
2. [Calendar Commands](#calendar-commands)
3. [Classification Commands](#classification-commands)

---

## Frontmatter Commands

### `frontmatter walk` - Walk and display frontmatter

```bash
voidline frontmatter walk [OPTIONS]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-r, --root <ROOT>` | Root directory to walk | `.` |
| `-o, --output <OUTPUT>` | Output format: `text` or `json` | `text` |
| `--include-hidden` | Include hidden files/directories | `false` |
| `--extensions <EXT>` | File extensions (comma-separated) | `.md,.markdown` |
| `--include-globs <GLOBS>` | Include glob patterns | - |
| `--exclude-globs <GLOBS>` | Exclude glob patterns | - |
| `--max-files <MAX>` | Maximum files to process (0 = unlimited) | `0` |

**Examples:**

```bash
# Walk current directory
voidline frontmatter walk

# Walk specific directory
voidline frontmatter walk -r ./content

# JSON output
voidline frontmatter walk -o json

# Include hidden files
voidline frontmatter walk --include-hidden

# Custom extensions
voidline frontmatter walk --extensions ".md,.markdown,.txt"

# Limit file count
voidline frontmatter walk --max-files 100

# Exclude patterns
voidline frontmatter walk --exclude-globs "**/drafts/**,**/archive/**"
```

---

### `frontmatter aggregate` - Aggregate frontmatter properties

```bash
voidline frontmatter aggregate [TARGET] [OPTIONS]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `<TARGET>` | Target directory or file | `.` |
| `-o, --output <OUTPUT>` | Output file path | `frontmatter.json` |

**Examples:**

```bash
# Aggregate current directory
voidline frontmatter aggregate

# Aggregate specific directory
voidline frontmatter aggregate ./content

# Specify output file
voidline frontmatter aggregate -o aggregated.json

# Single file target
voidline frontmatter aggregate ./posts/single.md -o single.json
```

**Example Output:**

```json
[
  {
    "name": "status",
    "values": ["draft", "published"]
  },
  {
    "name": "tags",
    "values": ["ai", "cli", "rust"]
  }
]
```

---

### `frontmatter validate` - Validate frontmatter against schema

```bash
voidline frontmatter validate [OPTIONS]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-r, --root <ROOT>` | Root directory to validate | `.` |
| `-s, --schema <SCHEMA>` | Schema name | `personal` |
| `-c, --config <CONFIG>` | Config file path | - |
| `-o, --output <OUTPUT>` | Output format: `text` or `json` | `text` |

**Examples:**

```bash
# Validate current directory
voidline frontmatter validate

# Validate specific directory
voidline frontmatter validate -r ./content

# JSON output
voidline frontmatter validate -o json
```

**Schema: `personal` - Required fields:**

- `title`
- `uid` (UUID format)
- `slug` (kebab-case)
- `created` (ISO 8601)
- `updated` (ISO 8601)
- `type` (identity, lifestyle, goals, relationships, finance, reference, tracking)
- `status` (draft, published, private, archived)

---

### `frontmatter migrate` - Migrate frontmatter fields

```bash
voidline frontmatter migrate [OPTIONS]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-r, --root <ROOT>` | Root directory | `.` |
| `-s, --schema <SCHEMA>` | Schema name | `personal` |
| `--strategy <STRATEGY>` | Migration strategy | `fill` |
| `--dry-run` | Show changes without applying | `false` |
| `--write` | Write changes to files | `false` |
| `--backup` | Create backup files | `false` |
| `-o, --output <OUTPUT>` | Output format: `text` or `json` | `text` |

**Strategies:**

| Strategy | Description |
|----------|-------------|
| `fill` | Add missing required fields and defaults |
| `repair` | Fix invalid fields and add missing ones |
| `overwrite` | Replace all fields with schema defaults |
| `timestamps` | Only add/update timestamp fields |

**Examples:**

```bash
# Dry run (default)
voidline frontmatter migrate

# Fill missing required fields
voidline frontmatter migrate --strategy fill

# Repair invalid fields
voidline frontmatter migrate --strategy repair

# Write changes
voidline frontmatter migrate --strategy fill --write

# Write with backups
voidline frontmatter migrate --strategy fill --write --backup

# JSON output
voidline frontmatter migrate -o json --strategy fill
```

---

### `frontmatter slug` - Detect and resolve slug collisions

```bash
voidline frontmatter slug [OPTIONS]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-r, --root <ROOT>` | Root directory | `.` |
| `--resolve` | Resolve a slug collision | `false` |
| `--detect` | Detect collisions (default) | `false` |
| `--scope <SCOPE>` | Collision scope | `directory` |
| `--slug <SLUG>` | Slug to resolve (required with `--resolve`) | - |
| `--policy <POLICY>` | Collision policy | `increment` |
| `--max-attempts <MAX>` | Max increment attempts | `10` |
| `--existing-slugs <SLUGS>` | Existing slugs to check | - |
| `-o, --output <OUTPUT>` | Output format: `text` or `json` | `text` |

**Scopes:**

| Scope | Description |
|-------|-------------|
| `directory` | Collisions within same directory only |
| `project` | Collisions across entire project |
| `global` | All files globally |

**Policies:**

| Policy | Description |
|--------|-------------|
| `fail` | Return error on collision |
| `increment` | Append `-2`, `-3`, etc. |
| `append-uid` | Append short unique ID |

**Examples:**

```bash
# Detect collisions in current directory
voidline frontmatter slug

# Detect in specific directory
voidline frontmatter slug -r ./content

# Project-wide scope
voidline frontmatter slug --scope project

# Resolve a slug
voidline frontmatter slug --resolve --slug "my-note"

# Resolve with specific policy
voidline frontmatter slug --resolve --slug "my-note" --policy increment

# Resolve with existing slugs
voidline frontmatter slug --resolve --slug "note" --existing-slugs note,note-2,note-3
```

---

### `frontmatter update` - Update frontmatter field values

```bash
voidline frontmatter update [OPTIONS]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-r, --root <ROOT>` | Root directory | `.` |
| `--field <FIELD>` | Field name to update (required) | - |
| `--value <VALUE>` | New value (required) | - |
| `--dry-run` | Show changes without applying | `false` |

**Examples:**

```bash
# Update status field
voidline frontmatter update --field status --value published

# Update type field
voidline frontmatter update --field type --value article

# Dry run
voidline frontmatter update --field status --value draft --dry-run

# Specific directory
voidline frontmatter update -r ./content --field category --value tech
```

---

## Calendar Commands

### `cal import` - Import calendar events

```bash
voidline cal import [OPTIONS]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-f, --file <FILE>` | ICS file path (required) | - |
| `-o, --output <OUTPUT>` | Output directory | - |
| `--merge` | Merge with existing events | `false` |

**Examples:**

```bash
# Import ICS file
voidline cal import -f calendar.ics

# Import to specific directory
voidline cal import -f events.ics -o ./calendar

# Merge with existing
voidline cal import -f new-events.ics --merge
```

---

### `cal expand` - Expand recurring events

```bash
voidline cal expand [OPTIONS]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-d, --days <DAYS>` | Days to expand | `30` |
| `-o, --output <OUTPUT>` | Output file | - |

**Examples:**

```bash
# Expand next 30 days
voidline cal expand

# Expand 90 days
voidline cal expand -d 90

# Output to file
voidline cal expand -o expanded.json
```

---

### `cal query` - Query calendar events

```bash
voidline cal query [OPTIONS]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-s, --start <START>` | Start date | - |
| `-e, --end <END>` | End date | - |
| `-t, --type <TYPE>` | Event type filter | - |
| `-o, --output <OUTPUT>` | Output format: `text` or `json` | `text` |

**Examples:**

```bash
# Query all events
voidline cal query

# Query date range
voidline cal query -s 2026-01-01 -e 2026-12-31

# Filter by type
voidline cal query -t meeting

# JSON output
voidline cal query -o json
```

---

### `cal inspect` - Inspect calendar data

```bash
voidline cal inspect [PATH]
```

**Examples:**

```bash
# Inspect calendar directory
voidline cal inspect

# Inspect specific path
voidline cal inspect ./calendar/events
```

---

### `cal stats` - Show calendar statistics

```bash
voidline cal stats [OPTIONS]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-p, --period <PERIOD>` | Time period | - |
| `-o, --output <OUTPUT>` | Output format | - |

**Examples:**

```bash
# Show stats
voidline cal stats

# Monthly stats
voidline cal stats -p month

# Yearly stats
voidline cal stats -p year
```

---

### `cal doctor` - Diagnose calendar issues

```bash
voidline cal doctor [OPTIONS]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-f, --fix` | Auto-fix issues | `false` |
| `-v, --verbose` | Verbose output | `false` |

**Examples:**

```bash
# Run diagnostics
voidline cal doctor

# Auto-fix issues
voidline cal doctor --fix

# Verbose output
voidline cal doctor -v
```

---

## Classification Commands

### `classify essays` - Classify markdown essays and generate a move plan

```bash
voidline classify essays [OPTIONS]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-d, --dir <DIR>` | Directory containing markdown essays | `.` |
| `--yes` | Skip confirmation prompts when executing | `false` |
| `--execute` | Execute the move plan | `false` |
| `--tui` | Launch interactive TUI mode | `false` |
| `--resume` | Resume from the highest completed pass | `false` |
| `--from-pass <PASS>` | Resume from a specific pass | - |
| `--threshold <THRESHOLD>` | Confidence threshold for auto-move | `0.75` |
| `--llm <PROVIDER>` | LLM provider | `ollama` |
| `--api-key <KEY>` | OpenAI API key | - |
| `--base-url <URL>` | Base URL for LLM API | - |
| `--model <MODEL>` | Model name | - |
| `--csv <FILE>` | Export move plan to CSV | - |
| `--cluster-threshold <THRESHOLD>` | Clustering distance threshold | `0.75` |

**Examples:**

```bash
# Basic run
voidline classify essays --dir ./essays

# Resume from pass 3
voidline classify essays --dir ./essays --from-pass 3

# Execute the move plan
voidline classify essays --dir ./essays --execute --yes

# Open TUI
voidline classify essays --dir ./essays --tui

# Export to CSV
voidline classify essays --dir ./essays --csv plan.csv
```

**Status:**
- Pass 1 through Pass 5 are implemented in a deterministic scaffold form
- Execute mode will move files into domain folders
- TUI and richer LLM-backed classification are still future work

---

## Build & Run

```bash
# Build
cargo build -p voidline

# Run from source
cargo run -p voidline -- frontmatter walk

# Run binary directly
./target/debug/voidline frontmatter walk

# Install globally
cargo install --path apps/voidline
```

---

## Testing Checklist

### frontmatter walk
- [ ] Default directory walk
- [ ] Custom root directory
- [ ] Text output format
- [ ] JSON output format
- [ ] Include hidden files
- [ ] Custom extensions
- [ ] Max files limit

### frontmatter aggregate
- [ ] Current directory aggregation
- [ ] Specific directory aggregation
- [ ] Single file target
- [ ] Custom output file

### frontmatter validate
- [ ] Valid files
- [ ] Missing required fields
- [ ] Invalid field values
- [ ] Text output
- [ ] JSON output

### frontmatter migrate
- [ ] Fill strategy (dry run)
- [ ] Fill strategy (write)
- [ ] Repair strategy
- [ ] Overwrite strategy
- [ ] Timestamps strategy
- [ ] With backup files

### frontmatter slug
- [ ] Detect collisions (directory scope)
- [ ] Detect collisions (project scope)
- [ ] Resolve with increment policy
- [ ] Resolve with append-uid policy
- [ ] Resolve with fail policy

### frontmatter update
- [ ] Update single field
- [ ] Update multiple files
- [ ] Dry run

### cal commands
- [ ] Import ICS file
- [ ] Expand recurring events
- [ ] Query by date range
- [ ] Inspect calendar
- [ ] Show statistics
- [ ] Doctor diagnostics

---

## Release

Release assets are published from tags like `voidline-v0.1.0`.

---

## Technical Notes

- Frontmatter parsing handles UTF-8 BOMs and YAML delimited by `---`
- Validation uses a built-in `personal` schema by default
- Migration supports fill, repair, overwrite, and timestamps strategies
- Slug collision detection can be scoped by directory, project, or global namespace
- Calendar functionality is exposed through the `cal` subcommands

## Related Files

- Source: `apps/voidline/src/main.rs`
- Calendar module: `apps/voidline/src/cal/`
- Tests: `apps/voidline/src/main.rs` (inline tests)
