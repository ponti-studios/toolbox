"""Spotify CLI commands."""

from __future__ import annotations

import typer
from rich.console import Console
from rich.table import Table

from warehouse.core import AppSettings, Database
from warehouse.core.errors import ConfigError
from warehouse.spotify import SpotifyClient, SpotifyEnrichmentService

app = typer.Typer(help="Spotify lookup and enrichment tools.")
console = Console()


def _settings() -> AppSettings:
    try:
        s = AppSettings.from_config()
        s.ensure_database()
    except ConfigError as exc:
        console.print(f"[red]{exc}[/red]")
        raise typer.Exit(1) from exc
    return s


@app.command("track-info")
def track_info(
    artist: str = typer.Option(..., help="Artist name"),
    track: str = typer.Option(..., help="Track name"),
    save: bool = typer.Option(False, help="Save track info to the database"),
) -> None:
    """Fetch Spotify information for a track."""

    settings = _settings()
    settings.validate_spotify()
    client = SpotifyClient(settings.spotify_client_id, settings.spotify_client_secret)
    result = client.search_track(artist, track)
    if not result:
        typer.echo(f"No track found for '{track}' by {artist}")
        raise typer.Exit(code=0)

    track_data = client.get_track(result["spotify_id"])
    artist_id = track_data.get("artist_ids", [None])[0]
    genres: list[str] = []
    if artist_id:
        try:
            genres = client.get_artist(artist_id).get("genres", [])
        except Exception:
            genres = []

    table = Table(title="Track Information")
    table.add_column("Field", style="cyan")
    table.add_column("Value", style="green")
    table.add_row("Spotify ID", track_data.get("spotify_id", "N/A"))
    table.add_row("Track", track_data.get("track_name", "N/A"))
    table.add_row("Artist", track_data.get("artist_name", "N/A"))
    table.add_row("Album", track_data.get("album_name", "N/A"))
    table.add_row("Release Date", track_data.get("release_date", "N/A"))
    table.add_row("Popularity", str(track_data.get("popularity", "N/A")))
    table.add_row("Duration", f"{track_data.get('duration_ms', 0) // 1000}s")
    if genres:
        table.add_row("Genres", ", ".join(genres))
    console.print(table)

    if save:
        db = Database(settings.database_path)
        service = SpotifyEnrichmentService(db)
        service.save_track_to_db(track_data, genres)
        typer.echo("Track saved to the database.")


@app.command("enrich")
def enrich(
    limit: int = typer.Option(0, help="Max tracks to process (0 = all)."),
    dry_run: bool = typer.Option(False, help="Preview changes without saving."),
    refresh: bool = typer.Option(
        False,
        help="Retry tracks already attempted, including previous misses.",
    ),
) -> None:
    """Batch enrich tracks with Spotify metadata."""

    settings = _settings()
    settings.validate_spotify()
    db = Database(settings.database_path)
    service = SpotifyEnrichmentService(db)
    client = SpotifyClient(settings.spotify_client_id, settings.spotify_client_secret)
    candidates = service.fetch_tracks_for_enrichment(
        limit=limit,
        skip_matched=not refresh,
    )
    if not candidates:
        typer.echo("No tracks to enrich.")
        return

    matched = 0
    unmatched = 0
    errors = 0
    for candidate in candidates:
        if candidate.existing_spotify_id:
            matched += 1
            if not dry_run:
                service.stamp_miss(candidate.track_db_id)
            continue

        try:
            result = client.search_track(candidate.artist_name, candidate.track_name)
            if not result:
                unmatched += 1
                if not dry_run:
                    service.stamp_miss(candidate.track_db_id)
                continue

            genres: list[str] = []
            artist_id = result.get("artist_ids", [None])[0]
            if artist_id:
                try:
                    genres = client.get_artist(artist_id).get("genres", [])
                except Exception:
                    genres = []

            matched += 1
            if not dry_run:
                service.save_enrichment(candidate.track_db_id, result, genres)
        except Exception as exc:
            errors += 1
            if not dry_run:
                service.stamp_miss(candidate.track_db_id)
            typer.echo(
                f"Error enriching '{candidate.track_name}' by {candidate.artist_name}: {exc}"
            )

    typer.echo(f"Processed: {len(candidates)}")
    typer.echo(f"Matched:   {matched}")
    typer.echo(f"Unmatched: {unmatched}")
    typer.echo(f"Errors:    {errors}")
    if dry_run:
        typer.echo("Dry run only. No database changes were made.")
