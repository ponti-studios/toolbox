package operations

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/charlesponti/trackie/internal/database"
)

func ListAccounts(ctx context.Context, db *database.DB, limit, offset int, accountType string) ([]Account, error) {
	if limit <= 0 {
		limit = 20
	}

	query := `SELECT id, name, type, balance, currency, created_at FROM finance_accounts`
	args := []interface{}{}
	if accountType != "" {
		query += ` WHERE type = ?`
		args = append(args, accountType)
	}
	query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`
	args = append(args, limit, offset)

	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("system: error fetching accounts: %w", err)
	}
	defer rows.Close()

	accounts := make([]Account, 0)
	for rows.Next() {
		var account Account
		if err := rows.Scan(&account.ID, &account.Name, &account.Type, &account.Balance, &account.Currency, &account.CreatedAt); err != nil {
			return nil, fmt.Errorf("system: error scanning account: %w", err)
		}
		accounts = append(accounts, account)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("system: error iterating accounts: %w", err)
	}
	return accounts, nil
}

func CreateAccount(ctx context.Context, db *database.DB, input CreateAccountInput) (*Account, error) {
	if input.Name == "" {
		return nil, fmt.Errorf("validation: name is required")
	}
	if input.Type == "" {
		return nil, fmt.Errorf("validation: type is required")
	}
	if input.Currency == "" {
		input.Currency = "USD"
	}

	accountID := newID()
	query := `
		INSERT INTO finance_accounts (id, name, type, balance, currency)
		VALUES (?, ?, ?, ?, ?)
		RETURNING id, name, type, balance, currency, created_at
	`
	account := &Account{}
	if err := db.QueryRow(ctx, query, accountID, input.Name, input.Type, input.Balance, input.Currency).
		Scan(&account.ID, &account.Name, &account.Type, &account.Balance, &account.Currency, &account.CreatedAt); err != nil {
		return nil, fmt.Errorf("system: error creating account: %w", err)
	}
	return account, nil
}

type UpdateAccountInput struct {
	Name     *string  `json:"name"`
	Type     *string  `json:"type"`
	Balance  *float64 `json:"balance"`
	Currency *string  `json:"currency"`
}

func UpdateAccount(ctx context.Context, db *database.DB, accountID string, input UpdateAccountInput) (*Account, error) {
	setClauses := []string{}
	args := []interface{}{}

	if input.Name != nil {
		setClauses = append(setClauses, "name = ?")
		args = append(args, *input.Name)
	}
	if input.Type != nil {
		setClauses = append(setClauses, "type = ?")
		args = append(args, *input.Type)
	}
	if input.Balance != nil {
		setClauses = append(setClauses, "balance = ?")
		args = append(args, *input.Balance)
	}
	if input.Currency != nil {
		setClauses = append(setClauses, "currency = ?")
		args = append(args, *input.Currency)
	}

	if len(setClauses) == 0 {
		return nil, fmt.Errorf("validation: no fields to update")
	}

	args = append(args, accountID)
	query := "UPDATE finance_accounts SET " + strings.Join(setClauses, ", ") + " WHERE id = ? RETURNING id, name, type, balance, currency, created_at"

	account := &Account{}
	if err := db.QueryRow(ctx, query, args...).Scan(&account.ID, &account.Name, &account.Type, &account.Balance, &account.Currency, &account.CreatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("not_found: account not found")
		}
		return nil, fmt.Errorf("system: error updating account: %w", err)
	}
	return account, nil
}

func DeleteAccount(ctx context.Context, db *database.DB, accountID string) error {
	if err := db.Exec(ctx, "DELETE FROM finance_accounts WHERE id = ?", accountID); err != nil {
		return fmt.Errorf("system: error deleting account: %w", err)
	}
	return nil
}
