import sqlite3
from decimal import Decimal
from pathlib import Path

from warehouse.finance.ledger_audit import (
    audit_transfers,
    find_exact_duplicates,
    find_near_duplicate_pairs,
    run_ledger_audit,
    write_ledger_audit_outputs,
)


def _add_account(
    conn: sqlite3.Connection,
    name: str,
    *,
    lifecycle_status: str = "open",
    include_in_net_worth: int = 1,
) -> int:
    row = conn.execute(
        """
        INSERT INTO finance_accounts
          (name, institution, lifecycle_status, include_in_net_worth)
        VALUES (?, 'Test Bank', ?, ?)
        RETURNING id
        """,
        (name, lifecycle_status, include_in_net_worth),
    ).fetchone()
    return int(row[0])


def _add_txn(
    conn: sqlite3.Connection,
    *,
    account_id: int,
    date: str,
    name: str,
    amount: str,
    seq: int,
    kind: str = "regular",
    note: str = "",
) -> int:
    fingerprint = f"test-ledger-audit|{seq}"
    conn.execute(
        """
        INSERT INTO finance_transactions
          (
            posted_on, name, amount_cents, account_id, category_id, excluded,
            transaction_kind, note, source_fingerprint
          )
        VALUES (?, ?, ?, ?, 1, 0, ?, ?, ?)
        RETURNING id
        """,
        (
            date,
            name,
            int(Decimal(amount) * 100),
            account_id,
            kind,
            note,
            fingerprint,
        ),
    )
    row = conn.execute(
        "SELECT id FROM finance_transactions WHERE source_fingerprint = ?",
        (fingerprint,),
    ).fetchone()
    assert row is not None
    return int(row[0])


def test_duplicate_audit_finds_exact_and_near_duplicates(scratch_db: str) -> None:
    conn = sqlite3.connect(scratch_db)
    account_id = 1
    _add_txn(conn, account_id=account_id, date="2024-01-01", name="Currys", amount="65.37", seq=1)
    _add_txn(conn, account_id=account_id, date="2024-01-01", name="Currys", amount="65.37", seq=2)
    _add_txn(
        conn,
        account_id=account_id,
        date="2024-01-04",
        name="Currys London",
        amount="65.37",
        seq=3,
    )
    _add_txn(conn, account_id=account_id, date="2024-01-10", name="Currys", amount="65.37", seq=4)
    conn.commit()

    exact = find_exact_duplicates(conn)
    near = find_near_duplicate_pairs(conn, window_days=10, max_occurrences=4)

    assert len(exact) == 1
    assert exact[0].normalized_name == "currys"
    assert all(pair.day_gap <= 5 for pair in near)
    assert not any({pair.id_1, pair.id_2} == {1, 3} for pair in near)


def test_transfer_audit_classifies_match_ambiguity_artifact_and_missing(
    scratch_db: str,
) -> None:
    conn = sqlite3.connect(scratch_db)
    checking_id = 1
    savings_id = _add_account(conn, "Savings")
    card_id = _add_account(conn, "Credit Card")
    closed_id = _add_account(conn, "Closed Account", lifecycle_status="closed")

    matched_id = _add_txn(
        conn,
        account_id=checking_id,
        date="2024-01-01",
        name="Transfer To Savings",
        amount="100.00",
        seq=1,
        kind="internal_transfer",
    )
    _add_txn(
        conn,
        account_id=savings_id,
        date="2024-01-02",
        name="Transfer From Checking",
        amount="-100.00",
        seq=2,
        kind="internal_transfer",
    )
    ambiguous_id = _add_txn(
        conn,
        account_id=checking_id,
        date="2024-02-01",
        name="Payment",
        amount="75.00",
        seq=3,
        kind="internal_transfer",
    )
    _add_txn(
        conn,
        account_id=savings_id,
        date="2024-02-02",
        name="Payment",
        amount="-75.00",
        seq=4,
        kind="internal_transfer",
    )
    _add_txn(
        conn,
        account_id=card_id,
        date="2024-02-03",
        name="Payment",
        amount="-75.00",
        seq=5,
        kind="internal_transfer",
    )
    same_account_id = _add_txn(
        conn,
        account_id=checking_id,
        date="2024-03-01",
        name="Adj Redist Purchase Bal",
        amount="-25.00",
        seq=6,
        kind="internal_transfer",
    )
    _add_txn(
        conn,
        account_id=checking_id,
        date="2024-03-01",
        name="Dr Adj Redist Cadv Prin",
        amount="25.00",
        seq=7,
        kind="internal_transfer",
    )
    missing_id = _add_txn(
        conn,
        account_id=checking_id,
        date="2024-04-01",
        name="Lonely Transfer",
        amount="33.00",
        seq=8,
        kind="internal_transfer",
    )
    manual_id = _add_txn(
        conn,
        account_id=checking_id,
        date="2024-05-01",
        name="Manual Reconciliation Transfer",
        amount="44.00",
        seq=9,
        kind="internal_transfer",
        note="manual reconciliation",
    )
    closed_id_txn = _add_txn(
        conn,
        account_id=closed_id,
        date="2024-06-01",
        name="Closure Transfer",
        amount="55.00",
        seq=10,
        kind="internal_transfer",
    )
    conn.commit()

    rows = {row.transaction_id: row for row in audit_transfers(conn)}

    assert rows[matched_id].classification == "matched_pair"
    assert rows[ambiguous_id].classification == "ambiguous_multiple_matches"
    assert rows[same_account_id].classification == "same_account_artifact"
    assert rows[missing_id].classification == "missing_counterpart"
    assert rows[manual_id].classification == "external_or_manual_transfer_candidate"
    assert rows[closed_id_txn].classification == "missing_counterpart"
    assert rows[closed_id_txn].closure_adjacent is True


def test_transfer_audit_prefers_same_account_artifact_over_missing_counterpart(
    scratch_db: str,
) -> None:
    conn = sqlite3.connect(scratch_db)
    savings_id = _add_account(conn, "Savings Account")

    original_id = _add_txn(
        conn,
        account_id=savings_id,
        date="2024-01-01",
        name="Transfer To Test Account",
        amount="120.00",
        seq=1,
        kind="internal_transfer",
    )
    _add_txn(
        conn,
        account_id=savings_id,
        date="2024-01-03",
        name="ACH Credit Returned",
        amount="-120.00",
        seq=2,
        kind="internal_transfer",
    )
    conn.commit()

    rows = {row.transaction_id: row for row in audit_transfers(conn)}

    assert rows[original_id].classification == "same_account_artifact"


def test_ledger_audit_writes_reviewable_outputs(scratch_db: str, tmp_path: Path) -> None:
    conn = sqlite3.connect(scratch_db)
    card_id = _add_account(conn, "Credit Card")
    _add_txn(conn, account_id=1, date="2024-01-01", name="Apple", amount="10.00", seq=1)
    _add_txn(conn, account_id=1, date="2024-01-01", name="Apple", amount="10.00", seq=2)
    _add_txn(
        conn,
        account_id=1,
        date="2024-02-01",
        name="Bank Transfer",
        amount="88.00",
        seq=3,
        kind="internal_transfer",
    )
    _add_txn(
        conn,
        account_id=card_id,
        date="2024-02-20",
        name="Bank Transfer Payment",
        amount="-88.00",
        seq=4,
        kind="internal_transfer",
    )
    conn.commit()

    report = run_ledger_audit(conn)
    paths = write_ledger_audit_outputs(report, tmp_path)

    assert paths["markdown"].exists()
    assert paths["summary"].exists()
    assert paths["exact_duplicates"].exists()
    assert "exact_duplicate_groups" in paths["summary"].read_text()
    assert "## Transfer Review" in paths["markdown"].read_text()


def test_ledger_audit_can_write_markdown_only(scratch_db: str, tmp_path: Path) -> None:
    conn = sqlite3.connect(scratch_db)
    _add_txn(conn, account_id=1, date="2024-01-01", name="Apple", amount="10.00", seq=1)
    conn.commit()

    report = run_ledger_audit(conn)
    paths = write_ledger_audit_outputs(report, tmp_path, include_csv=False)

    assert set(paths) == {"markdown"}
    assert paths["markdown"].exists()
    assert not list(tmp_path.glob("*.csv"))
    assert "finance_ledger_audit_summary.csv" not in paths["markdown"].read_text()
