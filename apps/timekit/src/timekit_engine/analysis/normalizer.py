"""Rule-based title normalization and rewrite proposal generation."""

from __future__ import annotations

import re


# Prefixes to strip
_STRIP_PREFIXES = re.compile(
    r"^(re|fwd?|fw|cancelled?|canceled?|rescheduled?|updated?|tentative|"
    r"hold|placeholder|block|blocked|ooo|out of office)"
    r"[\s:–—\-]+",
    re.IGNORECASE,
)

# Trailing noise
_STRIP_SUFFIXES = re.compile(r"[\s.…]+$")

# Collapse internal whitespace
_WHITESPACE = re.compile(r"\s+")

# Patterns that suggest a title should be title-cased
_ALL_CAPS = re.compile(r"^[A-Z\s\d\W]+$")
_ALL_LOWER = re.compile(r"^[a-z\s\d\W]+$")


def _smart_case(title: str) -> str:
    """Apply title case only when the original is all-caps or all-lowercase."""
    if _ALL_CAPS.match(title) or _ALL_LOWER.match(title):
        # title() handles basic cases; preserve existing mixed-case titles
        return title.title()
    return title


def normalize_title(title: str | None) -> str | None:
    """Return a normalized title, or None if no change is needed."""
    if not title:
        return None

    result = title.strip()
    result = _WHITESPACE.sub(" ", result)
    result = _STRIP_PREFIXES.sub("", result).strip()
    result = _STRIP_SUFFIXES.sub("", result).strip()
    result = _smart_case(result)

    if result == title:
        return None  # no change
    return result or None


def build_proposals(
    event_id: int,
    title_original: str | None,
    title_normalized: str | None,
) -> list[dict]:
    """Build rewrite_proposal dicts for changed fields."""
    proposals = []

    if title_normalized and title_normalized != title_original:
        proposals.append({
            "event_id": event_id,
            "field_name": "title",
            "original_value": title_original,
            "proposed_value": title_normalized,
            "model_name": "rule-based",
            "confidence": 0.85,
            "status": "pending",
        })

    return proposals
