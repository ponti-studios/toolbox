import ast
from pathlib import Path

from warehouse.core.settings import AppSettings


def test_settings_reads_config_file(tmp_path: Path) -> None:
    db_path = tmp_path / "data.db"
    db_path.touch()
    config_path = tmp_path / "config.yml"
    config_path.write_text(f"database_path: {db_path}\n")

    settings = AppSettings.from_config(config_path=config_path, load_dotenv=False)

    assert settings.database_path == str(db_path.resolve())


def test_settings_creates_config_if_missing(tmp_path: Path) -> None:
    config_path = tmp_path / "config.yml"
    assert not config_path.exists()

    settings = AppSettings.from_config(config_path=config_path, load_dotenv=False)

    assert config_path.exists()
    assert settings.database_path


def test_warehouse_does_not_import_local_package() -> None:
    package_root = Path("warehouse")
    for path in package_root.rglob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    assert not alias.name.startswith("ponti_db_local")
            if isinstance(node, ast.ImportFrom) and node.module:
                assert not node.module.startswith("ponti_db_local")
