"""Content hash comparison for sync diffing."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class DiffResult:
    added: list[dict] = field(default_factory=list)
    updated: list[dict] = field(default_factory=list)
    unchanged: list[str] = field(default_factory=list)


def diff_events(
    events: list[dict],
    existing_hashes: dict[str, str],
) -> DiffResult:
    """Compare fetched events against existing content hashes.

    Args:
        events: List of serialized event dicts (must include 'ek_event_id' and 'content_hash').
        existing_hashes: Mapping of ek_event_id → content_hash from events_canonical.
    """
    result = DiffResult()

    for ev in events:
        eid = ev["ek_event_id"]
        new_hash = ev["content_hash"]

        if eid not in existing_hashes:
            result.added.append(ev)
        elif existing_hashes[eid] != new_hash:
            result.updated.append(ev)
        else:
            result.unchanged.append(eid)

    return result
