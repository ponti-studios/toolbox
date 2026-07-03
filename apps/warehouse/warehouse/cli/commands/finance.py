"""Finance CLI — import, review, recurring, net worth, and accounts."""

from __future__ import annotations

import csv
import sqlite3
from datetime import date
from decimal import Decimal
from pathlib import Path

import typer
from rich.console import Console
from rich.table import Table

from warehouse.core import AppSettings
from warehouse.core.errors import ConfigError
from warehouse.finance import (
    AccountResolver,
    CategoryResolver,
    compute_balances,
    net_worth_history,
    run_doctor,
    run_ledger_audit,
    write_ledger_audit_outputs,
)
from warehouse.finance.pipeline import import_file
from warehouse.finance.recurring import _interval_label, find_recurring
from warehouse.finance.summary import monthly_summaries

app = typer.Typer(help="Personal finance tools.")
accounts_app = typer.Typer(help="Manage accounts.")
categories_app = typer.Typer(help="Manage categories.")
app.add_typer(accounts_app, name="accounts")
app.add_typer(categories_app, name="categories")

console = Console()

# Common CSV header aliases for auto-detection
_HEADER_ALIASES = {
    "date": {"date", "posted_on", "transaction_date", "posted date"},
    "name": {"name", "description", "payee", "merchant", "memo"},
    "amount": {"amount", "amount_usd", "value"},
    "account": {"account", "account_name", "account name"},
    "category": {"category", "subcategory"},
    "parent_category": {"parent_category", "parent category", "main category"},
    "type": {"type", "transaction_type", "kind"},
    "note": {"note", "notes", "memo", "description 2"},
    "account_mask": {"account_mask", "account mask", "mask"},
    "tags": {"tags", "labels"},
    "status": {"status", "state"},
    "excluded": {"excluded", "hidden"},
    "recurring": {"recurring", "is_recurring"},
}


def _auto_map(headers: list[str]) -> dict[str, str] | None:
    """Try to auto-detect a column mapping from common CSV headers."""

    lower = [h.strip().lower() for h in headers]
    mapping: dict[str, str] = {}
    for canonical, aliases in _HEADER_ALIASES.items():
        for alias in aliases:
            if alias in lower:
                idx = lower.index(alias)
                mapping[canonical] = headers[idx]
                break

    required = {"date", "name", "amount"}
    if required & mapping.keys() != required:
        return None
    return mapping


def _settings() -> AppSettings:
    try:
        s = AppSettings.from_config()
        s.ensure_database()
    except ConfigError as exc:
        console.print(f"[red]{exc}[/red]")
        raise typer.Exit(1) from exc
    return s


def _connect(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@app.command("import")
def import_csv(
    csv_path: str = typer.Argument(..., help="Path to the CSV export to import."),
    column_map: str | None = typer.Option(
        None,
        "--map",
        help="Column mapping: date=Date,name=Description,amount=Amt (auto-detected if omitted).",
    ),
    dry_run: bool = typer.Option(False, "--dry-run", "-n", help="Report without writing."),
    since: str | None = typer.Option(
        None,
        "--since",
        help="ISO date (YYYY-MM-DD, inclusive). Only rows on/after this date are merged.",
    ),
) -> None:
    """Import transactions from a CSV file."""

    settings = _settings()

    mapping = None
    if column_map:
        mapping = {}
        for pair in column_map.split(","):
            if "=" not in pair:
                raise typer.BadParameter(f"--map entries must be field=Header, got: {pair!r}")
            field, header = pair.split("=", 1)
            mapping[field.strip()] = header.strip()
    else:
        with open(csv_path, encoding="utf-8-sig", newline="") as f:
            headers = next(csv.reader(f))
        mapping = _auto_map(headers)
        if mapping is None:
            raise typer.BadParameter(
                "Could not auto-detect CSV headers. "
                "Pass --map date=Date,name=Description,amount=Amt to specify column mapping."
            )

    report = import_file(
        settings.database_path,
        csv_path,
        connector_name="generic",
        column_map=mapping,
        dry_run=dry_run,
        since=since,
    )
    typer.echo(report.render())


@app.command("summary")
def summary(
    months: int = typer.Option(12, "--months", help="Number of months to show."),
) -> None:
    """Show monthly income, expenses, and category breakdown."""

    settings = _settings()
    conn = _connect(settings.database_path)
    try:
        summaries = monthly_summaries(conn, months=months)
        if not summaries:
            console.print("[yellow]No transactions found.[/yellow]")
            return

        for s in summaries:
            table = Table(
                title=f"{s.month} — "
                f"Income {s.income:,.2f}  "
                f"Expenses {s.expenses:,.2f}  "
                f"Net {s.net:,.2f}"
            )
            table.add_column("Category", style="cyan")
            table.add_column("Amount", style="green", justify="right")
            table.add_column("Count", style="dim", justify="right")
            for cat in s.categories:
                table.add_row(
                    cat.category_name,
                    f"{cat.total:,.2f}",
                    str(cat.transaction_count),
                )
            console.print(table)
            console.print()
    finally:
        conn.close()


@app.command("recurring")
def recurring(
    min_occurrences: int = typer.Option(2, "--min", help="Minimum occurrences to qualify."),
    lookback_days: int = typer.Option(180, "--days", help="How many days to look back."),
) -> None:
    """Detect recurring subscriptions and bills."""

    settings = _settings()
    conn = _connect(settings.database_path)
    try:
        items = find_recurring(
            conn, min_occurrences=min_occurrences, lookback_days=lookback_days
        )
        if not items:
            console.print("[yellow]No recurring transactions found.[/yellow]")
            return

        table = Table(title="Recurring Transactions")
        table.add_column("Merchant", style="cyan")
        table.add_column("Amount", style="green", justify="right")
        table.add_column("Interval", style="yellow")
        table.add_column("Category", style="dim")
        table.add_column("Last", style="dim")
        table.add_column("Next", style="bold")

        for item in items:
            table.add_row(
                item.name,
                f"{item.amount:,.2f}",
                _interval_label(item.interval_days),
                item.category_name,
                item.last_date.isoformat(),
                item.next_expected.isoformat() if item.next_expected else "—",
            )
        console.print(table)
    finally:
        conn.close()


@app.command("net-worth")
def net_worth_cmd(
    as_of: str | None = typer.Option(None, "--as-of", help="YYYY-MM-DD, default today."),
    history: bool = typer.Option(False, "--history", help="Show trailing 12-month history."),
) -> None:
    """Show current or historical net worth."""

    settings = _settings()
    conn = _connect(settings.database_path)
    try:
        as_of_date = date.fromisoformat(as_of) if as_of else None
        if history:
            for month, total in net_worth_history(conn, as_of=as_of_date):
                typer.echo(f"{month}  {total:>14,.2f}")
            return
        balances = compute_balances(conn, as_of_date)
        total = sum((b.balance for b in balances), Decimal("0"))
        for balance in balances:
            typer.echo(f"{balance.account_name:35s} {balance.balance:>14,.2f}")
        typer.echo("-" * 50)
        typer.echo(f"{'Net worth':35s} {total:>14,.2f}")
    finally:
        conn.close()


@app.command("doctor")
def doctor(
    stale_days: int = typer.Option(
        365,
        "--stale-days",
        help="Days without activity before an open account is stale.",
    ),
) -> None:
    """Run data-quality checks on the finance ledger."""

    settings = _settings()
    conn = _connect(settings.database_path)
    try:
        findings = run_doctor(conn, stale_days=stale_days)
        if not findings:
            typer.echo("No issues found.")
            return
        for finding in findings:
            typer.echo(
                f"{finding.severity.upper():5s} {finding.check:34s} "
                f"{finding.count:>8,}  {finding.detail}"
            )
    finally:
        conn.close()


@app.command("audit")
def audit(
    window_days: int = typer.Option(
        5, "--window-days", help="Max days apart for duplicate and transfer review."
    ),
    output_dir: str = typer.Option(
        ".archive/reports", "--output-dir", help="Directory for the Markdown report."
    ),
    csv: bool = typer.Option(
        False, "--csv", help="Also write CSV detail files."
    ),
    top: int = typer.Option(20, "--top", help="Max summary rows to print."),
) -> None:
    """Run the finance ledger audit (duplicates, transfers, lifecycle)."""

    settings = _settings()
    conn = _connect(settings.database_path)
    try:
        report = run_ledger_audit(conn, window_days=window_days)
        paths = write_ledger_audit_outputs(report, Path(output_dir), include_csv=csv)
        typer.echo("Finance ledger audit")
        typer.echo("-" * 72)
        for row in report.summaries[:top]:
            typer.echo(
                f"{row.severity:6s} {row.category:36.36s} "
                f"count={row.count:>6,} impact={row.dollar_impact:>14,.2f}"
            )
        typer.echo(f"\nReport: {paths['markdown']}")
        if csv:
            typer.echo(f"CSV detail files: {Path(output_dir)}")
    finally:
        conn.close()


@accounts_app.command("list")
def accounts_list() -> None:
    """List all accounts."""

    settings = _settings()
    conn = _connect(settings.database_path)
    try:
        resolver = AccountResolver(conn)
        for account in resolver.list_accounts():
            typer.echo(
                f"{account.id:>4}  {account.name:45s} {account.institution or '':25s} "
                f"{account.account_type:11s} {account.lifecycle_status:10s} "
                f"nw={'yes' if account.include_in_net_worth else 'no'}"
            )
    finally:
        conn.close()


@accounts_app.command("add")
def accounts_add(
    name: str = typer.Argument(..., help="Account name."),
    institution: str = typer.Option("", "--institution", help="Institution name."),
) -> None:
    """Add an account to the registry."""

    settings = _settings()
    conn = _connect(settings.database_path)
    try:
        resolver = AccountResolver(conn)
        account_id = resolver.add_account(name, institution)
        typer.echo(f"Added account {account_id}: {name}")
    finally:
        conn.close()


@accounts_app.command("alias")
def accounts_alias(
    alias: str = typer.Argument(..., help="Alternate or historical label to map."),
    account_name: str = typer.Argument(..., help="Canonical account name."),
) -> None:
    """Register an account alias for future imports."""

    settings = _settings()
    conn = _connect(settings.database_path)
    try:
        resolver = AccountResolver(conn)
        resolver.add_alias(alias, account_name)
        typer.echo(f"Aliased {alias!r} -> {account_name!r}")
    finally:
        conn.close()


@categories_app.command("list")
def categories_list() -> None:
    """List all categories."""

    settings = _settings()
    conn = _connect(settings.database_path)
    try:
        resolver = CategoryResolver(conn)
        for category in resolver.list_categories():
            parent = category.parent_name or "-"
            typer.echo(f"{category.id:>4}  {parent:25s} {category.name}")
    finally:
        conn.close()


@categories_app.command("add")
def categories_add(
    name: str = typer.Argument(..., help="Category name."),
    parent: str = typer.Option("", "--parent", help="Parent category name."),
) -> None:
    """Add a category."""

    settings = _settings()
    conn = _connect(settings.database_path)
    try:
        resolver = CategoryResolver(conn)
        category_id = resolver.add_category(name, parent)
        suffix = f" (under {parent})" if parent else ""
        typer.echo(f"Added category {category_id}: {name}{suffix}")
    finally:
        conn.close()
