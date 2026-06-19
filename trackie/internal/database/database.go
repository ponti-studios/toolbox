// Package database provides SQLite connection management for Trackie.
package database

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite"
)

// DB wraps sql.DB.
type DB struct {
	db *sql.DB
}

// New creates a new SQLite connection and ensures the local schema exists.
func New(databasePath string) (*DB, error) {
	if databasePath == "" {
		databasePath = "trackie.db"
	}
	if err := ensureDirectory(databasePath); err != nil {
		return nil, err
	}

	db, err := sql.Open("sqlite", databasePath)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	db.SetConnMaxLifetime(0)

	if _, err := db.Exec(`PRAGMA foreign_keys = ON`); err != nil {
		db.Close()
		return nil, fmt.Errorf("enable foreign keys: %w", err)
	}
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}

	database := &DB{db: db}
	if err := database.migrate(); err != nil {
		db.Close()
		return nil, fmt.Errorf("migrate schema: %w", err)
	}

	return database, nil
}

func ensureDirectory(databasePath string) error {
	dir := filepath.Dir(databasePath)
	if dir == "." || dir == string(filepath.Separator) {
		return nil
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("create database directory: %w", err)
	}
	return nil
}

// Close closes the database connection.
func (db *DB) Close() {
	db.db.Close()
}

// Query executes a query.
func (db *DB) Query(ctx context.Context, sql string, args ...interface{}) (*sql.Rows, error) {
	return db.db.QueryContext(ctx, sql, args...)
}

// QueryRow executes a query returning a single row.
func (db *DB) QueryRow(ctx context.Context, sql string, args ...interface{}) *sql.Row {
	return db.db.QueryRowContext(ctx, sql, args...)
}

// Exec executes a query without returning rows.
func (db *DB) Exec(ctx context.Context, sql string, args ...interface{}) error {
	_, err := db.db.ExecContext(ctx, sql, args...)
	return err
}

func (db *DB) migrate() error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	statements := []string{
		`CREATE TABLE IF NOT EXISTS finance_accounts (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			type TEXT NOT NULL,
			balance REAL NOT NULL DEFAULT 0,
			currency TEXT NOT NULL DEFAULT 'USD',
			created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS transactions (
			id TEXT PRIMARY KEY,
			account_id TEXT NOT NULL REFERENCES finance_accounts(id) ON DELETE CASCADE,
			type TEXT NOT NULL,
			amount REAL NOT NULL,
			date TEXT NOT NULL,
			description TEXT,
			category TEXT,
			created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS idx_finance_accounts_type ON finance_accounts(type)`,
		`CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id)`,
		`CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category)`,
		`CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date)`,
		`CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type)`,
	}

	for _, stmt := range statements {
		if _, err := db.db.ExecContext(ctx, stmt); err != nil {
			return err
		}
	}

	return nil
}
