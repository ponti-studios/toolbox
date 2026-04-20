"""Database schema definition and initialization."""

from __future__ import annotations

import aiosqlite

SCHEMA_VERSION = 2

SCHEMA_SQL = """\
CREATE TABLE IF NOT EXISTS schema_version (
    version     INTEGER NOT NULL,
    applied_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS sync_runs (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at       TEXT NOT NULL,
    finished_at      TEXT,
    status           TEXT NOT NULL DEFAULT 'running',
    calendars_seen   INTEGER DEFAULT 0,
    events_upserted  INTEGER DEFAULT 0,
    events_deleted   INTEGER DEFAULT 0,
    error_message    TEXT,
    date_range_start TEXT,
    date_range_end   TEXT
);

CREATE TABLE IF NOT EXISTS calendars (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    ek_calendar_id     TEXT NOT NULL UNIQUE,
    title              TEXT NOT NULL,
    calendar_type      TEXT,
    source_title       TEXT,
    source_id          TEXT,
    color_hex          TEXT,
    is_writable        INTEGER DEFAULT 1,
    first_seen_sync_id INTEGER REFERENCES sync_runs(id),
    last_seen_sync_id  INTEGER REFERENCES sync_runs(id),
    created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS events_raw (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    ek_event_id      TEXT NOT NULL,
    calendar_id      INTEGER NOT NULL REFERENCES calendars(id),
    sync_run_id      INTEGER NOT NULL REFERENCES sync_runs(id),
    title            TEXT,
    start_date       TEXT NOT NULL,
    end_date         TEXT NOT NULL,
    is_all_day       INTEGER DEFAULT 0,
    location_name    TEXT,
    location_lat     REAL,
    location_lon     REAL,
    notes            TEXT,
    url              TEXT,
    availability     TEXT,
    status           TEXT,
    organizer_name   TEXT,
    organizer_email  TEXT,
    attendees_json   TEXT,
    recurrence_json  TEXT,
    alarms_json      TEXT,
    timezone         TEXT,
    last_modified    TEXT,
    ek_created_date  TEXT,
    content_hash     TEXT NOT NULL,
    created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE(ek_event_id, sync_run_id)
);

CREATE INDEX IF NOT EXISTS idx_events_raw_ek_id ON events_raw(ek_event_id);
CREATE INDEX IF NOT EXISTS idx_events_raw_dates ON events_raw(start_date, end_date);

CREATE TABLE IF NOT EXISTS events_canonical (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    ek_event_id      TEXT NOT NULL UNIQUE,
    latest_raw_id    INTEGER NOT NULL REFERENCES events_raw(id),
    calendar_id      INTEGER NOT NULL REFERENCES calendars(id),
    title_original   TEXT,
    title_normalized TEXT,
    start_date       TEXT NOT NULL,
    end_date         TEXT NOT NULL,
    duration_minutes INTEGER,
    is_all_day       INTEGER DEFAULT 0,
    location_name    TEXT,
    location_lat     REAL,
    location_lon     REAL,
    notes            TEXT,
    url              TEXT,
    organizer_name   TEXT,
    organizer_email  TEXT,
    attendee_count   INTEGER DEFAULT 0,
    is_recurring     INTEGER DEFAULT 0,
    timezone         TEXT,
    content_hash     TEXT NOT NULL,
    first_seen_at    TEXT NOT NULL,
    last_seen_at     TEXT NOT NULL,
    deleted_at       TEXT,
    created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_canonical_dates ON events_canonical(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_canonical_calendar ON events_canonical(calendar_id);

CREATE TABLE IF NOT EXISTS entities (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type   TEXT NOT NULL,
    name          TEXT NOT NULL,
    email         TEXT,
    metadata_json TEXT,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE(entity_type, name, email)
);

CREATE TABLE IF NOT EXISTS event_entities (
    event_id  INTEGER NOT NULL REFERENCES events_canonical(id),
    entity_id INTEGER NOT NULL REFERENCES entities(id),
    role      TEXT,
    PRIMARY KEY (event_id, entity_id, role)
);

CREATE TABLE IF NOT EXISTS event_categories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id   INTEGER NOT NULL REFERENCES events_canonical(id),
    category   TEXT NOT NULL,
    confidence REAL,
    source     TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE(event_id, category)
);

CREATE TABLE IF NOT EXISTS rewrite_proposals (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id       INTEGER NOT NULL REFERENCES events_canonical(id),
    field_name     TEXT NOT NULL,
    original_value TEXT,
    proposed_value TEXT NOT NULL,
    model_name     TEXT,
    confidence     REAL,
    status         TEXT NOT NULL DEFAULT 'pending',
    reviewed_at    TEXT,
    created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE(event_id, field_name)
);

CREATE TABLE IF NOT EXISTS export_runs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    format       TEXT NOT NULL,
    file_path    TEXT,
    event_count  INTEGER,
    filters_json TEXT,
    started_at   TEXT NOT NULL,
    finished_at  TEXT,
    status       TEXT NOT NULL DEFAULT 'running'
);
"""


_MIGRATIONS: dict[int, str] = {
    2: "CREATE UNIQUE INDEX IF NOT EXISTS idx_rewrite_proposals_event_field ON rewrite_proposals(event_id, field_name);",
}


async def init_schema(db: aiosqlite.Connection) -> None:
    """Create all tables if they don't exist and run any pending migrations."""
    await db.executescript(SCHEMA_SQL)

    cursor = await db.execute("SELECT MAX(version) FROM schema_version")
    row = await cursor.fetchone()
    current = row[0] if row and row[0] else 0

    for version in sorted(v for v in _MIGRATIONS if v > current):
        await db.executescript(_MIGRATIONS[version])
        await db.execute(
            "INSERT INTO schema_version (version) VALUES (?)", (version,)
        )

    if current < SCHEMA_VERSION:
        await db.commit()


async def get_schema_version(db: aiosqlite.Connection) -> int:
    """Return the current schema version, or 0 if uninitialized."""
    try:
        cursor = await db.execute("SELECT MAX(version) FROM schema_version")
        row = await cursor.fetchone()
        return row[0] if row and row[0] else 0
    except Exception:
        return 0
