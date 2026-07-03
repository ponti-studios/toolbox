"""Detect recurring transactions — subscriptions and repeating bills."""

from __future__ import annotations

import sqlite3
from collections import defaultdict
from dataclasses import dataclass
from datetime import date as date_type
from datetime import datetime, timedelta
from decimal import Decimal


@dataclass
class RecurringTransaction:
    name: str
    account_name: str
    category_name: str
    amount: Decimal
    interval_days: int
    occurrence_count: int
    first_date: date_type
    last_date: date_type
    next_expected: date_type | None


def find_recurring(
    conn: sqlite3.Connection,
    *,
    min_occurrences: int = 2,
    lookback_days: int = 180,
) -> list[RecurringTransaction]:
    """Find transactions that repeat at regular intervals.

    Groups transactions by (name, amount, account) and looks for those
    that appear at least ``min_occurrences`` times with a consistent
    interval within the ``lookback_days`` window.
    """

    cutoff = (datetime.now() - timedelta(days=lookback_days)).strftime("%Y-%m-%d")

    rows = conn.execute(
        """
        SELECT
            l.description AS name,
            a.name AS account_name,
            COALESCE(c.name, 'Uncategorized') AS category_name,
            printf('%.2f', -l.balance_delta_cents / 100.0) AS amount,
            l.posted_on
        FROM finance_account_ledger_entries l
        JOIN finance_ledger_entry_annotations an ON an.ledger_entry_id = l.id
        JOIN finance_accounts a ON a.id = l.account_id
        LEFT JOIN finance_categories c ON c.id = an.category_id
        WHERE l.posted_on >= ?
          AND an.excluded = 0
          AND l.balance_delta_cents < 0
        ORDER BY l.description, l.posted_on
        """,
        (cutoff,),
    ).fetchall()

    # Group by (name, amount, account)
    groups: dict[tuple[str, str, str], list[date_type]] = defaultdict(list)
    for row in rows:
        try:
            d = datetime.strptime(row["posted_on"], "%Y-%m-%d").date()
        except ValueError:
            continue
        key = (row["name"], row["amount"], row["account_name"])
        groups[key].append(d)

    results: list[RecurringTransaction] = []
    today = date_type.today()

    for (name, amount_str, account_name), dates in groups.items():
        if len(dates) < min_occurrences:
            continue

        dates.sort()
        intervals: list[int] = []
        for i in range(1, len(dates)):
            intervals.append((dates[i] - dates[i - 1]).days)

        if not intervals:
            continue

        # Check for consistent intervals
        median_interval = sorted(intervals)[len(intervals) // 2]
        if median_interval < 7:  # Too frequent to be recurring
            continue

        # At least half the intervals should be close to the median
        close_count = sum(
            1 for i in intervals
            if abs(i - median_interval) <= max(5, median_interval * 0.20)
        )
        if close_count < len(intervals) * 0.5:
            continue

        amount = Decimal(amount_str)
        last_date = dates[-1]
        next_expected = last_date + timedelta(days=median_interval)
        if next_expected < today:
            next_expected = None  # Already past

        # Use category from the first occurrence of this group
        group_key = (name, amount_str, account_name)
        category_name = "Uncategorized"
        for row in rows:
            if (row["name"], row["amount"], row["account_name"]) == group_key:
                category_name = row["category_name"]
                break

        results.append(
            RecurringTransaction(
                name=name,
                account_name=account_name,
                category_name=category_name,
                amount=amount,
                interval_days=median_interval,
                occurrence_count=len(dates),
                first_date=dates[0],
                last_date=last_date,
                next_expected=next_expected,
            )
        )

    results.sort(
        key=lambda r: (
            r.next_expected is None,
            r.next_expected or date_type.max,
            -abs(r.amount),
        )
    )
    return results


def _interval_label(days: int) -> str:
    if 25 <= days <= 35:
        return "monthly"
    if 80 <= days <= 100:
        return "quarterly"
    if 350 <= days <= 380:
        return "yearly"
    if days % 7 == 0:
        return f"every {days // 7}w"
    return f"every {days}d"
