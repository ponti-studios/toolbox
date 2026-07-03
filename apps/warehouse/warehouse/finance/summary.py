"""Monthly spending summary — category breakdown by month."""

from __future__ import annotations

import sqlite3
from collections import defaultdict
from dataclasses import dataclass
from decimal import Decimal


@dataclass
class CategorySummary:
    category_name: str
    total: Decimal
    transaction_count: int


@dataclass
class MonthlySummary:
    month: str  # YYYY-MM
    income: Decimal
    expenses: Decimal
    net: Decimal
    categories: list[CategorySummary]


def monthly_summaries(
    conn: sqlite3.Connection,
    *,
    months: int = 12,
) -> list[MonthlySummary]:
    """Return monthly income, expenses, and category breakdowns."""

    rows = conn.execute(
        """
        SELECT
            strftime('%Y-%m', l.posted_on) AS month,
            CASE WHEN l.balance_delta_cents > 0 THEN 'income' ELSE 'expense' END AS direction,
            COALESCE(c.name, 'Uncategorized') AS category_name,
            SUM(ABS(l.balance_delta_cents)) AS total_cents,
            COUNT(*) AS tx_count
        FROM finance_account_ledger_entries l
        JOIN finance_ledger_entry_annotations a ON a.ledger_entry_id = l.id
        LEFT JOIN finance_categories c ON c.id = a.category_id
        WHERE a.excluded = 0
          AND l.posted_on >= date('now', ? || ' months')
        GROUP BY month, direction, category_name
        ORDER BY month DESC, direction, total_cents DESC
        """,
        (f"-{months}",),
    ).fetchall()

    grouped: dict[str, dict[str, Decimal]] = defaultdict(
        lambda: defaultdict(lambda: Decimal("0"))
    )
    counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    income: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    expenses: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))

    for row in rows:
        month = row["month"]
        category = row["category_name"]
        amount = Decimal(str(row["total_cents"])) / 100

        grouped[month][category] += amount
        counts[month][category] += row["tx_count"]

        if row["direction"] == "income":
            income[month] += amount
        else:
            expenses[month] += amount

    results: list[MonthlySummary] = []
    for month in sorted(grouped.keys(), reverse=True):
        cats = [
            CategorySummary(
                category_name=name,
                total=total,
                transaction_count=counts[month][name],
            )
            for name, total in sorted(
                grouped[month].items(), key=lambda kv: abs(kv[1]), reverse=True
            )
        ]
        results.append(
            MonthlySummary(
                month=month,
                income=income[month],
                expenses=expenses[month],
                net=income[month] - expenses[month],
                categories=cats,
            )
        )

    return results
