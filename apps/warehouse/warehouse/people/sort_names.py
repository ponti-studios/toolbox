"""Sort-name normalization helpers for people rows."""

from __future__ import annotations

from warehouse.people.name_parts import parse_display_name


def normalize_sort_name(display_name: str) -> str | None:
    """Return a canonical sort name for a person.

    We keep this intentionally conservative:
    - real personal names become "Last, First Middle"
    - single-token names and non-person labels stay as-is
    - names that our parser skips also stay as-is
    """

    cleaned = display_name.strip()
    if not cleaned:
        return None

    parts = parse_display_name(cleaned)
    if parts is None:
        return cleaned

    if not parts.last_name:
        return parts.first_name

    sort_name = f"{parts.last_name}, {parts.first_name}"
    if parts.middle_name:
        sort_name = f"{sort_name} {parts.middle_name}"
    return sort_name


def needs_sort_name_normalization(display_name: str, sort_name: str | None) -> bool:
    """Return True when the stored sort name differs from the canonical one."""

    desired = normalize_sort_name(display_name)
    current = (sort_name or "").strip() or None
    return desired != current
