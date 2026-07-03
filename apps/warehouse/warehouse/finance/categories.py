"""DB-backed category resolution, mirroring accounts.py::AccountResolver."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass


@dataclass(slots=True)
class Category:
    id: int
    name: str
    parent_id: int | None
    parent_name: str | None


class CategoryResolver:
    """Resolves (category, parent_category) text pairs to finance_categories.id.

    Never guesses: an unrecognized pair resolves to ``None`` so the caller
    can surface it explicitly, same convention as AccountResolver.
    """

    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn
        self._by_pair: dict[tuple[str, str], int] = {}
        self._by_name: dict[str, int] = {}
        self._load()

    def _load(self) -> None:
        rows = self._conn.execute(
            """
            SELECT c.id, c.name, p.name
            FROM finance_categories c
            LEFT JOIN finance_categories p ON c.parent_id = p.id
            """
        ).fetchall()
        for category_id, name, parent_name in rows:
            key_name = name.strip().lower()
            self._by_pair[(key_name, (parent_name or "").strip().lower())] = category_id
            # First match wins for name-only lookups (ambiguous names favor
            # whichever row was inserted first -- same tie-break the 00171
            # backfill uses).
            self._by_name.setdefault(key_name, category_id)

    def resolve(self, category: str, parent_category: str = "") -> int | None:
        if not category:
            return None
        key_name = category.strip().lower()
        key_parent = parent_category.strip().lower()
        if not key_name:
            return None
        if key_parent and (key_name, key_parent) in self._by_pair:
            return self._by_pair[(key_name, key_parent)]
        return self._by_name.get(key_name)

    def list_categories(self) -> list[Category]:
        rows = self._conn.execute(
            """
            SELECT c.id, c.name, c.parent_id, p.name
            FROM finance_categories c
            LEFT JOIN finance_categories p ON c.parent_id = p.id
            ORDER BY COALESCE(p.name, c.name), c.parent_id IS NULL DESC, c.name
            """
        ).fetchall()
        return [
            Category(id=row[0], name=row[1], parent_id=row[2], parent_name=row[3])
            for row in rows
        ]

    def add_category(self, name: str, parent_name: str = "") -> int:
        parent_id: int | None = None
        if parent_name:
            parent_id = self._by_pair.get((parent_name.strip().lower(), ""))
            if parent_id is None:
                raise ValueError(f"No top-level finance_categories row named {parent_name!r}")
        cursor = self._conn.execute(
            "INSERT INTO finance_categories (name, parent_id) VALUES (?, ?)",
            (name, parent_id),
        )
        self._conn.commit()
        assert cursor.lastrowid is not None
        category_id = cursor.lastrowid
        key_name = name.strip().lower()
        key_parent = parent_name.strip().lower()
        self._by_pair[(key_name, key_parent)] = category_id
        self._by_name.setdefault(key_name, category_id)
        return category_id
