package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
)

func main() {
	cli := NewCLI()
	flag.Parse()

	args := flag.Args()
	if len(args) < 2 {
		flag.Usage()
		os.Exit(1)
	}
	cli.resource = args[0]
	cli.action = args[1]

	ctx := context.Background()
	code := 0
	switch cli.resource {
	case "accounts":
		code = cli.runAccounts(ctx)
	case "transactions":
		code = cli.runTransactions(ctx)
	default:
		fmt.Fprintf(os.Stderr, "unsupported resource: %s\n", cli.resource)
		code = 1
	}
	os.Exit(code)
}

func printJSON(value interface{}) int {
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(value); err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	return 0
}
