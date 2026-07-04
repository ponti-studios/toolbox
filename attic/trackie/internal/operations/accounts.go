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

	query := `SELECT a.id, a.name, a.institution, a.account_type, a.currency_code, a.lifecycle_status,
		COALESCE((SELECT SUM(e.balance_delta_cents) / 100.0 FROM finance_account_ledger_entries e WHERE e.account_id = a.id), 0.0) AS balance
		FROM finance_accounts a`
	args := []interface{}{}
	if accountType != "" {
		query += ` WHERE a.account_type = ?`
		args = append(args, accountType)
	}
	query += ` ORDER BY a.name ASC LIMIT ? OFFSET ?`
	args = append(args, limit, offset)

	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("system: error fetching accounts: %w", err)
	}
	defer rows.Close()

	accounts := make([]Account, 0)
	for rows.Next() {
		var a Account
		var institution sql.NullString
		if err := rows.Scan(&a.ID, &a.Name, &institution, &a.AccountType, &a.CurrencyCode, &a.LifecycleStatus, &a.Balance); err != nil {
			return nil, fmt.Errorf("system: error scanning account: %w", err)
		}
		if institution.Valid {
			a.Institution = &institution.String
		}
		accounts = append(accounts, a)
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
	if input.AccountType == "" {
		return nil, fmt.Errorf("validation: accountType is required")
	}
	currencyCode := "USD"
	if input.Currency != nil && *input.Currency != "" {
		currencyCode = *input.Currency
	}

	query := `INSERT INTO finance_accounts (name, institution, account_type, currency_code)
		VALUES (?, ?, ?, ?)
		RETURNING id, name, institution, account_type, currency_code, lifecycle_status`
	var institution any = nil
	if input.Institution != nil && *input.Institution != "" {
		institution = *input.Institution
	}

	a := Account{}
	var inst sql.NullString
	if err := db.QueryRow(ctx, query, input.Name, institution, input.AccountType, currencyCode).
		Scan(&a.ID, &a.Name, &inst, &a.AccountType, &a.CurrencyCode, &a.LifecycleStatus); err != nil {
		return nil, fmt.Errorf("system: error creating account: %w", err)
	}
	if inst.Valid {
		a.Institution = &inst.String
	}
	// Balance starts at 0 for a new account
	zero := 0.0
	a.Balance = &zero
	return &a, nil
}

func UpdateAccount(ctx context.Context, db *database.DB, accountID string, input UpdateAccountInput) (*Account, error) {
	setClauses := []string{}
	args := []interface{}{}

	if input.Name != nil {
		setClauses = append(setClauses, "name = ?")
		args = append(args, *input.Name)
	}
	if input.Institution != nil {
		setClauses = append(setClauses, "institution = ?")
		args = append(args, *input.Institution)
	}
	if input.AccountType != nil {
		setClauses = append(setClauses, "account_type = ?")
		args = append(args, *input.AccountType)
	}
	if input.CurrencyCode != nil {
		setClauses = append(setClauses, "currency_code = ?")
		args = append(args, *input.CurrencyCode)
	}
	if input.LifecycleStatus != nil {
		setClauses = append(setClauses, "lifecycle_status = ?")
		args = append(args, *input.LifecycleStatus)
	}

	if len(setClauses) == 0 {
		return nil, fmt.Errorf("validation: no fields to update")
	}

	args = append(args, accountID)
	query := "UPDATE finance_accounts SET " + strings.Join(setClauses, ", ") +
		" WHERE id = ? RETURNING id, name, institution, account_type, currency_code, lifecycle_status"

	a := Account{}
	var institution sql.NullString
	if err := db.QueryRow(ctx, query, args...).
		Scan(&a.ID, &a.Name, &institution, &a.AccountType, &a.CurrencyCode, &a.LifecycleStatus); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("not_found: account not found")
		}
		return nil, fmt.Errorf("system: error updating account: %w", err)
	}
	if institution.Valid {
		a.Institution = &institution.String
	}
	return &a, nil
}

func DeleteAccount(ctx context.Context, db *database.DB, accountID string) error {
	// Delete related ledger entries and annotations first
	if _, err := db.Query(ctx, `DELETE FROM finance_account_ledger_entries WHERE account_id = ?`, accountID); err != nil {
		return fmt.Errorf("system: error deleting account ledger entries: %w", err)
	}
	if err := db.Exec(ctx, "DELETE FROM finance_accounts WHERE id = ?", accountID); err != nil {
		return fmt.Errorf("system: error deleting account: %w", err)
	}
	return nil
}
