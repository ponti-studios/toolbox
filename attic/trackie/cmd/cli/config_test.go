package main

import "testing"

func TestNewCLIProvidesDefaults(t *testing.T) {
	cli := NewCLI()
	if cli.apiURL == "" {
		t.Fatalf("expected apiURL default")
	}
}
