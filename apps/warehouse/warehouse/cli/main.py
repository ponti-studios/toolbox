"""Typer CLI entry point for warehouse."""

from __future__ import annotations

import sqlite3
from importlib import resources
from pathlib import Path

import typer
from rich.console import Console

from warehouse import __version__
from warehouse.cli.commands import career, finance, people, spotify
from warehouse.core import AppSettings

app = typer.Typer(
    name="warehouse",
    help="Personal data warehouse CLI — finance, career, people, and music enrichment.",
    no_args_is_help=True,
)
console = Console()

app.add_typer(finance.app, name="finance")
app.add_typer(career.app, name="career")
app.add_typer(people.app, name="people")
app.add_typer(spotify.app, name="spotify")


@app.command()
def version() -> None:
    """Show version information."""

    typer.echo(f"warehouse version {__version__}")


@app.command()
def init() -> None:
    """Initialize the database with the warehouse schema."""

    settings = AppSettings.from_config()
    db_path = Path(settings.database_path)

    if db_path.exists():
        console.print(f"[yellow]Database already exists at {db_path}.[/yellow]")
        console.print("Use [bold]warehouse doctor[/bold] to verify it.")
        raise typer.Exit(0)

    schema = resources.files("warehouse.migrations").joinpath(
        "00001_initial_schema.sql"
    ).read_text()

    # Extract just the Up section
    import re
    match = re.search(
        r"-- \+goose StatementBegin\n(.*?)\n-- \+goose StatementEnd",
        schema, re.DOTALL
    )
    if not match:
        console.print("[red]Could not parse schema migration.[/red]")
        raise typer.Exit(1)

    sql = match.group(1)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    try:
        conn.executescript(sql)
        conn.commit()
    finally:
        conn.close()

    count = sqlite3.connect(str(db_path)).execute(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name != 'sqlite_sequence'"
    ).fetchone()[0]

    console.print(f"[green]✓[/green] Initialized [bold]{db_path}[/bold] with {count} tables.")
    console.print()
    console.print("Next steps:")
    console.print(
        "  [bold]warehouse finance accounts add[/bold]"
        ' "Checking" --institution "My Bank"'
    )
    console.print("  [bold]warehouse finance categories add[/bold] \"Groceries\"")
    console.print("  [bold]warehouse finance import[/bold] transactions.csv")


def main() -> None:
    """Launch the CLI."""

    app()


if __name__ == "__main__":
    main()
