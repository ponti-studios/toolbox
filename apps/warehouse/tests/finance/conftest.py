import sqlite3
from pathlib import Path

import pytest

SCHEMA = """
CREATE TABLE finance_accounts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  institution TEXT,
  account_type TEXT NOT NULL DEFAULT 'other',
  currency_code TEXT NOT NULL DEFAULT 'USD',
  lifecycle_status TEXT NOT NULL DEFAULT 'open',
  opened_on TEXT,
  closed_on TEXT,
  include_in_net_worth INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE finance_account_labels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES finance_accounts(id),
  label TEXT NOT NULL,
  label_kind TEXT NOT NULL CHECK (label_kind IN ('canonical', 'alias', 'historical_name')),
  institution TEXT,
  effective_from TEXT,
  effective_to TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  confidence REAL NOT NULL DEFAULT 1.0,
  is_generic INTEGER NOT NULL DEFAULT 0,
  resolves_to_account INTEGER NOT NULL DEFAULT 1,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  CHECK (trim(label) <> '')
);

CREATE UNIQUE INDEX idx_finance_account_labels_active_resolution
  ON finance_account_labels(lower(trim(label)))
  WHERE resolves_to_account = 1 AND effective_to IS NULL;

CREATE TABLE finance_categories (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL,
  parent_id INTEGER REFERENCES finance_categories(id),
  UNIQUE (name, parent_id)
);

CREATE TABLE finance_account_ledger_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES finance_accounts(id),
  posted_on TEXT NOT NULL DEFAULT '1970-01-01',
  description TEXT NOT NULL,
  balance_delta_cents INTEGER NOT NULL DEFAULT 0,
  currency_code TEXT NOT NULL DEFAULT 'USD',
  posting_status TEXT NOT NULL DEFAULT 'posted',
  ledger_entry_kind TEXT NOT NULL DEFAULT 'regular',
  account_mask TEXT,
  note TEXT,
  source_fingerprint TEXT NOT NULL UNIQUE,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE finance_ledger_entry_annotations (
  ledger_entry_id INTEGER PRIMARY KEY
    REFERENCES finance_account_ledger_entries(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES finance_categories(id),
  category_assignment_source TEXT NOT NULL DEFAULT 'source',
  excluded INTEGER NOT NULL DEFAULT 0 CHECK (excluded IN (0, 1)),
  recurring INTEGER NOT NULL DEFAULT 0 CHECK (recurring IN (0, 1))
);

CREATE VIEW finance_transactions AS
SELECT
  l.id,
  l.posted_on,
  l.description AS name,
  -l.balance_delta_cents AS amount_cents,
  l.currency_code,
  l.posting_status AS status_key,
  a.excluded,
  l.ledger_entry_kind AS transaction_kind,
  l.account_id,
  a.category_id,
  a.category_assignment_source,
  l.account_mask,
  l.note,
  a.recurring,
  l.created_at,
  l.updated_at,
  l.source_fingerprint
FROM finance_account_ledger_entries l
JOIN finance_ledger_entry_annotations a ON a.ledger_entry_id = l.id;

CREATE TRIGGER finance_transactions_insert
INSTEAD OF INSERT ON finance_transactions
BEGIN
  INSERT INTO finance_account_ledger_entries
    (
      id, account_id, posted_on, description, balance_delta_cents, currency_code,
      posting_status, ledger_entry_kind, account_mask, note, source_fingerprint,
      created_at, updated_at
    )
  VALUES (
    NEW.id,
    NEW.account_id,
    COALESCE(NEW.posted_on, '1970-01-01'),
    NEW.name,
    -COALESCE(NEW.amount_cents, 0),
    COALESCE(NEW.currency_code, 'USD'),
    COALESCE(NEW.status_key, 'posted'),
    COALESCE(NEW.transaction_kind, 'regular'),
    NEW.account_mask,
    NEW.note,
    NEW.source_fingerprint,
    NEW.created_at,
    NEW.updated_at
  );

  INSERT INTO finance_ledger_entry_annotations
    (
      ledger_entry_id, category_id, category_assignment_source, excluded, recurring
    )
  VALUES (
    COALESCE(NEW.id, last_insert_rowid()),
    NEW.category_id,
    COALESCE(NEW.category_assignment_source, 'source'),
    COALESCE(NEW.excluded, 0),
    COALESCE(NEW.recurring, 0)
  );
END;

CREATE TABLE finance_account_statement_periods (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES finance_accounts(id),
  period_start_on TEXT NOT NULL,
  period_end_on TEXT NOT NULL,
  opening_balance_cents INTEGER NOT NULL DEFAULT 0,
  closing_balance_cents INTEGER NOT NULL DEFAULT 0,
  currency_code TEXT NOT NULL DEFAULT 'USD',
  evidence_path TEXT,
  source      TEXT NOT NULL DEFAULT 'manual',
  note        TEXT,
  certification_status TEXT NOT NULL DEFAULT 'uncertified',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (account_id, period_start_on, period_end_on)
);

CREATE VIEW finance_account_reconciliations AS
SELECT
  id,
  account_id,
  period_end_on AS as_of_date,
  closing_balance_cents AS balance_cents,
  currency_code,
  evidence_path,
  source,
  note,
  created_at
FROM finance_account_statement_periods;

"""


@pytest.fixture
def scratch_db(tmp_path: Path) -> str:
    db_path = tmp_path / "scratch.db"
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript(SCHEMA)
    conn.execute(
        """
        INSERT INTO finance_accounts
          (name, institution, lifecycle_status, include_in_net_worth)
        VALUES (?, ?, 'open', 1)
        """,
        ("Test Checking Account", "Test Bank"),
    )
    conn.execute(
        """
        INSERT INTO finance_account_labels
          (account_id, label, label_kind, institution, source)
        SELECT id, name, 'canonical', institution, 'test_fixture'
        FROM finance_accounts
        """
    )
    conn.execute("INSERT INTO finance_categories (name, parent_id) VALUES ('Food & Drink', NULL)")
    conn.execute(
        "INSERT INTO finance_categories (name, parent_id) VALUES ('Groceries', 1)"
    )
    conn.execute("INSERT INTO finance_categories (name, parent_id) VALUES ('Uncategorized', NULL)")
    conn.commit()
    conn.close()
    return str(db_path)


@pytest.fixture
def generic_fixture_path() -> Path:
    return Path(__file__).parent / "fixtures" / "copilot_sample.csv"
