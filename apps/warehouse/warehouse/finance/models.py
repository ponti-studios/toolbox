"""Typed domain model for the finance ingestion pipeline."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date as date_type
from decimal import Decimal, InvalidOperation

from pydantic import BaseModel, field_validator

from .normalize import normalise_date, normalise_mask
from .strict import money_to_cents


def normalise_status(value: str) -> str:
    key = (value or "").strip().lower()
    return "pending" if key == "pending" else "posted"


def normalise_transaction_kind(value: str) -> str:
    key = (value or "").strip().lower()
    if key == "income":
        return "income"
    if key in {"internal transfer", "transfer"}:
        return "internal_transfer"
    if key == "adjustment":
        return "adjustment"
    return "regular"


class TransactionRecord(BaseModel):
    """A single validated, canonical transaction ready to merge."""

    date: date_type
    name: str
    amount: Decimal
    status: str = ""
    category: str = ""
    parent_category: str = ""
    excluded: bool = False
    tags: str = ""
    type: str = ""
    account_raw: str = ""
    account_id: int | None = None
    category_id: int | None = None
    account_mask: str = ""
    note: str = ""
    recurring: bool = False
    source_connector: str
    source_file: str
    source_fingerprint: str = ""

    @field_validator("account_mask")
    @classmethod
    def _normalise_mask(cls, value: str) -> str:
        return normalise_mask(value)

    @property
    def amount_cents(self) -> int:
        return money_to_cents(self.amount)

    @property
    def import_key(self) -> str:
        """Stable source-backed import identity."""

        if not self.source_fingerprint:
            raise ValueError("source_fingerprint is required for finance imports")
        return self.source_fingerprint

    @property
    def status_key(self) -> str:
        return normalise_status(self.status)

    @property
    def transaction_kind(self) -> str:
        return normalise_transaction_kind(self.type)


def parse_amount(value: object) -> Decimal:
    """Parse a raw amount string into a signed ``Decimal``.

    Raises ``InvalidOperation`` (a pydantic-catchable ``ValueError`` subclass
    is not needed here -- callers pass this straight into ``TransactionRecord``,
    which will surface the failure as a validation error) if the value cannot
    be parsed at all.
    """

    if value is None:
        raise InvalidOperation("amount is None")
    s = str(value).strip()
    if not s:
        raise InvalidOperation("amount is empty")
    s = s.replace("$", "").replace(",", "").strip()
    if s.startswith("(") and s.endswith(")"):
        s = "-" + s[1:-1]
    return Decimal(s)


def parse_date(value: object) -> date_type:
    """Parse a raw date value into a ``date``, raising if it can't be normalised."""

    normalised = normalise_date(value)
    if not normalised:
        raise ValueError(f"unparseable date: {value!r}")
    return date_type.fromisoformat(normalised)


@dataclass(slots=True)
class RejectedRow:
    """A raw row that failed validation, kept for the import report."""

    row_index: int
    raw: dict
    reason: str


@dataclass(slots=True)
class ImportReport:
    """Summary of one import run -- always printed in full, never swallowed."""

    connector: str
    source_file: str
    batch_id: int | None = None
    rows_read: int = 0
    rows_landed: int = 0
    rows_validated: int = 0
    rows_rejected: int = 0
    rows_merged: int = 0
    rows_duplicate: int = 0
    unmapped_accounts: dict[str, int] = field(default_factory=dict)
    unmapped_categories: dict[str, int] = field(default_factory=dict)
    rejects: list[RejectedRow] = field(default_factory=list)

    def render(self) -> str:
        lines = [
            "=" * 70,
            "FINANCE IMPORT REPORT",
            "=" * 70,
            f"Connector:        {self.connector}",
            f"Source file:      {self.source_file}",
            f"Batch id:         {self.batch_id if self.batch_id is not None else 'n/a (dry run)'}",
            f"Rows read:        {self.rows_read:,}",
            f"Rows landed:      {self.rows_landed:,}",
            f"Rows validated:   {self.rows_validated:,}",
            f"Rows rejected:    {self.rows_rejected:,}",
            f"Rows merged (new):{self.rows_merged:>10,}",
            f"Rows duplicate:   {self.rows_duplicate:,}",
        ]
        if self.unmapped_accounts:
            lines.append("")
            lines.append(
                "Unmapped accounts (row lands with account_id=NULL, "
                "add an alias or a new finance_accounts row):"
            )
            for raw_name, count in sorted(
                self.unmapped_accounts.items(), key=lambda kv: -kv[1]
            ):
                lines.append(f"  {count:>6,}  {raw_name!r}")
        if self.unmapped_categories:
            lines.append("")
            lines.append(
                "Unmapped categories (row lands with category_id=NULL, "
                "add via `uv run warehouse finance categories add`):"
            )
            for raw_category, count in sorted(
                self.unmapped_categories.items(), key=lambda kv: -kv[1]
            ):
                lines.append(f"  {count:>6,}  {raw_category!r}")
        if self.rejects:
            lines.append("")
            lines.append(f"Rejected rows ({len(self.rejects)}):")
            for reject in self.rejects[:20]:
                lines.append(f"  row {reject.row_index}: {reject.reason}")
            if len(self.rejects) > 20:
                lines.append(f"  ... and {len(self.rejects) - 20} more")
        lines.append("=" * 70)
        return "\n".join(lines)
