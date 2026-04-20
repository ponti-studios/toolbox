-- V1__initial_schema.sql
-- Initial schema for voidline calendar database

CREATE TABLE IF NOT EXISTS calendar_events_raw (
    id                      INTEGER PRIMARY KEY,
    import_batch_id         TEXT NOT NULL,
    source_system           TEXT,
    source_file             TEXT NOT NULL,
    source_path             TEXT,
    source_hash             TEXT,

    uid                     TEXT NOT NULL,
    recurrence_id_raw        TEXT,
    recurrence_id_utc       TEXT,
    sequence                INTEGER,
    dtstamp_utc             TEXT,
    created_utc             TEXT,
    last_modified_utc       TEXT,

    calendar_name           TEXT,
    prodid                  TEXT,
    method                  TEXT,
    event_type              TEXT,
    classification          TEXT,
    status                  TEXT,
    transp                  TEXT,

    summary                 TEXT,
    description             TEXT,
    location               TEXT,

    dtstart_raw            TEXT,
    dtstart_tzid           TEXT,
    dtstart_utc            TEXT,
    dtstart_kind           TEXT,

    dtend_raw              TEXT,
    dtend_tzid             TEXT,
    dtend_utc              TEXT,
    dtend_kind             TEXT,

    duration_raw            TEXT,
    all_day                INTEGER DEFAULT 0,

    rrule_raw              TEXT,
    exdate_raw             TEXT,
    rdate_raw              TEXT,
    exrule_raw             TEXT,
    tzid                   TEXT,

    organizer              TEXT,
    attendees_json          TEXT,
    categories_json        TEXT,
    url                    TEXT,

    raw                    TEXT NOT NULL,
    parse_warnings_json    TEXT,
    parse_error            TEXT,

    ingested_at            TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_raw_event_key
    ON calendar_events_raw(source_file, uid,
        COALESCE(recurrence_id_raw, ''),
        COALESCE(sequence, 0));

CREATE INDEX IF NOT EXISTS idx_raw_uid ON calendar_events_raw(uid);
CREATE INDEX IF NOT EXISTS idx_raw_source_file ON calendar_events_raw(source_file);
CREATE INDEX IF NOT EXISTS idx_raw_source_system ON calendar_events_raw(source_system);
CREATE INDEX IF NOT EXISTS idx_raw_summary ON calendar_events_raw(summary);
CREATE INDEX IF NOT EXISTS idx_raw_dtstart_utc ON calendar_events_raw(dtstart_utc);
CREATE INDEX IF NOT EXISTS idx_raw_import_batch ON calendar_events_raw(import_batch_id);

CREATE TABLE IF NOT EXISTS calendar_event_occurrences (
    id                      INTEGER PRIMARY KEY,
    raw_event_id            INTEGER NOT NULL,
    uid                     TEXT NOT NULL,

    occurrence_key          TEXT NOT NULL,
    recurrence_id_utc       TEXT,
    occurrence_start_utc    TEXT NOT NULL,
    occurrence_end_utc      TEXT,
    occurrence_date         TEXT,

    is_all_day              INTEGER NOT NULL DEFAULT 0,
    is_generated            INTEGER NOT NULL DEFAULT 0,
    is_override             INTEGER NOT NULL DEFAULT 0,
    is_cancelled            INTEGER NOT NULL DEFAULT 0,
    is_excluded             INTEGER NOT NULL DEFAULT 0,
    status                  TEXT,

    summary                 TEXT,
    description             TEXT,
    location                TEXT,

    expansion_window_start  TEXT,
    expansion_window_end    TEXT,
    expanded_at            TEXT NOT NULL,
    expansion_version      TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_occ_key
    ON calendar_event_occurrences(uid, occurrence_key);

CREATE INDEX IF NOT EXISTS idx_occ_start ON calendar_event_occurrences(occurrence_start_utc);
CREATE INDEX IF NOT EXISTS idx_occ_date ON calendar_event_occurrences(occurrence_date);
CREATE INDEX IF NOT EXISTS idx_occ_raw_id ON calendar_event_occurrences(raw_event_id);

CREATE TABLE IF NOT EXISTS cal_import_batches (
    id                      TEXT PRIMARY KEY,
    imported_at             TEXT NOT NULL,
    source_paths_json       TEXT,
    file_count              INTEGER,
    event_count             INTEGER,
    warning_count           INTEGER,
    error_count             INTEGER
);

CREATE TABLE IF NOT EXISTS cal_schema_version (
    version                 INTEGER PRIMARY KEY,
    applied_at              TEXT NOT NULL
);

INSERT OR IGNORE INTO cal_schema_version (version, applied_at)
VALUES (1, datetime('now'));
