"""macOS EventKit permission handling."""

from __future__ import annotations

import platform
import sys
import threading
from enum import Enum


class CalendarAccess(Enum):
    AUTHORIZED = "authorized"
    DENIED = "denied"
    RESTRICTED = "restricted"
    NOT_DETERMINED = "not_determined"
    UNAVAILABLE = "unavailable"


def _check_platform() -> str | None:
    """Return an error message if not on macOS, else None."""
    if platform.system() != "Darwin":
        return "Timekit requires macOS with Apple Calendar (EventKit)."
    return None


def check_access() -> CalendarAccess:
    """Check current EventKit authorization status without prompting."""
    err = _check_platform()
    if err:
        return CalendarAccess.UNAVAILABLE

    try:
        import EventKit  # type: ignore[import-not-found]
    except ImportError:
        return CalendarAccess.UNAVAILABLE

    status = EventKit.EKEventStore.authorizationStatusForEntityType_(
        EventKit.EKEntityTypeEvent
    )

    # EKAuthorizationStatus values:
    # 0 = notDetermined, 1 = restricted, 2 = denied, 3 = authorized/fullAccess
    mapping = {
        0: CalendarAccess.NOT_DETERMINED,
        1: CalendarAccess.RESTRICTED,
        2: CalendarAccess.DENIED,
        3: CalendarAccess.AUTHORIZED,
    }
    # macOS 14+ adds 4 = writeOnly, treat as denied for our read purposes
    return mapping.get(status, CalendarAccess.DENIED)


def request_access() -> CalendarAccess:
    """Request calendar access, blocking until the user responds."""
    err = _check_platform()
    if err:
        return CalendarAccess.UNAVAILABLE

    try:
        import EventKit  # type: ignore[import-not-found]
    except ImportError:
        return CalendarAccess.UNAVAILABLE

    store = EventKit.EKEventStore.alloc().init()
    result: list[CalendarAccess] = []
    done = threading.Event()

    def callback(granted: bool, error: object) -> None:
        if granted:
            result.append(CalendarAccess.AUTHORIZED)
        else:
            result.append(CalendarAccess.DENIED)
        done.set()

    # macOS 17+ (Sonoma) uses requestFullAccessToEventsWithCompletion_
    # Older versions use requestAccessToEntityType_completion_
    if hasattr(store, "requestFullAccessToEventsWithCompletion_"):
        store.requestFullAccessToEventsWithCompletion_(callback)
    else:
        store.requestAccessToEntityType_completion_(
            EventKit.EKEntityTypeEvent, callback
        )

    done.wait(timeout=120)

    if not result:
        return CalendarAccess.DENIED
    return result[0]


def access_denied_message() -> str:
    """Return a user-friendly message explaining how to grant access."""
    return (
        "Calendar access denied.\n\n"
        "To grant access, open:\n"
        "  System Settings → Privacy & Security → Calendars\n\n"
        "Enable access for your terminal application "
        "(Terminal.app, iTerm2, etc.)."
    )
