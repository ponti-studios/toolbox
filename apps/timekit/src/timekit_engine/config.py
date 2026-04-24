"""Path and configuration management for Timekit."""

from __future__ import annotations

from pathlib import Path


def support_root() -> Path:
    return Path.home() / "Library" / "Application Support" / "timekit"


def cache_root() -> Path:
    return Path.home() / "Library" / "Caches" / "timekit" / "models"


def db_path() -> Path:
    return support_root() / "timekit.db"


def exports_dir() -> Path:
    return support_root() / "exports"


def ensure_dirs() -> None:
    support_root().mkdir(parents=True, exist_ok=True)
    cache_root().mkdir(parents=True, exist_ok=True)
    exports_dir().mkdir(parents=True, exist_ok=True)
