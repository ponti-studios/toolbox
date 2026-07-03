"""Connector registry: source-format adapters for the ingestion pipeline."""

from __future__ import annotations

from pathlib import Path

from ..accounts import AccountResolver
from ..categories import CategoryResolver
from .base import Connector
from .generic_csv import GenericCsvConnector

CONNECTOR_NAMES = ("generic",)


def build_connector(
    name: str,
    resolver: AccountResolver,
    category_resolver: CategoryResolver,
    *,
    column_map: dict[str, str] | None = None,
) -> Connector:
    """Instantiate a connector by name."""

    if name == "generic":
        if not column_map:
            raise ValueError("generic connector requires --map")
        return GenericCsvConnector(resolver, category_resolver, column_map)
    raise ValueError(f"Unknown connector: {name!r}. Known: {CONNECTOR_NAMES}")


def detect_connector(
    path: Path, resolver: AccountResolver, category_resolver: CategoryResolver
) -> Connector | None:
    """Auto-detect applies only to connectors that implement sniff()."""

    # generic connector never auto-detects -- always explicit
    return None


__all__ = [
    "Connector",
    "CopilotConnector",
    "GenericCsvConnector",
    "CONNECTOR_NAMES",
    "build_connector",
    "detect_connector",
]
