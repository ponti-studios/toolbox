"""SQLite connection management."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

import aiosqlite

from chronicle_engine.config import db_path, ensure_dirs


@asynccontextmanager
async def get_db() -> AsyncIterator[aiosqlite.Connection]:
    ensure_dirs()
    db = await aiosqlite.connect(db_path())
    try:
        await db.execute("PRAGMA journal_mode=WAL")
        await db.execute("PRAGMA foreign_keys=ON")
        db.row_factory = aiosqlite.Row
        yield db
    finally:
        await db.close()
