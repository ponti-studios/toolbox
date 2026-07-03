"""Value normalisation helpers for finance-transaction fields."""

from __future__ import annotations

import hashlib
import re
from datetime import datetime
from typing import Any


def normalise_date(val: Any) -> str:
    """Return YYYY-MM-DD from any common representation."""

    if val is None:
        return ""
    s = str(val).strip()
    if not s or s == "None":
        return ""
    if "T" in s:
        s = s.split("T")[0]
    if " " in s:
        s = s.split(" ")[0]
    # Strip timezone suffix (Z or +00:00) if present
    for tz_suffix in ("Z+00:00", "+00:00", "Z"):
        if s.endswith(tz_suffix):
            s = s[: -len(tz_suffix)]
            break
    if re.match(r"^\d{4}-\d{2}-\d{2}", s):
        return s[:10]
    return s


def normalise_amount(val: Any) -> str:
    """Normalise amounts to canonical signed decimal strings."""

    if val is None:
        return ""
    s = str(val).strip()
    if not s:
        return ""
    s = s.replace("$", "").replace(",", "")
    if s.startswith("(") and s.endswith(")"):
        s = "-" + s[1:-1]
    try:
        return f"{float(s):.2f}"
    except ValueError:
        return s


def float_amount(val: Any) -> float:
    """Convert an amount to float for grouping and reporting."""

    try:
        return float(normalise_amount(val) or 0)
    except ValueError:
        return 0.0


def bool_val(val: Any) -> str:
    """Collapse mixed boolean representations to ``0`` or ``1`` strings."""

    if val in (None, "", "None"):
        return "0"
    s = str(val).strip().lower()
    return "1" if s in {"1", "true", "yes", "y"} else "0"


def normalise_mask(val: Any) -> str:
    """Normalize account mask values to their last 4 digits."""

    if val is None:
        return ""
    digits = re.sub(r"\D", "", str(val))
    return digits[-4:] if digits else ""


def normalise_account(val: Any) -> str:
    """Trim an account label.

    Account label resolution (legacy/alternate spellings -> account ID) lives
    in ``AccountResolver`` (accounts.py), backed by
    ``finance_account_labels``. This function only normalizes a raw display
    value before resolver lookup.
    """

    if val is None:
        return ""
    return str(val).strip()


def normalise_name(val: Any) -> str:
    """Clean and normalize transaction names."""

    if val is None:
        return ""
    return re.sub(r"\s+", " ", str(val).strip())


def name_key(val: Any) -> str:
    """Create a normalized key for fuzzy name comparisons."""

    s = normalise_name(val).lower()
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def build_source_key(row: dict[str, Any]) -> str:
    """Build the exact-match dedup key."""

    parts = [
        normalise_date(row.get("date")),
        name_key(row.get("name")),
        normalise_amount(row.get("amount")),
        normalise_account(row.get("account")),
        normalise_mask(row.get("account_mask")),
    ]
    return "|".join(parts)


def _stable_text(val: Any) -> str:
    if val is None:
        return ""
    return re.sub(r"\s+", " ", str(val).strip()).lower()


def _stable_amount(val: Any) -> str:
    return _stable_text(normalise_amount(val))


def build_source_fingerprint(row: dict[str, Any]) -> str:
    """Build a provenance-based import fingerprint from raw source fields.

    This intentionally keys off source-native values, not mutable ledger
    display columns, so later fixes to account/category/merchant rendering do
    not alter idempotency for future imports.
    """

    payload = {
        "date": normalise_date(
            row.get("date")
            or row.get("posted_on")
            or row.get("date_settled")
            or row.get("transaction_date")
        ),
        "tx_id": _stable_text(row.get("tx_id") or row.get("id") or row.get("transaction_id")),
        "amount": _stable_amount(row.get("amount") or row.get("amount_usd")),
        "account": _stable_text(row.get("account") or row.get("account_name")),
        "account_mask": normalise_mask(row.get("account mask") or row.get("account_mask")),
        "name": _stable_text(row.get("payee") or row.get("name") or row.get("description")),
        "type": _stable_text(row.get("type")),
    }
    return (
        "v1|"
        + payload["date"]
        + "|"
        + payload["tx_id"]
        + "|"
        + payload["amount"]
        + "|"
        + payload["account"]
        + "|"
        + payload["account_mask"]
        + "|"
        + payload["name"]
        + "|"
        + payload["type"]
    )


def row_quality_score(row: dict[str, Any]) -> int:
    """Score rows by how much durable information they carry."""

    fields = [
        "id",
        "status",
        "category",
        "parent_category",
        "tags",
        "type",
        "account",
        "account_mask",
        "note",
        "created_at",
        "updated_at",
    ]
    score = sum(1 for field in fields if row.get(field))
    if row.get("id"):
        score += 3
    if row.get("created_at"):
        score += 1
    return score


def prefer_row(left: dict[str, Any], right: dict[str, Any]) -> dict[str, Any]:
    """Return the better of two duplicate rows, merging missing fields."""

    winner = left if row_quality_score(left) >= row_quality_score(right) else right
    loser = right if winner is left else left
    merged = dict(winner)
    for key, value in loser.items():
        if not merged.get(key) and value:
            merged[key] = value
    return merged


def stable_row_id(row: dict[str, Any]) -> str:
    """Build a deterministic fallback row identifier."""

    payload = "|".join(
        [
            normalise_date(row.get("date")),
            normalise_name(row.get("name")),
            normalise_amount(row.get("amount")),
            normalise_account(row.get("account")),
        ]
    )
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()


def parse_timestamp(value: Any) -> datetime | None:
    """Parse common timestamp shapes when available."""

    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None
    candidates = [
        "%Y-%m-%dT%H:%M:%S.%fZ",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d",
    ]
    for fmt in candidates:
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None
