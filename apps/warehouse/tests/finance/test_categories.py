import sqlite3

from warehouse.finance.categories import CategoryResolver


def test_resolve_exact_pair_match(scratch_db: str) -> None:
    conn = sqlite3.connect(scratch_db)
    resolver = CategoryResolver(conn)
    assert resolver.resolve("Groceries", "Food & Drink") is not None
    conn.close()


def test_resolve_unmapped_stays_none(scratch_db: str) -> None:
    conn = sqlite3.connect(scratch_db)
    resolver = CategoryResolver(conn)
    assert resolver.resolve("Some Unknown Category", "Nope") is None
    conn.close()


def test_add_category_round_trip(scratch_db: str) -> None:
    conn = sqlite3.connect(scratch_db)
    resolver = CategoryResolver(conn)
    new_id = resolver.add_category("Streaming", "Food & Drink")
    assert resolver.resolve("Streaming", "Food & Drink") == new_id
    conn.close()
