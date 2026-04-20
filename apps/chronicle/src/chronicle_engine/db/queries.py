"""Named database query functions."""

from __future__ import annotations

from datetime import datetime, timezone

import aiosqlite

from chronicle_engine.db.models import EventRaw


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


async def create_sync_run(
    db: aiosqlite.Connection,
    date_range_start: str,
    date_range_end: str,
) -> int:
    cursor = await db.execute(
        """INSERT INTO sync_runs (started_at, date_range_start, date_range_end)
           VALUES (?, ?, ?)""",
        (_now_iso(), date_range_start, date_range_end),
    )
    await db.commit()
    return cursor.lastrowid  # type: ignore[return-value]


async def finish_sync_run(
    db: aiosqlite.Connection,
    sync_run_id: int,
    *,
    status: str = "completed",
    calendars_seen: int = 0,
    events_upserted: int = 0,
    events_deleted: int = 0,
    error_message: str | None = None,
) -> None:
    await db.execute(
        """UPDATE sync_runs
           SET finished_at = ?, status = ?, calendars_seen = ?,
               events_upserted = ?, events_deleted = ?, error_message = ?
           WHERE id = ?""",
        (
            _now_iso(),
            status,
            calendars_seen,
            events_upserted,
            events_deleted,
            error_message,
            sync_run_id,
        ),
    )
    await db.commit()


async def upsert_calendar(
    db: aiosqlite.Connection,
    *,
    ek_calendar_id: str,
    title: str,
    calendar_type: str | None,
    source_title: str | None,
    source_id: str | None,
    color_hex: str | None,
    is_writable: bool,
    sync_run_id: int,
) -> int:
    now = _now_iso()
    cursor = await db.execute(
        """INSERT INTO calendars
               (ek_calendar_id, title, calendar_type, source_title, source_id,
                color_hex, is_writable, first_seen_sync_id, last_seen_sync_id,
                created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(ek_calendar_id) DO UPDATE SET
               title = excluded.title,
               calendar_type = excluded.calendar_type,
               source_title = excluded.source_title,
               color_hex = excluded.color_hex,
               is_writable = excluded.is_writable,
               last_seen_sync_id = excluded.last_seen_sync_id,
               updated_at = excluded.updated_at""",
        (
            ek_calendar_id,
            title,
            calendar_type,
            source_title,
            source_id,
            color_hex,
            int(is_writable),
            sync_run_id,
            sync_run_id,
            now,
            now,
        ),
    )
    await db.commit()

    # Fetch the actual id
    row = await db.execute_fetchall(
        "SELECT id FROM calendars WHERE ek_calendar_id = ?", (ek_calendar_id,)
    )
    return row[0][0]


async def insert_event_raw(db: aiosqlite.Connection, event: EventRaw) -> int:
    cursor = await db.execute(
        """INSERT INTO events_raw
               (ek_event_id, calendar_id, sync_run_id, title, start_date, end_date,
                is_all_day, location_name, location_lat, location_lon, notes, url,
                availability, status, organizer_name, organizer_email,
                attendees_json, recurrence_json, alarms_json, timezone,
                last_modified, ek_created_date, content_hash)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            event.ek_event_id,
            event.calendar_id,
            event.sync_run_id,
            event.title,
            event.start_date,
            event.end_date,
            int(event.is_all_day),
            event.location_name,
            event.location_lat,
            event.location_lon,
            event.notes,
            event.url,
            event.availability,
            event.status,
            event.organizer_name,
            event.organizer_email,
            event.attendees_json,
            event.recurrence_json,
            event.alarms_json,
            event.timezone,
            event.last_modified,
            event.ek_created_date,
            event.content_hash,
        ),
    )
    return cursor.lastrowid  # type: ignore[return-value]


async def upsert_event_canonical(
    db: aiosqlite.Connection,
    *,
    ek_event_id: str,
    raw_id: int,
    calendar_id: int,
    event: EventRaw,
    attendee_count: int = 0,
    is_recurring: bool = False,
    duration_minutes: int | None = None,
) -> None:
    now = _now_iso()
    await db.execute(
        """INSERT INTO events_canonical
               (ek_event_id, latest_raw_id, calendar_id, title_original,
                start_date, end_date, duration_minutes, is_all_day,
                location_name, location_lat, location_lon, notes, url,
                organizer_name, organizer_email, attendee_count, is_recurring,
                timezone, content_hash, first_seen_at, last_seen_at,
                created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(ek_event_id) DO UPDATE SET
               latest_raw_id = excluded.latest_raw_id,
               calendar_id = excluded.calendar_id,
               title_original = excluded.title_original,
               start_date = excluded.start_date,
               end_date = excluded.end_date,
               duration_minutes = excluded.duration_minutes,
               is_all_day = excluded.is_all_day,
               location_name = excluded.location_name,
               location_lat = excluded.location_lat,
               location_lon = excluded.location_lon,
               notes = excluded.notes,
               url = excluded.url,
               organizer_name = excluded.organizer_name,
               organizer_email = excluded.organizer_email,
               attendee_count = excluded.attendee_count,
               is_recurring = excluded.is_recurring,
               timezone = excluded.timezone,
               content_hash = excluded.content_hash,
               last_seen_at = excluded.last_seen_at,
               deleted_at = NULL,
               updated_at = excluded.updated_at""",
        (
            ek_event_id,
            raw_id,
            calendar_id,
            event.title,
            event.start_date,
            event.end_date,
            duration_minutes,
            int(event.is_all_day),
            event.location_name,
            event.location_lat,
            event.location_lon,
            event.notes,
            event.url,
            event.organizer_name,
            event.organizer_email,
            attendee_count,
            int(is_recurring),
            event.timezone,
            event.content_hash,
            now,
            now,
            now,
            now,
        ),
    )


async def get_canonical_hash(db: aiosqlite.Connection, ek_event_id: str) -> str | None:
    rows = await db.execute_fetchall(
        "SELECT content_hash FROM events_canonical WHERE ek_event_id = ? AND deleted_at IS NULL",
        (ek_event_id,),
    )
    return rows[0][0] if rows else None


async def mark_events_deleted(
    db: aiosqlite.Connection,
    ek_event_ids_seen: set[str],
    date_range_start: str,
    date_range_end: str,
) -> int:
    """Soft-delete canonical events within the sync range that were not seen."""
    now = _now_iso()
    rows = await db.execute_fetchall(
        """SELECT ek_event_id FROM events_canonical
           WHERE deleted_at IS NULL
             AND start_date >= ? AND start_date <= ?""",
        (date_range_start, date_range_end),
    )
    to_delete = [r[0] for r in rows if r[0] not in ek_event_ids_seen]
    for eid in to_delete:
        await db.execute(
            "UPDATE events_canonical SET deleted_at = ?, updated_at = ? WHERE ek_event_id = ?",
            (now, now, eid),
        )
    return len(to_delete)


async def get_last_sync_run(
    db: aiosqlite.Connection,
) -> tuple[str, str] | None:
    """Return (date_range_start, date_range_end) of the last successful sync."""
    rows = await db.execute_fetchall(
        """SELECT date_range_start, date_range_end FROM sync_runs
           WHERE status = 'completed'
           ORDER BY id DESC LIMIT 1"""
    )
    if rows and rows[0][0] and rows[0][1]:
        return (rows[0][0], rows[0][1])
    return None
