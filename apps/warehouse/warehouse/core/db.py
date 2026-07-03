"""SQLite database helpers."""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Generator, Iterable

from .errors import DatabaseError


class Database:
    """Thin SQLite helper with safe materialized query methods."""

    def __init__(self, db_path: str | Path, *, row_factory: Any = sqlite3.Row):
        self.db_path = str(db_path)
        self.row_factory = row_factory

    def connect(self) -> sqlite3.Connection:
        """Open a configured SQLite connection."""

        try:
            conn = sqlite3.connect(self.db_path)
        except sqlite3.Error as exc:
            raise DatabaseError(f"Failed to connect to database: {exc}") from exc
        conn.row_factory = self.row_factory
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        return conn

    @contextmanager
    def transaction(self) -> Generator[sqlite3.Connection, None, None]:
        """Yield a connection wrapped in commit/rollback handling."""

        conn = self.connect()
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def fetch_one(self, sql: str, params: tuple[Any, ...] = ()) -> Any:
        """Fetch a single row."""

        with self.transaction() as conn:
            return conn.execute(sql, params).fetchone()

    def fetch_all(self, sql: str, params: tuple[Any, ...] = ()) -> list[Any]:
        """Fetch all rows."""

        with self.transaction() as conn:
            return conn.execute(sql, params).fetchall()

    def execute(self, sql: str, params: tuple[Any, ...] = ()) -> int:
        """Execute a statement and return the affected row count."""

        with self.transaction() as conn:
            cursor = conn.execute(sql, params)
            return cursor.rowcount

    def executemany(self, sql: str, params: Iterable[tuple[Any, ...]]) -> int:
        """Execute a statement many times and return the affected row count."""

        with self.transaction() as conn:
            cursor = conn.executemany(sql, params)
            return cursor.rowcount
