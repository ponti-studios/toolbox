import sqlite3
from datetime import date
from decimal import Decimal

from warehouse.finance.networth import compute_balances


def _insert_txn(
    conn: sqlite3.Connection, *, txn_date: str, amount: str, excluded: int = 0
) -> None:
    seq = conn.execute("SELECT COUNT(*) FROM finance_transactions").fetchone()[0] + 1
    conn.execute(
        """
        INSERT INTO finance_transactions
          (posted_on, name, amount_cents, account_id, category_id, excluded, source_fingerprint)
        VALUES (?, 'txn', ?, 1, 1, ?, ?)
        """,
        (txn_date, int(Decimal(amount) * 100), excluded, f"test-networth|{seq}"),
    )


def test_balance_matches_signed_transactions(scratch_db: str) -> None:
    conn = sqlite3.connect(scratch_db)
    _insert_txn(conn, txn_date="2024-01-01", amount="30.00")  # expense: balance -30
    _insert_txn(conn, txn_date="2024-02-01", amount="-50.00")  # income: balance +50
    conn.commit()

    balances = compute_balances(conn, as_of=date(2024, 3, 1))
    assert len(balances) == 1
    # -(30.00 + -50.00) = -(-20) = 20
    assert balances[0].balance == 20

    conn.close()


def test_balance_excludes_transactions_after_as_of(scratch_db: str) -> None:
    conn = sqlite3.connect(scratch_db)
    _insert_txn(conn, txn_date="2024-01-01", amount="30.00")
    _insert_txn(conn, txn_date="2024-04-01", amount="1000.00")
    conn.commit()

    balances = compute_balances(conn, as_of=date(2024, 2, 1))
    assert balances[0].balance == -30  # the April txn is excluded

    conn.close()


def test_excluded_transactions_still_count_toward_balance(scratch_db: str) -> None:
    """excluded=1 means 'hide from spend budget', not 'never happened' --
    credit-card autopay rows are marked excluded but must still offset the
    balance, or every payment vanishes while every purchase stays."""

    conn = sqlite3.connect(scratch_db)
    _insert_txn(conn, txn_date="2024-01-01", amount="200.00")  # purchase
    _insert_txn(conn, txn_date="2024-01-15", amount="-150.00", excluded=1)  # autopay payment
    conn.commit()

    balances = compute_balances(conn, as_of=date(2024, 2, 1))
    # -(200.00 + -150.00) = -50
    assert balances[0].balance == -50

    conn.close()


def test_irrelevant_side_tables_do_not_override_ledger_balance(scratch_db: str) -> None:
    conn = sqlite3.connect(scratch_db)
    conn.execute(
        """
        INSERT INTO finance_accounts
          (name, institution, account_type, include_in_net_worth)
        VALUES ('Test Rollover IRA', 'Test Brokerage', 'retirement', 1)
        """
    )
    account_id = conn.execute(
        "SELECT id FROM finance_accounts WHERE name = 'Test Rollover IRA'"
    ).fetchone()[0]
    conn.execute(
        """
        INSERT INTO finance_transactions
          (posted_on, name, amount_cents, account_id, category_id, excluded, source_fingerprint)
        VALUES ('2024-01-01', 'rollover', -10000, ?, 1, 0, 'test-networth|market')
        """,
        (account_id,),
    )
    conn.commit()

    balances = compute_balances(conn, as_of=date(2026, 7, 2))
    ira = next(b for b in balances if b.account_name == "Test Rollover IRA")
    assert ira.balance == Decimal("100.00")

    conn.close()
