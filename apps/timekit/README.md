# Timekit

Native Swift CLI for Apple Calendar on macOS.

## Requirements

- macOS
- Swift 6+
- Apple Calendar permissions enabled for the terminal or shell app you run from

## Install

```bash
cd apps/timekit
swift build
```

Run directly from source:

```bash
swift run timekit -- --help
```

## Commands

```bash
timekit doctor
timekit auth --login
timekit sync
timekit preview --limit 25
timekit export --format jsonl
timekit export --format csv
timekit export --format ics
timekit dedupe --strictness strict
timekit dedupe --strictness medium --calendar "Personal"
timekit dedupe --strictness loose --from 2026-01-01 --to 2026-12-31 --apply
```

### `dedupe`

Scans writable Apple Calendar events through EventKit, detects duplicate events, and optionally deletes the extras from the user's real calendars.

- `strict`: same calendar, title, exact start/end, all-day flag, location, notes, and URL
- `medium`: same calendar, title, exact start/end, and all-day flag
- `loose`: same calendar, title, same day, and all-day flag

Notes:
- Dry-run by default; pass `--apply` to actually delete events
- `--calendar NAME` limits the scan to one writable calendar
- `--from` and `--to` accept `YYYY-MM-DD`
- If omitted, dedupe scans a practical all-time EventKit range: 1900-01-01 through 2100-12-31
- Recurring event occurrences are included in the scan
- When applied to recurring duplicates, Timekit removes duplicate occurrences with EventKit using `.thisEvent`

## Storage

- **Config root**: `~/.hominem`
- **SwiftData store**: `~/.hominem/db.sqlite`
- **Exports**: `~/.hominem/exports/`
- **Cache root**: `~/Library/Caches/timekit`

This SwiftData-first port keeps synced events in a local-only store at `~/.hominem/db.sqlite`.

## Architecture

Timekit now uses EventKit directly from Swift to read Apple Calendar events, cache them locally, and export them as JSONL, CSV, or ICS.

### Project Structure

```
apps/timekit/
├── Package.swift
├── README.md
└── Sources/
    └── Timekit/
        └── main.swift
```

## Development

```bash
cd apps/timekit
swift build
swift run timekit -- doctor
```

## Notes

- This app is macOS-only because it depends on EventKit.
- `timekit sync` merges fresh EventKit results into the local SwiftData store that `preview` and `export` read.
- `timekit dedupe` operates on the real Apple Calendar store, not the local SwiftData cache.
- The Python implementation has been retired in favor of a native Swift package.
