from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from typing import Annotated, Optional

import typer
from rich.console import Console
from rich.table import Table

from timekit_engine.config import cache_root, db_path, support_root

app = typer.Typer(name="timekit", help="Calendar intelligence CLI")
console = Console()


@app.command()
def auth(
    login: Annotated[Optional[bool], typer.Option("--login", help="Request calendar access")] = None,
):
    """Manage calendar permissions."""
    if login:
        from timekit_engine.calendar.permissions import check_access, request_access, CalendarAccess

        status = check_access()
        if status == CalendarAccess.AUTHORIZED:
            console.print("[green]Calendar access already granted.[/green]")
            return

        console.print("[dim]Requesting calendar access...[/dim]")
        result = request_access()

        if result == CalendarAccess.AUTHORIZED:
            console.print("[green]Calendar access granted![/green]")
        else:
            from timekit_engine.calendar.permissions import access_denied_message
            console.print(f"[red]{access_denied_message()}[/red]")
            raise typer.Exit(1)
    else:
        from timekit_engine.calendar.permissions import check_access

        status = check_access()
        console.print(f"Calendar access status: [bold]{status.value}[/bold]")


@app.command()
def sync():
    """Sync events from Apple Calendar into local database."""
    from timekit_engine.calendar.eventkit import CalendarAccessError
    from timekit_engine.sync.orchestrator import print_sync_summary, run_sync

    try:
        stats = asyncio.run(run_sync())
        print_sync_summary(stats)
    except CalendarAccessError as exc:
        console.print(f"[red]{exc}[/red]")
        console.print("[dim]Run: timekit auth --login[/dim]")
        raise typer.Exit(1)
    except Exception as exc:
        console.print(f"[red]Sync failed: {exc}[/red]")
        raise typer.Exit(1)


@app.command()
def analyze(
    profile: Annotated[
        str, typer.Option("--profile", "-p", help="Analysis profile")
    ] = "fast",
):
    """Analyze events: extract entities, classify categories, propose title rewrites."""
    if profile not in ("fast", "deep"):
        console.print("[red]Invalid profile. Use 'fast' or 'deep'[/]")
        raise typer.Exit(1)

    from timekit_engine.analysis.runner import print_analysis_summary, run_analysis

    stats = asyncio.run(run_analysis(profile))

    if stats.events_analyzed == 0:
        console.print("[yellow]No events found. Run 'timekit sync' first.[/yellow]")
        raise typer.Exit(1)

    print_analysis_summary(stats)


@app.command()
def preview():
    """Preview synced events."""

    async def _preview():
        from timekit_engine.db.connection import get_db
        from timekit_engine.db.schema import init_schema
        from timekit_engine.export.common import fetch_canonical_events

        async with get_db() as db:
            await init_schema(db)
            events = await fetch_canonical_events(db)

        if not events:
            console.print("[yellow]No events found. Run 'timekit sync' first.[/yellow]")
            return

        table = Table(title=f"Calendar Events ({len(events)} total)")
        table.add_column("Date", style="cyan", no_wrap=True)
        table.add_column("Time", style="dim")
        table.add_column("Title", style="bold")
        table.add_column("Location")
        table.add_column("Duration")

        for ev in events[:50]:
            start = ev.get("start_date", "")
            date_str = start[:10] if start else ""
            time_str = start[11:16] if start and len(start) > 16 else ""

            if ev.get("is_all_day"):
                time_str = "all day"

            duration = ev.get("duration_minutes")
            dur_str = ""
            if duration:
                if duration >= 60:
                    dur_str = f"{duration // 60}h {duration % 60}m"
                else:
                    dur_str = f"{duration}m"

            title = ev.get("title_normalized") or ev.get("title_original") or ""
            location = ev.get("location_name") or ""

            table.add_row(date_str, time_str, title, location, dur_str)

        if len(events) > 50:
            console.print(f"[dim]Showing first 50 of {len(events)} events[/dim]")

        console.print(table)

    asyncio.run(_preview())


@app.command()
def export(
    format: Annotated[
        str, typer.Option("--format", "-f", help="Export format")
    ] = "jsonl",
    output: Annotated[
        Optional[str], typer.Option("--output", "-o", help="Output file path")
    ] = None,
):
    """Export calendar data."""
    if format not in ("ics", "jsonl", "csv"):
        console.print("[red]Invalid format. Use 'ics', 'jsonl', or 'csv'[/]")
        raise typer.Exit(1)

    out_path = Path(output) if output else None

    async def _export():
        if format == "jsonl":
            from timekit_engine.export.jsonl import export_jsonl
            return await export_jsonl(out_path)
        elif format == "csv":
            from timekit_engine.export.csv_export import export_csv
            return await export_csv(out_path)
        else:
            from timekit_engine.export.ics import export_ics
            return await export_ics(out_path)

    result = asyncio.run(_export())
    console.print(f"[green]Exported to {result}[/green]")


@app.command()
def doctor():
    """Check system and configuration."""
    table = Table(title="Timekit Health Check")
    table.add_column("Check", style="bold")
    table.add_column("Status")
    table.add_column("Details", style="dim")

    # Python version
    py_ver = f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
    py_ok = sys.version_info >= (3, 12)
    table.add_row(
        "Python",
        "[green]OK[/green]" if py_ok else "[red]FAIL[/red]",
        f"v{py_ver}" + ("" if py_ok else " (need 3.12+)"),
    )

    # pyobjc / EventKit
    try:
        import EventKit  # type: ignore[import-not-found]
        table.add_row("EventKit", "[green]OK[/green]", "pyobjc-framework-EventKit available")
    except ImportError:
        table.add_row("EventKit", "[red]FAIL[/red]", "pip install pyobjc-framework-EventKit")

    # Calendar permissions
    from timekit_engine.calendar.permissions import check_access, CalendarAccess
    access = check_access()
    if access == CalendarAccess.AUTHORIZED:
        table.add_row("Calendar Access", "[green]OK[/green]", "Full access granted")
    elif access == CalendarAccess.NOT_DETERMINED:
        table.add_row("Calendar Access", "[yellow]PENDING[/yellow]", "Run: timekit auth --login")
    elif access == CalendarAccess.UNAVAILABLE:
        table.add_row("Calendar Access", "[red]UNAVAIL[/red]", "macOS with EventKit required")
    else:
        table.add_row("Calendar Access", "[red]DENIED[/red]", "Check System Settings > Privacy > Calendars")

    # Database
    db = db_path()
    if db.exists():
        size_kb = db.stat().st_size / 1024
        table.add_row("Database", "[green]OK[/green]", f"{db} ({size_kb:.1f} KB)")
    else:
        table.add_row("Database", "[yellow]EMPTY[/yellow]", f"Will be created at {db}")

    # Paths
    table.add_row("Config root", "[dim]INFO[/dim]", str(support_root()))
    table.add_row("Model cache", "[dim]INFO[/dim]", str(cache_root()))

    console.print(table)


models_app = typer.Typer(help="Manage local ML models.")
app.add_typer(models_app, name="models")


@models_app.command("pull")
def models_pull(
    profile: Annotated[
        str, typer.Option("--profile", "-p", help="Model profile (fast or deep)")
    ] = "fast",
):
    """Download a model profile to the local cache."""
    from timekit_engine.models import PROFILES, is_downloaded, model_dir, pull

    if profile not in PROFILES:
        console.print(f"[red]Unknown profile '{profile}'. Use: {', '.join(PROFILES)}[/red]")
        raise typer.Exit(1)

    if is_downloaded(profile):
        console.print(f"[green]Model '{profile}' already downloaded at {model_dir(profile)}[/green]")
        return

    try:
        dest = pull(profile)
        console.print(f"[green]Model '{profile}' downloaded to {dest}[/green]")
    except Exception as exc:
        console.print(f"[red]Download failed: {exc}[/red]")
        raise typer.Exit(1)


@models_app.command("list")
def models_list():
    """Show available model profiles and their download status."""
    from timekit_engine.models import PROFILES, is_downloaded, model_dir

    table = Table(title="Model Profiles")
    table.add_column("Profile", style="bold")
    table.add_column("Model")
    table.add_column("Status")
    table.add_column("Path", style="dim")

    for profile, repo_id in PROFILES.items():
        if is_downloaded(profile):
            status = "[green]downloaded[/green]"
            path = str(model_dir(profile))
        else:
            status = "[dim]not downloaded[/dim]"
            path = ""
        table.add_row(profile, repo_id, status, path)

    console.print(table)


def main():
    app()


if __name__ == "__main__":
    main()
