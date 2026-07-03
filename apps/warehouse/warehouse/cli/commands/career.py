"""Career CLI commands."""

from __future__ import annotations

import sqlite3
from datetime import date, datetime

import typer
from rich.console import Console
from rich.table import Table

from warehouse.core import AppSettings
from warehouse.core.errors import ConfigError

app = typer.Typer(help="Career tracking tools.")
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
    return conn


def _parse_date(value: str | None) -> date | None:
    if not value or not value.strip():
        return None
    cleaned = value.strip()
    for fmt in (
        "%Y-%m-%d",
        "%Y-%m-%d %H:%M:%S",
        "%b %Y",
        "%B %Y",
        "%B %d, %Y",
        "%b %d, %Y",
    ):
        try:
            return datetime.strptime(cleaned, fmt).date()
        except ValueError:
            continue
    return None


def _duration(start: date, end: date | None) -> str:
    """Human-readable duration between two dates."""

    if end is None:
        end = date.today()
    total_months = (end.year - start.year) * 12 + (end.month - start.month)
    years, months = divmod(total_months, 12)
    if years and months:
        return f"{years}y {months}m"
    if years:
        return f"{years}y"
    return f"{months}m"


def _date_label(raw: str | None) -> str:
    d = _parse_date(raw)
    return d.strftime("%b %Y") if d else "—"


def _end_label(row: sqlite3.Row, end: date | None, today: date) -> str:
    if row["is_current"] or (end and end >= today):
        return "present"
    return _date_label(row["end_date"])


@app.command("add")
def add_position() -> None:
    """Add an employment or project position."""

    from warehouse.cli.forms import Field, run_form

    values = run_form(
        "Add Position",
        [
            Field("company", "Company / organization", required=True),
            Field("title", "Job title / role", required=True),
            Field("start_date", "Start date (YYYY-MM-DD, Mon YYYY, etc.)"),
            Field("end_date", "End date (leave empty if current)"),
            Field("record_type", "Type (employment or project)", default="employment"),
            Field("description", "Description / notes"),
            Field("location", "Location (city, remote, etc.)"),
            Field("url", "URL"),
            Field("project_status", "Project status"),
        ],
    )
    company = values["company"]
    title = values["title"]
    start_date = values["start_date"] or None
    end_date = values["end_date"] or None
    record_type = values["record_type"] or "employment"
    description = values["description"] or None
    location = values["location"] or None
    url = values["url"] or None
    project_status = values["project_status"] or None

    settings = _settings()
    db_path = settings.database_path
    conn = _connect(db_path)
    try:
        conn.execute(
            """
            INSERT INTO career_positions
                (company, title, start_date, end_date, is_current,
                 record_type, description, location, url, project_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                company,
                title,
                start_date,
                end_date,
                1 if not end_date else 0,
                record_type,
                description,
                location,
                url,
                project_status if record_type == "project" else None,
            ),
        )
        conn.commit()
    finally:
        conn.close()

    table = Table(title="Position Added")
    table.add_column("Field", style="cyan")
    table.add_column("Value", style="green")
    table.add_row("Company", company)
    table.add_row("Title", title)
    table.add_row("Start", start_date or "—")
    table.add_row("End", end_date or ("present" if not end_date else "—"))
    table.add_row("Type", record_type)
    if location:
        table.add_row("Location", location)
    if project_status:
        table.add_row("Status", project_status)
    console.print(table)


@app.command("timeline")
def timeline() -> None:
    """Print a career timeline with employment and project history."""

    settings = _settings()
    db_path = settings.database_path
    conn = _connect(db_path)
    try:
        rows = conn.execute(
            """
            SELECT company, title, start_date, end_date, record_type,
                   project_status, is_current
            FROM career_positions
            WHERE record_type IN ('employment', 'project')
            ORDER BY COALESCE(NULLIF(start_date, ''), '9999'), id
            """
        ).fetchall()
    finally:
        conn.close()

    if not rows:
        console.print("[yellow]No career data found.[/yellow]")
        return

    today = date.today()
    employment_rows = [r for r in rows if r["record_type"] == "employment"]
    project_rows = [r for r in rows if r["record_type"] == "project"]

    # ---- Employment table ----
    if employment_rows:
        table = Table(title="Employment History")
        table.add_column("Company", style="cyan", no_wrap=True)
        table.add_column("Title", style="white")
        table.add_column("Start", style="dim")
        table.add_column("End", style="dim")
        table.add_column("Duration", style="green")

        for row in employment_rows:
            start = _parse_date(row["start_date"])
            end = _parse_date(row["end_date"])
            if end is None and row["is_current"]:
                end = today

            table.add_row(
                row["company"] or "—",
                row["title"] or "—",
                _date_label(row["start_date"]),
                _end_label(row, end, today),
                _duration(start, end) if start else "—",
            )
        console.print(table)

    # ---- Project table ----
    if project_rows:
        table = Table(title="Projects")
        table.add_column("Project", style="cyan", no_wrap=True)
        table.add_column("Description", style="white")
        table.add_column("Start", style="dim")
        table.add_column("End", style="dim")
        table.add_column("Status", style="green")

        for row in project_rows:
            start = _parse_date(row["start_date"])
            end = _parse_date(row["end_date"])
            if end is None and row["is_current"]:
                end = today

            label = row["company"] or ""
            if row["title"]:
                label = f"{label} - {row['title']}" if label else row["title"]

            table.add_row(
                label or "—",
                "",
                _date_label(row["start_date"]),
                _end_label(row, end, today),
                row["project_status"] or "",
            )
        console.print(table)
