# Chronicle

Calendar intelligence CLI for local-first Apple Calendar enrichment.

## Features

- **Local-first**: All data stored locally in SQLite
- **Apple Calendar sync**: Pull events from all configured calendars (iCloud, Google, Exchange, etc.)
- **ML analysis**: Use Apple MLX for local AI analysis (coming soon)
- **Multiple export formats**: ICS, JSONL, CSV

## Installation

```bash
pip install -e .
```

## Usage

```bash
# Check system configuration
chronicle doctor

# Grant calendar access
chronicle auth --login

# Sync events from Apple Calendar
chronicle sync

# Preview synced events
chronicle preview

# Export calendar data
chronicle export --format jsonl
chronicle export --format csv
chronicle export --format ics

# Analyze calendar data (coming soon)
chronicle analyze --profile fast
chronicle analyze --profile deep
```

## Configuration

- **Config root**: `~/Library/Application Support/chronicle`
- **Database**: `~/Library/Application Support/chronicle/chronicle.db`
- **Exports**: `~/Library/Application Support/chronicle/exports/`
- **Model cache**: `~/Library/Caches/chronicle/models`

## Requirements

- Python 3.12+
- macOS (Apple Calendar via EventKit)
- Apple Silicon Mac (for future MLX analysis)

## Architecture

Chronicle uses Apple's EventKit framework via `pyobjc` to access calendar data
from any calendar configured in Apple Calendar (iCloud, Google, Exchange, etc.).
Events are stored locally in SQLite with full history tracking, content-hash-based
change detection, and soft deletes.
