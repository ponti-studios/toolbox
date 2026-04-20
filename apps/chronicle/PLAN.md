# Chronicle: Apple Calendar Integration Plan

## Context

Chronicle is a calendar intelligence CLI that standardizes and enriches calendar event formats. Originally designed around Google Calendar, we're pivoting to **Apple Calendar via EventKit** (using `pyobjc-framework-EventKit`). This eliminates the need for OAuth, simplifies auth to macOS TCC permissions, and gives access to all calendars the user has configured (iCloud, Google via Apple Calendar, Exchange, etc.).

Current state: only a Typer CLI skeleton exists with stub commands. Nothing functional.

## Phase 1: Foundation

### 1a. Update dependencies (`apps/chronicle/pyproject.toml`)
- Replace `google-api-python-client` and `google-auth-httplib2` with:
  - `pyobjc-framework-EventKit>=10.0`
  - `pyobjc-core>=10.0`

### 1b. Create config module (`src/chronicle_engine/config.py`)
- Move `support_root()` and `cache_root()` from `__main__.py`
- Add `db_path()` → `~/Library/Application Support/chronicle/chronicle.db`
- Add `ensure_dirs()` to create directories on first run

### 1c. Create database layer

**`src/chronicle_engine/db/__init__.py`** — empty

**`src/chronicle_engine/db/connection.py`** — aiosqlite connection helper, WAL mode, foreign keys pragma

**`src/chronicle_engine/db/schema.py`** — Full schema creation with these tables:
- `sync_runs` — track sync operations (started_at, finished_at, status, counts)
- `calendars` — synced calendar metadata (ek_calendar_id, title, type, source)
- `events_raw` — append-only raw event snapshots per sync (content_hash for change detection)
- `events_canonical` — materialized latest state per event (one row per ek_event_id, soft-delete via deleted_at)
- `entities` — extracted people/places/organizations (future ML use)
- `event_entities` — junction table
- `event_categories` — tags (meal, travel, work, etc.)
- `rewrite_proposals` — proposed field changes (pending/accepted/rejected)
- `export_runs` — export metadata

**`src/chronicle_engine/db/models.py`** — Python dataclasses for each table

**`src/chronicle_engine/db/queries.py`** — Named query functions (upsert_calendar, upsert_event, mark_deleted, etc.)

### 1d. Implement `doctor` command
- Check Python version, pyobjc importability, EventKit permission status, DB existence/schema version

## Phase 2: Calendar Access

**`src/chronicle_engine/calendar/__init__.py`** — empty

**`src/chronicle_engine/calendar/permissions.py`**
- Check `EKEventStore.authorizationStatus(for: .event)`
- Request access via `requestFullAccessToEvents` (macOS 14+) or `requestAccess(to:completion:)` (macOS 13)
- Block on threading.Event until callback fires
- User-friendly Rich errors if denied (with System Preferences instructions)

**`src/chronicle_engine/calendar/eventkit.py`**
- Wrap `EKEventStore` — fetch calendars, fetch events with date range predicate
- Chunk large date ranges into 1-year windows (EventKit max ~4yr predicate)
- Return plain Python dicts (no EventKit objects leak out)

**`src/chronicle_engine/calendar/serializers.py`**
- Convert EKEvent → dict (title, dates, location, attendees, recurrence, etc.)
- NSDate → UTC datetime conversion
- Compute SHA-256 content_hash from deterministic JSON serialization

### Update `auth` command → check/request calendar permissions

## Phase 3: Sync Engine

**`src/chronicle_engine/sync/__init__.py`** — empty

**`src/chronicle_engine/sync/date_ranges.py`**
- First sync: past 12 months + future 6 months
- Incremental: from last sync end minus 7-day overlap window
- Chunk into 1-year windows

**`src/chronicle_engine/sync/differ.py`**
- Compare content_hash to detect add/update/unchanged
- Detect deleted events (present in canonical but not in current sync)

**`src/chronicle_engine/sync/orchestrator.py`**
- Main sync flow: check permissions → discover calendars → fetch events → diff → upsert DB
- Rich progress bar for large syncs
- Print summary table (added/updated/deleted per calendar)

### Wire up `sync` CLI command

## Phase 4: Preview & Export

**Update `preview` command** — query events_canonical, render with Rich tables

**`src/chronicle_engine/export/__init__.py`** — empty
**`src/chronicle_engine/export/ics.py`** — ICS export
**`src/chronicle_engine/export/jsonl.py`** — JSONL export
**`src/chronicle_engine/export/csv_export.py`** — CSV export

### Wire up `export` CLI command

## Database Schema

```sql
-- Track sync operations
CREATE TABLE sync_runs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at      TEXT NOT NULL,  -- ISO-8601
    finished_at     TEXT,
    status          TEXT NOT NULL DEFAULT 'running',  -- running, completed, failed
    calendars_seen  INTEGER DEFAULT 0,
    events_upserted INTEGER DEFAULT 0,
    events_deleted  INTEGER DEFAULT 0,
    error_message   TEXT,
    date_range_start TEXT,  -- ISO-8601, the query window
    date_range_end   TEXT
);

-- Calendar sources (iCloud, Google, Exchange, etc.)
CREATE TABLE calendars (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    ek_calendar_id      TEXT NOT NULL UNIQUE,  -- EKCalendar.calendarIdentifier
    title               TEXT NOT NULL,
    calendar_type       TEXT,  -- local, caldav, exchange, subscription, birthday
    source_title        TEXT,  -- EKSource.title (e.g. "iCloud", "Gmail")
    source_id           TEXT,  -- EKSource.sourceIdentifier
    color_hex           TEXT,
    is_writable         INTEGER DEFAULT 1,
    first_seen_sync_id  INTEGER REFERENCES sync_runs(id),
    last_seen_sync_id   INTEGER REFERENCES sync_runs(id),
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Raw event data, preserving original fields exactly as received
CREATE TABLE events_raw (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    ek_event_id         TEXT NOT NULL,  -- EKEvent.eventIdentifier
    calendar_id         INTEGER NOT NULL REFERENCES calendars(id),
    sync_run_id         INTEGER NOT NULL REFERENCES sync_runs(id),
    title               TEXT,
    start_date          TEXT NOT NULL,  -- ISO-8601 UTC
    end_date            TEXT NOT NULL,
    is_all_day          INTEGER DEFAULT 0,
    location_name       TEXT,
    location_lat        REAL,
    location_lon        REAL,
    notes               TEXT,
    url                 TEXT,
    availability        TEXT,  -- busy, free, tentative, unavailable
    status              TEXT,  -- none, confirmed, tentative, canceled
    organizer_name      TEXT,
    organizer_email     TEXT,
    attendees_json      TEXT,  -- JSON array of {name, email, role, status}
    recurrence_json     TEXT,  -- JSON array of recurrence rule dicts
    alarms_json         TEXT,  -- JSON array of alarm offsets
    timezone            TEXT,
    last_modified       TEXT,  -- from EventKit
    ek_created_date     TEXT,  -- from EventKit
    content_hash        TEXT NOT NULL,  -- SHA-256 of serialized fields for change detection
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE(ek_event_id, sync_run_id)
);
CREATE INDEX idx_events_raw_ek_id ON events_raw(ek_event_id);
CREATE INDEX idx_events_raw_dates ON events_raw(start_date, end_date);

-- Canonical/normalized event view (latest version of each event)
CREATE TABLE events_canonical (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    ek_event_id         TEXT NOT NULL UNIQUE,
    latest_raw_id       INTEGER NOT NULL REFERENCES events_raw(id),
    calendar_id         INTEGER NOT NULL REFERENCES calendars(id),
    title_original      TEXT,
    title_normalized    TEXT,  -- ML-cleaned title (filled later)
    start_date          TEXT NOT NULL,
    end_date            TEXT NOT NULL,
    duration_minutes    INTEGER,
    is_all_day          INTEGER DEFAULT 0,
    location_name       TEXT,
    location_lat        REAL,
    location_lon        REAL,
    notes               TEXT,
    url                 TEXT,
    organizer_name      TEXT,
    organizer_email     TEXT,
    attendee_count      INTEGER DEFAULT 0,
    is_recurring        INTEGER DEFAULT 0,
    timezone            TEXT,
    content_hash        TEXT NOT NULL,
    first_seen_at       TEXT NOT NULL,
    last_seen_at        TEXT NOT NULL,
    deleted_at          TEXT,  -- soft-delete when event disappears from calendar
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_canonical_dates ON events_canonical(start_date, end_date);
CREATE INDEX idx_canonical_calendar ON events_canonical(calendar_id);

-- Entities extracted from events (people, places, orgs)
CREATE TABLE entities (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type     TEXT NOT NULL,  -- person, place, organization
    name            TEXT NOT NULL,
    email           TEXT,
    metadata_json   TEXT,  -- flexible additional data
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE(entity_type, name, email)
);

-- Junction: which entities appear in which events
CREATE TABLE event_entities (
    event_id    INTEGER NOT NULL REFERENCES events_canonical(id),
    entity_id   INTEGER NOT NULL REFERENCES entities(id),
    role        TEXT,  -- organizer, attendee, location, mentioned
    PRIMARY KEY (event_id, entity_id, role)
);

-- Category/tag assignments
CREATE TABLE event_categories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id    INTEGER NOT NULL REFERENCES events_canonical(id),
    category    TEXT NOT NULL,  -- meal, travel, work, exercise, social, etc.
    confidence  REAL,          -- ML confidence score
    source      TEXT NOT NULL,  -- rule, ml, manual
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE(event_id, category)
);

-- Proposed rewrites for ML enrichment
CREATE TABLE rewrite_proposals (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id        INTEGER NOT NULL REFERENCES events_canonical(id),
    field_name      TEXT NOT NULL,  -- title, location, category, etc.
    original_value  TEXT,
    proposed_value  TEXT NOT NULL,
    model_name      TEXT,
    confidence      REAL,
    status          TEXT NOT NULL DEFAULT 'pending',  -- pending, accepted, rejected
    reviewed_at     TEXT,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Export tracking
CREATE TABLE export_runs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    format          TEXT NOT NULL,  -- ics, jsonl, csv
    file_path       TEXT,
    event_count     INTEGER,
    filters_json    TEXT,  -- what filters were applied
    started_at      TEXT NOT NULL,
    finished_at     TEXT,
    status          TEXT NOT NULL DEFAULT 'running'
);
```

## Key Gotchas

| Issue | Mitigation |
|-------|-----------|
| TCC permission attributed to terminal app, not Python | `doctor` explains this clearly; show System Prefs deep link on denial |
| NSDate timezone confusion | Convert to UTC immediately in serializer, store UTC in DB |
| EventKit `events(matching:)` is synchronous | Chunk into 1-year windows, show Rich progress bar |
| pyobjc on non-macOS | Guard imports, fail fast with clear error |
| Recurring events expand to many occurrences | Store each as separate event with `is_recurring=True` |
| EventKit max ~4yr predicate range | `date_ranges.py` handles chunking automatically |
| aiosqlite is async but EventKit is sync | Run EventKit calls synchronously, use aiosqlite for DB ops, `asyncio.run()` at top level |

## Module Structure

```
chronicle_engine/
    __init__.py
    __main__.py            -- Typer CLI (update existing)
    config.py              -- Paths, settings

    calendar/
        __init__.py
        permissions.py     -- TCC permission check/request
        eventkit.py        -- EKEventStore wrapper
        serializers.py     -- EKEvent → dict, content_hash

    db/
        __init__.py
        connection.py      -- aiosqlite connection, pragmas
        schema.py          -- Schema DDL, migrations
        models.py          -- Dataclasses
        queries.py         -- Named query functions

    sync/
        __init__.py
        date_ranges.py     -- Sync window computation
        differ.py          -- Content hash comparison
        orchestrator.py    -- Main sync flow

    export/
        __init__.py
        ics.py
        jsonl.py
        csv_export.py
```

## Verification

1. `pip install -e .` from `apps/chronicle/`
2. `chronicle doctor` — should report Python version, pyobjc status, permission status, DB status
3. `chronicle auth --login` — should trigger macOS calendar permission prompt
4. `chronicle sync` — should pull events into SQLite, print summary
5. `chronicle preview` — should show upcoming events in Rich table
6. `chronicle export --format jsonl` — should write events to file
7. Verify DB at `~/Library/Application Support/chronicle/chronicle.db` with `sqlite3`
