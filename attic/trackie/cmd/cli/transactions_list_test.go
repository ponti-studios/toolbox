package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestTransactionsListHTTPMode(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/transactions" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[{"id":"tx1","type":"expense","amount":12.5,"date":"2026-01-01","createdAt":"2026-01-01"}]`))
	}))
	defer ts.Close()

	cli := &CLI{apiURL: ts.URL, action: "list", limit: 20, offset: 0}
	code := cli.runTransactions(context.Background())
	if code != 0 {
		t.Fatalf("expected exit code 0, got %d", code)
	}
}
