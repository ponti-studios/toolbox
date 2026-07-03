"""Connector protocol: source-format adapters for the ingestion pipeline."""

from __future__ import annotations

from pathlib import Path
from typing import Iterator, Protocol, runtime_checkable

from ..models import TransactionRecord


@runtime_checkable
class Connector(Protocol):
    """Adapter boundary between a raw export file and the canonical schema.

    Adding a new source (a bank CSV, a Plaid live-sync feed) means writing
    one class implementing this protocol and registering it in
    ``connectors/__init__.py`` -- nothing in ``pipeline.py`` changes.
    """

    name: str

    def sniff(self, path: Path) -> bool:
        """Return True if this connector can parse the given file."""
        ...

    def parse(self, path: Path) -> Iterator[dict]:
        """Yield raw rows (source-native keys, untouched values)."""
        ...

    def to_record(self, raw: dict, *, source_file: str) -> TransactionRecord:
        """Convert one raw row into a validated ``TransactionRecord``.

        Should raise on genuinely malformed input (e.g. unparseable amount)
        rather than silently coercing -- the pipeline catches the exception
        and records it as an explicit reject.
        """
        ...
