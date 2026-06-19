package operations

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/charlesponti/trackie/internal/database"
)

func ListTransactions(ctx context.Context, db *database.DB, input ListTransactionsInput) ([]Transaction, error) {
	if input.Limit <= 0 {
		input.Limit = 20
	}

	query := `SELECT id, account_id, type, amount, date, description, category, created_at FROM transactions`
	args := []interface{}{}
	conditions := make([]string, 0, 4)

	if input.AccountID != "" {
		conditions = append(conditions, "account_id = ?")
		args = append(args, input.AccountID)
	}
	if input.Category != "" {
		conditions = append(conditions, "category = ?")
		args = append(args, input.Category)
	}
	if input.StartDate != "" {
		conditions = append(conditions, "date >= ?")
		args = append(args, input.StartDate)
	}
	if input.EndDate != "" {
		conditions = append(conditions, "date <= ?")
		args = append(args, input.EndDate)
	}
	if input.Type != "" {
		conditions = append(conditions, "type = ?")
		args = append(args, input.Type)
	}
	if len(conditions) > 0 {
		query += " WHERE " + strings.Join(conditions, " AND ")
	}
	query += " ORDER BY date DESC, created_at DESC LIMIT ? OFFSET ?"
	args = append(args, input.Limit, input.Offset)

	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("system: error fetching transactions: %w", err)
	}
	defer rows.Close()

	result := make([]Transaction, 0)
	for rows.Next() {
		var tx Transaction
		var description sql.NullString
		var category sql.NullString
		if err := rows.Scan(&tx.ID, &tx.AccountID, &tx.Type, &tx.Amount, &tx.Date, &description, &category, &tx.CreatedAt); err != nil {
			return nil, fmt.Errorf("system: error scanning transaction: %w", err)
		}
		tx.Description = stringOrNil(description)
		tx.Category = stringOrNil(category)
		result = append(result, tx)
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
	if input.Type == "" {
		return nil, fmt.Errorf("validation: type is required")
	}
	if input.Date == "" {
		return nil, fmt.Errorf("validation: date is required")
	}
	if _, err := time.Parse("2006-01-02", input.Date); err != nil {
		return nil, fmt.Errorf("validation: invalid date format: %v", err)
	}

	transactionID := newID()
	query := `
		INSERT INTO transactions (id, account_id, type, amount, date, description, category)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		RETURNING id, account_id, type, amount, date, description, category, created_at
	`
	result := &Transaction{}
	var description any = nil
	if input.Description != "" {
		description = input.Description
	}
	var category any = nil
	if input.Category != "" {
		category = input.Category
	}
	if err := db.QueryRow(ctx, query, transactionID, input.AccountID, input.Type, input.Amount, input.Date, description, category).
		Scan(&result.ID, &result.AccountID, &result.Type, &result.Amount, &result.Date, &description, &category, &result.CreatedAt); err != nil {
		return nil, fmt.Errorf("system: error creating transaction: %w", err)
	}
	if s, ok := description.(string); ok && s != "" {
		result.Description = &s
	}
	if s, ok := category.(string); ok && s != "" {
		result.Category = &s
	}
	return result, nil
}

func UpdateTransaction(ctx context.Context, db *database.DB, transactionID string, input UpdateTransactionInput) (*Transaction, error) {
	setClauses := []string{}
	args := []interface{}{}

	if input.AccountID != nil {
		setClauses = append(setClauses, "account_id = ?")
		args = append(args, *input.AccountID)
	}
	if input.Type != nil {
		setClauses = append(setClauses, "type = ?")
		args = append(args, *input.Type)
	}
	if input.Amount != nil {
		setClauses = append(setClauses, "amount = ?")
		args = append(args, *input.Amount)
	}
	if input.Date != nil {
		setClauses = append(setClauses, "date = ?")
		args = append(args, *input.Date)
	}
	if input.Description != nil {
		setClauses = append(setClauses, "description = ?")
		args = append(args, *input.Description)
	}
	if input.Category != nil {
		setClauses = append(setClauses, "category = ?")
		args = append(args, *input.Category)
	}

	if len(setClauses) == 0 {
		return nil, fmt.Errorf("validation: no fields to update")
	}

	args = append(args, transactionID)
	query := "UPDATE transactions SET " + strings.Join(setClauses, ", ") + " WHERE id = ? RETURNING id, account_id, type, amount, date, description, category, created_at"

	result := &Transaction{}
	var description sql.NullString
	var category sql.NullString
	if err := db.QueryRow(ctx, query, args...).Scan(&result.ID, &result.AccountID, &result.Type, &result.Amount, &result.Date, &description, &category, &result.CreatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("not_found: transaction not found")
		}
		return nil, fmt.Errorf("system: error updating transaction: %w", err)
	}
	result.Description = stringOrNil(description)
	result.Category = stringOrNil(category)
	return result, nil
}

func DeleteTransaction(ctx context.Context, db *database.DB, transactionID string) error {
	if err := db.Exec(ctx, "DELETE FROM transactions WHERE id = ?", transactionID); err != nil {
		return fmt.Errorf("system: error deleting transaction: %w", err)
	}
	return nil
}
