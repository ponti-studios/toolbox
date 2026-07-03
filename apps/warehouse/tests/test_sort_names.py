from warehouse.people.sort_names import needs_sort_name_normalization, normalize_sort_name


def test_normalize_sort_name_standard_person() -> None:
    assert normalize_sort_name("Jane A Smith") == "Smith, Jane A"
    assert normalize_sort_name("Robert J Wilson") == "Wilson, Robert J"


def test_normalize_sort_name_single_token_and_non_person() -> None:
    assert normalize_sort_name("Mike") == "Mike"
    assert normalize_sort_name("Alpha & Co") == "Alpha & Co"


def test_needs_sort_name_normalization() -> None:
    assert needs_sort_name_normalization("Jane A Smith", "Jones, Jane A")
    assert not needs_sort_name_normalization("Mike", "Mike")
