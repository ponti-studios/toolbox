"""Deterministic certification audit for the bank-grade finance ledger."""

from __future__ import annotations

import csv
import sqlite3
from dataclasses import dataclass
from datetime import date as date_type
from decimal import Decimal
from pathlib import Path
from typing import Iterable

from .doctor import DoctorFinding, run_doctor
from .networth import compute_balances
from .reconciliation import ReconciliationCheck, check_reconciliations
from .strict import (
    table_exists,
    transaction_amount_select,
    transaction_date_expr,
    transactions_subquery,
)

TRANSFER_CLASSIFICATIONS = {
    "matched_pair",
    "ambiguous_multiple_matches",
    "missing_counterpart",
    "same_account_artifact",
    "external_or_manual_transfer_candidate",
}


@dataclass(slots=True)
class ExactDuplicateGroup:
    account_id: int
    account_name: str
    posted_on: date_type
    amount: Decimal
    normalized_name: str
    transaction_ids: list[int]
    names: list[str]


@dataclass(slots=True)
class NearDuplicatePair:
    account_id: int
    account_name: str
    amount: Decimal
    id_1: int
    date_1: date_type
    name_1: str
    id_2: int
    date_2: date_type
    name_2: str
    day_gap: int
    total_occurrences: int


@dataclass(slots=True)
class TransferAuditRow:
    transaction_id: int
    account_id: int
    account_name: str
    posted_on: date_type
    name: str
    amount: Decimal
    classification: str
    counterpart_ids: list[int]
    counterpart_accounts: list[str]
    day_gaps: list[int]
    closure_adjacent: bool
    evidence: str


@dataclass(slots=True)
class LifecycleIssue:
    account_id: int
    account_name: str
    lifecycle_status: str
    include_in_net_worth: bool
    ledger_balance: Decimal
    issue: str
    detail: str


@dataclass(slots=True)
class AuditSummaryRow:
    severity: str
    category: str
    count: int
    dollar_impact: Decimal
    detail: str


@dataclass(slots=True)
class LedgerAuditReport:
    generated_at: date_type
    summaries: list[AuditSummaryRow]
    exact_duplicates: list[ExactDuplicateGroup]
    near_duplicates: list[NearDuplicatePair]
    transfers: list[TransferAuditRow]
    lifecycle_issues: list[LifecycleIssue]
    reconciliation_checks: list[ReconciliationCheck]
    doctor_findings: list[DoctorFinding]

    @property
    def needs_review_count(self) -> int:
        return sum(
            row.count
            for row in self.summaries
            if row.severity in {"error", "warn", "review"}
        )


def _money(value: Decimal) -> str:
    return f"{value:,.2f}"


def _write_csv(path: Path, fieldnames: list[str], rows: Iterable[dict[str, object]]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)
            count += 1
    return count


def find_exact_duplicates(conn: sqlite3.Connection) -> list[ExactDuplicateGroup]:
    rows = conn.execute(
        f"""
        SELECT
          t.account_id,
          a.name AS account_name,
          t.posted_on,
          t.amount_cents,
          lower(trim(t.name)) AS normalized_name,
          GROUP_CONCAT(t.id) AS ids,
          GROUP_CONCAT(t.name, ' || ') AS names
        FROM {transactions_subquery("t")}
        JOIN finance_accounts a ON a.id = t.account_id
        GROUP BY t.account_id, t.posted_on, t.amount_cents, lower(trim(t.name))
        HAVING COUNT(*) > 1
        ORDER BY ABS(t.amount_cents) DESC, t.posted_on DESC
        """
    ).fetchall()
    return [
        ExactDuplicateGroup(
            account_id=int(account_id),
            account_name=str(account_name),
            posted_on=date_type.fromisoformat(str(posted_on)),
            amount=Decimal(int(amount_cents)) / Decimal("100"),
            normalized_name=str(normalized_name),
            transaction_ids=[int(value) for value in str(ids).split(",") if value],
            names=str(names).split(" || ") if names else [],
        )
        for account_id, account_name, posted_on, amount_cents, normalized_name, ids, names in rows
    ]


def find_near_duplicate_pairs(
    conn: sqlite3.Connection,
    *,
    window_days: int = 5,
    max_occurrences: int = 4,
) -> list[NearDuplicatePair]:
    effective_window = max(0, min(window_days, 5))
    date_expr = transaction_date_expr(conn, "t")
    amount_expr = transaction_amount_select(conn, "t")
    raw_rows = conn.execute(
        f"""
        SELECT t.id, {date_expr}, t.name, {amount_expr}, t.account_id, a.name
        FROM {transactions_subquery("t")}
        JOIN finance_accounts a ON a.id = t.account_id
        ORDER BY t.account_id, t.amount_cents, {date_expr}, t.id
        """
    ).fetchall()

    rows: list[tuple[int, date_type, str, Decimal, int, str, str]] = []
    for txn_id, posted_on, name, amount, account_id, account_name in raw_rows:
        amount_key = f"{Decimal(str(amount)):.2f}"
        rows.append(
            (
                int(txn_id),
                date_type.fromisoformat(str(posted_on)),
                str(name),
                Decimal(amount_key),
                int(account_id),
                str(account_name),
                amount_key,
            )
        )

    occurrence_counts: dict[tuple[int, str], int] = {}
    for _txn_id, _posted_on, _name, _amount, account_id, _account_name, amount_key in rows:
        key = (account_id, amount_key)
        occurrence_counts[key] = occurrence_counts.get(key, 0) + 1

    by_key: dict[tuple[int, str], list[tuple[int, date_type, str, Decimal, int, str, str]]] = {}
    for row in rows:
        key = (row[4], row[6])
        if occurrence_counts[key] <= max_occurrences:
            by_key.setdefault(key, []).append(row)

    pairs: list[NearDuplicatePair] = []
    for key, entries in by_key.items():
        entries.sort(key=lambda row: (row[1], row[0]))
        total_occurrences = occurrence_counts[key]
        for index, row_a in enumerate(entries):
            id_a, date_a, name_a, amount_a, account_id, account_name, _ = row_a
            for row_b in entries[index + 1 :]:
                id_b, date_b, name_b, _amount_b, _account_id, _account_name, _ = row_b
                day_gap = abs((date_b - date_a).days)
                if day_gap > effective_window:
                    break
                if name_a.strip().lower() != name_b.strip().lower():
                    continue
                pairs.append(
                    NearDuplicatePair(
                        account_id=account_id,
                        account_name=account_name,
                        amount=amount_a,
                        id_1=id_a,
                        date_1=date_a,
                        name_1=name_a,
                        id_2=id_b,
                        date_2=date_b,
                        name_2=name_b,
                        day_gap=day_gap,
                        total_occurrences=total_occurrences,
                    )
                )
    pairs.sort(key=lambda pair: (-abs(pair.amount), pair.account_name, pair.date_1, pair.id_1))
    return pairs


def audit_transfers(conn: sqlite3.Connection, *, window_days: int = 5) -> list[TransferAuditRow]:
    effective_window = max(0, min(window_days, 5))
    rows = conn.execute(
        f"""
        SELECT
          t.id,
          t.account_id,
          a.name,
          a.lifecycle_status,
          t.posted_on,
          t.name,
          t.amount_cents,
          COALESCE(t.note, '')
        FROM {transactions_subquery("t")}
        JOIN finance_accounts a ON a.id = t.account_id
        WHERE t.transaction_kind = 'internal_transfer'
        ORDER BY t.posted_on, t.id
        """
    ).fetchall()

    account_last_dates = {
        int(account_id): date_type.fromisoformat(str(max_date))
        for account_id, max_date in conn.execute(
            """
            SELECT account_id, MAX(posted_on)
            FROM finance_account_ledger_entries
            GROUP BY account_id
            """
        ).fetchall()
        if max_date
    }

    entries = [
        {
            "id": int(row[0]),
            "account_id": int(row[1]),
            "account_name": str(row[2]),
            "lifecycle_status": str(row[3]),
            "posted_on": date_type.fromisoformat(str(row[4])),
            "name": str(row[5]),
            "amount_cents": int(row[6]),
            "note": str(row[7] or ""),
        }
        for row in rows
    ]

    audit_rows: list[TransferAuditRow] = []
    for entry in entries:
        candidates = [
            candidate
            for candidate in entries
            if candidate["id"] != entry["id"]
            and candidate["amount_cents"] == -entry["amount_cents"]
            and abs((candidate["posted_on"] - entry["posted_on"]).days) <= effective_window
        ]
        cross_account = [c for c in candidates if c["account_id"] != entry["account_id"]]
        same_account = [c for c in candidates if c["account_id"] == entry["account_id"]]
        note_blob = " ".join([entry["name"], entry["note"]]).lower()
        manual_like = any(token in note_blob for token in ("manual", "reconciled", "rollover"))
        last_date = account_last_dates.get(entry["account_id"])
        closure_adjacent = bool(
            entry["lifecycle_status"] != "open"
            and last_date is not None
            and 0 <= (last_date - entry["posted_on"]).days <= 30
        )

        if len(cross_account) == 1:
            classification = "matched_pair"
            selected = cross_account
            evidence = "single opposite-sign cross-account candidate within window"
        elif len(cross_account) > 1:
            classification = "ambiguous_multiple_matches"
            selected = cross_account
            evidence = "multiple opposite-sign cross-account candidates within window"
        elif same_account:
            classification = "same_account_artifact"
            selected = same_account
            evidence = "opposite-sign same-account row within window"
        elif manual_like:
            classification = "external_or_manual_transfer_candidate"
            selected = []
            evidence = "manual/reconciled/rollover language without in-ledger counterpart"
        else:
            classification = "missing_counterpart"
            selected = []
            evidence = "no opposite-sign counterpart found within window"

        audit_rows.append(
            TransferAuditRow(
                transaction_id=entry["id"],
                account_id=entry["account_id"],
                account_name=entry["account_name"],
                posted_on=entry["posted_on"],
                name=entry["name"],
                amount=Decimal(entry["amount_cents"]) / Decimal("100"),
                classification=classification,
                counterpart_ids=[int(c["id"]) for c in selected],
                counterpart_accounts=[str(c["account_name"]) for c in selected],
                day_gaps=[abs((c["posted_on"] - entry["posted_on"]).days) for c in selected],
                closure_adjacent=closure_adjacent,
                evidence=evidence,
            )
        )
    return audit_rows


def audit_lifecycle(conn: sqlite3.Connection) -> list[LifecycleIssue]:
    balances = {balance.account_id: balance.balance for balance in compute_balances(conn)}
    rows = conn.execute(
        """
        SELECT id, name, lifecycle_status, include_in_net_worth
        FROM finance_accounts
        ORDER BY name
        """
    ).fetchall()

    issues: list[LifecycleIssue] = []
    for account_id, name, lifecycle_status, include_in_net_worth in rows:
        ledger_balance = balances.get(int(account_id), Decimal("0"))
        included = bool(include_in_net_worth)
        if lifecycle_status in {"closed", "historical"} and abs(ledger_balance) >= Decimal("0.01"):
            issues.append(
                LifecycleIssue(
                    account_id=int(account_id),
                    account_name=str(name),
                    lifecycle_status=str(lifecycle_status),
                    include_in_net_worth=included,
                    ledger_balance=ledger_balance,
                    issue="nonzero_inactive_balance",
                    detail="Closed or historical account has a non-zero ledger balance.",
                )
            )
        elif not included and abs(ledger_balance) >= Decimal("0.01"):
            issues.append(
                LifecycleIssue(
                    account_id=int(account_id),
                    account_name=str(name),
                    lifecycle_status=str(lifecycle_status),
                    include_in_net_worth=included,
                    ledger_balance=ledger_balance,
                    issue="excluded_nonzero_balance",
                    detail="Account excluded from net worth still carries ledger balance.",
                )
            )
    return issues


def _latest_reconciliation_checks(
    checks: list[ReconciliationCheck],
) -> list[ReconciliationCheck]:
    latest: dict[int, ReconciliationCheck] = {}
    for check in checks:
        account_id = check.reconciliation.account_id
        current = latest.get(account_id)
        if current is None or check.reconciliation.as_of_date > current.reconciliation.as_of_date:
            latest[account_id] = check
    return list(latest.values())


def _count_uncertified_statement_periods(conn: sqlite3.Connection) -> int:
    if not table_exists(conn, "finance_account_statement_periods"):
        return 0
    row = conn.execute(
        """
        SELECT COUNT(*)
        FROM finance_account_statement_periods
        WHERE certification_status != 'certified'
        """
    ).fetchone()
    return int(row[0] or 0)


def _count_stale_pending_entries(conn: sqlite3.Connection, *, stale_days: int = 30) -> int:
    row = conn.execute(
        """
        SELECT COUNT(*)
        FROM finance_account_ledger_entries
        WHERE posting_status = 'pending'
          AND posted_on < date('now', ?)
        """,
        (f"-{stale_days} days",),
    ).fetchone()
    return int(row[0] or 0)


def run_ledger_audit(conn: sqlite3.Connection, *, window_days: int = 5) -> LedgerAuditReport:
    exact_duplicates = find_exact_duplicates(conn)
    near_duplicates = find_near_duplicate_pairs(conn, window_days=window_days)
    transfers = audit_transfers(conn, window_days=window_days)
    lifecycle_issues = audit_lifecycle(conn)
    reconciliation_checks = check_reconciliations(conn)
    doctor_findings = run_doctor(conn)

    transfer_counts: dict[str, int] = {
        classification: 0 for classification in TRANSFER_CLASSIFICATIONS
    }
    for transfer in transfers:
        transfer_counts[transfer.classification] += 1

    latest_reconciliations = _latest_reconciliation_checks(reconciliation_checks)
    latest_reconciliation_variances = [
        check for check in latest_reconciliations if abs(check.variance) >= Decimal("0.01")
    ]
    all_statement_variances = [
        check for check in reconciliation_checks if abs(check.variance) >= Decimal("0.01")
    ]

    summaries = [
        AuditSummaryRow(
            "error",
            "statement_period_variances",
            len(all_statement_variances),
            sum((abs(check.variance) for check in all_statement_variances), Decimal("0")),
            "Statement periods where opening balance plus posted deltas miss closing balance.",
        ),
        AuditSummaryRow(
            "warn",
            "uncertified_statement_periods",
            _count_uncertified_statement_periods(conn),
            Decimal("0"),
            "Statement periods not yet marked certified.",
        ),
        AuditSummaryRow(
            "warn",
            "stale_pending_ledger_entries",
            _count_stale_pending_entries(conn),
            Decimal("0"),
            "Pending ledger entries older than 30 days.",
        ),
        AuditSummaryRow(
            "warn",
            "latest_reconciliation_variances",
            len(latest_reconciliation_variances),
            sum((abs(check.variance) for check in latest_reconciliation_variances), Decimal("0")),
            "Latest statement variance for each account.",
        ),
        AuditSummaryRow(
            "warn",
            "lifecycle_issues",
            len(lifecycle_issues),
            sum((abs(issue.ledger_balance) for issue in lifecycle_issues), Decimal("0")),
            "Closed, historical, or excluded accounts with unexplained ledger balances.",
        ),
        AuditSummaryRow(
            "review",
            "exact_duplicate_groups",
            len(exact_duplicates),
            sum(
                (
                    abs(group.amount) * Decimal(len(group.transaction_ids) - 1)
                    for group in exact_duplicates
                ),
                Decimal("0"),
            ),
            "Same account/date/amount/name groups with more than one posted row.",
        ),
        AuditSummaryRow(
            "review",
            "near_duplicate_pairs",
            len(near_duplicates),
            sum((abs(pair.amount) for pair in near_duplicates), Decimal("0")),
            "Same account/same name/same amount pairs within the 5-day review window.",
        ),
        AuditSummaryRow(
            "review",
            "missing_transfer_counterparts",
            transfer_counts["missing_counterpart"],
            sum(
                (
                    abs(row.amount)
                    for row in transfers
                    if row.classification == "missing_counterpart"
                ),
                Decimal("0"),
            ),
            "Internal-transfer rows without an opposite-sign cross-account counterpart.",
        ),
        AuditSummaryRow(
            "review",
            "ambiguous_transfer_counterparts",
            transfer_counts["ambiguous_multiple_matches"],
            sum(
                (
                    abs(row.amount)
                    for row in transfers
                    if row.classification == "ambiguous_multiple_matches"
                ),
                Decimal("0"),
            ),
            "Internal-transfer rows with multiple possible opposite-sign counterparts.",
        ),
        AuditSummaryRow(
            "review",
            "same_account_transfer_artifacts",
            transfer_counts["same_account_artifact"],
            sum(
                (
                    abs(row.amount)
                    for row in transfers
                    if row.classification == "same_account_artifact"
                ),
                Decimal("0"),
            ),
            "Equal-and-opposite transfer rows inside the same account.",
        ),
        AuditSummaryRow(
            "info",
            "matched_transfer_rows",
            transfer_counts["matched_pair"],
            sum(
                (
                    abs(row.amount)
                    for row in transfers
                    if row.classification == "matched_pair"
                ),
                Decimal("0"),
            ),
            "Internal-transfer rows with one clean opposite-sign cross-account match.",
        ),
        AuditSummaryRow(
            "info",
            "external_or_manual_transfer_candidates",
            transfer_counts["external_or_manual_transfer_candidate"],
            sum(
                (
                    abs(row.amount)
                    for row in transfers
                    if row.classification == "external_or_manual_transfer_candidate"
                ),
                Decimal("0"),
            ),
            "Transfer rows that look manual or external rather than paired ledger movements.",
        ),
    ]

    for finding in doctor_findings:
        summaries.append(
            AuditSummaryRow(
                finding.severity,
                f"doctor:{finding.check}",
                finding.count,
                Decimal("0"),
                finding.detail,
            )
        )

    severity_order = {"error": 0, "warn": 1, "review": 2, "info": 3}
    summaries.sort(
        key=lambda row: (
            severity_order.get(row.severity, 9),
            -abs(row.dollar_impact),
            -row.count,
            row.category,
        )
    )

    return LedgerAuditReport(
        generated_at=date_type.today(),
        summaries=summaries,
        exact_duplicates=exact_duplicates,
        near_duplicates=near_duplicates,
        transfers=transfers,
        lifecycle_issues=lifecycle_issues,
        reconciliation_checks=reconciliation_checks,
        doctor_findings=doctor_findings,
    )


def render_markdown_report(report: LedgerAuditReport, *, include_csv_listing: bool = True) -> str:
    lines = [
        "# Finance Ledger Audit",
        "",
        f"Generated: {report.generated_at}",
        "",
        "## Summary",
        "",
        "| Severity | Category | Count | Impact |",
        "| --- | --- | ---: | ---: |",
    ]
    for row in report.summaries:
        lines.append(
            f"| {row.severity} | {row.category} | {row.count:,} | {_money(row.dollar_impact)} |"
        )

    lines.extend(
        [
            "",
            "## Exact Duplicate Groups",
            "",
        ]
    )
    if report.exact_duplicates:
        for row in report.exact_duplicates:
            ids = ", ".join(str(value) for value in row.transaction_ids)
            lines.append(
                f"- {row.account_name} {row.posted_on} {row.amount:,.2f} "
                f"`{row.normalized_name}` ids={ids}"
            )
    else:
        lines.append("- None")

    lines.extend(
        [
            "",
            "## Near Duplicate Pairs",
            "",
        ]
    )
    if report.near_duplicates:
        for row in report.near_duplicates:
            lines.append(
                f"- {row.account_name} {row.amount:,.2f}: "
                f"{row.date_1} `{row.name_1}` (id {row.id_1}) <-> "
                f"{row.date_2} `{row.name_2}` (id {row.id_2}), gap={row.day_gap}d"
            )
    else:
        lines.append("- None")

    lines.extend(["", "## Transfer Review", ""])
    if report.transfers:
        for row in report.transfers:
            counterparts = ", ".join(str(value) for value in row.counterpart_ids) or "-"
            lines.append(
                f"- {row.classification}: {row.account_name} {row.posted_on} "
                f"{row.amount:,.2f} `{row.name}` (id {row.transaction_id}); "
                f"counterparts={counterparts}"
            )
    else:
        lines.append("- None")

    lines.extend(["", "## Lifecycle Issues", ""])
    if report.lifecycle_issues:
        for row in report.lifecycle_issues:
            lines.append(
                f"- {row.account_name}: {row.issue} balance={row.ledger_balance:,.2f} "
                f"({row.lifecycle_status})"
            )
    else:
        lines.append("- None")

    lines.extend(["", "## Reconciliation Variances", ""])
    variances = [
        row for row in report.reconciliation_checks if abs(row.variance) >= Decimal("0.01")
    ]
    if variances:
        for row in variances:
            recon = row.reconciliation
            lines.append(
                f"- {recon.account_name} {recon.as_of_date}: "
                f"real={recon.balance:,.2f} computed={row.computed_balance:,.2f} "
                f"variance={row.variance:+,.2f}"
            )
    else:
        lines.append("- None")

    if include_csv_listing:
        lines.extend(
            [
                "",
                "## CSV Files",
                "",
                "- `finance_ledger_audit_summary.csv`",
                "- `finance_ledger_audit_exact_duplicates.csv`",
                "- `finance_ledger_audit_near_duplicates.csv`",
                "- `finance_ledger_audit_transfers.csv`",
                "- `finance_ledger_audit_lifecycle_issues.csv`",
                "- `finance_ledger_audit_reconciliation_checks.csv`",
            ]
        )

    return "\n".join(lines) + "\n"


def write_ledger_audit_outputs(
    report: LedgerAuditReport,
    output_dir: Path,
    *,
    include_csv: bool = True,
) -> dict[str, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    paths = {"markdown": output_dir / "finance_ledger_audit.md"}
    paths["markdown"].write_text(
        render_markdown_report(report, include_csv_listing=include_csv),
        encoding="utf-8",
    )
    if not include_csv:
        return paths

    paths.update(
        {
            "summary": output_dir / "finance_ledger_audit_summary.csv",
            "exact_duplicates": output_dir / "finance_ledger_audit_exact_duplicates.csv",
            "near_duplicates": output_dir / "finance_ledger_audit_near_duplicates.csv",
            "transfers": output_dir / "finance_ledger_audit_transfers.csv",
            "lifecycle_issues": output_dir / "finance_ledger_audit_lifecycle_issues.csv",
            "reconciliation_checks": output_dir / "finance_ledger_audit_reconciliation_checks.csv",
        }
    )

    _write_csv(
        paths["summary"],
        ["severity", "category", "count", "dollar_impact", "detail"],
        (
            {
                "severity": row.severity,
                "category": row.category,
                "count": row.count,
                "dollar_impact": f"{row.dollar_impact:.2f}",
                "detail": row.detail,
            }
            for row in report.summaries
        ),
    )
    _write_csv(
        paths["exact_duplicates"],
        [
            "account_id",
            "account_name",
            "posted_on",
            "amount",
            "normalized_name",
            "transaction_ids",
            "names",
        ],
        (
            {
                "account_id": row.account_id,
                "account_name": row.account_name,
                "posted_on": row.posted_on.isoformat(),
                "amount": f"{row.amount:.2f}",
                "normalized_name": row.normalized_name,
                "transaction_ids": ",".join(str(value) for value in row.transaction_ids),
                "names": " | ".join(row.names),
            }
            for row in report.exact_duplicates
        ),
    )
    _write_csv(
        paths["near_duplicates"],
        [
            "account_id",
            "account_name",
            "amount",
            "id_1",
            "date_1",
            "name_1",
            "id_2",
            "date_2",
            "name_2",
            "day_gap",
            "total_occurrences",
        ],
        (
            {
                "account_id": row.account_id,
                "account_name": row.account_name,
                "amount": f"{row.amount:.2f}",
                "id_1": row.id_1,
                "date_1": row.date_1.isoformat(),
                "name_1": row.name_1,
                "id_2": row.id_2,
                "date_2": row.date_2.isoformat(),
                "name_2": row.name_2,
                "day_gap": row.day_gap,
                "total_occurrences": row.total_occurrences,
            }
            for row in report.near_duplicates
        ),
    )
    _write_csv(
        paths["transfers"],
        [
            "transaction_id",
            "account_id",
            "account_name",
            "posted_on",
            "name",
            "amount",
            "classification",
            "counterpart_ids",
            "counterpart_accounts",
            "day_gaps",
            "closure_adjacent",
            "evidence",
        ],
        (
            {
                "transaction_id": row.transaction_id,
                "account_id": row.account_id,
                "account_name": row.account_name,
                "posted_on": row.posted_on.isoformat(),
                "name": row.name,
                "amount": f"{row.amount:.2f}",
                "classification": row.classification,
                "counterpart_ids": ",".join(str(value) for value in row.counterpart_ids),
                "counterpart_accounts": " | ".join(row.counterpart_accounts),
                "day_gaps": ",".join(str(value) for value in row.day_gaps),
                "closure_adjacent": int(row.closure_adjacent),
                "evidence": row.evidence,
            }
            for row in report.transfers
        ),
    )
    _write_csv(
        paths["lifecycle_issues"],
        [
            "account_id",
            "account_name",
            "lifecycle_status",
            "include_in_net_worth",
            "ledger_balance",
            "issue",
            "detail",
        ],
        (
            {
                "account_id": row.account_id,
                "account_name": row.account_name,
                "lifecycle_status": row.lifecycle_status,
                "include_in_net_worth": int(row.include_in_net_worth),
                "ledger_balance": f"{row.ledger_balance:.2f}",
                "issue": row.issue,
                "detail": row.detail,
            }
            for row in report.lifecycle_issues
        ),
    )
    _write_csv(
        paths["reconciliation_checks"],
        [
            "reconciliation_id",
            "account_id",
            "account_name",
            "as_of_date",
            "real_balance",
            "computed_balance",
            "variance",
            "source",
            "note",
        ],
        (
            {
                "reconciliation_id": row.reconciliation.id,
                "account_id": row.reconciliation.account_id,
                "account_name": row.reconciliation.account_name,
                "as_of_date": row.reconciliation.as_of_date.isoformat(),
                "real_balance": f"{row.reconciliation.balance:.2f}",
                "computed_balance": f"{row.computed_balance:.2f}",
                "variance": f"{row.variance:.2f}",
                "source": row.reconciliation.source,
                "note": row.reconciliation.note or "",
            }
            for row in report.reconciliation_checks
        ),
    )
    return paths
