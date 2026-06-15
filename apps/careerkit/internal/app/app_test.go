package app

import (
	"bytes"
	"testing"
)

func TestRunShowsUsageForHelp(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	exitCode := New(&stdout, &stderr).Run([]string{"--help"})
	if exitCode != 0 {
		t.Fatalf("expected exit code 0, got %d", exitCode)
	}
	if stderr.Len() != 0 {
		t.Fatalf("expected empty stderr, got %q", stderr.String())
	}
	if got := stdout.String(); got == "" || !bytes.Contains(stdout.Bytes(), []byte("careerkit build")) {
		t.Fatalf("expected usage output, got %q", got)
	}
}

func TestRunRejectsUnknownCommand(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	exitCode := New(&stdout, &stderr).Run([]string{"wat"})
	if exitCode != 2 {
		t.Fatalf("expected exit code 2, got %d", exitCode)
	}
	if !bytes.Contains(stderr.Bytes(), []byte(`unknown command "wat"`)) {
		t.Fatalf("expected unknown command error, got %q", stderr.String())
	}
}
