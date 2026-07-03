import sqlite3
from decimal import Decimal

from warehouse.finance.reconciliation import (
    add_reconciliation,
    check_reconciliations,
    list_reconciliations,
)


def test_add_and_list_reconciliation(scratch_db: str) -> None:
    conn = sqlite3.connect(scratch_db)
    add_reconciliation(
        conn, account_id=1, as_of_date="2026-06-30", balance=Decimal("-2509.00"), source="dashboard"
    )
    recons = list_reconciliations(conn)
    assert len(recons) == 1
    assert recons[0].account_id == 1
    assert recons[0].balance == Decimal("-2509.00")
    assert recons[0].source == "dashboard"
    conn.close()


def test_add_upserts_on_same_account_and_date(scratch_db: str) -> None:
    conn = sqlite3.connect(scratch_db)
    add_reconciliation(conn, account_id=1, as_of_date="2026-06-30", balance=Decimal("100.00"))
    add_reconciliation(conn, account_id=1, as_of_date="2026-06-30", balance=Decimal("200.00"))
    recons = list_reconciliations(conn)
    assert len(recons) == 1
    assert recons[0].balance == Decimal("200.00")
    conn.close()


def test_check_reconciliations_reports_variance(scratch_db: str) -> None:
    conn = sqlite3.connect(scratch_db)
    # a 30.00 expense on an account with no opening balance -> computed balance -30.00
    conn.execute(
        """
        INSERT INTO finance_transactions
          (posted_on, name, amount_cents, account_id, category_id, excluded, source_fingerprint)
        VALUES ('2026-01-01', 'txn', 3000, 1, 1, 0, 'test-reconciliation|1')
        """
    )
    conn.commit()

    add_reconciliation(conn, account_id=1, as_of_date="2026-06-30", balance=Decimal("-30.00"))
    checks = check_reconciliations(conn)
    assert len(checks) == 1
    assert checks[0].computed_balance == Decimal("-30")
    assert checks[0].variance == Decimal("0")

    conn.close()


def test_check_reconciliations_surfaces_nonzero_variance(scratch_db: str) -> None:
    conn = sqlite3.connect(scratch_db)
    conn.execute(
        """
        INSERT INTO finance_transactions
          (posted_on, name, amount_cents, account_id, category_id, excluded, source_fingerprint)
        VALUES ('2026-01-01', 'txn', 3000, 1, 1, 0, 'test-reconciliation|2')
        """
    )
    conn.commit()

    # claim the real balance is -50.00, but the ledger computes to -30.00
    add_reconciliation(conn, account_id=1, as_of_date="2026-06-30", balance=Decimal("-50.00"))
    checks = check_reconciliations(conn)
    assert checks[0].variance == Decimal("20")
    conn.close()
