import sqlite3
from pathlib import Path

from warehouse.finance.pipeline import import_file

_COLUMN_MAP = {
    "date": "date",
    "name": "name",
    "amount": "amount",
    "status": "status",
    "category": "category",
    "parent_category": "parent category",
    "excluded": "excluded",
    "tags": "tags",
    "type": "type",
    "account": "account",
    "account_mask": "account mask",
    "note": "note",
    "recurring": "recurring",
}


def test_import_reports_reads_validates_rejects_and_unmapped(
    scratch_db: str, generic_fixture_path: Path
) -> None:
    report = import_file(
        scratch_db, str(generic_fixture_path),
        connector_name="generic", column_map=_COLUMN_MAP,
    )

    assert report.connector == "generic"
    assert report.rows_read == 5
    assert report.rows_rejected == 2
    assert report.rows_validated == 3
    assert report.unmapped_accounts == {"Some Unknown Bank": 1}
    assert report.rows_merged == 3
    assert report.rows_duplicate == 0


def test_import_is_idempotent_on_rerun(
    scratch_db: str, generic_fixture_path: Path
) -> None:
    first = import_file(
        scratch_db, str(generic_fixture_path),
        connector_name="generic", column_map=_COLUMN_MAP,
    )
    assert first.rows_merged == 3

    second = import_file(
        scratch_db, str(generic_fixture_path),
        connector_name="generic", column_map=_COLUMN_MAP,
    )
    assert second.rows_merged == 0
    assert second.rows_duplicate == 3

    conn = sqlite3.connect(scratch_db)
    total = conn.execute("SELECT COUNT(*) FROM finance_transactions").fetchone()[0]
    conn.close()
    assert total == 3


def test_legitimate_repeated_transactions_are_not_collapsed(
    scratch_db: str, generic_fixture_path: Path
) -> None:
    import_file(
        scratch_db, str(generic_fixture_path),
        connector_name="generic", column_map=_COLUMN_MAP,
    )

    conn = sqlite3.connect(scratch_db)
    starbucks_count = conn.execute(
        "SELECT COUNT(*) FROM finance_transactions WHERE name = 'Starbucks'"
    ).fetchone()[0]
    conn.close()
    assert starbucks_count == 2


def test_unmapped_account_row_does_not_merge_to_strict_ledger(
    scratch_db: str, generic_fixture_path: Path
) -> None:
    import_file(
        scratch_db, str(generic_fixture_path),
        connector_name="generic", column_map=_COLUMN_MAP,
    )

    conn = sqlite3.connect(scratch_db)
    row = conn.execute(
        "SELECT COUNT(*) FROM finance_transactions WHERE name = 'Weird Bank Deposit'"
    ).fetchone()
    conn.close()
    assert row[0] == 0


def test_since_filters_out_rows_before_the_cutoff(
    scratch_db: str, generic_fixture_path: Path
) -> None:
    report = import_file(
        scratch_db, str(generic_fixture_path),
        connector_name="generic", column_map=_COLUMN_MAP, since="2024-01-07",
    )

    assert report.rows_read == 5
    assert report.rows_rejected == 2
    assert report.rows_validated == 0
    assert report.rows_merged == 0

    conn = sqlite3.connect(scratch_db)
    names = {
        row[0] for row in conn.execute("SELECT name FROM finance_transactions").fetchall()
    }
    conn.close()
    assert names == set()


def test_dry_run_writes_nothing(
    scratch_db: str, generic_fixture_path: Path
) -> None:
    report = import_file(
        scratch_db, str(generic_fixture_path),
        connector_name="generic", column_map=_COLUMN_MAP, dry_run=True,
    )
    assert report.rows_merged == 3
    assert report.batch_id is None

    conn = sqlite3.connect(scratch_db)
    total = conn.execute("SELECT COUNT(*) FROM finance_transactions").fetchone()[0]
    conn.close()
    assert total == 0


def test_import_writes_strict_columns(
    scratch_db: str, generic_fixture_path: Path
) -> None:
    import_file(
        scratch_db, str(generic_fixture_path),
        connector_name="generic", column_map=_COLUMN_MAP,
    )

    conn = sqlite3.connect(scratch_db)
    row = conn.execute(
        """
        SELECT posted_on, amount_cents, currency_code, status_key,
               transaction_kind, category_assignment_source
        FROM finance_transactions
        WHERE name = 'Tesco'
        """
    ).fetchone()
    conn.close()

    assert row[0:6] == ("2024-01-05", 1234, "USD", "posted", "regular", "source")
    assert row[5] == "source"


def test_import_writes_no_legacy_transaction_columns(
    scratch_db: str, generic_fixture_path: Path
) -> None:
    import_file(
        scratch_db, str(generic_fixture_path),
        connector_name="generic", column_map=_COLUMN_MAP,
    )

    conn = sqlite3.connect(scratch_db)
    columns = {
        row[1] for row in conn.execute("PRAGMA table_info(finance_transactions)").fetchall()
    }
    conn.close()

    assert not {
        "date",
        "amount",
        "status",
        "category",
        "parent_category",
        "tags",
        "type",
        "account",
        "dedupe_key",
    } & columns
