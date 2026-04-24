"""Analysis orchestrator: run entity extraction, categories, and normalization."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass

import aiosqlite
from rich.console import Console
from rich.table import Table

from timekit_engine.analysis.categories import classify
from timekit_engine.analysis.entities import extract_people, extract_place
from timekit_engine.analysis.normalizer import build_proposals, normalize_title
from timekit_engine.db.connection import get_db
from timekit_engine.db.schema import init_schema

console = Console()


@dataclass
class AnalysisStats:
    events_analyzed: int = 0
    entities_added: int = 0
    categories_added: int = 0
    proposals_added: int = 0


async def _upsert_entity(db: aiosqlite.Connection, entity: dict) -> int:
    """Insert or return existing entity id."""
    await db.execute(
        """INSERT INTO entities (entity_type, name, email)
           VALUES (?, ?, ?)
           ON CONFLICT(entity_type, name, email) DO NOTHING""",
        (entity["entity_type"], entity["name"], entity.get("email")),
    )
    rows = await db.execute_fetchall(
        """SELECT id FROM entities
           WHERE entity_type = ? AND name = ? AND (email = ? OR (email IS NULL AND ? IS NULL))""",
        (entity["entity_type"], entity["name"], entity.get("email"), entity.get("email")),
    )
    return rows[0][0]


async def _link_entity(
    db: aiosqlite.Connection, event_id: int, entity_id: int, role: str
) -> None:
    await db.execute(
        """INSERT INTO event_entities (event_id, entity_id, role)
           VALUES (?, ?, ?)
           ON CONFLICT DO NOTHING""",
        (event_id, entity_id, role),
    )


async def _upsert_category(
    db: aiosqlite.Connection,
    event_id: int,
    category: str,
    confidence: float,
) -> bool:
    cursor = await db.execute(
        """INSERT INTO event_categories (event_id, category, confidence, source)
           VALUES (?, ?, ?, 'rule')
           ON CONFLICT(event_id, category) DO NOTHING""",
        (event_id, category, confidence),
    )
    return (cursor.rowcount or 0) > 0


async def _upsert_proposal(db: aiosqlite.Connection, proposal: dict) -> bool:
    cursor = await db.execute(
        """INSERT INTO rewrite_proposals
               (event_id, field_name, original_value, proposed_value, model_name, confidence, status)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT DO NOTHING""",
        (
            proposal["event_id"],
            proposal["field_name"],
            proposal["original_value"],
            proposal["proposed_value"],
            proposal["model_name"],
            proposal["confidence"],
            proposal["status"],
        ),
    )
    return (cursor.rowcount or 0) > 0


async def run_analysis(profile: str = "fast") -> AnalysisStats:
    stats = AnalysisStats()

    async with get_db() as db:
        await init_schema(db)

        rows = await db.execute_fetchall(
            """SELECT ec.id, ec.title_original, ec.location_name,
                      ec.organizer_name, ec.organizer_email, ec.notes,
                      er.attendees_json
               FROM events_canonical ec
               JOIN events_raw er ON ec.latest_raw_id = er.id
               WHERE ec.deleted_at IS NULL"""
        )

        if not rows:
            return stats  # nothing to analyze; user should run sync first

        for row in rows:
            (event_id, title, location_name, organizer_name,
             organizer_email, notes, attendees_json) = row

            stats.events_analyzed += 1

            # --- Entities ---
            people = extract_people(attendees_json, organizer_name, organizer_email)
            place = extract_place(location_name)

            for person in people:
                eid = await _upsert_entity(db, person)
                await _link_entity(db, event_id, eid, person["role"])
                stats.entities_added += 1

            if place:
                eid = await _upsert_entity(db, place)
                await _link_entity(db, event_id, eid, "location")
                stats.entities_added += 1

            # --- Categories ---
            categories = classify(title or "", notes)
            for cat, conf in categories:
                added = await _upsert_category(db, event_id, cat, conf)
                if added:
                    stats.categories_added += 1

            # --- Title normalization ---
            normalized = normalize_title(title)
            if normalized:
                for proposal in build_proposals(event_id, title, normalized):
                    added = await _upsert_proposal(db, proposal)
                    if added:
                        stats.proposals_added += 1

                # Write normalized title back to canonical
                await db.execute(
                    "UPDATE events_canonical SET title_normalized = ? WHERE id = ?",
                    (normalized, event_id),
                )

        await db.commit()

    return stats


def print_analysis_summary(stats: AnalysisStats) -> None:
    table = Table(title="Analysis Summary")
    table.add_column("Metric", style="bold")
    table.add_column("Count", justify="right")

    table.add_row("Events analyzed", str(stats.events_analyzed))
    table.add_row("Entities extracted", str(stats.entities_added))
    table.add_row("Categories assigned", str(stats.categories_added))
    table.add_row("Title proposals", str(stats.proposals_added))

    console.print(table)
