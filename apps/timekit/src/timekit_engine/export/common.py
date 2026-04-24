"""Common export utilities."""

from __future__ import annotations

from datetime import datetime, timezone

import aiosqlite

from timekit_engine.db.connection import get_db
from timekit_engine.db.schema import init_schema


async def fetch_canonical_events(
    db: aiosqlite.Connection,
    include_deleted: bool = False,
) -> list[dict]:
    """Fetch all canonical events as dicts."""
    where = "" if include_deleted else "WHERE deleted_at IS NULL"
    rows = await db.execute_fetchall(
        f"""SELECT id, ek_event_id, calendar_id, title_original, title_normalized,
                   start_date, end_date, duration_minutes, is_all_day,
                   location_name, location_lat, location_lon, notes, url,
                   organizer_name, organizer_email, attendee_count, is_recurring,
                   timezone, content_hash, first_seen_at, last_seen_at, deleted_at
            FROM events_canonical {where}
            ORDER BY start_date"""
    )
    columns = [
        "id", "ek_event_id", "calendar_id", "title_original", "title_normalized",
        "start_date", "end_date", "duration_minutes", "is_all_day",
        "location_name", "location_lat", "location_lon", "notes", "url",
        "organizer_name", "organizer_email", "attendee_count", "is_recurring",
        "timezone", "content_hash", "first_seen_at", "last_seen_at", "deleted_at",
    ]
    return [dict(zip(columns, row)) for row in rows]


async def record_export_run(
    db: aiosqlite.Connection,
    *,
    fmt: str,
    file_path: str,
    event_count: int,
) -> None:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
    await db.execute(
        """INSERT INTO export_runs (format, file_path, event_count, started_at, finished_at, status)
           VALUES (?, ?, ?, ?, ?, 'completed')""",
        (fmt, file_path, event_count, now, now),
    )
    await db.commit()
