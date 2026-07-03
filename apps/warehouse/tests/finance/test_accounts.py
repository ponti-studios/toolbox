import sqlite3

from warehouse.finance.accounts import AccountResolver


def test_resolver_maps_aliases_to_account(scratch_db: str) -> None:
    conn = sqlite3.connect(scratch_db)
    conn.execute(
        """
        INSERT INTO finance_accounts
          (name, institution, account_type)
        VALUES ('Acme Corp 401(k) Plan', 'Acme Corp', 'retirement')
        """
    )
    account_id = conn.execute(
        "SELECT id FROM finance_accounts WHERE name = 'Acme Corp 401(k) Plan'"
    ).fetchone()[0]
    conn.execute(
        """
        INSERT INTO finance_account_labels
          (label, account_id, label_kind, source, confidence, note)
        VALUES
          ('payroll provider 401k', ?, 'alias', 'local_finance_documents', 1.0, 'lineage'),
          ('former employer 401k', ?, 'alias', 'local_finance_documents', 1.0, 'lineage')
        """,
        (account_id, account_id),
    )
    conn.commit()

    resolver = AccountResolver(conn)
    assert resolver.resolve("Payroll Provider 401k") == account_id
    assert resolver.resolve("Former Employer 401k") == account_id

    conn.close()


def test_add_alias_writes_account_label(scratch_db: str) -> None:
    conn = sqlite3.connect(scratch_db)
    resolver = AccountResolver(conn)

    resolver.add_alias("Test Credit Card", "Test Checking Account")

    label = conn.execute(
        """
        SELECT label_kind, source, resolves_to_account
        FROM finance_account_labels
        WHERE label = 'Test Credit Card'
        """
    ).fetchone()
    assert label == ("alias", "manual", 1)
    assert resolver.resolve("Test Credit Card") == 1

    conn.close()
