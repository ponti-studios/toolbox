package main

import (
	"flag"
	"os"
)

type CLI struct {
	apiURL   string
	resource string
	action   string
	payload  string
	limit    int
	offset   int
}

func NewCLI() *CLI {
	flag.Usage = printUsage

	cli := &CLI{}

	flag.StringVar(&cli.apiURL, "api-url", envOrDefault("TRACKIE_API_URL", "http://localhost:8080"), "HTTP API base URL")
	flag.StringVar(&cli.payload, "payload", "", "JSON payload for create commands")
	flag.IntVar(&cli.limit, "limit", 20, "result limit")
	flag.IntVar(&cli.offset, "offset", 0, "result offset")

	return cli
}

func envOrDefault(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
