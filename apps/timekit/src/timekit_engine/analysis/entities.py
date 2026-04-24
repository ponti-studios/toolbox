"""Extract entities (people, places) from event data."""

from __future__ import annotations

import json
import re


def extract_people(
    attendees_json: str | None,
    organizer_name: str | None,
    organizer_email: str | None,
) -> list[dict]:
    """Return list of person entity dicts from attendee and organizer fields."""
    people: list[dict] = []
    seen_emails: set[str] = set()

    if organizer_name or organizer_email:
        email = (organizer_email or "").lower().strip()
        if email not in seen_emails:
            seen_emails.add(email)
            people.append({
                "entity_type": "person",
                "name": organizer_name or email,
                "email": organizer_email,
                "role": "organizer",
            })

    if attendees_json:
        try:
            attendees = json.loads(attendees_json)
        except (json.JSONDecodeError, TypeError):
            attendees = []

        for att in attendees:
            email = (att.get("email") or "").lower().strip()
            name = att.get("name") or email

            if not name:
                continue

            if email and email in seen_emails:
                continue
            if email:
                seen_emails.add(email)

            people.append({
                "entity_type": "person",
                "name": name,
                "email": att.get("email"),
                "role": att.get("role", "attendee"),
            })

    return people


def extract_place(location_name: str | None) -> dict | None:
    """Return a place entity dict if location is meaningful."""
    if not location_name:
        return None
    # Skip bare addresses that are just coordinates or very short strings
    stripped = location_name.strip()
    if len(stripped) < 3:
        return None
    # Skip if it looks like a URL
    if stripped.startswith(("http://", "https://", "zoom.us", "meet.google")):
        return None
    return {
        "entity_type": "place",
        "name": stripped,
        "email": None,
        "role": "location",
    }
