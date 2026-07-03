"""Name parsing helpers for the people graph."""

from __future__ import annotations

import re
from dataclasses import dataclass

_ROLE_WORDS = {
    "apt",
    "artist",
    "assistant",
    "book",
    "company",
    "co",
    "dental",
    "doctor",
    "family",
    "group",
    "home",
    "inc",
    "maintenance",
    "neighbor",
    "nurse",
    "office",
    "or",
    "oral",
    "psychiatry",
    "protector",
    "surgeon",
}

_PUNCTUATION_SKIP = re.compile(r"[<>\[\]{}@/#|]")
_DIGIT_RE = re.compile(r"\d")
_COMMAS_SPLIT_RE = re.compile(r"\s*,\s*")
_SPACE_RE = re.compile(r"\s+")
_POSSESSIVE_RE = re.compile(r"\b\w+['’]s\b", re.IGNORECASE)


@dataclass(slots=True)
class NameParts:
    """Structured name parts extracted from a display name."""

    first_name: str
    middle_name: str
    last_name: str


def should_skip_display_name(display_name: str) -> bool:
    """Return True when the display name does not look like a person name."""

    cleaned = display_name.strip()
    if not cleaned:
        return True
    if cleaned.startswith("Unknown person "):
        return True
    if _PUNCTUATION_SKIP.search(cleaned):
        return True
    if "(" in cleaned or ")" in cleaned:
        return True
    if _DIGIT_RE.search(cleaned):
        return True
    if "&" in cleaned:
        return True
    if _POSSESSIVE_RE.search(cleaned):
        return True

    tokens = _split_tokens(cleaned)
    if not tokens:
        return True

    if any(token.lower() in _ROLE_WORDS for token in tokens):
        return True
    if len(tokens) == 1 and tokens[0].lower() in _ROLE_WORDS:
        return True
    return False


def parse_display_name(display_name: str) -> NameParts | None:
    """Split a display name into first, middle, and last components.

    The parser is intentionally conservative. It handles standard names and
    comma-separated "Last, First Middle" forms, but skips strings that look like
    labels, organizations, or descriptive notes.
    """

    cleaned = _SPACE_RE.sub(" ", display_name.strip())
    if should_skip_display_name(cleaned):
        return None

    if "," in cleaned:
        parts = [part.strip() for part in _COMMAS_SPLIT_RE.split(cleaned) if part.strip()]
        if len(parts) >= 2:
            if len(parts) == 2:
                last = parts[0]
                rest = _split_tokens(parts[1])
                if not rest:
                    return None
                first = rest[0]
                middle = " ".join(rest[1:])
                return NameParts(first_name=first, middle_name=middle, last_name=last)

    tokens = _split_tokens(cleaned)
    if len(tokens) == 1:
        return NameParts(first_name=tokens[0], middle_name="", last_name="")
    if len(tokens) == 2:
        return NameParts(first_name=tokens[0], middle_name="", last_name=tokens[1])
    if len(tokens) == 3:
        return NameParts(first_name=tokens[0], middle_name=tokens[1], last_name=tokens[2])

    first = tokens[0]
    last = tokens[-1]
    middle = " ".join(tokens[1:-1])
    return NameParts(first_name=first, middle_name=middle, last_name=last)


def _split_tokens(display_name: str) -> list[str]:
    cleaned = _SPACE_RE.sub(" ", display_name.strip())
    return [token for token in cleaned.split(" ") if token]


def needs_update(
    *,
    display_name: str,
    first_name: str | None,
    middle_name: str | None,
    last_name: str | None,
) -> bool:
    """Return True when the stored split name differs from a plausible parse."""

    parsed = parse_display_name(display_name)
    if parsed is None:
        return False

    current = (
        (first_name or "").strip(),
        (middle_name or "").strip(),
        (last_name or "").strip(),
    )
    desired = (parsed.first_name, parsed.middle_name, parsed.last_name)
    return current != desired

