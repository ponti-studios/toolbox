"""CSV export."""

from __future__ import annotations

import csv
from pathlib import Path

from chronicle_engine.config import exports_dir
from chronicle_engine.db.connection import get_db
from chronicle_engine.db.schema import init_schema
from chronicle_engine.export.common import fetch_canonical_events, record_export_run

CSV_COLUMNS = [
    "ek_event_id", "title_original", "title_normalized",
    "start_date", "end_date", "duration_minutes", "is_all_day",
    "location_name", "organizer_name", "organizer_email",
    "attendee_count", "is_recurring", "timezone",
]


async def export_csv(output: Path | None = None) -> Path:
    """Export canonical events as CSV."""
    if output is None:
        exports_dir().mkdir(parents=True, exist_ok=True)
        output = exports_dir() / "chronicle_events.csv"

    async with get_db() as db:
        await init_schema(db)
        events = await fetch_canonical_events(db)

        with open(output, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(events)

        await record_export_run(db, fmt="csv", file_path=str(output), event_count=len(events))

    return output
