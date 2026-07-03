import sqlite3

from warehouse.finance.doctor import run_doctor


def test_doctor_surfaces_uncategorized_rows(scratch_db: str) -> None:
    conn = sqlite3.connect(scratch_db)
    uncategorized_id = conn.execute(
        "SELECT id FROM finance_categories WHERE name = 'Uncategorized'"
    ).fetchone()[0]
    conn.execute(
        """
        INSERT INTO finance_transactions
          (posted_on, name, amount_cents, account_id, category_id,
           category_assignment_source, excluded, source_fingerprint)
        VALUES ('2026-01-01', 'txn', 1000, 1, ?, 'unmapped', 0, 'test-doctor|1')
        """,
        (uncategorized_id,),
    )
    conn.commit()

    findings = run_doctor(conn)
    by_check = {finding.check: finding for finding in findings}

    assert by_check["uncategorized_transactions"].count == 1

    conn.close()


def test_doctor_detects_stale_open_accounts(scratch_db: str) -> None:
    conn = sqlite3.connect(scratch_db)
    conn.execute(
        """
        INSERT INTO finance_transactions
          (posted_on, name, amount_cents, account_id, category_id,
           excluded, source_fingerprint)
        VALUES ('2025-07-01', 'old txn', 1000, 1, 1, 0, 'test-doctor|2')
        """
    )
    conn.commit()

    findings = run_doctor(conn, stale_days=30)
    by_check = {finding.check: finding for finding in findings}

    assert by_check["stale_open_accounts"].count == 1

    conn.close()
