"""Helpers for the strict finance schema."""

from __future__ import annotations

import sqlite3
from decimal import ROUND_HALF_UP, Decimal


def money_to_cents(amount: Decimal) -> int:
    """Convert a Decimal dollar amount to integer cents."""

    cents = (amount * Decimal("100")).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return int(cents)


def cents_to_decimal(cents: int | None) -> Decimal:
    """Convert integer cents to a Decimal dollar amount."""

    return Decimal(cents or 0) / Decimal("100")


def has_column(conn: sqlite3.Connection, table: str, column: str) -> bool:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return any(row[1] == column for row in rows)


def table_exists(conn: sqlite3.Connection, table: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?",
        (table,),
    ).fetchone()
    return row is not None


def transaction_date_expr(conn: sqlite3.Connection, alias: str = "t") -> str:
    return f"{alias}.posted_on"


def transaction_amount_expr(conn: sqlite3.Connection, alias: str = "t") -> str:
    return f"({alias}.amount_cents / 100.0)"


def transaction_amount_select(conn: sqlite3.Connection, alias: str = "t") -> str:
    return f"printf('%.2f', {transaction_amount_expr(conn, alias)})"


def import_key_expr(conn: sqlite3.Connection, alias: str | None = "t") -> str:
    prefix = f"{alias}." if alias else ""
    return f"{prefix}source_fingerprint"


def transactions_subquery(alias: str = "t") -> str:
    return f"""
    (
      SELECT
        l.id,
        l.posted_on,
        l.description AS name,
        -l.balance_delta_cents AS amount_cents,
        l.currency_code,
        l.posting_status AS status_key,
        l.ledger_entry_kind AS transaction_kind,
        l.account_id,
        a.category_id,
        a.category_assignment_source,
        a.excluded,
        l.account_mask,
        l.note,
        a.recurring,
        l.source_fingerprint,
        l.created_at,
        l.updated_at
      FROM finance_account_ledger_entries l
      JOIN finance_ledger_entry_annotations a ON a.ledger_entry_id = l.id
    ) {alias}
    """


def reconciliations_subquery(alias: str = "r") -> str:
    return f"""
    (
      SELECT
        id,
        account_id,
        period_end_on AS as_of_date,
        closing_balance_cents AS balance_cents,
        currency_code,
        evidence_path,
        source,
        note,
        created_at
      FROM finance_account_statement_periods
    ) {alias}
    """
