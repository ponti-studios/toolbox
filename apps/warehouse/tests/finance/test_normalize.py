from decimal import Decimal, InvalidOperation

import pytest

from warehouse.finance.models import parse_amount
from warehouse.finance.normalize import (
    bool_val,
    normalise_account,
    normalise_date,
    normalise_mask,
    normalise_name,
)


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("2024-01-05", "2024-01-05"),
        ("2024-01-05T00:00:00Z", "2024-01-05"),
        ("2024-01-05 12:30:00", "2024-01-05"),
        (None, ""),
        ("", ""),
    ],
)
def test_normalise_date(raw, expected) -> None:
    assert normalise_date(raw) == expected


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("12.34", Decimal("12.34")),
        ("$12.34", Decimal("12.34")),
        ("1,234.56", Decimal("1234.56")),
        ("(12.34)", Decimal("-12.34")),
        ("-5", Decimal("-5")),
    ],
)
def test_parse_amount(raw, expected) -> None:
    assert parse_amount(raw) == expected


def test_parse_amount_rejects_garbage() -> None:
    with pytest.raises(InvalidOperation):
        parse_amount("not-a-number")


def test_normalise_mask_keeps_last_four_digits() -> None:
    assert normalise_mask("****1234") == "1234"
    assert normalise_mask("") == ""
    assert normalise_mask(None) == ""


def test_bool_val() -> None:
    assert bool_val("true") == "1"
    assert bool_val("1") == "1"
    assert bool_val("false") == "0"
    assert bool_val(None) == "0"


def test_normalise_account_strips_only_no_alias_lookup() -> None:
    # Alias resolution now lives in AccountResolver, not here.
    assert normalise_account("  Test Checking Account  ") == "Test Checking Account"
    assert normalise_account("Quicksilver") == "Quicksilver"


def test_normalise_name_whitespace() -> None:
    assert normalise_name("Some New Merchant") == "Some New Merchant"
    assert normalise_name("  Extra   Spaces  ") == "Extra Spaces"
    assert normalise_name("T-mobile") == "T-mobile"
