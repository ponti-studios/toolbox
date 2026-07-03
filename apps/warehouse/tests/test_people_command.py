import sqlite3
from pathlib import Path

from typer.testing import CliRunner

from warehouse.cli.main import app

runner = CliRunner()


def test_people_backfill_name_parts_dry_run(tmp_path: Path, monkeypatch) -> None:
    db_path = tmp_path / "people.db"
    monkeypatch.setenv("WAREHOUSE_DATABASE_PATH", str(db_path.resolve()))

    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            """
            CREATE TABLE people (
                id TEXT PRIMARY KEY,
                display_name TEXT NOT NULL,
                first_name TEXT,
                middle_name TEXT,
                last_name TEXT,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.executemany(
            """INSERT INTO people
               (id, display_name, first_name, middle_name, last_name)
               VALUES (?, ?, ?, ?, ?)""",
            [
                ("1", "Jane A Smith", None, None, None),
                ("2", "Acme Corp Support", None, None, None),
            ],
        )
        conn.commit()
    finally:
        conn.close()

    result = runner.invoke(
        app,
        ["people", "backfill-name-parts", "--dry-run"],
    )
    assert result.exit_code == 0
    assert "Candidates" in result.stdout


def test_people_normalize_phone_numbers_dry_run(tmp_path: Path, monkeypatch) -> None:
    db_path = tmp_path / "people.db"
    monkeypatch.setenv("WAREHOUSE_DATABASE_PATH", str(db_path.resolve()))

    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            """
            CREATE TABLE people_contacts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                person_id TEXT NOT NULL,
                kind TEXT NOT NULL,
                value TEXT NOT NULL,
                value_normalized TEXT,
                label TEXT,
                is_primary INTEGER NOT NULL DEFAULT 0,
                source TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.executemany(
            """
            INSERT INTO people_contacts
                (person_id, kind, value, value_normalized, label, is_primary, source)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            [
                ("1", "phone", "555.010.1234", "5550101234", None, 1, "person_phones"),
                ("2", "phone", "555.010.5678", "5550105678", None, 1, "person_phones"),
                ("3", "phone", "411", "411", None, 1, "person_phones"),
            ],
        )
        conn.commit()
    finally:
        conn.close()

    result = runner.invoke(
        app,
        ["people", "normalize-phone-numbers", "--dry-run"],
    )
    assert result.exit_code == 0
    assert "Candidates" in result.stdout


def test_people_normalize_sort_names_dry_run(tmp_path: Path, monkeypatch) -> None:
    db_path = tmp_path / "people.db"
    monkeypatch.setenv("WAREHOUSE_DATABASE_PATH", str(db_path.resolve()))

    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            """
            CREATE TABLE people (
                id TEXT PRIMARY KEY,
                display_name TEXT NOT NULL,
                sort_name TEXT,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.executemany(
            "INSERT INTO people (id, display_name, sort_name) VALUES (?, ?, ?)",
            [
                ("1", "Jane A Smith", "Smith, Jane A"),
                ("2", "Mike", "Mike"),
                ("3", "Alpha & Co", "Alpha & Co"),
            ],
        )
        conn.commit()
    finally:
        conn.close()

    result = runner.invoke(
        app,
        ["people", "normalize-sort-names", "--dry-run"],
    )
    assert result.exit_code == 0
    assert "Candidates" in result.stdout
