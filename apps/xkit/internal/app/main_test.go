package app

import (
	"net/http"
	"testing"
	"time"
)

func TestParseRetryAfterSeconds(t *testing.T) {
	d := parseRetryAfter("3")
	if d < 3*time.Second {
		t.Fatalf("expected at least 3s, got %v", d)
	}
}

func TestParseRetryAfterHTTPDate(t *testing.T) {
	future := time.Now().Add(2 * time.Second).UTC().Format(http.TimeFormat)
	d := parseRetryAfter(future)
	if d <= 0 {
		t.Fatalf("expected positive duration, got %v", d)
	}
}

func TestBackoffDelayCapsAtMax(t *testing.T) {
	d := backoffDelay(20, nil)
	if d > retryMaxDelay {
		t.Fatalf("expected backoff <= %v, got %v", retryMaxDelay, d)
	}
}

func TestIsRetryableStatus(t *testing.T) {
	if !isRetryableStatus(http.StatusTooManyRequests) {
		t.Fatal("429 should be retryable")
	}
	if !isRetryableStatus(http.StatusServiceUnavailable) {
		t.Fatal("503 should be retryable")
	}
	if isRetryableStatus(http.StatusBadRequest) {
		t.Fatal("400 should not be retryable")
	}
}

func TestRateLimitResetDetailsPrefersResetHeader(t *testing.T) {
	resp := &http.Response{
		Header: http.Header{},
	}
	resp.Header.Set("x-rate-limit-reset", "1735689900")
	got, source := rateLimitResetDetails(resp)
	if source != "x-rate-limit-reset" {
		t.Fatalf("expected x-rate-limit-reset source, got %q", source)
	}
	if got.IsZero() {
		t.Fatal("expected reset time")
	}
}

func TestRateLimitResetDetailsFallsBackToRetryAfter(t *testing.T) {
	resp := &http.Response{
		Header: http.Header{
			"Retry-After": []string{"60"},
		},
	}
	got, source := rateLimitResetDetails(resp)
	if source != "Retry-After" {
		t.Fatalf("expected Retry-After source, got %q", source)
	}
	if got.IsZero() {
		t.Fatal("expected retry-after derived reset time")
	}
}
