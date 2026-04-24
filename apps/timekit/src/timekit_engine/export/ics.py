"""ICS (iCalendar) export."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

from timekit_engine.config import exports_dir
from timekit_engine.db.connection import get_db
from timekit_engine.db.schema import init_schema
from timekit_engine.export.common import fetch_canonical_events, record_export_run


def _to_ics_datetime(iso_str: str | None) -> str:
    """Convert ISO-8601 string to ICS DTSTART/DTEND format."""
    if not iso_str:
        return ""
    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        return dt.strftime("%Y%m%dT%H%M%SZ")
    except (ValueError, TypeError):
        return ""


def _escape_ics(text: str | None) -> str:
    """Escape text for ICS format."""
    if not text:
        return ""
    return text.replace("\\", "\\\\").replace("\n", "\\n").replace(",", "\\,").replace(";", "\\;")


def _event_to_vcalendar(events: list[dict], use_normalized: bool = False) -> str:
    """Build a VCALENDAR string from a list of event dicts."""
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Timekit//Calendar Intelligence//EN",
        "CALSCALE:GREGORIAN",
    ]

    for ev in events:
        title = ev.get("title_normalized") if use_normalized else None
        if not title:
            title = ev.get("title_original", "")

        lines.append("BEGIN:VEVENT")
        lines.append(f"UID:{ev.get('ek_event_id', '')}")
        lines.append(f"DTSTART:{_to_ics_datetime(ev.get('start_date'))}")
        lines.append(f"DTEND:{_to_ics_datetime(ev.get('end_date'))}")
        lines.append(f"SUMMARY:{_escape_ics(title)}")

        location = ev.get("location_name")
        if location:
            lines.append(f"LOCATION:{_escape_ics(location)}")

        notes = ev.get("notes")
        if notes:
            lines.append(f"DESCRIPTION:{_escape_ics(notes)}")

        url = ev.get("url")
        if url:
            lines.append(f"URL:{url}")

        lines.append("END:VEVENT")

    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"


async def export_ics(output: Path | None = None, optimized: bool = False) -> Path:
    """Export canonical events as ICS.

    Args:
        output: Output file path. Defaults to exports dir.
        optimized: If True, use title_normalized where available.
    """
    if output is None:
        exports_dir().mkdir(parents=True, exist_ok=True)
        suffix = "optimized" if optimized else "original"
        output = exports_dir() / f"timekit_{suffix}.ics"

    async with get_db() as db:
        await init_schema(db)
        events = await fetch_canonical_events(db)

        content = _event_to_vcalendar(events, use_normalized=optimized)
        output.write_text(content)

        await record_export_run(db, fmt="ics", file_path=str(output), event_count=len(events))

    return output
