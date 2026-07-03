from warehouse.people.name_parts import needs_update, parse_display_name, should_skip_display_name


def test_parse_display_name_standard_names() -> None:
    assert parse_display_name("Jane A Smith") is not None
    parts = parse_display_name("Robert J Wilson")
    assert parts is not None
    assert parts.first_name == "Robert"
    assert parts.middle_name == "J"
    assert parts.last_name == "Wilson"


def test_parse_display_name_single_token() -> None:
    parts = parse_display_name("Mike")
    assert parts is not None
    assert parts.first_name == "Mike"
    assert parts.middle_name == ""
    assert parts.last_name == ""


def test_skip_non_person_names() -> None:
    assert should_skip_display_name("Joe's Auto Shop")
    assert should_skip_display_name("Foo & Co")
    assert should_skip_display_name("Unknown person 169")
    assert should_skip_display_name("<Some Italian Girl From Yonkers>")


def test_needs_update_detects_partial_split() -> None:
    assert needs_update(
        display_name="Robert J Wilson",
        first_name="Alice",
        middle_name=None,
        last_name="B Jones",
    )

