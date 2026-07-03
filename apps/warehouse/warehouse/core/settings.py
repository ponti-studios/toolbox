"""Typed application settings read from ``~/.hominem/config.yml``."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

import yaml

from .errors import ConfigError

DEFAULT_CONFIG = Path.home() / ".hominem" / "config.yml"
DEFAULT_DB = Path.home() / ".hominem" / "warehouse.db"


def _read_config(path: Path) -> dict:
    """Read and parse the YAML config file, creating it with defaults if missing."""

    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        defaults = {
            "database_path": str(DEFAULT_DB),
            "spotify": {
                "client_id": "",
                "client_secret": "",
            },
        }
        with open(path, "w") as f:
            yaml.dump(defaults, f, default_flow_style=False, sort_keys=False)
        return defaults

    try:
        with open(path) as f:
            return yaml.safe_load(f) or {}
    except yaml.YAMLError as exc:
        raise ConfigError(f"Invalid YAML in {path}: {exc}") from exc


@dataclass(slots=True)
class AppSettings:
    """Shared runtime settings for CLI commands and services."""

    database_path: str = str(DEFAULT_DB)
    output_dir: Path = field(default_factory=Path.cwd)
    spotify_client_id: str = ""
    spotify_client_secret: str = ""

    @classmethod
    def from_config(
        cls,
        *,
        config_path: str | Path | None = None,
        load_dotenv: bool = True,
    ) -> "AppSettings":
        """Create settings from ``~/.hominem/config.yml`` and environment.

        Config file provides the database path; Spotify credentials come from
        environment variables (they are secrets and should not live in config).
        """

        if load_dotenv:
            from dotenv import load_dotenv

            load_dotenv()

        config_path = Path(config_path) if config_path else DEFAULT_CONFIG
        try:
            config = _read_config(config_path)
        except ConfigError:
            env_db = os.getenv("WAREHOUSE_DATABASE_PATH")
            if env_db:
                config = {}
            else:
                raise

        # Env-var override for the database path (mainly for tests)
        env_db = os.getenv("WAREHOUSE_DATABASE_PATH")
        if env_db:
            database_path = str(Path(env_db).expanduser().resolve())
        else:
            db_raw = config.get("database_path", str(DEFAULT_DB))
            database_path = str(Path(os.path.expanduser(db_raw)).expanduser().resolve())

        return cls(
            database_path=database_path,
            output_dir=Path(config.get("output_dir", ".")).resolve(),
            spotify_client_id=os.getenv(
                "SPOTIFY_CLIENT_ID",
                config.get("spotify", {}).get("client_id", ""),
            ),
            spotify_client_secret=os.getenv(
                "SPOTIFY_CLIENT_SECRET",
                config.get("spotify", {}).get("client_secret", ""),
            ),
        )

    def validate_spotify(self) -> None:
        """Ensure Spotify credentials are available."""

        if not self.spotify_client_id or not self.spotify_client_secret:
            raise ConfigError(
                "Spotify credentials not set. Provide SPOTIFY_CLIENT_ID and "
                "SPOTIFY_CLIENT_SECRET."
            )

    def ensure_database(self) -> None:
        """Verify the database file exists, with a helpful message if not."""

        path = Path(self.database_path)
        if not path.exists():
            raise ConfigError(
                f"Database not found at {path}.\n"
                f"Run [bold]warehouse init[/bold] to create it."
            )
