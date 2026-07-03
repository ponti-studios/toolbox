"""People graph maintenance commands."""

from __future__ import annotations

import sqlite3
import uuid

import typer
from rich.console import Console
from rich.table import Table

from warehouse.core import AppSettings
from warehouse.core.errors import ConfigError
from warehouse.people.name_parts import needs_update, parse_display_name
from warehouse.people.phone_numbers import needs_phone_normalization, normalize_phone_number
from warehouse.people.sort_names import needs_sort_name_normalization, normalize_sort_name

app = typer.Typer(help="People graph maintenance tools.")
console = Console()


def _settings() -> AppSettings:
    try:
        s = AppSettings.from_config()
        s.ensure_database()
    except ConfigError as exc:
        console.print(f"[red]{exc}[/red]")
        raise typer.Exit(1) from exc
    return s


def _connect(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@app.command("add")
def add_person() -> None:
    """Add a person to the people graph."""

    from warehouse.cli.forms import Field, run_form

    values = run_form(
        "Add Person",
        [
            Field("display_name", "Display name", required=True),
            Field("first_name", "First name"),
            Field("middle_name", "Middle name"),
            Field("last_name", "Last name"),
        ],
    )
    display_name = values["display_name"]
    first_name = values["first_name"] or None
    middle_name = values["middle_name"] or None
    last_name = values["last_name"] or None

    settings = _settings()
    db_path = settings.database_path
    conn = _connect(db_path)
    try:
        # Auto-parse name parts if not explicitly provided
        if not first_name and not last_name:
            parts = parse_display_name(display_name)
            if parts:
                first_name = parts.first_name or first_name
                middle_name = parts.middle_name or middle_name
                last_name = parts.last_name or last_name

        person_id = str(uuid.uuid4())
        sort_name = normalize_sort_name(display_name)

        conn.execute(
            """
            INSERT INTO people (id, display_name, first_name, middle_name, last_name, sort_name)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (person_id, display_name, first_name, middle_name, last_name, sort_name),
        )
        conn.commit()
    finally:
        conn.close()

    table = Table(title="Person Added")
    table.add_column("Field", style="cyan")
    table.add_column("Value", style="green")
    table.add_row("ID", person_id)
    table.add_row("Display Name", display_name)
    if first_name:
        table.add_row("First Name", first_name)
    if middle_name:
        table.add_row("Middle Name", middle_name)
    if last_name:
        table.add_row("Last Name", last_name)
    table.add_row("Sort Name", sort_name or "—")
    console.print(table)


@app.command("backfill-name-parts")
def backfill_name_parts(
    dry_run: bool = typer.Option(False, "--dry-run", "-n", help="Preview without writing."),
    limit: int = typer.Option(0, help="Limit the number of candidate rows processed."),
) -> None:
    """Backfill first_name, middle_name, and last_name from display_name."""

    settings = _settings()
    db_path = settings.database_path
    conn = _connect(db_path)
    try:
        rows = conn.execute(
            """
            SELECT id, display_name, first_name, middle_name, last_name
            FROM people
            WHERE NULLIF(TRIM(display_name), '') IS NOT NULL
            ORDER BY CAST(id AS INTEGER), id
            """
        ).fetchall()

        candidates: list[sqlite3.Row] = []
        rejected: list[sqlite3.Row] = []
        for row in rows:
            display_name = row["display_name"] or ""
            parts = parse_display_name(display_name)
            if parts is None:
                if _needs_backfill(
                    first_name=row["first_name"],
                    middle_name=row["middle_name"],
                    last_name=row["last_name"],
                ):
                    rejected.append(row)
                continue

            if needs_update(
                display_name=display_name,
                first_name=row["first_name"],
                middle_name=row["middle_name"],
                last_name=row["last_name"],
            ):
                candidates.append(row)

        if limit > 0:
            candidates = candidates[:limit]

        updated = 0
        skipped = len(rejected)
        for row in candidates:
            parts = parse_display_name(row["display_name"])
            if parts is None:
                skipped += 1
                continue

            if not dry_run:
                conn.execute(
                    """
                    UPDATE people
                    SET first_name = ?,
                        middle_name = ?,
                        last_name = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (
                        parts.first_name or None,
                        parts.middle_name or None,
                        parts.last_name or None,
                        row["id"],
                    ),
                )
            updated += 1

        if not dry_run:
            conn.commit()

        table = Table(title="People Name Backfill")
        table.add_column("Metric", style="cyan")
        table.add_column("Count", style="green", justify="right")
        table.add_row("Candidates", str(len(candidates)))
        table.add_row("Updated", str(updated))
        table.add_row("Skipped", str(skipped))
        table.add_row("Dry run", "yes" if dry_run else "no")
        console.print(table)

        if candidates:
            preview = Table(title="Planned Name Updates")
            preview.add_column("ID", style="cyan")
            preview.add_column("Display Name", style="white")
            preview.add_column("First", style="green")
            preview.add_column("Middle", style="green")
            preview.add_column("Last", style="green")
            for row in candidates[:10]:
                parts = parse_display_name(row["display_name"])
                assert parts is not None
                preview.add_row(
                    str(row["id"]),
                    row["display_name"] or "",
                    parts.first_name,
                    parts.middle_name,
                    parts.last_name,
                )
            console.print(preview)

        if rejected:
            preview = Table(title="Skipped Non-Person Names")
            preview.add_column("ID", style="cyan")
            preview.add_column("Display Name", style="white")
            for row in rejected[:10]:
                preview.add_row(str(row["id"]), row["display_name"] or "")
            console.print(preview)
    finally:
        conn.close()


@app.command("normalize-phone-numbers")
def normalize_phone_numbers(
    dry_run: bool = typer.Option(False, "--dry-run", "-n", help="Preview without writing."),
    limit: int = typer.Option(0, help="Limit the number of candidate rows processed."),
) -> None:
    """Normalize phone contact methods into a canonical E.164-style format."""

    settings = _settings()
    db_path = settings.database_path
    conn = _connect(db_path)
    try:
        rows = conn.execute(
            """
            SELECT id, person_id, value, value_normalized, label, source
            FROM people_contacts
            WHERE kind = 'phone'
              AND NULLIF(TRIM(value), '') IS NOT NULL
            ORDER BY id
            """
        ).fetchall()

        candidates: list[sqlite3.Row] = []
        skipped: list[sqlite3.Row] = []
        for row in rows:
            if needs_phone_normalization(row["value"], row["value_normalized"]):
                desired = normalize_phone_number(row["value"])
                if desired is None:
                    skipped.append(row)
                    continue
                candidates.append(row)

        if limit > 0:
            candidates = candidates[:limit]

        updated = 0
        for row in candidates:
            desired = normalize_phone_number(row["value"])
            assert desired is not None
            if not dry_run:
                conn.execute(
                    """
                    UPDATE people_contacts
                    SET value_normalized = ?
                    WHERE id = ?
                    """,
                    (desired, row["id"]),
                )
            updated += 1

        if not dry_run:
            conn.commit()

        table = Table(title="Phone Normalization")
        table.add_column("Metric", style="cyan")
        table.add_column("Count", style="green", justify="right")
        table.add_row("Candidates", str(len(candidates)))
        table.add_row("Updated", str(updated))
        table.add_row("Skipped", str(len(skipped)))
        table.add_row("Dry run", "yes" if dry_run else "no")
        console.print(table)

        if candidates:
            preview = Table(title="Planned Phone Updates")
            preview.add_column("ID", style="cyan")
            preview.add_column("Person", style="white")
            preview.add_column("Raw", style="white")
            preview.add_column("Normalized", style="green")
            for row in candidates[:10]:
                preview.add_row(
                    str(row["id"]),
                    str(row["person_id"]),
                    row["value"] or "",
                    normalize_phone_number(row["value"]) or "",
                )
            console.print(preview)

        if skipped:
            preview = Table(title="Skipped Phone Values")
            preview.add_column("ID", style="cyan")
            preview.add_column("Person", style="white")
            preview.add_column("Raw", style="white")
            for row in skipped[:10]:
                preview.add_row(str(row["id"]), str(row["person_id"]), row["value"] or "")
            console.print(preview)
    finally:
        conn.close()


@app.command("normalize-sort-names")
def normalize_sort_names(
    dry_run: bool = typer.Option(False, "--dry-run", "-n", help="Preview without writing."),
    limit: int = typer.Option(0, help="Limit the number of candidate rows processed."),
) -> None:
    """Normalize people.sort_name into a canonical sort key."""

    settings = _settings()
    db_path = settings.database_path
    conn = _connect(db_path)
    try:
        rows = conn.execute(
            """
            SELECT id, display_name, sort_name
            FROM people
            WHERE NULLIF(TRIM(display_name), '') IS NOT NULL
            ORDER BY CAST(id AS INTEGER), id
            """
        ).fetchall()

        candidates: list[sqlite3.Row] = []
        for row in rows:
            if needs_sort_name_normalization(row["display_name"], row["sort_name"]):
                candidates.append(row)

        if limit > 0:
            candidates = candidates[:limit]

        updated = 0
        for row in candidates:
            desired = normalize_sort_name(row["display_name"])
            if not dry_run:
                conn.execute(
                    """
                    UPDATE people
                    SET sort_name = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (desired, row["id"]),
                )
            updated += 1

        if not dry_run:
            conn.commit()

        table = Table(title="Sort Name Normalization")
        table.add_column("Metric", style="cyan")
        table.add_column("Count", style="green", justify="right")
        table.add_row("Candidates", str(len(candidates)))
        table.add_row("Updated", str(updated))
        table.add_row("Dry run", "yes" if dry_run else "no")
        console.print(table)

        if candidates:
            preview = Table(title="Planned Sort Name Updates")
            preview.add_column("ID", style="cyan")
            preview.add_column("Display Name", style="white")
            preview.add_column("Sort Name", style="green")
            for row in candidates[:10]:
                preview.add_row(
                    str(row["id"]),
                    row["display_name"] or "",
                    normalize_sort_name(row["display_name"]) or "",
                )
            console.print(preview)
    finally:
        conn.close()


def _needs_backfill(
    *,
    first_name: str | None,
    middle_name: str | None,
    last_name: str | None,
) -> bool:
    current = (
        (first_name or "").strip(),
        (middle_name or "").strip(),
        (last_name or "").strip(),
    )
    return any(not part for part in current)
