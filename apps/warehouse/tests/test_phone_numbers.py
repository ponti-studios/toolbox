from warehouse.people.phone_numbers import needs_phone_normalization, normalize_phone_number


def test_normalize_phone_number_us_formats() -> None:
    assert normalize_phone_number("555.010.1234") == "+15550101234"
    assert normalize_phone_number("(555) 010-5678") == "+15550105678"
    assert normalize_phone_number("1 555 010 9999") == "+15550109999"


def test_normalize_phone_number_international_formats() -> None:
    assert normalize_phone_number("+44 20 7946 0958") == "+442079460958"
    assert normalize_phone_number("351211234567") == "+351211234567"


def test_normalize_phone_number_skips_short_noise() -> None:
    assert normalize_phone_number("411") is None


def test_needs_phone_normalization() -> None:
    assert needs_phone_normalization("555.010.1234", "5550101234")
    assert not needs_phone_normalization("+447429546938", "+447429546938")
