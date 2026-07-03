"""Statement-period certification for the bank-style finance ledger."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import date as date_type
from decimal import Decimal

from .ledger import (
    add_statement_period,
    check_statement_periods,
    list_statement_periods,
)


@dataclass(slots=True)
class Reconciliation:
    id: int
    account_id: int
    account_name: str
    as_of_date: date_type
    balance: Decimal
    source: str
    note: str | None


@dataclass(slots=True)
class ReconciliationCheck:
    reconciliation: Reconciliation
    computed_balance: Decimal
    variance: Decimal


def add_reconciliation(
    conn: sqlite3.Connection,
    *,
    account_id: int,
    as_of_date: str,
    balance: Decimal,
    period_start_on: str = "0001-01-01",
    opening_balance: Decimal = Decimal("0"),
    source: str = "manual",
    note: str | None = None,
    certification_status: str = "uncertified",
) -> int:
    return add_statement_period(
        conn,
        account_id=account_id,
        period_start_on=period_start_on,
        period_end_on=as_of_date,
        opening_balance=opening_balance,
        closing_balance=balance,
        source=source,
        note=note,
        certification_status=certification_status,
    )


def list_reconciliations(
    conn: sqlite3.Connection, account_id: int | None = None
) -> list[Reconciliation]:
    return [
        Reconciliation(
            id=period.id,
            account_id=period.account_id,
            account_name=period.account_name,
            as_of_date=period.period_end_on,
            balance=period.closing_balance,
            source=period.source,
            note=period.note,
        )
        for period in list_statement_periods(conn, account_id)
    ]


def check_reconciliations(
    conn: sqlite3.Connection, account_id: int | None = None
) -> list[ReconciliationCheck]:
    """For each checkpoint, compute the ledger balance as of that date and
    report the variance against the known-real value."""

    checks: list[ReconciliationCheck] = []
    for check in check_statement_periods(conn, account_id):
        checks.append(
            ReconciliationCheck(
                reconciliation=Reconciliation(
                    id=check.period.id,
                    account_id=check.period.account_id,
                    account_name=check.period.account_name,
                    as_of_date=check.period.period_end_on,
                    balance=check.period.closing_balance,
                    source=check.period.source,
                    note=check.period.note,
                ),
                computed_balance=check.computed_closing_balance,
                variance=check.variance,
            )
        )
    return checks
