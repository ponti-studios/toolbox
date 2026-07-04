package operations

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"math/rand"
	"strings"
	"time"

	"github.com/charlesponti/trackie/internal/database"
)

// sourceFingerprint generates a unique, deterministic-ish fingerprint for
// deduplication, matching the warehouse's v1 fingerprint format.
func sourceFingerprint(accountID, date, description string) string {
	hash := fmt.Sprintf("%s|%s|%s|%d", accountID, date, description, rand.Int63())
	return fmt.Sprintf("trackie-v1|%d|%s", time.Now().UnixMilli(), hash)
}

// resolveCategoryID looks up a category by name in finance_categories,
// creating it if it doesn't exist. Returns nil if name is empty.
func resolveCategoryID(ctx context.Context, db *database.DB, name string) (*int, error) {
	if name == "" {
		return nil, nil
	}

	// Look up existing category
	var id int
	err := db.QueryRow(ctx, "SELECT id FROM finance_categories WHERE name = ? AND parent_id IS NULL", name).Scan(&id)
	if err == nil {
		return &id, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("system: error looking up category: %w", err)
	}

	// Create it
	err = db.QueryRow(ctx,
		"INSERT INTO finance_categories (name) VALUES (?) RETURNING id", name,
	).Scan(&id)
	if err != nil {
		return nil, fmt.Errorf("system: error creating category: %w", err)
	}
	return &id, nil
}

// centsFromAmount converts a dollar float to balance_delta_cents (integer).
// Positive amount → positive cents (credit/income).
// Negative amount → negative cents (debit/expense).
func centsFromAmount(amount float64) int {
	return int(amount * 100)
}

// amountFromCents converts balance_delta_cents back to a dollar float.
func amountFromCents(cents int) float64 {
	return float64(cents) / 100.0
}

func ListTransactions(ctx context.Context, db *database.DB, input ListTransactionsInput) ([]Transaction, error) {
	if input.Limit <= 0 {
		input.Limit = 20
	}

	query := `SELECT e.id, e.account_id, e.posted_on, e.description, e.balance_delta_cents,
		e.ledger_entry_kind, e.note, e.created_at,
		COALESCE((SELECT c.name FROM finance_ledger_entry_annotations an
			JOIN finance_categories c ON c.id = an.category_id
			WHERE an.ledger_entry_id = e.id), '') AS category_name
		FROM finance_account_ledger_entries e`
	args := []interface{}{}
	conditions := make([]string, 0, 5)

	if input.AccountID != "" {
		conditions = append(conditions, "e.account_id = ?")
		args = append(args, input.AccountID)
	}
	if input.Category != "" {
		conditions = append(conditions,
			`EXISTS (SELECT 1 FROM finance_ledger_entry_annotations an
				JOIN finance_categories c ON c.id = an.category_id
				WHERE an.ledger_entry_id = e.id AND c.name = ?)`)
		args = append(args, input.Category)
	}
	if input.StartDate != "" {
		conditions = append(conditions, "e.posted_on >= ?")
		args = append(args, input.StartDate)
	}
	if input.EndDate != "" {
		conditions = append(conditions, "e.posted_on <= ?")
		args = append(args, input.EndDate)
	}
	if input.Kind != "" {
		conditions = append(conditions, "e.ledger_entry_kind = ?")
		args = append(args, input.Kind)
	}
	if len(conditions) > 0 {
		query += " WHERE " + strings.Join(conditions, " AND ")
	}
	query += " ORDER BY e.posted_on DESC, e.id DESC LIMIT ? OFFSET ?"
	args = append(args, input.Limit, input.Offset)

	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("system: error fetching transactions: %w", err)
	}
	defer rows.Close()

	result := make([]Transaction, 0)
	for rows.Next() {
		var t Transaction
		var note, createdAt sql.NullString
		var categoryName sql.NullString
		var cents int
		if err := rows.Scan(&t.ID, &t.AccountID, &t.PostedOn, &t.Description, &cents,
			&t.Kind, &note, &createdAt, &categoryName); err != nil {
			return nil, fmt.Errorf("system: error scanning transaction: %w", err)
		}
		t.Amount = amountFromCents(cents)
		if note.Valid && note.String != "" {
			t.Note = &note.String
		}
		if createdAt.Valid {
			t.CreatedAt = &createdAt.String
		}
		if categoryName.Valid && categoryName.String != "" {
			t.Category = &categoryName.String
		}
		result = append(result, t)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("system: error iterating transactions: %w", err)
	}
	return result, nil
}

func CreateTransaction(ctx context.Context, db *database.DB, input CreateTransactionInput) (*Transaction, error) {
	if input.AccountID == "" {
		return nil, fmt.Errorf("validation: accountId is required")
	}
	if input.PostedOn == "" {
		return nil, fmt.Errorf("validation: postedOn is required")
	}
	if _, err := time.Parse("2006-01-02", input.PostedOn); err != nil {
		return nil, fmt.Errorf("validation: invalid date format: %v", err)
	}
	if input.Kind == "" {
		input.Kind = "regular"
	}
	if input.Description == "" {
		return nil, fmt.Errorf("validation: description is required")
	}

	cents := centsFromAmount(input.Amount)
	fingerprint := sourceFingerprint(input.AccountID, input.PostedOn, input.Description)

	// Insert ledger entry
	query := `INSERT INTO finance_account_ledger_entries
		(account_id, posted_on, description, balance_delta_cents, currency_code, posting_status, ledger_entry_kind, source_fingerprint)
		VALUES (?, ?, ?, ?, 'USD', 'posted', ?, ?)
		RETURNING id, account_id, posted_on, description, balance_delta_cents, ledger_entry_kind, note, created_at`

	var t Transaction
	var note, createdAt sql.NullString
	var returnedCents int
	if err := db.QueryRow(ctx, query, input.AccountID, input.PostedOn, input.Description, cents, input.Kind, fingerprint).
		Scan(&t.ID, &t.AccountID, &t.PostedOn, &t.Description, &returnedCents, &t.Kind, &note, &createdAt); err != nil {
		return nil, fmt.Errorf("system: error creating transaction: %w", err)
	}
	t.Amount = amountFromCents(returnedCents)
	if note.Valid {
		t.Note = &note.String
	}
	if createdAt.Valid {
		t.CreatedAt = &createdAt.String
	}

	// Handle category annotation
	if input.Category != nil && *input.Category != "" {
		catID, err := resolveCategoryID(ctx, db, *input.Category)
		if err != nil {
			return nil, err
		}
		if catID != nil {
			annotQuery := `INSERT INTO finance_ledger_entry_annotations
				(ledger_entry_id, category_id, category_assignment_source)
				VALUES (?, ?, 'manual')
				ON CONFLICT(ledger_entry_id) DO UPDATE SET category_id = excluded.category_id`
			if err := db.Exec(ctx, annotQuery, t.ID, *catID); err != nil {
				return nil, fmt.Errorf("system: error creating category annotation: %w", err)
			}
			t.Category = input.Category
		}
	}

	return &t, nil
}

func UpdateTransaction(ctx context.Context, db *database.DB, transactionID string, input UpdateTransactionInput) (*Transaction, error) {
	setClauses := []string{}
	args := []interface{}{}

	if input.AccountID != nil {
		setClauses = append(setClauses, "account_id = ?")
		args = append(args, *input.AccountID)
	}
	if input.Amount != nil {
		setClauses = append(setClauses, "balance_delta_cents = ?")
		args = append(args, centsFromAmount(*input.Amount))
	}
	if input.Kind != nil {
		setClauses = append(setClauses, "ledger_entry_kind = ?")
		args = append(args, *input.Kind)
	}
	if input.PostedOn != nil {
		setClauses = append(setClauses, "posted_on = ?")
		args = append(args, *input.PostedOn)
	}
	if input.Description != nil {
		setClauses = append(setClauses, "description = ?")
		args = append(args, *input.Description)
	}
	if input.Note != nil {
		setClauses = append(setClauses, "note = ?")
		args = append(args, *input.Note)
	}
	setClauses = append(setClauses, "updated_at = strftime('%Y-%m-%dT%H:%M:%S','now')")

	if len(setClauses) == 0 {
		return nil, fmt.Errorf("validation: no fields to update")
	}

	args = append(args, transactionID)
	query := "UPDATE finance_account_ledger_entries SET " + strings.Join(setClauses, ", ") +
		" WHERE id = ? RETURNING id, account_id, posted_on, description, balance_delta_cents, ledger_entry_kind, note, created_at"

	var t Transaction
	var note, createdAt sql.NullString
	var returnedCents int
	if err := db.QueryRow(ctx, query, args...).
		Scan(&t.ID, &t.AccountID, &t.PostedOn, &t.Description, &returnedCents, &t.Kind, &note, &createdAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("not_found: transaction not found")
		}
		return nil, fmt.Errorf("system: error updating transaction: %w", err)
	}
	t.Amount = amountFromCents(returnedCents)
	if note.Valid {
		t.Note = &note.String
	}
	if createdAt.Valid {
		t.CreatedAt = &createdAt.String
	}

	// Update category annotation if provided
	if input.Category != nil {
		if *input.Category == "" {
			// Remove category annotation
			_ = db.Exec(ctx, "DELETE FROM finance_ledger_entry_annotations WHERE ledger_entry_id = ?", t.ID)
		} else {
			catID, err := resolveCategoryID(ctx, db, *input.Category)
			if err != nil {
				return nil, err
			}
			if catID != nil {
				annotQuery := `INSERT INTO finance_ledger_entry_annotations
					(ledger_entry_id, category_id, category_assignment_source)
					VALUES (?, ?, 'manual')
					ON CONFLICT(ledger_entry_id) DO UPDATE SET category_id = excluded.category_id`
				if err := db.Exec(ctx, annotQuery, t.ID, *catID); err != nil {
					return nil, fmt.Errorf("system: error updating category annotation: %w", err)
				}
				t.Category = input.Category
			}
		}
	}

	return &t, nil
}

func DeleteTransaction(ctx context.Context, db *database.DB, transactionID string) error {
	// Annotation is CASCADE-deleted by the FK on ledger_entry_id
	if err := db.Exec(ctx, "DELETE FROM finance_account_ledger_entries WHERE id = ?", transactionID); err != nil {
		return fmt.Errorf("system: error deleting transaction: %w", err)
	}
	return nil
}
