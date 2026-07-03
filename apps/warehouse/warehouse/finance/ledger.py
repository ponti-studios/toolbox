"""Bank-style finance ledger helpers."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import date as date_type
from decimal import Decimal

from .strict import cents_to_decimal, money_to_cents, table_exists


@dataclass(slots=True)
class StatementPeriod:
    id: int
    account_id: int
    account_name: str
    period_start_on: date_type
    period_end_on: date_type
    opening_balance: Decimal
    closing_balance: Decimal
    certification_status: str
    source: str
    note: str | None


@dataclass(slots=True)
class StatementPeriodCheck:
    period: StatementPeriod
    posted_delta: Decimal
    computed_closing_balance: Decimal
    variance: Decimal


def ledger_table_exists(conn: sqlite3.Connection) -> bool:
    return table_exists(conn, "finance_account_ledger_entries")


def ledger_balance_cents(
    conn: sqlite3.Connection, account_id: int, as_of: date_type | None = None
) -> int:
    params: list[object] = [account_id]
    date_filter = ""
    if as_of is not None:
        date_filter = " AND posted_on <= ?"
        params.append(as_of.isoformat())
    row = conn.execute(
        f"""
        SELECT COALESCE(SUM(balance_delta_cents), 0)
        FROM finance_account_ledger_entries
        WHERE account_id = ?
          AND posting_status = 'posted'
          {date_filter}
        """,
        params,
    ).fetchone()
    return int(row[0] or 0)


def add_statement_period(
    conn: sqlite3.Connection,
    *,
    account_id: int,
    period_start_on: str,
    period_end_on: str,
    opening_balance: Decimal,
    closing_balance: Decimal,
    source: str = "manual",
    note: str | None = None,
    certification_status: str = "uncertified",
) -> int:
    conn.execute(
        """
        INSERT INTO finance_account_statement_periods
          (
            account_id, period_start_on, period_end_on, opening_balance_cents,
            closing_balance_cents, currency_code, source, note, certification_status
          )
        VALUES (?, ?, ?, ?, ?, 'USD', ?, ?, ?)
        ON CONFLICT(account_id, period_start_on, period_end_on) DO UPDATE SET
          opening_balance_cents = excluded.opening_balance_cents,
          closing_balance_cents = excluded.closing_balance_cents,
          currency_code = excluded.currency_code,
          source = excluded.source,
          note = excluded.note,
          certification_status = excluded.certification_status
        """,
        (
            account_id,
            period_start_on,
            period_end_on,
            money_to_cents(opening_balance),
            money_to_cents(closing_balance),
            source,
            note,
            certification_status,
        ),
    )
    conn.commit()
    row = conn.execute(
        """
        SELECT id
        FROM finance_account_statement_periods
        WHERE account_id = ? AND period_start_on = ? AND period_end_on = ?
        """,
        (account_id, period_start_on, period_end_on),
    ).fetchone()
    assert row is not None
    return int(row[0])


def list_statement_periods(
    conn: sqlite3.Connection, account_id: int | None = None
) -> list[StatementPeriod]:
    query = """
        SELECT
          p.id, p.account_id, a.name, p.period_start_on, p.period_end_on,
          p.opening_balance_cents, p.closing_balance_cents,
          p.certification_status, p.source, p.note
        FROM finance_account_statement_periods p
        JOIN finance_accounts a ON a.id = p.account_id
    """
    params: list[object] = []
    if account_id is not None:
        query += " WHERE p.account_id = ?"
        params.append(account_id)
    query += " ORDER BY a.name, p.period_start_on, p.period_end_on"
    return [
        StatementPeriod(
            id=row[0],
            account_id=row[1],
            account_name=row[2],
            period_start_on=date_type.fromisoformat(row[3]),
            period_end_on=date_type.fromisoformat(row[4]),
            opening_balance=cents_to_decimal(row[5]),
            closing_balance=cents_to_decimal(row[6]),
            certification_status=row[7],
            source=row[8],
            note=row[9],
        )
        for row in conn.execute(query, params).fetchall()
    ]


def check_statement_periods(
    conn: sqlite3.Connection, account_id: int | None = None
) -> list[StatementPeriodCheck]:
    checks: list[StatementPeriodCheck] = []
    for period in list_statement_periods(conn, account_id):
        row = conn.execute(
            """
            SELECT COALESCE(SUM(balance_delta_cents), 0)
            FROM finance_account_ledger_entries
            WHERE account_id = ?
              AND posting_status = 'posted'
              AND posted_on >= ?
              AND posted_on <= ?
            """,
            (
                period.account_id,
                period.period_start_on.isoformat(),
                period.period_end_on.isoformat(),
            ),
        ).fetchone()
        posted_delta = cents_to_decimal(row[0])
        computed = period.opening_balance + posted_delta
        checks.append(
            StatementPeriodCheck(
                period=period,
                posted_delta=posted_delta,
                computed_closing_balance=computed,
                variance=computed - period.closing_balance,
            )
        )
    return checks
