"""Sync window computation."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone


def first_sync_range() -> tuple[datetime, datetime]:
    """Default range for first sync: 12 months back, 6 months forward."""
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=365)
    end = now + timedelta(days=182)
    return start, end


def incremental_range(
    last_start: str, last_end: str, overlap_days: int = 7
) -> tuple[datetime, datetime]:
    """Compute range for incremental sync with overlap window."""
    last_end_dt = datetime.fromisoformat(last_end.replace("Z", "+00:00"))
    now = datetime.now(timezone.utc)

    # Start from overlap_days before the last sync's end
    start = last_end_dt - timedelta(days=overlap_days)
    # Go up to 6 months from now
    end = now + timedelta(days=182)
    return start, end


def compute_sync_range(
    last_sync: tuple[str, str] | None,
) -> tuple[datetime, datetime]:
    """Determine the sync range based on whether this is a first or incremental sync."""
    if last_sync is None:
        return first_sync_range()
    return incremental_range(last_sync[0], last_sync[1])
