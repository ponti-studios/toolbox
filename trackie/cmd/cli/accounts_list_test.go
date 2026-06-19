package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAccountsListHTTPMode(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/accounts" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[{"id":"1","name":"Checking","type":"checking","balance":10,"currency":"USD","createdAt":"2026-01-01"}]`))
	}))
	defer ts.Close()

	cli := &CLI{apiURL: ts.URL, action: "list", limit: 20, offset: 0}
	code := cli.runAccounts(context.Background())
	if code != 0 {
		t.Fatalf("expected exit code 0, got %d", code)
	}
}
