"""Spotify Web API client for track information and authentication."""

from __future__ import annotations

import base64
import time
from datetime import UTC, datetime, timedelta
from typing import Callable

import requests

from warehouse.core.errors import APIError


class SpotifyClient:
    """Client for Spotify Web API with OAuth 2.0 authentication."""

    AUTH_URL = "https://accounts.spotify.com/api/token"
    API_URL = "https://api.spotify.com/v1"

    def __init__(
        self,
        client_id: str,
        client_secret: str,
        *,
        on_wait: Callable[[int], None] | None = None,
        on_request: Callable[[str, int, float], None] | None = None,
        session: requests.Session | None = None,
    ):
        self.client_id = client_id
        self.client_secret = client_secret
        self.access_token: str | None = None
        self.token_expires_at: datetime | None = None
        self.on_wait = on_wait
        self.on_request = on_request
        self.session = session or requests.Session()

    def _get_access_token(self) -> str:
        if self.access_token and self.token_expires_at:
            if datetime.now(UTC) < self.token_expires_at - timedelta(seconds=60):
                return self.access_token

        credentials = f"{self.client_id}:{self.client_secret}"
        encoded = base64.b64encode(credentials.encode()).decode()
        headers = {
            "Authorization": f"Basic {encoded}",
            "Content-Type": "application/x-www-form-urlencoded",
        }

        try:
            response = self.session.post(
                self.AUTH_URL,
                headers=headers,
                data={"grant_type": "client_credentials"},
                timeout=10,
            )
            response.raise_for_status()
        except requests.RequestException as exc:
            raise APIError(f"Failed to authenticate with Spotify: {exc}") from exc

        token_data = response.json()
        self.access_token = token_data["access_token"]
        expires_in = token_data.get("expires_in", 3600)
        self.token_expires_at = datetime.now(UTC) + timedelta(seconds=expires_in)
        return self.access_token

    def _interruptible_sleep(self, seconds: int) -> None:
        for remaining in range(seconds, 0, -1):
            if self.on_wait:
                self.on_wait(remaining)
            time.sleep(1)
        if self.on_wait:
            self.on_wait(0)

    def _request(self, method: str, endpoint: str, **kwargs) -> dict:
        token = self._get_access_token()
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        url = f"{self.API_URL}{endpoint}"
        max_retries = 3
        retry_count = 0

        while retry_count < max_retries:
            t0 = time.monotonic()
            try:
                response = self.session.request(
                    method,
                    url,
                    headers=headers,
                    timeout=15,
                    **kwargs,
                )
                elapsed_ms = (time.monotonic() - t0) * 1000
                if self.on_request:
                    self.on_request(endpoint, response.status_code, elapsed_ms)

                if response.status_code == 429:
                    retry_after = min(int(response.headers.get("Retry-After", 5)), 30)
                    self._interruptible_sleep(retry_after)
                    retry_count += 1
                    continue

                response.raise_for_status()
                return response.json()
            except requests.RequestException as exc:
                elapsed_ms = (time.monotonic() - t0) * 1000
                if self.on_request:
                    self.on_request(endpoint, 0, elapsed_ms)
                if retry_count < max_retries - 1:
                    retry_count += 1
                    wait = min(2**retry_count, 10)
                    if self.on_wait:
                        self.on_wait(-wait)
                    self._interruptible_sleep(wait)
                    continue
                raise APIError(f"Spotify API request failed: {exc}") from exc

        raise APIError("Max retries exceeded for Spotify API request")

    def search_track(
        self, artist: str, track_name: str, limit: int = 5
    ) -> dict | None:
        query = f"artist:{artist} track:{track_name}"
        results = self._request(
            "GET",
            "/search",
            params={"q": query, "type": "track", "limit": limit},
        )
        tracks = results.get("tracks", {}).get("items", [])
        if not tracks:
            return None
        return self._parse_track(tracks[0])

    def get_track(self, spotify_id: str) -> dict:
        return self._parse_track(self._request("GET", f"/tracks/{spotify_id}"))

    def get_artist(self, artist_id: str) -> dict:
        return self._request("GET", f"/artists/{artist_id}")

    @staticmethod
    def _parse_track(track: dict) -> dict:
        artists = track.get("artists", [])
        artist_names = ", ".join([artist.get("name", "") for artist in artists])
        artist_ids = [artist.get("id", "") for artist in artists]

        return {
            "spotify_id": track.get("id"),
            "track_name": track.get("name"),
            "artist_name": artist_names,
            "artist_ids": artist_ids,
            "album_name": track.get("album", {}).get("name"),
            "album_id": track.get("album", {}).get("id"),
            "popularity": track.get("popularity"),
            "duration_ms": track.get("duration_ms"),
            "release_date": track.get("album", {}).get("release_date"),
            "preview_url": track.get("preview_url"),
            "external_urls": track.get("external_urls", {}),
        }
