"""Read-only data-quality checks for the finance ledger schema."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import date as date_type
from datetime import timedelta

from .strict import table_exists


@dataclass(slots=True)
class DoctorFinding:
    severity: str
    check: str
    count: int
    detail: str


def _count(conn: sqlite3.Connection, sql: str, params: tuple[object, ...] = ()) -> int:
    row = conn.execute(sql, params).fetchone()
    return int(row[0] or 0)


def run_doctor(conn: sqlite3.Connection, *, stale_days: int = 365) -> list[DoctorFinding]:
    findings: list[DoctorFinding] = []

    if not table_exists(conn, "finance_account_ledger_entries"):
        findings.append(
            DoctorFinding(
                "error",
                "missing_ledger_table",
                1,
                "finance_account_ledger_entries is missing.",
            )
        )
        return findings

    # ---- Data integrity checks ----

    checks = [
        (
            "error",
            "null_strict_transaction_fields",
            """
            SELECT COUNT(*)
            FROM finance_account_ledger_entries l
            LEFT JOIN finance_ledger_entry_annotations a ON a.ledger_entry_id = l.id
            WHERE l.posted_on IS NULL OR l.balance_delta_cents IS NULL
               OR l.currency_code IS NULL OR l.posting_status IS NULL
               OR l.ledger_entry_kind IS NULL OR l.account_id IS NULL
               OR a.category_id IS NULL OR l.source_fingerprint IS NULL
               OR trim(source_fingerprint) = ''
            """,
            "Strict transaction columns must be populated.",
        ),
        (
            "error",
            "invalid_status_key",
            """
            SELECT COUNT(*)
            FROM finance_account_ledger_entries
            WHERE posting_status NOT IN ('posted', 'pending')
            """,
            "status_key should be posted or pending.",
        ),
        (
            "error",
            "invalid_transaction_kind",
            """
            SELECT COUNT(*)
            FROM finance_account_ledger_entries
            WHERE ledger_entry_kind NOT IN
              ('regular', 'income', 'internal_transfer', 'adjustment')
            """,
            "transaction_kind must be a canonical enum value.",
        ),
        (
            "error",
            "duplicate_source_fingerprint",
            """
            SELECT COUNT(*)
            FROM (
              SELECT source_fingerprint
              FROM finance_account_ledger_entries
              GROUP BY source_fingerprint
              HAVING COUNT(*) > 1
            )
            """,
            "source_fingerprint is the import identity and must be unique.",
        ),
        (
            "error",
            "orphan_account_id",
            """
            SELECT COUNT(*) FROM finance_account_ledger_entries l
            LEFT JOIN finance_accounts a ON a.id = l.account_id
            WHERE l.account_id IS NOT NULL AND a.id IS NULL
            """,
            "Every transaction account_id must reference finance_accounts.",
        ),
        (
            "error",
            "orphan_category_id",
            """
            SELECT COUNT(*)
            FROM finance_ledger_entry_annotations a
            LEFT JOIN finance_categories c ON c.id = a.category_id
            WHERE a.category_id IS NOT NULL AND c.id IS NULL
            """,
            "Every transaction category_id must reference finance_categories.",
        ),
        (
            "warn",
            "uncategorized_transactions",
            """
            SELECT COUNT(*)
            FROM finance_ledger_entry_annotations a
            JOIN finance_categories c ON c.id = a.category_id
            WHERE c.name = 'Uncategorized' AND c.parent_id IS NULL
            """,
            "Rows are explicit Uncategorized and should be classified over time.",
        ),
    ]

    for severity, check, sql, detail in checks:
        count = _count(conn, sql)
        if count:
            findings.append(DoctorFinding(severity, check, count, detail))

    # ---- Account label checks ----

    if table_exists(conn, "finance_account_labels"):
        count = _count(
            conn,
            "SELECT COUNT(*) FROM finance_account_labels WHERE is_generic = 1",
        )
        if count:
            findings.append(
                DoctorFinding(
                    "warn",
                    "generic_account_labels",
                    count,
                    "Generic account labels require care because they can map "
                    "differently by institution or time.",
                )
            )

        count = _count(
            conn,
            """
            SELECT COUNT(*)
            FROM (
              SELECT lower(trim(label)) AS label_key
              FROM finance_account_labels
              WHERE resolves_to_account = 1
              GROUP BY label_key
              HAVING COUNT(DISTINCT account_id) > 1
            )
            """,
        )
        if count:
            findings.append(
                DoctorFinding(
                    "error",
                    "ambiguous_account_labels",
                    count,
                    "A resolvable account label maps to multiple account IDs.",
                )
            )

    # ---- Stale account check ----

    cutoff = (date_type.today() - timedelta(days=stale_days)).isoformat()
    count = _count(
        conn,
        """
        SELECT COUNT(*)
        FROM finance_accounts a
        WHERE a.lifecycle_status = 'open'
          AND COALESCE(
            (
              SELECT MAX(l.posted_on)
              FROM finance_account_ledger_entries l
              WHERE l.account_id = a.id
            ),
            ''
          ) < ?
        """,
        (cutoff,),
    )
    if count:
        findings.append(
            DoctorFinding(
                "warn",
                "stale_open_accounts",
                count,
                f"Open accounts with no transactions since {cutoff}; "
                "review lifecycle_status and include_in_net_worth.",
            )
        )

    severity_order = {"error": 0, "warn": 1, "info": 2}
    findings.sort(key=lambda f: (severity_order.get(f.severity, 9), -f.count, f.check))
    return findings
