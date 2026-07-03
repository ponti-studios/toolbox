"""Phone number normalization helpers for people contact methods."""

from __future__ import annotations

import re

_NON_DIGIT_RE = re.compile(r"\D+")


def normalize_phone_number(value: str) -> str | None:
    """Return a conservative E.164-style normalization for a phone number.

    We keep the raw source value elsewhere, so this helper only emits a normalized
    value when the input looks like a real phone number. Short service codes and
    other noise are intentionally left unresolved.
    """

    cleaned = value.strip()
    if not cleaned:
        return None

    digits = _NON_DIGIT_RE.sub("", cleaned)
    if len(digits) < 7:
        return None

    if cleaned.startswith("+"):
        if 8 <= len(digits) <= 15:
            return f"+{digits}"
        return None

    if len(digits) == 10:
        return f"+1{digits}"

    if len(digits) == 11 and digits.startswith("1"):
        return f"+{digits}"

    if 8 <= len(digits) <= 15:
        return f"+{digits}"

    return None


def needs_phone_normalization(raw_value: str, value_normalized: str | None) -> bool:
    """Return True when a stored phone number should be rewritten."""

    desired = normalize_phone_number(raw_value)
    current = (value_normalized or "").strip() or None
    return desired != current
