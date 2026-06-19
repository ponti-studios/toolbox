package main

import (
	"fmt"
	"os"
)

func printUsage() {
	fmt.Fprintln(os.Stderr, "trackie: local accounts and transactions")
	fmt.Fprintln(os.Stderr, "usage: trackie <accounts|transactions> <list|create> [--flags]")
	fmt.Fprintln(os.Stderr, "")
	fmt.Fprintln(os.Stderr, "flags:")
	fmt.Fprintln(os.Stderr, "  --api-url   API base URL (default http://localhost:8080)")
	fmt.Fprintln(os.Stderr, "  --limit     list limit (default 20)")
	fmt.Fprintln(os.Stderr, "  --offset    list offset (default 0)")
	fmt.Fprintln(os.Stderr, "  --payload   JSON body for create commands")
}
