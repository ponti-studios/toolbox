"""
Shared date-pattern abstraction for photokit.

Provides built-in filename date patterns, auto-detection, and
a custom-pattern matcher — all returning a uniform date-parts dict.
"""

import re
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Optional


@dataclass
class DatePattern:
    """A named regex pattern with named capture groups for date extraction.

    Required groups:  year, month, day
    Optional groups:  hour, minute, second  (defaults: 12, 00, 00)
    Alternative:      doy (day-of-year 1-366) in place of month+day
    """

    name: str
    regex: str
    description: str = ""


# ---------------------------------------------------------------------------
# Built-in patterns (tried in order during auto-detect)
# ---------------------------------------------------------------------------

BUILTIN_PATTERNS: list[DatePattern] = [
    # 1: YYYY-MM-DD-HH-MM-SS  (full datetime with hyphens)
    DatePattern(
        "standard",
        r"(?P<year>\d{4})-(?P<month>\d{2})-(?P<day>\d{2})-(?P<hour>\d{2})-(?P<minute>\d{2})-(?P<second>\d{2})",
        "2024-03-12-11-32-03",
    ),
    # 2: YYYY-MM-DD_HH-MM-SS  (underscore separator)
    DatePattern(
        "underscore",
        r"(?P<year>\d{4})-(?P<month>\d{2})-(?P<day>\d{2})_(?P<hour>\d{2})-(?P<minute>\d{2})-(?P<second>\d{2})",
        "2024-03-12_11-32-03",
    ),
    # 3: YYYYMMDD_HHMMSS  (compact, no separators)
    DatePattern(
        "compact",
        r"(?P<year>\d{4})(?P<month>\d{2})(?P<day>\d{2})_(?P<hour>\d{2})(?P<minute>\d{2})(?P<second>\d{2})",
        "20240312_113203",
    ),
    # 4: YYYY-MM-DD-HHMM  (compact time)
    DatePattern(
        "compact_time",
        r"(?P<year>\d{4})-(?P<month>\d{2})-(?P<day>\d{2})-(?P<hour>\d{2})(?P<minute>\d{2})",
        "2024-07-23-0931",
    ),
    # 5: YYYY-MM-DD  (date only)
    DatePattern(
        "date_only",
        r"(?P<year>\d{4})-(?P<month>\d{2})-(?P<day>\d{2})",
        "2024-06-21",
    ),
    # 6: YYYY-DDD-at-HH-MM-SS  (day-of-year with time)
    DatePattern(
        "doy_time",
        r"(?P<year>\d{4})-(?P<doy>\d{3})-at-(?P<hour>\d{2})-(?P<minute>\d{2})-(?P<second>\d{2})",
        "2024-019-at-11-05-42",
    ),
    # 7: YYYY-DDD-HHMM  (day-of-year compact)
    DatePattern(
        "doy_compact",
        r"(?P<year>\d{4})-(?P<doy>\d{3})-(?P<hour>\d{2})(?P<minute>\d{2})",
        "2024-022-0843",
    ),
    # 8: YYYY-DDD  (day-of-year only)
    DatePattern(
        "doy_only",
        r"(?P<year>\d{4})-(?P<doy>\d{3})",
        "2024-022",
    ),
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _doy_to_month_day(year: int, doy: int) -> tuple[int, int]:
    """Convert day-of-year (1-366) to (month, day)."""
    d = date(year, 1, 1) + timedelta(days=doy - 1)
    return d.month, d.day


def _parse_match(m: re.Match) -> Optional[dict]:
    """Convert a regex Match to a uniform date-parts dict."""
    parts = m.groupdict()

    if "doy" in parts and parts["doy"]:
        # Day-of-year pattern — no month/day in the regex
        year = int(parts["year"])
        doy = int(parts["doy"])
        if doy < 1 or doy > 366:
            return None
        month, day = _doy_to_month_day(year, doy)
    else:
        # Standard month/day pattern
        if not all(parts.get(k) for k in ("year", "month", "day")):
            return None
        year = int(parts["year"])
        month = int(parts["month"])
        day = int(parts["day"])

    return {
        "year": year,
        "month": month,
        "day": day,
        "hour": int(parts.get("hour") or "12"),
        "minute": int(parts.get("minute") or "0"),
        "second": int(parts.get("second") or "0"),
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def auto_detect(filename: str) -> Optional[dict]:
    """Try built-in patterns in order, return first match or None."""
    for pat in BUILTIN_PATTERNS:
        m = re.search(pat.regex, filename)
        if m:
            result = _parse_match(m)
            if result:
                return result
    return None


def match_from_pattern(pattern_regex: str, filename: str) -> Optional[dict]:
    """Match a user-supplied regex against the filename.

    The regex must contain named groups ``year``, ``month``, ``day``
    (or ``year``, ``doy``). Optional: ``hour``, ``minute``, ``second``.
    """
    try:
        compiled = re.compile(pattern_regex)
    except re.error as exc:
        raise ValueError(f"Invalid regex: {exc}") from exc

    m = compiled.search(filename)
    if not m:
        return None
    return _parse_match(m)


DATE_PATTERN_HELP = """\
Auto-detect tries these built-in patterns (in order):
  1) YYYY-MM-DD-HH-MM-SS       (e.g. 2024-03-12-11-32-03)
  2) YYYY-MM-DD_HH-MM-SS       (e.g. 2024-03-12_11-32-03)
  3) YYYYMMDD_HHMMSS           (e.g. 20240312_113203)
  4) YYYY-MM-DD-HHMM           (e.g. 2024-07-23-0931)
  5) YYYY-MM-DD                (e.g. 2024-06-21)
  6) YYYY-DDD-at-HH-MM-SS      (e.g. 2024-019-at-11-05-42)
  7) YYYY-DDD-HHMM             (e.g. 2024-022-0843)
  8) YYYY-DDD                  (e.g. 2024-022)

Use --pattern to supply a custom regex with named groups
year, month, day (or year, doy) and optionally hour, minute, second.
"""
