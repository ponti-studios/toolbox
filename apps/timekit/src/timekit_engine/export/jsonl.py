"""JSONL export."""

from __future__ import annotations

import json
from pathlib import Path

from timekit_engine.config import exports_dir
from timekit_engine.db.connection import get_db
from timekit_engine.db.schema import init_schema
from timekit_engine.export.common import fetch_canonical_events, record_export_run


async def export_jsonl(output: Path | None = None) -> Path:
    """Export canonical events as JSONL."""
    if output is None:
        exports_dir().mkdir(parents=True, exist_ok=True)
        output = exports_dir() / "timekit_events.jsonl"

    async with get_db() as db:
        await init_schema(db)
        events = await fetch_canonical_events(db)

        with open(output, "w") as f:
            for ev in events:
                f.write(json.dumps(ev, default=str) + "\n")

        await record_export_run(db, fmt="jsonl", file_path=str(output), event_count=len(events))

    return output
