from typer.testing import CliRunner

from warehouse.cli.main import app

runner = CliRunner()


def test_version_command() -> None:
    result = runner.invoke(app, ["version"])
    assert result.exit_code == 0
    assert "warehouse version" in result.stdout


def test_finance_ledger_audit_help() -> None:
    result = runner.invoke(app, ["finance", "audit", "--help"])
    assert result.exit_code == 0
    assert "audit" in result.stdout
