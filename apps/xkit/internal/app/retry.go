package app

import (
	"context"
	"crypto/rand"
	"encoding/binary"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

var errUnauthorized = errors.New("unauthorized")

const (
	retryRateLimitBase = 15 * time.Minute
	retryRateLimitMax  = 1 * time.Hour
)

func isRetryableError(err error) bool {
	var netErr interface {
		Timeout() bool
		Temporary() bool
	}
	if errors.As(err, &netErr) {
		return netErr.Timeout() || netErr.Temporary()
	}
	return errors.Is(err, context.DeadlineExceeded)
}

func isRetryableStatus(code int) bool {
	return code == http.StatusTooManyRequests || (code >= 500 && code <= 599)
}

func backoffDelay(attempt int, resp *http.Response) time.Duration {
	if resp != nil {
		if retryAfter := parseRetryAfter(resp.Header.Get("Retry-After")); retryAfter > 0 {
			return retryAfter
		}
	}

	delay := retryBaseDelay * time.Duration(1<<uint(attempt-1))
	if delay > retryMaxDelay {
		delay = retryMaxDelay
	}
	if delay <= 0 {
		delay = retryBaseDelay
	}
	return jitterDuration(delay)
}

type rateLimitError struct {
	ResetAt    time.Time
	RetryAfter time.Duration
	Source     string
}

func (e rateLimitError) Error() string {
	if !e.ResetAt.IsZero() {
		if e.Source != "" {
			return fmt.Sprintf("rate limited until %s (%s)", e.ResetAt.Format(time.RFC3339), e.Source)
		}
		return fmt.Sprintf("rate limited until %s", e.ResetAt.Format(time.RFC3339))
	}
	if e.RetryAfter > 0 {
		if e.Source != "" {
			return fmt.Sprintf("rate limited for %s (%s)", e.RetryAfter, e.Source)
		}
		return fmt.Sprintf("rate limited for %s", e.RetryAfter)
	}
	return "rate limited"
}

func parseRetryAfter(value string) time.Duration {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0
	}
	if secs, err := strconv.Atoi(value); err == nil && secs > 0 {
		return time.Duration(secs) * time.Second
	}
	if t, err := http.ParseTime(value); err == nil {
		if d := time.Until(t); d > 0 {
			return d
		}
	}
	return 0
}

func jitterDuration(max time.Duration) time.Duration {
	if max <= 0 {
		return 0
	}
	var buf [8]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return max
	}
	n := binary.LittleEndian.Uint64(buf[:])
	return time.Duration(n % uint64(max+1))
}

func rateLimitResetTime(resp *http.Response) time.Time {
	until, _ := rateLimitResetDetails(resp)
	return until
}

func rateLimitResetDetails(resp *http.Response) (time.Time, string) {
	if resp == nil {
		return time.Time{}, ""
	}
	if reset := strings.TrimSpace(resp.Header.Get("x-rate-limit-reset")); reset != "" {
		if unix, err := strconv.ParseInt(reset, 10, 64); err == nil && unix > 0 {
			return time.Unix(unix, 0), "x-rate-limit-reset"
		}
	}
	if retryAfter := parseRetryAfter(resp.Header.Get("Retry-After")); retryAfter > 0 {
		return time.Now().Add(retryAfter), "Retry-After"
	}
	return time.Time{}, ""
}

func summarizeHTTPError(payload []byte) string {
	msg := strings.TrimSpace(string(payload))
	if msg == "" {
		return "empty response body"
	}
	msg = strings.ReplaceAll(msg, "\n", " ")
	if len(msg) > 500 {
		msg = msg[:500] + "..."
	}
	return msg
}
