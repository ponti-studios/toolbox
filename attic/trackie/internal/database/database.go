// Package database provides SQLite connection management for Trackie.
//
// It shares the warehouse database at ~/.hominem/warehouse.db, resolving
// the path using the same precedence as the warehouse Python app:
//
//  1. WAREHOUSE_DATABASE_PATH env var (overrides everything)
//  2. database_path from ~/.hominem/config.yml
//  3. Default: ~/.hominem/warehouse.db
package database

import (
	"bufio"
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	_ "modernc.org/sqlite"
)

// DefaultDatabasePath is the fallback when nothing is configured.
const DefaultDatabasePath = "~/.hominem/warehouse.db"

// DefaultConfigPath is the warehouse YAML config file.
const DefaultConfigPath = "~/.hominem/config.yml"

// resolvePath expands a leading ~ to the user's home directory.
func resolvePath(path string) string {
	if len(path) > 0 && path[0] == '~' {
		home, err := os.UserHomeDir()
		if err == nil {
			return home + path[1:]
		}
	}
	return path
}

// warehouseDatabasePath resolves the database path using warehouse's
// precedence rules. Returns the resolved absolute path.
func warehouseDatabasePath() string {
	// 1. Env var override (same variable warehouse uses)
	if env := os.Getenv("WAREHOUSE_DATABASE_PATH"); env != "" {
		return resolvePath(env)
	}

	// 2. Read database_path from ~/.hominem/config.yml
	configPath := resolvePath(DefaultConfigPath)
	if data, err := os.ReadFile(configPath); err == nil {
		scanner := bufio.NewScanner(strings.NewReader(string(data)))
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			// Skip comments and empty lines
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			if strings.HasPrefix(line, "database_path:") {
				value := strings.TrimSpace(line[len("database_path:"):])
				// Strip quotes if present
				value = strings.Trim(value, `"'`)
				if value != "" {
					return resolvePath(value)
				}
			}
		}
	}

	// 3. Fallback
	return resolvePath(DefaultDatabasePath)
}

// DB wraps sql.DB.
type DB struct {
	db *sql.DB
}

// SchemaNote is a no-op. Trackie does not manage migrations — it uses
// the warehouse database, and warehouse owns the schema entirely.

// New creates a new SQLite connection and ensures the local schema exists.
func New(databasePath string) (*DB, error) {
	if databasePath == "" {
		databasePath = warehouseDatabasePath()
	}
	databasePath = resolvePath(databasePath)

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

	return &DB{db: db}, nil
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


