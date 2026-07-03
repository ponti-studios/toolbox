import requests

from warehouse.spotify import SpotifyClient


class FakeResponse:
    def __init__(self, payload: dict, status_code: int = 200, headers: dict | None = None):
        self.payload = payload
        self.status_code = status_code
        self.headers = headers or {}

    def raise_for_status(self) -> None:
        if self.status_code >= 400 and self.status_code != 429:
            raise requests.RequestException(f"status {self.status_code}")

    def json(self) -> dict:
        return self.payload


class FakeSession:
    def __init__(self):
        self.request_calls = 0

    def post(self, *args, **kwargs):
        return FakeResponse({"access_token": "token", "expires_in": 3600})

    def request(self, method, url, headers=None, timeout=None, **kwargs):
        self.request_calls += 1
        if self.request_calls == 1:
            return FakeResponse({}, status_code=429, headers={"Retry-After": "0"})
        return FakeResponse(
            {
                "tracks": {
                    "items": [
                        {
                            "id": "123",
                            "name": "Song",
                            "artists": [{"name": "Artist", "id": "artist-1"}],
                            "album": {
                                "name": "Album",
                                "id": "album-1",
                                "release_date": "2024-01-01",
                            },
                            "popularity": 50,
                            "duration_ms": 1000,
                            "preview_url": None,
                            "external_urls": {},
                        }
                    ]
                }
            }
        )


def test_spotify_client_retries_rate_limit() -> None:
    waits: list[int] = []
    client = SpotifyClient(
        "id",
        "secret",
        on_wait=waits.append,
        session=FakeSession(),
    )

    result = client.search_track("Artist", "Song")

    assert result is not None
    assert result["spotify_id"] == "123"
    assert waits
