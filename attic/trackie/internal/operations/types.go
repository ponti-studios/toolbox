package operations

// Account maps to warehouse's finance_accounts table.
type Account struct {
	ID              int      `json:"id"`
	Name            string   `json:"name"`
	Institution     *string  `json:"institution,omitempty"`
	AccountType     string   `json:"accountType"`
	CurrencyCode    string   `json:"currencyCode"`
	LifecycleStatus string   `json:"lifecycleStatus"`
	Balance         *float64 `json:"balance,omitempty"` // computed from ledger entries
}

type CreateAccountInput struct {
	Name        string  `json:"name"`
	Institution *string `json:"institution,omitempty"`
	AccountType string  `json:"accountType"`
	Currency    *string `json:"currency,omitempty"` // defaults to USD
}

type UpdateAccountInput struct {
	Name            *string `json:"name,omitempty"`
	Institution     *string `json:"institution,omitempty"`
	AccountType     *string `json:"accountType,omitempty"`
	CurrencyCode    *string `json:"currencyCode,omitempty"`
	LifecycleStatus *string `json:"lifecycleStatus,omitempty"`
}

// Transaction maps to warehouse's finance_account_ledger_entries
// with category pulled from finance_ledger_entry_annotations.
type Transaction struct {
	ID          int     `json:"id"`
	AccountID   int     `json:"accountId"`
	PostedOn    string  `json:"postedOn"`
	Description string  `json:"description"`
	Amount      float64 `json:"amount"`       // converted from balance_delta_cents / 100
	Kind        string  `json:"kind"`         // ledger_entry_kind
	Note        *string `json:"note,omitempty"`
	Category    *string `json:"category,omitempty"` // resolved from annotations
	CreatedAt   *string `json:"createdAt,omitempty"`
}

type ListTransactionsInput struct {
	Limit     int
	Offset    int
	AccountID string
	Category  string
	StartDate string
	EndDate   string
	Kind      string // ledger_entry_kind filter
}

type CreateTransactionInput struct {
	AccountID   string  `json:"accountId"`
	Amount      float64 `json:"amount"`
	Kind        string  `json:"kind"` // regular, income, internal_transfer, adjustment
	PostedOn    string  `json:"postedOn"`
	Description string  `json:"description"`
	Note        *string `json:"note,omitempty"`
	Category    *string `json:"category,omitempty"`
}

type UpdateTransactionInput struct {
	AccountID   *string  `json:"accountId,omitempty"`
	Amount      *float64 `json:"amount,omitempty"`
	Kind        *string  `json:"kind,omitempty"`
	PostedOn    *string  `json:"postedOn,omitempty"`
	Description *string  `json:"description,omitempty"`
	Note        *string  `json:"note,omitempty"`
	Category    *string  `json:"category,omitempty"`
}
