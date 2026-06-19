package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"

	"github.com/charlesponti/trackie/internal/operations"
)

func (cli *CLI) runAccounts(ctx context.Context) int {
	if cli.action != "list" && cli.action != "create" {
		fmt.Fprintln(os.Stderr, "trackie accounts: use list or create")
		return 1
	}

	client := newHTTPClient(cli.apiURL)
	if cli.action == "list" {
		var result []operations.Account
		path := fmt.Sprintf("/api/v1/accounts?limit=%d&offset=%d", cli.limit, cli.offset)
		if err := client.get(ctx, path, &result); err != nil {
			fmt.Fprintln(os.Stderr, err)
			return 1
		}
		return printJSON(result)
	}

	var payload operations.CreateAccountInput
	if err := json.Unmarshal([]byte(cli.payload), &payload); err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	var result operations.Account
	if err := client.post(ctx, "/api/v1/accounts", payload, &result); err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	return printJSON(result)
}
