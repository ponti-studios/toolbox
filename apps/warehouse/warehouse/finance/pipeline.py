"""Idempotent finance ingestion pipeline: parse -> validate -> merge.

Two auditable stages, run in one pass:

1. Validate -- raw dict -> TransactionRecord via the connector; failures are
   collected as explicit rejects, never silently dropped.
2. Merge -- multiset-reconciled idempotent upsert into the account ledger
   using import identity (see ``TransactionRecord.import_key`` for why this
   isn't a plain UNIQUE + INSERT-OR-IGNORE).
"""

from __future__ import annotations

import sqlite3
from collections import Counter
from datetime import date as date_type
from pathlib import Path

from .accounts import AccountResolver
from .categories import CategoryResolver
from .connectors import Connector, build_connector, detect_connector
from .models import ImportReport, RejectedRow, TransactionRecord


def _resolve_connector(
    path: Path,
    resolver: AccountResolver,
    category_resolver: CategoryResolver,
    *,
    connector_name: str | None,
    column_map: dict[str, str] | None,
) -> Connector:
    if connector_name:
        return build_connector(
            connector_name, resolver, category_resolver, column_map=column_map
        )
    detected = detect_connector(path, resolver, category_resolver)
    if detected is None:
        raise ValueError(
            f"Could not auto-detect a connector for {path}. "
            "Pass --connector explicitly (copilot|generic)."
        )
    return detected


def _existing_counts(conn: sqlite3.Connection, keys: set[str]) -> Counter:
    if not keys:
        return Counter()
    counts: Counter = Counter()
    key_list = list(keys)
    # SQLite bound-parameter limit is 999 -- batch in chunks.
    for start in range(0, len(key_list), 500):
        chunk = key_list[start : start + 500]
        placeholders = ",".join("?" for _ in chunk)
        rows = conn.execute(
            f"""
            SELECT source_fingerprint AS import_key, COUNT(*)
            FROM finance_account_ledger_entries
            WHERE source_fingerprint IN ({placeholders})
            GROUP BY import_key
            """,
            chunk,
        ).fetchall()
        for key, count in rows:
            counts[key] = count
    return counts


def _uncategorized_id(conn: sqlite3.Connection) -> int | None:
    row = conn.execute(
        "SELECT id FROM finance_categories WHERE name = 'Uncategorized' AND parent_id IS NULL"
    ).fetchone()
    return int(row[0]) if row else None


def _row_scoped_fingerprint(record: TransactionRecord, row_index: int) -> str:
    return f"{record.import_key}|row:{row_index}"


def _merge(
    conn: sqlite3.Connection,
    records: list[tuple[TransactionRecord, int | None]],
) -> tuple[int, int]:
    """Multiset-reconcile incoming records against existing rows by import key.

    For each key, only the excess over what's already stored is inserted --
    this is what makes re-running the same import a no-op while still
    allowing legitimate repeated transactions (same date/name/amount/account)
    to coexist.
    """

    incoming_by_key: dict[str, list[tuple[TransactionRecord, int | None]]] = {}
    for record, row_index in records:
        incoming_by_key.setdefault(record.import_key, []).append((record, row_index))

    existing = _existing_counts(conn, set(incoming_by_key))
    uncategorized_id = _uncategorized_id(conn)

    merged = 0
    duplicate = 0
    for key, group in incoming_by_key.items():
        already = existing.get(key, 0)
        to_insert = max(0, len(group) - already)
        duplicate += len(group) - to_insert
        for record, _row_index in group[:to_insert]:
            category_id = record.category_id if record.category_id is not None else uncategorized_id
            cursor = conn.execute(
                """
                INSERT INTO finance_account_ledger_entries
                  (
                    account_id, posted_on, description, balance_delta_cents,
                    currency_code, posting_status, ledger_entry_kind,
                    account_mask, note, source_fingerprint
                  )
                VALUES (?, ?, ?, ?, 'USD', ?, ?, ?, ?, ?)
                """,
                (
                    record.account_id,
                    record.date.isoformat(),
                    record.name,
                    -record.amount_cents,
                    record.status_key,
                    record.transaction_kind,
                    record.account_mask,
                    record.note,
                    record.source_fingerprint,
                ),
            )
            if cursor.lastrowid is not None:
                conn.execute(
                    """
                    INSERT INTO finance_ledger_entry_annotations
                      (
                        ledger_entry_id, category_id, category_assignment_source,
                        excluded, recurring
                      )
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        cursor.lastrowid,
                        category_id,
                        "source" if record.category_id is not None else "unmapped",
                        1 if record.excluded else 0,
                        1 if record.recurring else 0,
                    ),
                )
            merged += 1
    return merged, duplicate


def import_file(
    db_path: str,
    csv_path: str,
    *,
    connector_name: str | None = None,
    column_map: dict[str, str] | None = None,
    dry_run: bool = False,
    since: str | None = None,
) -> ImportReport:
    """Run the full land -> validate -> merge pipeline for one source file.

    ``since`` (ISO date string, inclusive) restricts which validated records
    get merged -- all raw rows still land for provenance, but only rows on
    or after this date count toward validated/merged/rejected/unmapped and
    actually get inserted. Use this for source files (like a full Copilot
    CSV export) that mix a large unattributed historical bulk with a small
    recent, properly account-tagged tail: re-merging the whole file risks
    inserting duplicates for the unattributed rows, since their import key
    can differ from already-reconciled DB rows when historical provenance is
    missing.
    """

    path = Path(csv_path)
    if not path.is_file():
        raise FileNotFoundError(f"File not found: {path}")

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        resolver = AccountResolver(conn)
        category_resolver = CategoryResolver(conn)
        connector = _resolve_connector(
            path,
            resolver,
            category_resolver,
            connector_name=connector_name,
            column_map=column_map,
        )

        report = ImportReport(connector=connector.name, source_file=str(path))

        raw_rows = list(connector.parse(path))
        report.rows_read = len(raw_rows)

        report.batch_id = None
        report.rows_landed = 0

        since_date = date_type.fromisoformat(since) if since else None

        records: list[tuple[TransactionRecord, int | None]] = []
        for index, raw in enumerate(raw_rows):
            try:
                record = connector.to_record(raw, source_file=str(path))
            except Exception as exc:  # noqa: BLE001 -- surfaced as an explicit reject, not swallowed
                report.rejects.append(RejectedRow(row_index=index, raw=raw, reason=str(exc)))
                continue
            record.source_fingerprint = _row_scoped_fingerprint(record, index)
            if since_date is not None and record.date < since_date:
                continue
            if not record.account_id and record.account_raw:
                report.unmapped_accounts[record.account_raw] = (
                    report.unmapped_accounts.get(record.account_raw, 0) + 1
                )
                report.rejects.append(
                    RejectedRow(
                        row_index=index,
                        raw=raw,
                        reason=(
                            f"unmapped account {record.account_raw!r}; raw row landed "
                            "but strict ledger merge requires finance_accounts mapping"
                        ),
                    )
                )
                continue
            if not record.category_id and record.category:
                report.unmapped_categories[record.category] = (
                    report.unmapped_categories.get(record.category, 0) + 1
                )
            records.append((record, index))

        report.rows_validated = len(records)
        report.rows_rejected = len(report.rejects)

        if dry_run:
            existing = _existing_counts(conn, {r.import_key for r, _ in records})
            counts_by_key: dict[str, int] = {}
            for record, _ in records:
                counts_by_key[record.import_key] = counts_by_key.get(record.import_key, 0) + 1
            merged = 0
            duplicate = 0
            for key, count in counts_by_key.items():
                already = existing.get(key, 0)
                new_count = max(0, count - already)
                merged += new_count
                duplicate += count - new_count
            report.rows_merged = merged
            report.rows_duplicate = duplicate
        else:
            merged, duplicate = _merge(conn, records)
            conn.commit()
            report.rows_merged = merged
            report.rows_duplicate = duplicate

        return report
    finally:
        conn.close()


def audit_batch(db_path: str, batch_id: int) -> str:
    """Legacy helper kept for CLI compatibility after provenance cleanup."""

    return (
        "Import batch auditing is no longer available. "
        "The ledger no longer stores batch/raw-row provenance tables."
    )
