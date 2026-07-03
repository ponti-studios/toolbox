"""Repository and service helpers for Spotify enrichment."""

from __future__ import annotations

import json
from dataclasses import dataclass

from warehouse.core.db import Database


@dataclass(slots=True)
class EnrichmentCandidate:
    """Music track candidate for Spotify enrichment."""

    track_db_id: int
    artist_name: str
    track_name: str
    existing_spotify_id: str | None


class SpotifyEnrichmentService:
    """Shared Spotify enrichment operations without presentation concerns."""

    def __init__(self, db: Database):
        self.db = db

    def fetch_tracks_for_enrichment(
        self, *, limit: int = 0, skip_matched: bool = False
    ) -> list[EnrichmentCandidate]:
        query = """
        SELECT mt.id, COALESCE(ma.name, ''), mt.title, mt.spotify_id
        FROM music_tracks mt
        LEFT JOIN music_artists ma ON ma.id = mt.artist_id
        WHERE 1=1
        """
        if skip_matched:
            query += " AND mt.enriched_at IS NULL"
        else:
            query += " AND (mt.enriched_at IS NULL OR mt.spotify_id IS NULL)"
        query += " ORDER BY mt.id"
        if limit > 0:
            query += f" LIMIT {limit}"

        rows = self.db.fetch_all(query)
        return [
            EnrichmentCandidate(
                track_db_id=row[0],
                artist_name=row[1],
                track_name=row[2],
                existing_spotify_id=row[3],
            )
            for row in rows
        ]

    def save_track_to_db(self, track_data: dict, genres: list[str]) -> None:
        artist_name = track_data.get("artist_name", "").split(",")[0].strip()

        with self.db.transaction() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO music_artists (name) VALUES (?)",
                (artist_name,),
            )

            album_name = track_data.get("album_name")
            if album_name:
                conn.execute(
                    """
                    INSERT OR IGNORE INTO music_albums (title, artist_id)
                    VALUES (?, (SELECT id FROM music_artists WHERE LOWER(name) = LOWER(?) LIMIT 1))
                    """,
                    (album_name, artist_name),
                )

            conn.execute(
                """
                INSERT INTO music_tracks (
                    title, artist_id, album_id, spotify_id, popularity,
                    preview_url, genres, duration_ms, release_date
                )
                VALUES (
                    ?,
                    (SELECT id FROM music_artists WHERE LOWER(name) = LOWER(?) LIMIT 1),
                    (SELECT id FROM music_albums WHERE LOWER(title) = LOWER(?) LIMIT 1),
                    ?, ?, ?, ?, ?, ?
                )
                ON CONFLICT(spotify_id) DO UPDATE SET
                    popularity = excluded.popularity,
                    preview_url = excluded.preview_url,
                    genres = excluded.genres,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
                """,
                (
                    track_data.get("track_name"),
                    artist_name,
                    album_name,
                    track_data.get("spotify_id"),
                    track_data.get("popularity"),
                    track_data.get("preview_url"),
                    json.dumps(genres),
                    track_data.get("duration_ms"),
                    track_data.get("release_date"),
                ),
            )

        track_row = self.db.fetch_one(
            "SELECT id FROM music_tracks WHERE spotify_id = ? LIMIT 1",
            (track_data.get("spotify_id"),),
        )
        if track_row:
            self.save_enrichment(track_row[0], track_data, genres)

    def save_enrichment(
        self, track_db_id: int, track_data: dict, genres: list[str]
    ) -> None:
        spotify_id = track_data.get("spotify_id")
        artist_ids = track_data.get("artist_ids", [])
        artist_names = [name.strip() for name in track_data.get("artist_name", "").split(",")]
        album_name = track_data.get("album_name")
        album_spotify_id = track_data.get("album_id")

        with self.db.transaction() as conn:
            conn.execute(
                """
                UPDATE music_tracks SET
                    spotify_id = ?,
                    popularity = ?,
                    preview_url = ?,
                    genres = ?,
                    duration_ms = COALESCE(duration_ms, ?),
                    release_date = COALESCE(release_date, ?),
                    enriched_at = strftime('%Y-%m-%dT%H:%M:%SZ','now'),
                    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
                WHERE id = ?
                """,
                (
                    spotify_id,
                    track_data.get("popularity"),
                    track_data.get("preview_url"),
                    json.dumps(genres),
                    track_data.get("duration_ms"),
                    track_data.get("release_date"),
                    track_db_id,
                ),
            )

            for artist_id, name in zip(artist_ids, artist_names, strict=False):
                if artist_id and name:
                    conn.execute(
                        """
                        UPDATE music_artists
                        SET spotify_id = ?
                        WHERE LOWER(name) = LOWER(?) AND spotify_id IS NULL
                        """,
                        (artist_id, name),
                    )

            if album_spotify_id and album_name:
                primary_artist_id = artist_ids[0] if artist_ids else None
                conn.execute(
                    """
                    INSERT OR IGNORE INTO music_albums (title, spotify_id, artist_id)
                    VALUES (?, ?, (SELECT id FROM music_artists WHERE spotify_id = ? LIMIT 1))
                    """,
                    (album_name, album_spotify_id, primary_artist_id),
                )
                conn.execute(
                    """
                    UPDATE music_albums SET spotify_id = ?
                    WHERE rowid = (
                        SELECT rowid FROM music_albums
                        WHERE LOWER(title) = LOWER(?) AND spotify_id IS NULL
                        AND NOT EXISTS (SELECT 1 FROM music_albums WHERE spotify_id = ?)
                        LIMIT 1
                    )
                    """,
                    (album_spotify_id, album_name, album_spotify_id),
                )
                conn.execute(
                    """
                    UPDATE music_tracks SET album_id = (
                        SELECT id FROM music_albums WHERE spotify_id = ? LIMIT 1
                    )
                    WHERE id = ?
                    """,
                    (album_spotify_id, track_db_id),
                )

    def stamp_miss(self, track_db_id: int) -> None:
        """Mark a track as attempted without a Spotify match."""

        self.db.execute(
            """
            UPDATE music_tracks
            SET enriched_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
            WHERE id = ?
            """,
            (track_db_id,),
        )
