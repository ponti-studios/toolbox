"""DB-backed account label resolution.

``finance_accounts`` owns durable account identity. ``finance_account_labels``
owns every account-facing label that can resolve to that identity: canonical
names, import aliases, and historical names.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass


@dataclass(slots=True)
class Account:
    id: int
    name: str
    institution: str | None
    account_type: str = "other"
    currency_code: str = "USD"
    lifecycle_status: str = "unknown"
    include_in_net_worth: bool = True


class AccountResolver:
    """Resolves raw account-name strings to ``finance_accounts.id``.

    Never guesses: an unrecognized name resolves to ``None`` so the caller
    can surface it explicitly (unmapped-account report) rather than silently
    dropping or misassigning the row.
    """

    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn
        self._by_name: dict[str, int] = {}
        self._by_alias: dict[str, int] = {}
        self._load()

    def _load(self) -> None:
        self._by_name = {
            name.strip().lower(): account_id
            for account_id, name in self._conn.execute(
                "SELECT id, name FROM finance_accounts"
            ).fetchall()
        }
        self._by_alias = {}
        conflicts = self._conn.execute(
            """
            SELECT lower(trim(label)) AS label_key, COUNT(DISTINCT account_id)
            FROM finance_account_labels
            WHERE resolves_to_account = 1
            GROUP BY label_key
            HAVING COUNT(DISTINCT account_id) > 1
            """
        ).fetchall()
        if conflicts:
            labels = ", ".join(row[0] for row in conflicts[:5])
            raise ValueError(f"Ambiguous finance account labels: {labels}")

        self._by_alias = {
            label.strip().lower(): account_id
            for label, account_id in self._conn.execute(
                """
                SELECT label, account_id
                FROM finance_account_labels
                WHERE resolves_to_account = 1
                """
            ).fetchall()
        }

    def resolve(self, raw_name: str) -> int | None:
        if not raw_name:
            return None
        key = raw_name.strip().lower()
        if not key:
            return None
        if key in self._by_name:
            return self._by_name[key]
        if key in self._by_alias:
            return self._by_alias[key]
        return None

    def list_accounts(self) -> list[Account]:
        rows = self._conn.execute(
            """
            SELECT id, name, institution, account_type, currency_code,
                   lifecycle_status, include_in_net_worth
            FROM finance_accounts
            ORDER BY name
            """
        ).fetchall()
        return [
            Account(
                id=row[0],
                name=row[1],
                institution=row[2],
                account_type=row[3],
                currency_code=row[4],
                lifecycle_status=row[5],
                include_in_net_worth=bool(row[6]),
            )
            for row in rows
        ]

    def add_account(self, name: str, institution: str = "", *, is_active: bool = True) -> int:
        cursor = self._conn.execute(
            """
            INSERT INTO finance_accounts
              (name, institution, lifecycle_status, include_in_net_worth)
            VALUES (?, ?, ?, ?)
            """,
            (
                name,
                institution,
                "open" if is_active else "historical",
                int(is_active),
            ),
        )
        self._conn.commit()
        assert cursor.lastrowid is not None
        account_id = cursor.lastrowid
        self._by_name[name.strip().lower()] = account_id
        return account_id

    def add_alias(self, alias: str, account_name: str) -> None:
        account_id = self._by_name.get(account_name.strip().lower())
        if account_id is None:
            raise ValueError(f"No finance_accounts row named {account_name!r}")
        self._conn.execute(
            """
            INSERT INTO finance_account_labels
              (account_id, label, label_kind, source, confidence, is_generic,
               resolves_to_account)
            VALUES (?, ?, 'alias', 'manual', 1.0, 0, 1)
            ON CONFLICT DO UPDATE SET
              account_id = excluded.account_id,
              label_kind = excluded.label_kind,
              source = excluded.source,
              confidence = excluded.confidence,
              is_generic = excluded.is_generic,
              resolves_to_account = excluded.resolves_to_account
            """,
            (account_id, alias),
        )
        self._conn.commit()
        self._by_alias[alias.strip().lower()] = account_id
