# Timekit

Calendar intelligence CLI for local-first Apple Calendar enrichment.

## Features

- **Local-first**: All data stored locally in SQLite
- **Apple Calendar sync**: Pull events from all configured calendars (iCloud, Google, Exchange, etc.)
- **ML analysis**: Use Apple MLX for local AI analysis (coming soon)
- **Multiple export formats**: ICS, JSONL, CSV

## Installation

```bash
cd apps/timekit
pip install -e .
```

---

## Usage

```bash
# Check system configuration
timekit doctor

# Grant calendar access
timekit auth --login

# Sync events from Apple Calendar
timekit sync

# Preview synced events
timekit preview

# Export calendar data
timekit export --format jsonl
timekit export --format csv
timekit export --format ics

# Analyze calendar data (coming soon)
timekit analyze --profile fast
timekit analyze --profile deep
```

---

## Configuration

- **Config root**: `~/Library/Application Support/timekit`
- **Database**: `~/Library/Application Support/timekit/timekit.db`
- **Exports**: `~/Library/Application Support/timekit/exports/`
- **Model cache**: `~/Library/Caches/timekit/models`

---

## Architecture

Timekit uses Apple's EventKit framework via `pyobjc` to access calendar data from any calendar configured in Apple Calendar (iCloud, Google, Exchange, etc.). Events are stored locally in SQLite with full history tracking, content-hash-based change detection, and soft deletes.

### Project Structure

```
apps/timekit/
├── pyproject.toml          # Project configuration
├── README.md               # This file
├── PLAN.md                 # Development plan
└── src/
    └── timekit_engine/
        ├── __init__.py
        ├── config.py       # Configuration
        ├── calendar/
        │   ├── __init__.py
        │   ├── eventkit.py     # Apple EventKit integration
        │   ├── serializers.py  # Event serialization
        │   └── permissions.py  # Permission handling
        └── analysis/
            ├── __init__.py
            ├── runner.py       # Analysis runner
            ├── categories.py   # Event categorization
            └── entities.py     # Entity definitions
```

---

## Calendar Integration

### Apple EventKit (macOS)

The `eventkit.py` module provides integration with macOS EventKit framework:

```python
from timekit_engine.calendar.eventkit import EventKitClient

client = EventKitClient()
events = client.get_events(start, end)
```

**Features:**
- Access to system calendars
- Event CRUD operations
- Calendar permissions handling

### Permissions

Calendar access requires user permission on macOS:

```python
from timekit_engine.calendar.permissions import request_access

granted = request_access()
if not granted:
    print("Calendar access denied")
```

---

## Analysis Features

### Event Categorization

The `categories.py` module provides event categorization:

```python
from timekit_engine.analysis.categories import categorize_event

category = categorize_event(event)
# Returns: work, personal, health, social, etc.
```

### Analysis Runner

The `runner.py` module orchestrates analysis:

```python
from timekit_engine.analysis.runner import AnalysisRunner

runner = AnalysisRunner()
results = runner.analyze(events)
```

---

## Development

### Run Tests

```bash
cd apps/timekit
pytest
```

### Run Linters

```bash
# Using ruff (configured in workspace)
ruff check src/

# Format code
ruff format src/
```

### Type Checking

```bash
# If using mypy
mypy src/
```

---

## Requirements

- Python 3.12+
- macOS (Apple Calendar via EventKit)
- Apple Silicon Mac (for future MLX analysis)

---

## Testing Checklist

### Installation
- [ ] `pip install -e .` succeeds
- [ ] Dependencies installed correctly
- [ ] CLI entry point available

### Calendar Access
- [ ] Request calendar permissions
- [ ] Access granted scenario
- [ ] Access denied scenario
- [ ] Read events from calendar
- [ ] Filter events by date range
- [ ] Filter events by calendar

### Event Processing
- [ ] Serialize event to dict
- [ ] Deserialize from dict
- [ ] Handle recurring events
- [ ] Handle all-day events
- [ ] Handle timezone conversions

### Analysis
- [ ] Categorize work events
- [ ] Categorize personal events
- [ ] Categorize health events
- [ ] Categorize social events
- [ ] Run full analysis pipeline
- [ ] Generate insights

### Edge Cases
- [ ] Empty calendar
- [ ] No events in range
- [ ] Very old events
- [ ] Future events
- [ ] Cancelled events
- [ ] Modified recurring events

---

## Notes

- Python 3.12+ required
- macOS-only for EventKit integration
- Calendar permissions required at runtime
- Check `PLAN.md` for development roadmap and planned features

---

## Technical Notes

- Timekit is a Python calendar analysis engine and the CLI entry points are defined in `pyproject.toml`
- Calendar access is macOS-specific and relies on Apple EventKit via `pyobjc`
- Events are stored locally in SQLite with change tracking and soft deletes
- The analysis layer is organized separately from calendar synchronization code

## Related Files

- Configuration: `apps/timekit/pyproject.toml`
- Main module: `apps/timekit/src/timekit_engine/`
- Calendar: `apps/timekit/src/timekit_engine/calendar/`
- Analysis: `apps/timekit/src/timekit_engine/analysis/`
- Plan: `apps/timekit/PLAN.md`
