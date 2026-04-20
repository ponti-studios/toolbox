"""Convert EventKit objects to plain Python dicts and compute content hashes."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone


def nsdate_to_iso(nsdate: object) -> str | None:
    """Convert an NSDate to an ISO-8601 UTC string."""
    if nsdate is None:
        return None
    try:
        ts = nsdate.timeIntervalSince1970()  # type: ignore[attr-defined]
        dt = datetime.fromtimestamp(ts, tz=timezone.utc)
        return dt.strftime("%Y-%m-%dT%H:%M:%S.%fZ")
    except (AttributeError, TypeError, OSError):
        return None


def _color_to_hex(color: object) -> str | None:
    """Convert an NSColor/CGColor to a hex string."""
    if color is None:
        return None
    try:
        rgb = color.colorUsingColorSpaceName_("NSCalibratedRGBColorSpace")  # type: ignore[attr-defined]
        if rgb is None:
            return None
        r = int(rgb.redComponent() * 255)
        g = int(rgb.greenComponent() * 255)
        b = int(rgb.blueComponent() * 255)
        return f"#{r:02x}{g:02x}{b:02x}"
    except (AttributeError, TypeError):
        return None


def serialize_calendar(cal: object) -> dict:
    """Convert an EKCalendar to a plain dict."""
    type_names = {0: "local", 1: "caldav", 2: "exchange", 3: "subscription", 4: "birthday"}
    cal_type = type_names.get(cal.type(), "unknown")  # type: ignore[attr-defined]

    source = cal.source()  # type: ignore[attr-defined]
    return {
        "ek_calendar_id": str(cal.calendarIdentifier()),  # type: ignore[attr-defined]
        "title": str(cal.title() or ""),  # type: ignore[attr-defined]
        "calendar_type": cal_type,
        "source_title": str(source.title()) if source else None,  # type: ignore[attr-defined]
        "source_id": str(source.sourceIdentifier()) if source else None,  # type: ignore[attr-defined]
        "color_hex": _color_to_hex(cal.color()),  # type: ignore[attr-defined]
        "is_writable": bool(cal.allowsContentModifications()),  # type: ignore[attr-defined]
    }


def _serialize_participant(p: object) -> dict:
    """Convert an EKParticipant to a dict."""
    role_names = {0: "unknown", 1: "required", 2: "optional", 3: "chair", 4: "non-participant"}
    status_names = {
        0: "unknown", 1: "pending", 2: "accepted",
        3: "declined", 4: "tentative", 5: "delegated",
        6: "completed", 7: "in-process",
    }

    email = None
    url = p.URL()  # type: ignore[attr-defined]
    if url:
        url_str = str(url.absoluteString())  # type: ignore[attr-defined]
        if url_str.startswith("mailto:"):
            email = url_str[7:]

    return {
        "name": str(p.name() or "") if p.name() else None,  # type: ignore[attr-defined]
        "email": email,
        "role": role_names.get(p.participantRole(), "unknown"),  # type: ignore[attr-defined]
        "status": status_names.get(p.participantStatus(), "unknown"),  # type: ignore[attr-defined]
    }


def _serialize_recurrence_rule(rule: object) -> dict:
    """Convert an EKRecurrenceRule to a dict."""
    freq_names = {0: "daily", 1: "weekly", 2: "monthly", 3: "yearly"}
    return {
        "frequency": freq_names.get(rule.frequency(), "unknown"),  # type: ignore[attr-defined]
        "interval": rule.interval(),  # type: ignore[attr-defined]
    }


def serialize_event(event: object) -> dict:
    """Convert an EKEvent to a plain dict with all relevant fields."""
    attendees = event.attendees()  # type: ignore[attr-defined]
    attendees_list = []
    if attendees:
        for i in range(len(attendees)):
            attendees_list.append(_serialize_participant(attendees[i]))

    recurrence_rules = event.recurrenceRules()  # type: ignore[attr-defined]
    recurrence_list = []
    if recurrence_rules:
        for i in range(len(recurrence_rules)):
            recurrence_list.append(_serialize_recurrence_rule(recurrence_rules[i]))

    alarms = event.alarms()  # type: ignore[attr-defined]
    alarms_list = []
    if alarms:
        for i in range(len(alarms)):
            alarm = alarms[i]
            alarms_list.append({"offset_seconds": alarm.relativeOffset()})  # type: ignore[attr-defined]

    organizer = event.organizer()  # type: ignore[attr-defined]
    organizer_name = None
    organizer_email = None
    if organizer:
        organizer_name = str(organizer.name()) if organizer.name() else None  # type: ignore[attr-defined]
        url = organizer.URL()  # type: ignore[attr-defined]
        if url:
            url_str = str(url.absoluteString())  # type: ignore[attr-defined]
            if url_str.startswith("mailto:"):
                organizer_email = url_str[7:]

    location_name = None
    location_lat = None
    location_lon = None
    loc = event.structuredLocation()  # type: ignore[attr-defined]
    if loc and loc.geoLocation():
        geo = loc.geoLocation()
        coord = geo.coordinate()  # CLLocationCoordinate2D bridged as (lat, lon) tuple
        location_lat = float(coord[0])
        location_lon = float(coord[1])
        location_name = str(loc.title()) if loc.title() else None  # type: ignore[attr-defined]
    if not location_name:
        raw_loc = event.location()  # type: ignore[attr-defined]
        if raw_loc:
            location_name = str(raw_loc)

    avail_names = {0: "not-supported", 1: "busy", 2: "free", 3: "tentative", 4: "unavailable"}
    status_names = {0: "none", 1: "confirmed", 2: "tentative", 3: "canceled"}

    event_url = event.URL()  # type: ignore[attr-defined]
    url_str = None
    if event_url:
        url_str = str(event_url.absoluteString())  # type: ignore[attr-defined]

    tz = event.timeZone()  # type: ignore[attr-defined]
    tz_name = str(tz.name()) if tz else None  # type: ignore[attr-defined]

    cal = event.calendar()  # type: ignore[attr-defined]
    ek_calendar_id = str(cal.calendarIdentifier()) if cal else None  # type: ignore[attr-defined]

    return {
        "ek_event_id": str(event.eventIdentifier()),  # type: ignore[attr-defined]
        "ek_calendar_id": ek_calendar_id,
        "title": str(event.title() or ""),  # type: ignore[attr-defined]
        "start_date": nsdate_to_iso(event.startDate()),  # type: ignore[attr-defined]
        "end_date": nsdate_to_iso(event.endDate()),  # type: ignore[attr-defined]
        "is_all_day": bool(event.isAllDay()),  # type: ignore[attr-defined]
        "location_name": location_name,
        "location_lat": location_lat,
        "location_lon": location_lon,
        "notes": str(event.notes()) if event.notes() else None,  # type: ignore[attr-defined]
        "url": url_str,
        "availability": avail_names.get(event.availability(), "unknown"),  # type: ignore[attr-defined]
        "status": status_names.get(event.status(), "unknown"),  # type: ignore[attr-defined]
        "organizer_name": organizer_name,
        "organizer_email": organizer_email,
        "attendees": attendees_list,
        "recurrence_rules": recurrence_list,
        "alarms": alarms_list,
        "timezone": tz_name,
        "last_modified": nsdate_to_iso(event.lastModifiedDate()),  # type: ignore[attr-defined]
        "ek_created_date": nsdate_to_iso(event.creationDate()),  # type: ignore[attr-defined]
        "is_recurring": bool(recurrence_list),
        "attendee_count": len(attendees_list),
    }


def compute_content_hash(event_dict: dict) -> str:
    """Compute a SHA-256 hash of the event's content for change detection."""
    # Use a deterministic subset of fields (exclude metadata like last_modified)
    hashable = {
        "title": event_dict.get("title"),
        "start_date": event_dict.get("start_date"),
        "end_date": event_dict.get("end_date"),
        "is_all_day": event_dict.get("is_all_day"),
        "location_name": event_dict.get("location_name"),
        "notes": event_dict.get("notes"),
        "url": event_dict.get("url"),
        "attendees": event_dict.get("attendees"),
        "recurrence_rules": event_dict.get("recurrence_rules"),
    }
    serialized = json.dumps(hashable, sort_keys=True, default=str)
    return hashlib.sha256(serialized.encode()).hexdigest()
