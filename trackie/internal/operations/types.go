package operations

type Account struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	Type      string  `json:"type"`
	Balance   float64 `json:"balance"`
	Currency  string  `json:"currency"`
	CreatedAt string  `json:"createdAt"`
}

type CreateAccountInput struct {
	Name     string  `json:"name"`
	Type     string  `json:"type"`
	Balance  float64 `json:"balance"`
	Currency string  `json:"currency"`
}

type Transaction struct {
	ID          string  `json:"id"`
	AccountID   string  `json:"accountId"`
	Type        string  `json:"type"`
	Amount      float64 `json:"amount"`
	Date        string  `json:"date"`
	Description *string `json:"description,omitempty"`
	Category    *string `json:"category,omitempty"`
	CreatedAt   string  `json:"createdAt"`
}

type ListTransactionsInput struct {
	Limit     int
	Offset    int
	AccountID string
	Category  string
	StartDate string
	EndDate   string
	Type      string
}

type CreateTransactionInput struct {
	AccountID   string  `json:"accountId"`
	Type        string  `json:"type"`
	Amount      float64 `json:"amount"`
	Date        string  `json:"date"`
	Description string  `json:"description"`
	Category    string  `json:"category"`
}

type UpdateTransactionInput struct {
	AccountID   *string  `json:"accountId"`
	Type        *string  `json:"type"`
	Amount      *float64 `json:"amount"`
	Date        *string  `json:"date"`
	Description *string  `json:"description"`
	Category    *string  `json:"category"`
}
