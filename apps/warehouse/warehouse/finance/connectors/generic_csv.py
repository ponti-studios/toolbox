"""Fallback connector for CSV shapes that don't match a known format.

Requires an explicit column mapping (``--map date=Date,amount=Amt,...``)
since there's nothing to auto-detect. Replaces the old ``schema.py``
guess-by-column-name fallback with an explicit, auditable mapping instead.
"""

from __future__ import annotations

import csv
from pathlib import Path
from typing import Iterator

from ..accounts import AccountResolver
from ..categories import CategoryResolver
from ..models import TransactionRecord, parse_amount, parse_date
from ..normalize import bool_val, build_source_fingerprint, normalise_name

CANONICAL_FIELDS = {
    "date",
    "name",
    "amount",
    "status",
    "category",
    "parent_category",
    "excluded",
    "tags",
    "type",
    "account",
    "account_mask",
    "note",
    "recurring",
}


class GenericCsvConnector:
    """Parses an arbitrary CSV given an explicit header mapping.

    ``column_map`` maps canonical field name -> source CSV header, e.g.
    ``{"date": "Date", "amount": "Amt", "name": "Description"}``. Unmapped
    canonical fields default to empty/False.
    """

    name = "generic"

    def __init__(
        self,
        resolver: AccountResolver,
        category_resolver: CategoryResolver,
        column_map: dict[str, str],
    ) -> None:
        unknown = set(column_map) - CANONICAL_FIELDS
        if unknown:
            raise ValueError(f"Unknown canonical field(s) in --map: {sorted(unknown)}")
        if "date" not in column_map or "amount" not in column_map or "name" not in column_map:
            raise ValueError("--map must at least cover date, name, and amount")
        self._resolver = resolver
        self._category_resolver = category_resolver
        self._column_map = column_map

    def sniff(self, path: Path) -> bool:
        # Generic connector never auto-detects -- it must be explicitly requested.
        return False

    def parse(self, path: Path) -> Iterator[dict]:
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                yield row

    def _get(self, raw: dict, field: str) -> str:
        source_col = self._column_map.get(field)
        if source_col is None:
            return ""
        return (raw.get(source_col) or "").strip()

    def to_record(self, raw: dict, *, source_file: str) -> TransactionRecord:
        account_raw = self._get(raw, "account")
        account_id = self._resolver.resolve(account_raw) if account_raw else None
        category = self._get(raw, "category")
        parent_category = self._get(raw, "parent_category")
        category_id = (
            self._category_resolver.resolve(category, parent_category) if category else None
        )

        return TransactionRecord(
            date=parse_date(self._get(raw, "date")),
            name=normalise_name(self._get(raw, "name")),
            amount=parse_amount(self._get(raw, "amount")),
            status=self._get(raw, "status"),
            category=category,
            parent_category=parent_category,
            excluded=bool_val(self._get(raw, "excluded")) == "1",
            tags=self._get(raw, "tags"),
            type=self._get(raw, "type"),
            account_raw=account_raw,
            account_id=account_id,
            category_id=category_id,
            account_mask=self._get(raw, "account_mask"),
            note=self._get(raw, "note"),
            recurring=bool_val(self._get(raw, "recurring")) == "1",
            source_connector=self.name,
            source_file=source_file,
            source_fingerprint=build_source_fingerprint(raw),
        )
