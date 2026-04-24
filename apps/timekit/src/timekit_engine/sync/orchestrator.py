"""Main sync flow: ties together calendar fetching, diffing, and DB writes."""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass

from rich.console import Console
from rich.table import Table

from timekit_engine.calendar.eventkit import ensure_access, fetch_calendars, fetch_events
from timekit_engine.calendar.serializers import compute_content_hash
from timekit_engine.db.connection import get_db
from timekit_engine.db.models import EventRaw
from timekit_engine.db.queries import (
    create_sync_run,
    finish_sync_run,
    get_canonical_hash,
    get_last_sync_run,
    insert_event_raw,
    mark_events_deleted,
    upsert_calendar,
    upsert_event_canonical,
)
from timekit_engine.db.schema import init_schema
from timekit_engine.sync.date_ranges import compute_sync_range
from timekit_engine.sync.differ import DiffResult, diff_events

console = Console()


@dataclass
class SyncStats:
    calendars: int = 0
    added: int = 0
    updated: int = 0
    unchanged: int = 0
    deleted: int = 0


async def run_sync() -> SyncStats:
    """Execute the full sync flow."""
    ensure_access()

    async with get_db() as db:
        await init_schema(db)

        # Determine date range
        last_sync = await get_last_sync_run(db)
        start, end = compute_sync_range(last_sync)
        start_iso = start.strftime("%Y-%m-%dT%H:%M:%S.%fZ")
        end_iso = end.strftime("%Y-%m-%dT%H:%M:%S.%fZ")

        sync_run_id = await create_sync_run(db, start_iso, end_iso)

        stats = SyncStats()

        try:
            # Phase 1: Discover calendars
            console.print("[dim]Discovering calendars...[/dim]")
            calendars = fetch_calendars()
            stats.calendars = len(calendars)

            cal_id_map: dict[str, int] = {}
            for cal in calendars:
                db_id = await upsert_calendar(
                    db,
                    ek_calendar_id=cal["ek_calendar_id"],
                    title=cal["title"],
                    calendar_type=cal["calendar_type"],
                    source_title=cal["source_title"],
                    source_id=cal["source_id"],
                    color_hex=cal["color_hex"],
                    is_writable=cal["is_writable"],
                    sync_run_id=sync_run_id,
                )
                cal_id_map[cal["ek_calendar_id"]] = db_id

            # Phase 2: Fetch events
            console.print(
                f"[dim]Fetching events from {start.date()} to {end.date()}...[/dim]"
            )
            raw_events = fetch_events(start, end)
            console.print(f"[dim]Found {len(raw_events)} events[/dim]")

            # Compute content hashes
            for ev in raw_events:
                ev["content_hash"] = compute_content_hash(ev)

            # Phase 3: Diff against existing
            existing_hashes: dict[str, str] = {}
            for ev in raw_events:
                h = await get_canonical_hash(db, ev["ek_event_id"])
                if h:
                    existing_hashes[ev["ek_event_id"]] = h

            diff = diff_events(raw_events, existing_hashes)

            # Phase 4: Write to DB
            seen_ids: set[str] = set()

            for ev in diff.added + diff.updated:
                ek_cal_id = ev.get("ek_calendar_id") or ""
                calendar_db_id = cal_id_map.get(ek_cal_id) or next(iter(cal_id_map.values()), 0)

                event_raw = EventRaw(
                    ek_event_id=ev["ek_event_id"],
                    calendar_id=calendar_db_id,
                    sync_run_id=sync_run_id,
                    title=ev.get("title"),
                    start_date=ev["start_date"] or "",
                    end_date=ev["end_date"] or "",
                    is_all_day=ev.get("is_all_day", False),
                    location_name=ev.get("location_name"),
                    location_lat=ev.get("location_lat"),
                    location_lon=ev.get("location_lon"),
                    notes=ev.get("notes"),
                    url=ev.get("url"),
                    availability=ev.get("availability"),
                    status=ev.get("status"),
                    organizer_name=ev.get("organizer_name"),
                    organizer_email=ev.get("organizer_email"),
                    attendees_json=json.dumps(ev.get("attendees", [])),
                    recurrence_json=json.dumps(ev.get("recurrence_rules", [])),
                    alarms_json=json.dumps(ev.get("alarms", [])),
                    timezone=ev.get("timezone"),
                    last_modified=ev.get("last_modified"),
                    ek_created_date=ev.get("ek_created_date"),
                    content_hash=ev["content_hash"],
                )

                raw_id = await insert_event_raw(db, event_raw)
                await upsert_event_canonical(
                    db,
                    ek_event_id=ev["ek_event_id"],
                    raw_id=raw_id,
                    calendar_id=calendar_db_id,
                    event=event_raw,
                    attendee_count=ev.get("attendee_count", 0),
                    is_recurring=ev.get("is_recurring", False),
                    duration_minutes=_compute_duration(ev),
                )
                seen_ids.add(ev["ek_event_id"])

            # Mark unchanged as seen
            for eid in diff.unchanged:
                seen_ids.add(eid)

            stats.added = len(diff.added)
            stats.updated = len(diff.updated)
            stats.unchanged = len(diff.unchanged)

            # Phase 5: Soft-delete missing events
            stats.deleted = await mark_events_deleted(
                db, seen_ids, start_iso, end_iso
            )

            await db.commit()

            await finish_sync_run(
                db,
                sync_run_id,
                status="completed",
                calendars_seen=stats.calendars,
                events_upserted=stats.added + stats.updated,
                events_deleted=stats.deleted,
            )

        except Exception as exc:
            await finish_sync_run(
                db,
                sync_run_id,
                status="failed",
                error_message=str(exc),
            )
            raise

    return stats


def _compute_duration(ev: dict) -> int | None:
    """Compute duration in minutes from start/end dates."""
    start = ev.get("start_date")
    end = ev.get("end_date")
    if not start or not end:
        return None
    try:
        from datetime import datetime

        s = datetime.fromisoformat(start.replace("Z", "+00:00"))
        e = datetime.fromisoformat(end.replace("Z", "+00:00"))
        return int((e - s).total_seconds() / 60)
    except (ValueError, TypeError):
        return None


def print_sync_summary(stats: SyncStats) -> None:
    """Print a Rich summary table of sync results."""
    table = Table(title="Sync Summary")
    table.add_column("Metric", style="bold")
    table.add_column("Count", justify="right")

    table.add_row("Calendars", str(stats.calendars))
    table.add_row("Events added", str(stats.added))
    table.add_row("Events updated", str(stats.updated))
    table.add_row("Events unchanged", str(stats.unchanged))
    table.add_row("Events deleted", str(stats.deleted))

    console.print(table)
