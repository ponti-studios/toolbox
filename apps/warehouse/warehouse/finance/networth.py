"""Net worth / account balance computation from the bank-style finance ledger."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import date as date_type
from datetime import timedelta
from decimal import Decimal

from .ledger import ledger_balance_cents
from .strict import cents_to_decimal


@dataclass(slots=True)
class AccountBalance:
    account_id: int
    account_name: str
    balance: Decimal


def compute_balances(
    conn: sqlite3.Connection, as_of: date_type | None = None
) -> list[AccountBalance]:
    if as_of is None:
        as_of = date_type.today()

    rows = conn.execute(
        """
        SELECT
          a.id,
          a.name
        FROM finance_accounts a
        WHERE a.include_in_net_worth = 1
        ORDER BY a.name
        """
    ).fetchall()
    return [
        AccountBalance(
            account_id=int(account_id),
            account_name=str(name),
            balance=cents_to_decimal(ledger_balance_cents(conn, int(account_id), as_of)),
        )
        for account_id, name in rows
    ]


def net_worth(conn: sqlite3.Connection, as_of: date_type | None = None) -> Decimal:
    return sum((b.balance for b in compute_balances(conn, as_of)), Decimal("0"))


def net_worth_history(
    conn: sqlite3.Connection, months: int = 12, as_of: date_type | None = None
) -> list[tuple[str, Decimal]]:
    """Trailing monthly net worth as of the last day of each of the last
    ``months`` months (most recent first)."""

    if as_of is None:
        as_of = date_type.today()

    history: list[tuple[str, Decimal]] = []
    year, month = as_of.year, as_of.month
    for _ in range(months):
        last_day = (
            date_type(year, month + 1, 1) - timedelta(days=1)
            if month < 12
            else date_type(year, 12, 31)
        )
        history.append((f"{year:04d}-{month:02d}", net_worth(conn, last_day)))
        month -= 1
        if month == 0:
            month = 12
            year -= 1
    return history
