"""EKEventStore wrapper — fetch calendars and events."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from timekit_engine.calendar.permissions import CalendarAccess, check_access, request_access
from timekit_engine.calendar.serializers import serialize_calendar, serialize_event


class CalendarAccessError(Exception):
    pass


def _get_store():
    """Create and return an EKEventStore instance."""
    import EventKit  # type: ignore[import-not-found]

    return EventKit.EKEventStore.alloc().init()


def ensure_access() -> None:
    """Ensure we have calendar access, requesting if needed. Raises on failure."""
    status = check_access()
    if status == CalendarAccess.AUTHORIZED:
        return

    if status == CalendarAccess.NOT_DETERMINED:
        status = request_access()

    if status != CalendarAccess.AUTHORIZED:
        from timekit_engine.calendar.permissions import access_denied_message

        raise CalendarAccessError(access_denied_message())


def fetch_calendars() -> list[dict]:
    """Fetch all event calendars from Apple Calendar."""
    import EventKit  # type: ignore[import-not-found]

    store = _get_store()
    calendars = store.calendarsForEntityType_(EventKit.EKEntityTypeEvent)
    return [serialize_calendar(cal) for cal in calendars]


def fetch_events(
    start: datetime,
    end: datetime,
    calendar_ids: list[str] | None = None,
) -> list[dict]:
    """Fetch events within a date range, optionally filtered by calendar IDs.

    Automatically chunks large ranges into 1-year windows to respect
    EventKit's predicate limit.
    """
    import EventKit  # type: ignore[import-not-found]
    from Foundation import NSDate  # type: ignore[import-not-found]

    store = _get_store()

    # Resolve calendar filter
    ek_calendars = None
    if calendar_ids:
        all_cals = store.calendarsForEntityType_(EventKit.EKEntityTypeEvent)
        ek_calendars = [
            c for c in all_cals if str(c.calendarIdentifier()) in calendar_ids
        ]

    # Chunk into 1-year windows
    max_window = timedelta(days=365)
    all_events: list[dict] = []
    seen_ids: set[str] = set()

    chunk_start = start
    while chunk_start < end:
        chunk_end = min(chunk_start + max_window, end)

        ns_start = NSDate.dateWithTimeIntervalSince1970_(
            chunk_start.replace(tzinfo=timezone.utc).timestamp()
        )
        ns_end = NSDate.dateWithTimeIntervalSince1970_(
            chunk_end.replace(tzinfo=timezone.utc).timestamp()
        )

        predicate = store.predicateForEventsWithStartDate_endDate_calendars_(
            ns_start, ns_end, ek_calendars
        )
        ek_events = store.eventsMatchingPredicate_(predicate)

        if ek_events:
            for ev in ek_events:
                eid = str(ev.eventIdentifier())
                if eid not in seen_ids:
                    seen_ids.add(eid)
                    all_events.append(serialize_event(ev))

        chunk_start = chunk_end

    return all_events
